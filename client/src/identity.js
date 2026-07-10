// Persistent player identity. Survives refreshes and reconnects so the server
// can hand the same seat back (see room:rejoin).
const KEY = "tt-player-id";

function makeId() {
  return (
    crypto.randomUUID?.() ??
    `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

let id = localStorage.getItem(KEY);
if (!id) {
  id = makeId();
  localStorage.setItem(KEY, id);
}

export const playerId = id;

export function getSavedName() {
  return localStorage.getItem("tt-name") || "";
}

export function saveName(name) {
  localStorage.setItem("tt-name", name);
}
