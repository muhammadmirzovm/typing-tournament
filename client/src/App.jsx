import { useEffect, useState } from "react";
import { socket } from "./socket";
import Home from "./Home";
import Lobby from "./Lobby";
import Race from "./Race";
import Bracket from "./Bracket";

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [room, setRoom] = useState(null); // lobby state
  const [match, setMatch] = useState(null); // current race
  const [bracket, setBracket] = useState(null); // tournament bracket

  useEffect(() => {
    function onConnect() {
      setConnected(true);
    }
    function onDisconnect() {
      setConnected(false);
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
    // When the tournament ends, drop out of the race view so everyone lands on
    // the bracket/champion screen instead of being stuck on a match overlay.
    function onTournamentOver() {
      setMatch(null);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("lobby:update", onLobbyUpdate);
    socket.on("match:start", onMatchStart);
    socket.on("bracket:update", onBracketUpdate);
    socket.on("tournament:over", onTournamentOver);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("lobby:update", onLobbyUpdate);
      socket.off("match:start", onMatchStart);
      socket.off("bracket:update", onBracketUpdate);
      socket.off("tournament:over", onTournamentOver);
    };
  }, []);

  function leave() {
    socket.emit("room:leave");
    setRoom(null);
    setMatch(null);
    setBracket(null);
  }

  return (
    <div className="app">
      <header className="header">
        <h1>⌨️ Typing Tournament</h1>
        <span className={`conn ${connected ? "on" : "off"}`}>
          {connected ? "connected" : "offline"}
        </span>
      </header>

      {match ? (
        // key forces a fresh Race per match so state (typed text, result
        // overlay, countdown) resets between rounds instead of carrying over.
        <Race key={match.matchId} match={match} onDone={() => setMatch(null)} />
      ) : bracket ? (
        <Bracket
          bracket={bracket}
          onLeave={leave}
          isHost={room?.hostId === socket.id}
          onNewTournament={() => socket.emit("room:returnToLobby")}
        />
      ) : room ? (
        <Lobby room={room} onLeave={leave} />
      ) : (
        <Home onEnterLobby={setRoom} />
      )}
    </div>
  );
}
