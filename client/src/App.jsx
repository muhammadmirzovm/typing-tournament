import { useEffect, useState } from "react";
import { socket } from "./socket";
import { playerId } from "./identity";
import { t, useLang, setLang } from "./i18n";
import { sound } from "./sound";
import Home from "./Home";
import Lobby from "./Lobby";
import Race from "./Race";
import Standings from "./Standings";

// Must match the server's PROTOCOL. If the server reports a newer one, this
// build is stale — prompt a reload instead of crashing on unknown payloads.
const PROTOCOL = 3;

export default function App() {
  const lang = useLang();
  const [connected, setConnected] = useState(socket.connected);
  const [stale, setStale] = useState(false);
  const [muted, setMuted] = useState(sound.isMuted());
  const [online, setOnline] = useState(0);
  const [room, setRoom] = useState(null); // lobby state
  const [role, setRole] = useState("player"); // player | spectator
  const [match, setMatch] = useState(null); // current race
  const [bracket, setBracket] = useState(null); // tournament view
  const [liveState, setLiveState] = useState(null); // all matches' live snapshot
  const [chat, setChat] = useState([]);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      // Reclaim our seat after a refresh or socket blip. Harmless no-op if the
      // server doesn't know us.
      socket.emit("room:rejoin", { playerId }, (res) => {
        if (!res?.ok) return;
        setRoom(res.room);
        if (res.role) setRole(res.role);
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
      setMatch(data);
    }
    function onBracketUpdate(data) {
      setBracket(data);
    }
    function onLiveState(data) {
      setLiveState(data);
    }
    function onTournamentOver() {
      setMatch(null);
      setLiveState(null);
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
    socket.on("live:state", onLiveState);
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
      socket.off("live:state", onLiveState);
      socket.off("tournament:over", onTournamentOver);
      socket.off("chat:msg", onChat);
    };
  }, []);

  function leave() {
    socket.emit("room:leave");
    setRoom(null);
    setRole("player");
    setMatch(null);
    setBracket(null);
    setLiveState(null);
    setChat([]);
  }

  // Home passes the whole join/create response: {room, role?, view?}.
  function enterLobby(res) {
    setRoom(res.room);
    setRole(res.role ?? "player");
    if (res.view) setBracket(res.view);
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
      ) : bracket ? (
        <Standings
          data={bracket}
          liveState={liveState}
          role={role}
          chat={chat}
          onLeave={leave}
          isHost={room?.hostId === playerId}
          onNewTournament={() => socket.emit("room:returnToLobby")}
        />
      ) : room ? (
        <Lobby room={room} role={role} chat={chat} onLeave={leave} />
      ) : (
        <Home onEnterLobby={enterLobby} />
      )}

      <footer className="footer">
        Typing Tournament · v{__APP_VERSION__} · build {__COMMIT_HASH__} ·{" "}
        {__BUILD_DATE__}
      </footer>
    </div>
  );
}
