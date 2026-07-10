import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import {
  createRoom,
  joinRoom,
  findRoomByPlayer,
  markDisconnected,
  reconnectPlayer,
  removePlayer,
  updateSettings,
  publicRoom,
} from "./rooms.js";
import {
  handleProgress,
  handleFinish,
  forfeitMatches,
  resumeMatch,
  getPublicMatch,
} from "./match.js";
import {
  startTournament,
  withdrawFromTournament,
  cancelTournament,
  getView,
} from "./tournament.js";

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

// Bumped whenever the socket payload shapes change. The client compares this
// and prompts a reload instead of crashing on an unexpected payload.
const PROTOCOL = 2;

// How long a disconnected player's seat is held before they forfeit.
const GRACE_MS = 45_000;
const graceTimers = new Map(); // playerId -> timeout

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));

app.get("/", (_req, res) => {
  res.send("Typing Tournament server is running.");
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

function emitLobby(room) {
  io.to(room.key).emit("lobby:update", publicRoom(room));
}

// Fully drop a player: forfeit any live match, forfeit future rounds, free the
// seat, and clean the room up if it emptied.
function dropPlayer(playerId) {
  forfeitMatches(io, playerId);
  withdrawFromTournament(io, playerId);
  const { room, key, deleted } = removePlayer(playerId);
  if (deleted) {
    console.log(`[delete]     ${key} (empty)`);
    cancelTournament(key);
    return;
  }
  if (room) emitLobby(room);
}

io.on("connection", (socket) => {
  console.log(`[connect]    ${socket.id}`);
  socket.emit("server:info", { protocol: PROTOCOL });

  const pid = () => socket.data.playerId || socket.id;

  socket.on("room:create", ({ name, playerId }, cb) => {
    socket.data.playerId = playerId || socket.id;
    const room = createRoom(pid(), socket.id, name);
    socket.join(room.key);
    cb?.({ ok: true, room: publicRoom(room) });
    emitLobby(room);
    console.log(`[create]     ${room.key} by ${pid()}`);
  });

  socket.on("room:join", ({ key, name, playerId }, cb) => {
    socket.data.playerId = playerId || socket.id;
    const normalized = String(key || "").trim().toUpperCase();
    const { room, error } = joinRoom(normalized, pid(), socket.id, name);
    if (error) return cb?.({ ok: false, error });
    clearGrace(pid());
    socket.join(room.key);
    cb?.({ ok: true, room: publicRoom(room) });
    emitLobby(room);
    console.log(`[join]       ${room.key} <- ${pid()}`);
  });

  // Reconnect after a refresh or socket blip: reclaim the seat, rejoin the
  // socket rooms, and hand back everything needed to restore the screen.
  socket.on("room:rejoin", ({ playerId }, cb) => {
    if (!playerId) return cb?.({ ok: false });
    const room = reconnectPlayer(playerId, socket.id);
    if (!room) return cb?.({ ok: false });
    socket.data.playerId = playerId;
    clearGrace(playerId);
    socket.join(room.key);
    const activeMatch = resumeMatch(io, playerId, socket.id);
    cb?.({
      ok: true,
      room: publicRoom(room),
      view: getView(room.key),
      match: activeMatch,
    });
    emitLobby(room);
    console.log(`[rejoin]     ${room.key} <- ${playerId}`);
  });

  socket.on("room:leave", () => {
    const playerId = pid();
    clearGrace(playerId);
    const room = findRoomByPlayer(playerId);
    if (room) socket.leave(room.key);
    dropPlayer(playerId);
  });

  // Host adjusts text settings while in the lobby.
  socket.on("room:settings", (partial) => {
    const room = findRoomByPlayer(pid());
    if (!room || room.hostId !== pid() || room.status !== "lobby") return;
    updateSettings(room, partial);
    emitLobby(room);
  });

  socket.on("tournament:start", () => {
    const room = findRoomByPlayer(pid());
    if (!room || room.hostId !== pid()) return;
    if (room.status !== "lobby") return;
    const connectedPlayers = room.players.filter((p) => p.connected);
    if (connectedPlayers.length < 2) return;

    room.status = "running";
    io.to(room.key).emit("tournament:started");
    startTournament(io, room);
  });

  // Host sends everyone back to the lobby for another tournament.
  socket.on("room:returnToLobby", () => {
    const room = findRoomByPlayer(pid());
    if (!room || room.hostId !== pid()) return;
    cancelTournament(room.key);
    room.status = "lobby";
    emitLobby(room);
  });

  socket.on("match:progress", ({ matchId, charIndex, wpm }) => {
    handleProgress(io, matchId, pid(), { charIndex, wpm });
  });

  socket.on("match:finish", ({ matchId, wpm, accuracy }) => {
    handleFinish(io, matchId, pid(), { wpm, accuracy });
  });

  // --- Spectating ---

  socket.on("spectate:join", ({ matchId }, cb) => {
    const state = getPublicMatch(matchId);
    if (!state) return cb?.({ ok: false, error: "Match no longer available." });
    socket.join(matchId);
    cb?.({ ok: true, state });
  });

  socket.on("spectate:leave", ({ matchId }) => {
    if (matchId) socket.leave(matchId);
  });

  // --- Chat (room-wide) & reactions (per live match) ---

  socket.on("chat:send", ({ text }) => {
    const room = findRoomByPlayer(pid());
    const player = room?.players.find((p) => p.id === pid());
    const clean = String(text || "").trim().slice(0, 200);
    if (!room || !player || !clean) return;
    io.to(room.key).emit("chat:msg", {
      from: player.name,
      fromId: player.id,
      text: clean,
      at: Date.now(),
    });
  });

  socket.on("react:send", ({ matchId, emoji }) => {
    const room = findRoomByPlayer(pid());
    const player = room?.players.find((p) => p.id === pid());
    const clean = String(emoji || "").slice(0, 4);
    if (!room || !player || !clean || !matchId) return;
    io.to(matchId).emit("match:react", { emoji: clean, from: player.name });
  });

  socket.on("disconnect", (reason) => {
    console.log(`[disconnect] ${socket.id} (${reason})`);
    const playerId = socket.data.playerId;
    if (!playerId) return;

    // Any live race is lost immediately (a frozen opponent would stall the
    // bracket), but the SEAT survives a grace window so a refresh or network
    // blip doesn't knock the player out of the tournament.
    forfeitMatches(io, playerId);
    const room = markDisconnected(playerId);
    if (room) emitLobby(room);

    clearGrace(playerId);
    graceTimers.set(
      playerId,
      setTimeout(() => {
        graceTimers.delete(playerId);
        console.log(`[forfeit]    ${playerId} (grace expired)`);
        dropPlayer(playerId);
      }, GRACE_MS)
    );
  });
});

function clearGrace(playerId) {
  const timer = graceTimers.get(playerId);
  if (timer) {
    clearTimeout(timer);
    graceTimers.delete(playerId);
  }
}

// On Render's free tier the service sleeps after ~15 min without traffic.
// Pinging our own public URL keeps it awake (one always-on service fits within
// the free 750 h/month).
const SELF_URL = process.env.RENDER_EXTERNAL_URL;
if (SELF_URL) {
  setInterval(() => {
    fetch(SELF_URL).catch(() => {});
  }, 10 * 60 * 1000);
  console.log(`Keep-alive ping enabled for ${SELF_URL}`);
}

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
