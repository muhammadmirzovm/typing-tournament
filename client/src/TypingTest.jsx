import { useEffect, useRef, useState } from "react";
import { generateText } from "./words";
import { useTyping } from "./useTyping";

const WORD_COUNT = 30;

export default function TypingTest() {
  const [text, setText] = useState(() => generateText(WORD_COUNT));
  const { typed, handleChange, reset, isFinished, startedAt, stats } =
    useTyping(text);
  const inputRef = useRef(null);

  // Keep focus on the hidden input so keystrokes always land.
  useEffect(() => {
    inputRef.current?.focus();
  }, [text]);

  // Re-render once per 100ms while racing so the live WPM ticks up.
  const [, force] = useState(0);
  useEffect(() => {
    if (!startedAt || isFinished) return;
    const id = setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [startedAt, isFinished]);

  function newTest() {
    setText(generateText(WORD_COUNT));
    reset();
  }

  return (
    <div className="card">
      <div className="stats">
        <Stat label="WPM" value={stats.wpm} />
        <Stat label="Accuracy" value={`${stats.accuracy}%`} />
        <Stat label="Progress" value={`${Math.round(stats.progress * 100)}%`} />
      </div>

      <div className="passage" onClick={() => inputRef.current?.focus()}>
        {text.split("").map((char, i) => {
          let cls = "char";
          if (i < typed.length) {
            cls += typed[i] === char ? " correct" : " wrong";
          } else if (i === typed.length) {
            cls += " current";
          }
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
        disabled={isFinished}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {isFinished && (
        <div className="result">
          <h2>Done!</h2>
          <p>
            <strong>{stats.wpm} WPM</strong> · {stats.accuracy}% accuracy ·{" "}
            {(stats.elapsedMs / 1000).toFixed(1)}s
          </p>
        </div>
      )}

      <button className="btn" onClick={newTest}>
        New test
      </button>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
