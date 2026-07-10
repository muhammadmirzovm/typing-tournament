import { useEffect, useRef, useState } from "react";
import { socket } from "./socket";
import { playerId } from "./identity";
import { useTyping } from "./useTyping";
import { t, useLang } from "./i18n";
import { sound } from "./sound";

const PROGRESS_THROTTLE_MS = 150;

export default function Race({ match, onDone }) {
  useLang();
  const { matchId, text, opponent, meta } = match;
  // A rejoined player skips the countdown — the race is already running.
  const [phase, setPhase] = useState(match.resume ? "racing" : "countdown");
  const [count, setCount] = useState(match.countdown ?? 3);
  const [opp, setOpp] = useState({ pct: 0, wpm: 0 });
  const [result, setResult] = useState(null);
  const [reactions, setReactions] = useState([]);

  const { typed, handleChange, isFinished, startedAt, stats } = useTyping(text);
  const inputRef = useRef(null);
  const lastSent = useRef(0);

  useEffect(() => {
    function onCountdown({ n }) {
      setCount(n);
      setPhase("countdown");
      sound.count();
    }
    function onGo() {
      setPhase("racing");
      sound.go();
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    function onProgress({ id, pct, wpm }) {
      if (id === playerId) return;
      setOpp({ pct, wpm: wpm ?? 0 });
    }
    function onResult(res) {
      if (res.matchId !== matchId) return;
      setResult(res);
      setPhase("result");
      if (res.winnerId === playerId) sound.win();
      else sound.lose();
    }
    function onReact({ emoji, from }) {
      const id = Math.random().toString(36).slice(2);
      setReactions((prev) => [...prev.slice(-8), { id, emoji, from }]);
      setTimeout(
        () => setReactions((prev) => prev.filter((r) => r.id !== id)),
        2500
      );
    }

    socket.on("match:countdown", onCountdown);
    socket.on("match:go", onGo);
    socket.on("match:progress", onProgress);
    socket.on("match:result", onResult);
    socket.on("match:react", onReact);
    return () => {
      socket.off("match:countdown", onCountdown);
      socket.off("match:go", onGo);
      socket.off("match:progress", onProgress);
      socket.off("match:result", onResult);
      socket.off("match:react", onReact);
    };
  }, [matchId]);

  // Focus immediately when resuming mid-race.
  useEffect(() => {
    if (match.resume) inputRef.current?.focus();
  }, [match.resume]);

  // Emit progress (throttled) and finish.
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

  const final = meta?.final;

  return (
    <div className="card race">
      {final && (
        <div className="final-badge">
          {t("finalGame", final.game, final.aWins, final.bWins)}
        </div>
      )}
      {match.resume && phase === "racing" && !isFinished && (
        <div className="resume-note">{t("rejoined")}</div>
      )}

      <div className="bars">
        <Bar
          label={`${match.you?.name ?? ""} (${t("you")})`}
          pct={stats.progress}
          wpm={stats.wpm}
          mine
        />
        <Bar label={opponent.name} pct={opp.pct} wpm={opp.wpm} />
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
        onPaste={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
        disabled={phase !== "racing"}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      <div className="reactions-float">
        {reactions.map((r) => (
          <span key={r.id} className="reaction-item">
            {r.emoji} <em>{r.from}</em>
          </span>
        ))}
      </div>

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
  const won = result.winnerId === playerId;
  return (
    <div className="overlay">
      <div className="result-card">
        <h2 className={won ? "win" : "lose"}>
          {won ? t("youWonMatch") : t("youLostMatch")}
        </h2>
        <ul className="result-list">
          {result.results.map((r) => (
            <li key={r.id} className={r.isWinner ? "winner" : ""}>
              <span>{r.name}</span>
              <span>
                {r.wpm} wpm · {r.accuracy}%{r.isWinner ? " 🏆" : ""}
              </span>
            </li>
          ))}
        </ul>
        <button className="btn block" onClick={onDone}>
          {t("cont")}
        </button>
      </div>
    </div>
  );
}
