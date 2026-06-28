import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

// Single shared socket for the whole app. autoConnect so Phase 0 can verify
// the realtime round-trip immediately.
export const socket = io(SERVER_URL, {
  transports: ["websocket"],
  autoConnect: true,
});
