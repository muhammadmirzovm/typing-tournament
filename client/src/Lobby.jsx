import { useState } from "react";
import { socket } from "./socket";
import { playerId } from "./identity";
import { t, useLang } from "./i18n";
import ChatBox from "./ChatBox";

export default function Lobby({ room, role, chat, onLeave }) {
  useLang();
  const [copied, setCopied] = useState("");
  const isHost = role !== "spectator" && room.hostId === playerId;
  const spectators = room.spectators ?? [];
  const connectedCount = room.players.filter((p) => p.connected).length;
  const canStart = isHost && connectedCount >= 2;

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

  function setSetting(partial) {
    socket.emit("room:settings", partial);
  }

  return (
    <div className="card lobby">
      <div className="key-block">
        <span className="key-label">{t("joinKey")}</span>
        <button className="key-value" onClick={copyKey} title="copy">
          {room.key}
        </button>
        <button className="btn ghost small" onClick={copyLink}>
          {t("copyInvite")}
        </button>
        {copied && <span className="copied">{t("copied")}</span>}
      </div>

      <div className="settings-row">
        <label className="setting">
          <span>{t("textLength")}</span>
          <select
            value={room.settings?.wordCount ?? 25}
            disabled={!isHost}
            onChange={(e) => setSetting({ wordCount: Number(e.target.value) })}
          >
            {[15, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n} {t("words")}
              </option>
            ))}
          </select>
        </label>
        <label className="setting">
          <span>{t("wordLang")}</span>
          <select
            value={room.settings?.wordLang ?? "en"}
            disabled={!isHost}
            onChange={(e) => setSetting({ wordLang: e.target.value })}
          >
            <option value="en">{t("langEn")}</option>
            <option value="uz">{t("langUz")}</option>
          </select>
        </label>
      </div>

      <h3 className="players-title">
        {t("players")} <span className="count">({room.players.length})</span>
      </h3>
      <ul className="player-list">
        {room.players.map((p) => (
          <li key={p.id} className="player">
            <span className={`dot ${p.connected ? "" : "off"}`} />
            {p.name}
            {p.id === room.hostId && <span className="badge">{t("host")}</span>}
            {p.id === playerId && <span className="badge you">{t("you")}</span>}
          </li>
        ))}
      </ul>

      {spectators.length > 0 && (
        <>
          <h3 className="players-title">
            {t("spectators")} <span className="count">({spectators.length})</span>
          </h3>
          <div className="chips" style={{ marginBottom: 20 }}>
            {spectators.map((s) => (
              <span key={s.id} className={`chip ${s.id === playerId ? "me" : ""}`}>
                👁 {s.name}
              </span>
            ))}
          </div>
        </>
      )}

      <ChatBox messages={chat} />

      <div className="lobby-actions">
        {isHost ? (
          <button
            className="btn block"
            onClick={() => socket.emit("tournament:start")}
            disabled={!canStart}
          >
            {canStart ? t("start") : t("needPlayers")}
          </button>
        ) : (
          <p className="waiting">{t("waitingHost")}</p>
        )}
        <button className="btn ghost" onClick={onLeave}>
          {t("leave")}
        </button>
      </div>
    </div>
  );
}
