// In-memory room store. Nothing is persisted — when a room empties it's deleted
// and all its state is gone. This is the single source of truth for the server.

const rooms = new Map(); // key -> room

// Avoid ambiguous characters (0/O, 1/I) in join keys.
const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const KEY_LENGTH = 5;

function generateKey() {
  let key;
  do {
    key = "";
    for (let i = 0; i < KEY_LENGTH; i++) {
      key += KEY_ALPHABET[Math.floor(Math.random() * KEY_ALPHABET.length)];
    }
  } while (rooms.has(key));
  return key;
}

export function createRoom(hostSocketId, hostName) {
  const key = generateKey();
  const room = {
    key,
    hostId: hostSocketId,
    status: "lobby", // lobby | running | finished
    players: [makePlayer(hostSocketId, hostName)],
    createdAt: Date.now(),
  };
  rooms.set(key, room);
  return room;
}

export function getRoom(key) {
  return rooms.get(key);
}

export function findRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.id === socketId)) return room;
  }
  return null;
}

export function joinRoom(key, socketId, name) {
  const room = rooms.get(key);
  if (!room) return { error: "Room not found." };
  if (room.status !== "lobby") return { error: "Tournament already started." };
  if (room.players.some((p) => p.id === socketId)) return { room };
  room.players.push(makePlayer(socketId, name));
  return { room };
}

// Remove a player from whatever room they're in. Returns the affected room
// (or null). Reassigns host if needed and deletes the room when it empties.
export function removePlayer(socketId) {
  for (const room of rooms.values()) {
    const idx = room.players.findIndex((p) => p.id === socketId);
    if (idx === -1) continue;

    room.players.splice(idx, 1);

    // Drop bots if no humans remain, then delete empty rooms.
    const humans = room.players.filter((p) => !p.isBot);
    if (humans.length === 0) {
      rooms.delete(room.key);
      return { room: null, key: room.key, deleted: true };
    }

    // Reassign host to the first remaining human if the host left.
    if (room.hostId === socketId) {
      room.hostId = humans[0].id;
    }
    return { room, key: room.key, deleted: false };
  }
  return { room: null, key: null, deleted: false };
}

function makePlayer(id, name) {
  return {
    id,
    name: (name || "Anon").slice(0, 16),
    isBot: false,
    alive: true,
    connected: true,
  };
}

// Public, serializable view of a room for the lobby UI.
export function publicRoom(room) {
  return {
    key: room.key,
    hostId: room.hostId,
    status: room.status,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
    })),
  };
}
