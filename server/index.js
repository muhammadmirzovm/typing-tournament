import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import {
  createRoom,
  joinRoom,
  joinAsSpectator,
  findRoomByPlayer,
  findRoomByAnyone,
  getMember,
  isSpectator,
  removeSpectator,
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
  getRoomLiveSnapshot,
  getActiveRoomKeys,
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
const PROTOCOL = 3;

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

// Fully drop a member (player or spectator): forfeit matches/rounds if they
// were racing, free the seat, and clean the room up if it emptied. A room
// whose players all left resets to the lobby so remaining spectators (e.g. an
// organizer host) can regroup.
function dropMember(playerId) {
  let result;
  if (isSpectator(playerId)) {
    result = removeSpectator(playerId);
  } else {
    forfeitMatches(io, playerId);
    withdrawFromTournament(io, playerId);
    result = removePlayer(playerId);
  }
  const { room, key, deleted } = result;
  if (deleted) {
    console.log(`[delete]     ${key} (empty)`);
    cancelTournament(key);
    return;
  }
  if (!room) return;
  if (room.players.length === 0 && room.status !== "lobby") {
    cancelTournament(room.key);
    room.status = "lobby";
  }
  emitLobby(room);
}

// Live visitor counter, broadcast to everyone whenever it changes.
let online = 0;

io.on("connection", (socket) => {
  console.log(`[connect]    ${socket.id}`);
  online += 1;
  io.emit("online:count", online);
  socket.emit("server:info", { protocol: PROTOCOL });

  const pid = () => socket.data.playerId || socket.id;

  socket.on("room:create", ({ name, playerId, role }, cb) => {
    socket.data.playerId = playerId || socket.id;
    const asSpectator = role === "spectator";
    const room = createRoom(pid(), socket.id, name, asSpectator);
    socket.join(room.key);
    cb?.({
      ok: true,
      role: asSpectator ? "spectator" : "player",
      room: publicRoom(room),
    });
    emitLobby(room);
    console.log(`[create${asSpectator ? "-spec" : ""}] ${room.key} by ${pid()}`);
  });

  socket.on("room:join", ({ key, name, playerId, role }, cb) => {
    socket.data.playerId = playerId || socket.id;
    const normalized = String(key || "").trim().toUpperCase();
    const asSpectator = role === "spectator";
    const { room, error, code } = asSpectator
      ? joinAsSpectator(normalized, pid(), socket.id, name)
      : joinRoom(normalized, pid(), socket.id, name);
    if (error) return cb?.({ ok: false, error, code });
    clearGrace(pid());
    socket.join(room.key);
    cb?.({
      ok: true,
      role: asSpectator ? "spectator" : "player",
      room: publicRoom(room),
      view: getView(room.key), // spectators may join mid-tournament
    });
    emitLobby(room);
    console.log(`[join${asSpectator ? "-spec" : ""}]  ${room.key} <- ${pid()}`);
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
    const spectator = isSpectator(playerId);
    const activeMatch = spectator ? null : resumeMatch(io, playerId, socket.id);
    cb?.({
      ok: true,
      role: spectator ? "spectator" : "player",
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
    const room = findRoomByAnyone(playerId);
    if (room) socket.leave(room.key);
    dropMember(playerId);
  });

  // Host adjusts text settings while in the lobby.
  socket.on("room:settings", (partial) => {
    const room = findRoomByAnyone(pid());
    if (!room || room.hostId !== pid() || room.status !== "lobby") return;
    updateSettings(room, partial);
    emitLobby(room);
  });

  socket.on("tournament:start", () => {
    const room = findRoomByAnyone(pid());
    if (!room || room.hostId !== pid()) return;
    if (room.status !== "lobby") return;
    // Safety net: never let anyone race while also holding a spectator seat.
    room.players = room.players.filter(
      (p) => !room.spectators.some((s) => s.id === p.id)
    );
    const connectedPlayers = room.players.filter((p) => p.connected);
    if (connectedPlayers.length < 2) return;

    room.status = "running";
    io.to(room.key).emit("tournament:started");
    startTournament(io, room);
  });

  // Host sends everyone back to the lobby for another tournament.
  socket.on("room:returnToLobby", () => {
    const room = findRoomByAnyone(pid());
    if (!room || room.hostId !== pid()) return;
    cancelTournament(room.key);
    room.status = "lobby";
    emitLobby(room);
  });

  socket.on("match:progress", ({ matchId, charIndex, wpm, accuracy }) => {
    handleProgress(io, matchId, pid(), { charIndex, wpm, accuracy });
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
    const room = findRoomByAnyone(pid());
    const member = getMember(pid());
    const clean = String(text || "").trim().slice(0, 200);
    if (!room || !member || !clean) return;
    io.to(room.key).emit("chat:msg", {
      from: member.name,
      fromId: member.id,
      text: clean,
      at: Date.now(),
    });
  });

  socket.on("react:send", ({ matchId, emoji }) => {
    const room = findRoomByAnyone(pid());
    const member = getMember(pid());
    const clean = String(emoji || "").slice(0, 4);
    if (!room || !member || !clean || !matchId) return;
    // Racers are in the match room, everyone else in the room key — the union
    // is deduped by socket.io, so each person gets it once.
    io.to(matchId).to(room.key).emit("match:react", {
      matchId,
      emoji: clean,
      from: member.name,
    });
  });

  socket.on("disconnect", (reason) => {
    console.log(`[disconnect] ${socket.id} (${reason})`);
    online = Math.max(0, online - 1);
    io.emit("online:count", online);
    const playerId = socket.data.playerId;
    if (!playerId) return;

    // Any live race is lost immediately (a frozen opponent would stall the
    // bracket), but the SEAT — player or spectator (an organizer host must
    // survive a refresh too) — is held for a grace window.
    if (!isSpectator(playerId)) forfeitMatches(io, playerId);
    const room = markDisconnected(playerId);
    if (room) emitLobby(room);

    clearGrace(playerId);
    graceTimers.set(
      playerId,
      setTimeout(() => {
        graceTimers.delete(playerId);
        console.log(`[forfeit]    ${playerId} (grace expired)`);
        dropMember(playerId);
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

// Tribune view: push a snapshot of every active match (progress, wpm,
// accuracy) to the whole room twice a second, so spectators and waiting
// players watch all races at once without joining match rooms.
setInterval(() => {
  for (const roomKey of getActiveRoomKeys()) {
    io.to(roomKey).emit("live:state", { matches: getRoomLiveSnapshot(roomKey) });
  }
}, 500);

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
