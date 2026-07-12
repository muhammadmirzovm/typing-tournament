import { useEffect, useState } from "react";
import { socket } from "./socket";
import { playerId } from "./identity";
import { t, useLang, setLang } from "./i18n";
import { sound } from "./sound";
import Home from "./Home";
import Lobby from "./Lobby";
import Race from "./Race";
import Standings from "./Standings";
import Spectate from "./Spectate";

// Must match the server's PROTOCOL. If the server reports a newer one, this
// build is stale — prompt a reload instead of crashing on unknown payloads.
const PROTOCOL = 2;

export default function App() {
  const lang = useLang();
  const [connected, setConnected] = useState(socket.connected);
  const [stale, setStale] = useState(false);
  const [muted, setMuted] = useState(sound.isMuted());
  const [online, setOnline] = useState(0);
  const [room, setRoom] = useState(null); // lobby state
  const [match, setMatch] = useState(null); // current race
  const [bracket, setBracket] = useState(null); // tournament view
  const [spectating, setSpectating] = useState(null); // match being watched
  const [chat, setChat] = useState([]);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      // Reclaim our seat after a refresh or socket blip. Harmless no-op if the
      // server doesn't know us.
      socket.emit("room:rejoin", { playerId }, (res) => {
        if (!res?.ok) return;
        setRoom(res.room);
        if (res.view) setBracket(res.view);
        if (res.match) setMatch(res.match);
      });
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onServerInfo({ protocol }) {
      if (protocol > PROTOCOL) setStale(true);
    }
    function onLobbyUpdate(updated) {
      setRoom(updated);
      if (updated.status === "lobby") setBracket(null);
    }
    function onMatchStart(data) {
      setSpectating((s) => {
        if (s) socket.emit("spectate:leave", { matchId: s.matchId });
        return null;
      });
      setMatch(data);
    }
    function onBracketUpdate(data) {
      setBracket(data);
    }
    function onTournamentOver() {
      setMatch(null);
      setSpectating(null);
    }
    function onChat(msg) {
      setChat((prev) => [...prev.slice(-99), msg]);
    }
    function onOnline(n) {
      setOnline(n);
    }

    socket.on("online:count", onOnline);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("server:info", onServerInfo);
    socket.on("lobby:update", onLobbyUpdate);
    socket.on("match:start", onMatchStart);
    socket.on("bracket:update", onBracketUpdate);
    socket.on("tournament:over", onTournamentOver);
    socket.on("chat:msg", onChat);

    if (socket.connected) onConnect();

    return () => {
      socket.off("online:count", onOnline);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("server:info", onServerInfo);
      socket.off("lobby:update", onLobbyUpdate);
      socket.off("match:start", onMatchStart);
      socket.off("bracket:update", onBracketUpdate);
      socket.off("tournament:over", onTournamentOver);
      socket.off("chat:msg", onChat);
    };
  }, []);

  function leave() {
    socket.emit("room:leave");
    setRoom(null);
    setMatch(null);
    setBracket(null);
    setSpectating(null);
    setChat([]);
  }

  function watch(matchId) {
    socket.emit("spectate:join", { matchId }, (res) => {
      if (res?.ok) setSpectating(res.state);
    });
  }

  return (
    <div className="app">
      <header className="header">
        <h1>⌨️ Typing Tournament</h1>
        <div className="header-controls">
          {online > 0 && (
            <span className="online-count" title={t("onlineTitle")}>
              🟢 {online}
            </span>
          )}
          <button
            className="icon-btn"
            title={muted ? "unmute" : "mute"}
            onClick={() => setMuted(sound.toggleMute())}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button
            className="icon-btn lang-btn"
            onClick={() => setLang(lang === "uz" ? "en" : "uz")}
          >
            {lang === "uz" ? "UZ" : "EN"}
          </button>
          <span className={`conn ${connected ? "on" : "off"}`}>
            {connected ? t("connected") : t("offline")}
          </span>
        </div>
      </header>

      {stale && (
        <div className="stale-banner">
          {t("newVersion")}{" "}
          <button className="btn small" onClick={() => window.location.reload()}>
            {t("reload")}
          </button>
        </div>
      )}

      {match ? (
        <Race key={match.matchId} match={match} onDone={() => setMatch(null)} />
      ) : spectating ? (
        <Spectate
          key={spectating.matchId}
          initial={spectating}
          onBack={() => setSpectating(null)}
        />
      ) : bracket ? (
        <Standings
          data={bracket}
          chat={chat}
          onLeave={leave}
          isHost={room?.hostId === playerId}
          onNewTournament={() => socket.emit("room:returnToLobby")}
          onWatch={watch}
        />
      ) : room ? (
        <Lobby room={room} chat={chat} onLeave={leave} />
      ) : (
        <Home onEnterLobby={setRoom} />
      )}

      <footer className="footer">
        Typing Tournament · v{__APP_VERSION__} · build {__COMMIT_HASH__} ·{" "}
        {__BUILD_DATE__}
      </footer>
    </div>
  );
}
