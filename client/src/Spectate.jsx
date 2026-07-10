import { useEffect, useState } from "react";
import { socket } from "./socket";

// Read-only live view of a match for eliminated / waiting players.
export default function Spectate({ initial, onBack }) {
  const { matchId, text } = initial;
  const [players, setPlayers] = useState(initial.players);
  const [result, setResult] = useState(null);

  useEffect(() => {
    function onProgress({ id, pct, wpm }) {
      setPlayers((prev) =>
        prev.map((p) => (p.id === id ? { ...p, progress: pct, wpm } : p))
      );
    }
    function onResult(res) {
      if (res.matchId && res.matchId !== matchId) return;
      setResult(res);
    }
    socket.on("match:progress", onProgress);
    socket.on("match:result", onResult);
    return () => {
      socket.off("match:progress", onProgress);
      socket.off("match:result", onResult);
    };
  }, [matchId]);

  function back() {
    socket.emit("spectate:leave", { matchId });
    onBack();
  }

  return (
    <div className="card race">
      <div className="spectate-tag">
        👁 Watching {players.map((p) => p.name).join(" vs ")}
      </div>

      <div className="bars">
        {players.map((p) => (
          <div className="bar-row" key={p.id}>
            <div className="bar-label">
              {p.name}
              {p.isBot ? " 🤖" : ""}{" "}
              <span className="bar-wpm">{p.wpm || 0} wpm</span>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill opp"
                style={{ width: `${Math.round((p.progress || 0) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="passage dim">
        {text.split("").map((char, i) => (
          <span key={i} className="char">
            {char}
          </span>
        ))}
      </div>

      {result && (
        <div className="overlay">
          <div className="result-card">
            <h2 className="win">
              🏆 {result.results.find((r) => r.isWinner)?.name} won
            </h2>
            <button className="btn block" onClick={back}>
              Back to bracket
            </button>
          </div>
        </div>
      )}

      {!result && (
        <button className="btn ghost block" onClick={back}>
          Stop watching
        </button>
      )}
    </div>
  );
}
