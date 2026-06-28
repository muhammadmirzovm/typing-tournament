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

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("lobby:update", onLobbyUpdate);
    socket.on("match:start", onMatchStart);
    socket.on("bracket:update", onBracketUpdate);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("lobby:update", onLobbyUpdate);
      socket.off("match:start", onMatchStart);
      socket.off("bracket:update", onBracketUpdate);
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
        <Race match={match} onDone={() => setMatch(null)} />
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
