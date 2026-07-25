import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

// Single shared socket for the whole app. Starting with polling and letting
// socket.io upgrade to websocket is far more reliable on real networks than
// forcing websocket only — some mobile carriers/proxies delay or block a
// fresh websocket handshake, which made reconnecting after a network switch
// hard. Reconnection itself is on by default; we just make it snappier.
export const socket = io(SERVER_URL, {
  transports: ["polling", "websocket"],
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity,
});
