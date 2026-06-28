import { useState } from "react";
import { socket } from "./socket";

export default function Lobby({ room, onLeave }) {
  const [copied, setCopied] = useState("");
  const isHost = room.hostId === socket.id;
  const canStart = isHost && room.players.length >= 2;

  function flash(what) {
    setCopied(what);
    setTimeout(() => setCopied(""), 1200);
  }

  function copyKey() {
    navigator.clipboard?.writeText(room.key).then(() => flash("key"));
  }

  function copyLink() {
    const url = `${window.location.origin}?room=${room.key}`;
    navigator.clipboard?.writeText(url).then(() => flash("link"));
  }

  function start() {
    // Phase 4 will handle the actual tournament start; stubbed for now.
    socket.emit("tournament:start");
  }

  return (
    <div className="card lobby">
      <div className="key-block">
        <span className="key-label">Join key</span>
        <button className="key-value" onClick={copyKey} title="Click to copy">
          {room.key}
        </button>
        <button className="btn ghost small" onClick={copyLink}>
          Copy invite link
        </button>
        {copied && <span className="copied">{copied} copied!</span>}
      </div>

      <h3 className="players-title">
        Players <span className="count">({room.players.length})</span>
      </h3>
      <ul className="player-list">
        {room.players.map((p) => (
          <li key={p.id} className="player">
            <span className="dot" />
            {p.name}
            {p.id === room.hostId && <span className="badge">host</span>}
            {p.id === socket.id && <span className="badge you">you</span>}
            {p.isBot && <span className="badge bot">bot</span>}
          </li>
        ))}
      </ul>

      <div className="lobby-actions">
        {isHost ? (
          <button className="btn block" onClick={start} disabled={!canStart}>
            {canStart ? "Start tournament" : "Need at least 2 players"}
          </button>
        ) : (
          <p className="waiting">Waiting for the host to start…</p>
        )}
        <button className="btn ghost" onClick={onLeave}>
          Leave
        </button>
      </div>
    </div>
  );
}
