import { useState } from "react";
import { socket } from "./socket";

// Prefill the join key if the page was opened via a shared ?room=KEY link.
function keyFromUrl() {
  if (typeof window === "undefined") return "";
  return (new URLSearchParams(window.location.search).get("room") || "")
    .toUpperCase()
    .slice(0, 5);
}

export default function Home({ onEnterLobby }) {
  const [name, setName] = useState("");
  const [key, setKey] = useState(keyFromUrl);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const trimmedName = name.trim();

  function create() {
    if (!trimmedName) return setError("Enter your name first.");
    setBusy(true);
    setError("");
    socket.emit("room:create", { name: trimmedName }, (res) => {
      setBusy(false);
      if (res?.ok) onEnterLobby(res.room);
      else setError(res?.error || "Could not create room.");
    });
  }

  function join() {
    if (!trimmedName) return setError("Enter your name first.");
    if (!key.trim()) return setError("Enter a join key.");
    setBusy(true);
    setError("");
    socket.emit(
      "room:join",
      { key: key.trim().toUpperCase(), name: trimmedName },
      (res) => {
        setBusy(false);
        if (res?.ok) onEnterLobby(res.room);
        else setError(res?.error || "Could not join room.");
      }
    );
  }

  return (
    <div className="card home">
      <label className="field">
        <span>Your name</span>
        <input
          value={name}
          maxLength={16}
          placeholder="e.g. Jimmy"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <button className="btn block" onClick={create} disabled={busy}>
        Create room
      </button>

      <div className="divider">or join with a key</div>

      <div className="join-row">
        <input
          className="key-input"
          value={key}
          maxLength={5}
          placeholder="XK7P2"
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && join()}
        />
        <button className="btn" onClick={join} disabled={busy}>
          Join
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
