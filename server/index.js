import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import {
  createRoom,
  joinRoom,
  getRoom,
  removePlayer,
  findRoomBySocket,
  publicRoom,
} from "./rooms.js";
import {
  handleProgress,
  handleFinish,
  handleDisconnect,
} from "./match.js";
import {
  startTournament,
  withdrawFromTournament,
  cancelTournament,
} from "./tournament.js";

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));

app.get("/", (_req, res) => {
  res.send("Typing Tournament server is running.");
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

// Broadcast the current lobby state to everyone in a room.
function emitLobby(room) {
  io.to(room.key).emit("lobby:update", publicRoom(room));
}

io.on("connection", (socket) => {
  console.log(`[connect]    ${socket.id}`);

  // --- Phase 2: rooms & lobby ---

  socket.on("room:create", ({ name }, cb) => {
    const room = createRoom(socket.id, name);
    socket.join(room.key);
    cb?.({ ok: true, room: publicRoom(room) });
    emitLobby(room);
    console.log(`[create]     ${room.key} by ${socket.id}`);
  });

  socket.on("room:join", ({ key, name }, cb) => {
    const normalized = String(key || "").trim().toUpperCase();
    const { room, error } = joinRoom(normalized, socket.id, name);
    if (error) {
      cb?.({ ok: false, error });
      return;
    }
    socket.join(room.key);
    cb?.({ ok: true, room: publicRoom(room) });
    emitLobby(room);
    console.log(`[join]       ${room.key} <- ${socket.id}`);
  });

  socket.on("room:leave", () => {
    handleLeave(socket);
  });

  // --- Phase 4: full single-elimination bracket ---

  socket.on("tournament:start", () => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.status !== "lobby") return;
    if (room.players.length < 2) return;

    // Drop any bots left over from a previous tournament before starting.
    room.players = room.players.filter((p) => !p.isBot);
    room.status = "running";
    io.to(room.key).emit("tournament:started");
    startTournament(io, room);
  });

  // Host sends everyone back to the lobby for another tournament.
  socket.on("room:returnToLobby", () => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id) return;
    cancelTournament(room.key);
    room.players = room.players.filter((p) => !p.isBot);
    room.status = "lobby";
    emitLobby(room);
  });

  socket.on("match:progress", ({ matchId, charIndex, wpm }) => {
    handleProgress(io, matchId, socket.id, { charIndex, wpm });
  });

  socket.on("match:finish", ({ matchId, wpm, accuracy }) => {
    handleFinish(io, matchId, socket.id, { wpm, accuracy });
  });

  socket.on("disconnect", (reason) => {
    console.log(`[disconnect] ${socket.id} (${reason})`);
    handleDisconnect(io, socket.id); // end any active match (opponent wins)
    withdrawFromTournament(io, socket.id); // forfeit future rounds
    handleLeave(socket); // remove from room; may delete it
  });
});

function handleLeave(socket) {
  const { room, key, deleted } = removePlayer(socket.id);
  if (!key) return;
  socket.leave(key);
  if (deleted) {
    console.log(`[delete]     ${key} (empty)`);
    cancelTournament(key); // stop any running tournament for this room
    return;
  }
  if (room) emitLobby(room);
}

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
