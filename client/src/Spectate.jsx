import { useEffect, useState } from "react";
import { socket } from "./socket";
import { t, useLang } from "./i18n";

const REACTION_EMOJIS = ["👏", "🔥", "😂", "😮"];

// Read-only live view of a match for eliminated / waiting players, with
// emoji reactions the racers can see too.
export default function Spectate({ initial, onBack }) {
  useLang();
  const { matchId, text, meta } = initial;
  const [players, setPlayers] = useState(initial.players);
  const [result, setResult] = useState(null);
  const [reactions, setReactions] = useState([]);

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
    function onReact({ emoji, from }) {
      const id = Math.random().toString(36).slice(2);
      setReactions((prev) => [...prev.slice(-8), { id, emoji, from }]);
      setTimeout(
        () => setReactions((prev) => prev.filter((r) => r.id !== id)),
        2500
      );
    }
    socket.on("match:progress", onProgress);
    socket.on("match:result", onResult);
    socket.on("match:react", onReact);
    return () => {
      socket.off("match:progress", onProgress);
      socket.off("match:result", onResult);
      socket.off("match:react", onReact);
    };
  }, [matchId]);

  function back() {
    socket.emit("spectate:leave", { matchId });
    onBack();
  }

  function react(emoji) {
    socket.emit("react:send", { matchId, emoji });
  }

  return (
    <div className="card race">
      <div className="spectate-tag">
        {t("watching")} {players.map((p) => p.name).join(" vs ")}
        {meta?.final && (
          <span className="final-inline">
            {" "}
            · FINAL {meta.final.aWins}:{meta.final.bWins}
          </span>
        )}
      </div>

      <div className="bars">
        {players.map((p) => (
          <div className="bar-row" key={p.id}>
            <div className="bar-label">
              {p.name} <span className="bar-wpm">{p.wpm || 0} wpm</span>
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

      <div className="react-bar">
        {REACTION_EMOJIS.map((e) => (
          <button key={e} className="react-btn" onClick={() => react(e)}>
            {e}
          </button>
        ))}
      </div>

      <div className="reactions-float">
        {reactions.map((r) => (
          <span key={r.id} className="reaction-item">
            {r.emoji} <em>{r.from}</em>
          </span>
        ))}
      </div>

      {result && (
        <div className="overlay">
          <div className="result-card">
            <h2 className="win">
              🏆 {result.results.find((r) => r.isWinner)?.name} {t("won")}
            </h2>
            <button className="btn block" onClick={back}>
              {t("backToStandings")}
            </button>
          </div>
        </div>
      )}

      {!result && (
        <button className="btn ghost block" onClick={back}>
          {t("stopWatching")}
        </button>
      )}
    </div>
  );
}
