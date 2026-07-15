import { useState } from "react";
import { socket } from "./socket";
import { playerId, getSavedName, saveName } from "./identity";
import { t, useLang } from "./i18n";

// Prefill the join key if the page was opened via a shared ?room=KEY link.
function keyFromUrl() {
  if (typeof window === "undefined") return "";
  return (new URLSearchParams(window.location.search).get("room") || "")
    .toUpperCase()
    .slice(0, 5);
}

export default function Home({ onEnterLobby }) {
  useLang();
  const [name, setName] = useState(getSavedName());
  const [key, setKey] = useState(keyFromUrl);
  const [role, setRole] = useState("player");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const trimmedName = name.trim();

  function create() {
    if (!trimmedName) return setError(t("enterName"));
    saveName(trimmedName);
    setBusy(true);
    setError("");
    socket.emit("room:create", { name: trimmedName, playerId }, (res) => {
      setBusy(false);
      if (res?.ok) onEnterLobby(res);
      else setError(res?.error || t("createFail"));
    });
  }

  function join() {
    if (!trimmedName) return setError(t("enterName"));
    if (!key.trim()) return setError(t("enterKey"));
    saveName(trimmedName);
    setBusy(true);
    setError("");
    socket.emit(
      "room:join",
      { key: key.trim().toUpperCase(), name: trimmedName, playerId, role },
      (res) => {
        setBusy(false);
        if (res?.ok) onEnterLobby(res);
        else if (res?.code === "NAME_TAKEN") setError(t("nameTaken"));
        else setError(res?.error || t("joinFail"));
      }
    );
  }

  return (
    <div className="card home">
      <label className="field">
        <span>{t("yourName")}</span>
        <input
          value={name}
          maxLength={16}
          placeholder={t("namePh")}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <button className="btn block" onClick={create} disabled={busy}>
        {t("createRoom")}
      </button>

      <div className="divider">{t("orJoin")}</div>

      <div className="role-row">
        <span className="role-label">{t("joinAs")}</span>
        <div className="role-btns">
          <button
            className={`role-btn ${role === "player" ? "active" : ""}`}
            onClick={() => setRole("player")}
          >
            {t("asPlayer")}
          </button>
          <button
            className={`role-btn ${role === "spectator" ? "active" : ""}`}
            onClick={() => setRole("spectator")}
          >
            {t("asSpectator")}
          </button>
        </div>
      </div>

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
          {t("join")}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
