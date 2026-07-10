import { useEffect, useRef, useState } from "react";
import { socket } from "./socket";
import { useTyping } from "./useTyping";

const PROGRESS_THROTTLE_MS = 150;

export default function Race({ match, onDone }) {
  const { matchId, text, you, opponent } = match;
  const [phase, setPhase] = useState("countdown"); // countdown | racing | result
  const [count, setCount] = useState(match.countdown ?? 3);
  const [opp, setOpp] = useState({ pct: 0, wpm: 0 });
  const [result, setResult] = useState(null);

  const { typed, handleChange, isFinished, startedAt, stats } = useTyping(text);
  const inputRef = useRef(null);
  const lastSent = useRef(0);

  // Server-driven race events.
  useEffect(() => {
    function onCountdown({ n }) {
      setCount(n);
      setPhase("countdown");
    }
    function onGo() {
      setPhase("racing");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    function onProgress({ id, pct, wpm }) {
      if (id === socket.id) return; // ignore our own echo
      setOpp({ pct, wpm: wpm ?? 0 });
    }
    function onResult(res) {
      setResult(res);
      setPhase("result");
    }

    socket.on("match:countdown", onCountdown);
    socket.on("match:go", onGo);
    socket.on("match:progress", onProgress);
    socket.on("match:result", onResult);
    return () => {
      socket.off("match:countdown", onCountdown);
      socket.off("match:go", onGo);
      socket.off("match:progress", onProgress);
      socket.off("match:result", onResult);
    };
  }, []);

  // Emit our progress (throttled) and the finish event to the server.
  useEffect(() => {
    if (phase !== "racing") return;
    if (isFinished) {
      socket.emit("match:finish", {
        matchId,
        wpm: stats.wpm,
        accuracy: stats.accuracy,
      });
      return;
    }
    const now = Date.now();
    if (now - lastSent.current >= PROGRESS_THROTTLE_MS) {
      lastSent.current = now;
      socket.emit("match:progress", {
        matchId,
        charIndex: typed.length,
        wpm: stats.wpm,
      });
    }
  }, [typed, isFinished, phase, matchId, stats.wpm, stats.accuracy]);

  // Tick live WPM while racing.
  const [, force] = useState(0);
  useEffect(() => {
    if (phase !== "racing" || !startedAt) return;
    const id = setInterval(() => force((n) => n + 1), 120);
    return () => clearInterval(id);
  }, [phase, startedAt]);

  return (
    <div className="card race">
      <div className="bars">
        <Bar label={`${you.name} (you)`} pct={stats.progress} wpm={stats.wpm} mine />
        <Bar
          label={`${opponent.name}${opponent.isBot ? " 🤖" : ""}`}
          pct={opp.pct}
          wpm={opp.wpm}
        />
      </div>

      <div className="passage" onClick={() => inputRef.current?.focus()}>
        {text.split("").map((char, i) => {
          let cls = "char";
          if (i < typed.length) cls += typed[i] === char ? " correct" : " wrong";
          else if (i === typed.length) cls += " current";
          return (
            <span key={i} className={cls}>
              {char}
            </span>
          );
        })}
      </div>

      <input
        ref={inputRef}
        className="hidden-input"
        value={typed}
        onChange={(e) => handleChange(e.target.value)}
        disabled={phase !== "racing"}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {phase === "countdown" && (
        <div className="overlay">
          <div className="countdown">{count > 0 ? count : "GO"}</div>
        </div>
      )}

      {phase === "result" && result && (
        <ResultOverlay result={result} onDone={onDone} />
      )}
    </div>
  );
}

function Bar({ label, pct, wpm, mine }) {
  return (
    <div className="bar-row">
      <div className="bar-label">
        {label} <span className="bar-wpm">{wpm} wpm</span>
      </div>
      <div className="bar-track">
        <div
          className={`bar-fill ${mine ? "mine" : "opp"}`}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
    </div>
  );
}

function ResultOverlay({ result, onDone }) {
  const won = result.winnerId === socket.id;
  return (
    <div className="overlay">
      <div className="result-card">
        <h2 className={won ? "win" : "lose"}>
          {won ? "✅ You won this match!" : "You lost this match"}
        </h2>
        <ul className="result-list">
          {result.results.map((r) => (
            <li key={r.id} className={r.isWinner ? "winner" : ""}>
              <span>{r.name}{r.isBot ? " 🤖" : ""}</span>
              <span>
                {r.wpm} wpm · {r.accuracy}%
                {r.isWinner ? " 🏆" : ""}
              </span>
            </li>
          ))}
        </ul>
        <button className="btn block" onClick={onDone}>
          Continue →
        </button>
      </div>
    </div>
  );
}
