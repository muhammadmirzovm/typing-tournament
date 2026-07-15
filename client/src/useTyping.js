import { useCallback, useMemo, useRef, useState } from "react";

// How many uncorrected wrong characters a typist may have before they're
// blocked from typing further — they must backspace and fix. Set to 0 to
// reject any wrong key outright; raise it to allow a bigger error buffer.
const MAX_UNCORRECTED_ERRORS = 2;

// Core typing engine. Framework-agnostic logic kept here so it can be reused
// by both the solo test (Phase 1) and the multiplayer race (Phase 3).
//
// WPM standard: 1 "word" = 5 characters. wpm = (chars / 5) / minutes.
// Accuracy = correct keystrokes / total keystrokes (counts every key pressed,
// so backspacing a mistake doesn't erase the fact it happened).
//
// You can only finish by typing the passage *exactly* correct — typing fast
// gibberish never wins; you must go back and fix mistakes.
export function useTyping(text) {
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState(null);
  const [finishedAt, setFinishedAt] = useState(null);
  // Bumped to force a re-render when a keystroke is rejected, so the controlled
  // input snaps back to `typed` (React won't resync the DOM otherwise).
  const [, setRejectBump] = useState(0);
  // Total keystrokes that produced a correct char at the moment they were typed.
  const correctKeystrokes = useRef(0);
  const totalKeystrokes = useRef(0);

  const isFinished = finishedAt !== null;

  const handleChange = useCallback(
    (raw) => {
      if (isFinished) return;

      // Mobile keyboards love to substitute lookalike characters that never
      // match the passage: non-breaking spaces, smart quotes, en-dashes. They
      // render identically to the real thing, so the player sees "correct"
      // text that can never equal the target. Normalize them away.
      const next = normalize(raw);

      // Never let input run past the passage — extra keys add nothing and
      // hide the real problem (an uncorrected mistake somewhere behind).
      if (next.length > text.length) next = next.slice(0, text.length);

      const adding = next.length > typed.length;

      // Nothing exists past the end of the passage — extra keystrokes there
      // would be invisible and just poison the exact-match check.
      if (adding && next.length > text.length) {
        setRejectBump((b) => b + 1);
        return;
      }

      // Block typing forward once too many uncorrected mistakes have piled up.
      // Backspacing (next shorter than typed) is always allowed so the typist
      // can fix them. The keystroke is simply ignored — the input stays put.
      if (adding && countErrors(typed, text) >= MAX_UNCORRECTED_ERRORS) {
        setRejectBump((b) => b + 1); // resync the input back to `typed`
        return;
      }

      // Start the clock on the very first character.
      if (startedAt === null && next.length > 0) {
        setStartedAt(Date.now());
      }

      // Count a keystroke only when text grows (ignore backspaces for the
      // keystroke tally, since accuracy is about chars attempted).
      if (adding) {
        const idx = next.length - 1;
        totalKeystrokes.current += 1;
        if (next[idx] === text[idx]) {
          correctKeystrokes.current += 1;
        }
      }

      setTyped(next);

      // Finish ONLY when the whole passage is typed exactly right.
      // Reaching the end finishes the race even with mistakes left — the
      // winner is then decided by score (speed × accuracy), not perfection.
      if (next.length >= text.length) {
        setFinishedAt(Date.now());
      }
    },
    [isFinished, startedAt, typed, text]
  );

  const reset = useCallback(() => {
    setTyped("");
    setStartedAt(null);
    setFinishedAt(null);
    correctKeystrokes.current = 0;
    totalKeystrokes.current = 0;
  }, []);

  const stats = useMemo(() => {
    const elapsedMs = startedAt
      ? (finishedAt ?? Date.now()) - startedAt
      : 0;
    const minutes = elapsedMs / 60000;
    const correctChars = countCorrect(typed, text);
    const wpm = minutes > 0 ? Math.round(correctChars / 5 / minutes) : 0;
    const accuracy =
      totalKeystrokes.current > 0
        ? Math.round((correctKeystrokes.current / totalKeystrokes.current) * 100)
        : 100;
    const progress = text.length > 0 ? typed.length / text.length : 0;
    const errors = typed.length - correctChars;
    // Blocked from typing forward: the uncorrected-error budget is used up
    // and the typist must backspace before continuing.
    const stuck = !finishedAt && errors >= MAX_UNCORRECTED_ERRORS;

    return { wpm, accuracy, progress, elapsedMs, correctChars, errors, stuck };
  }, [typed, text, startedAt, finishedAt]);

  return { typed, handleChange, reset, isFinished, startedAt, stats };
}

// Map keyboard "lookalike" characters to what the passage actually contains.
function normalize(s) {
  return s
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ") // NBSP & friends -> space
    .replace(/[‘’ʻʼ′]/g, "'") // smart/modifier apostrophes
    .replace(/[“”″]/g, '"') // smart double quotes
    .replace(/[–—−]/g, "-") // en/em dash, minus
    .replace(/…/g, "..."); // ellipsis
}

function countCorrect(typed, text) {
  let n = 0;
  for (let i = 0; i < typed.length; i++) {
    if (typed[i] === text[i]) n += 1;
  }
  return n;
}

// Number of currently-wrong characters in what's been typed so far.
function countErrors(typed, text) {
  let n = 0;
  for (let i = 0; i < typed.length; i++) {
    if (typed[i] !== text[i]) n += 1;
  }
  return n;
}
