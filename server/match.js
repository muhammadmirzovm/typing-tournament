import { generateText } from "./words.js";

// Authoritative race engine. The server owns the text, the start time, the
// countdown, and decides the winner (first to finish). Reused per bracket
// pairing. Supports a bot opponent that "types" at a steady WPM (Phase 5).

const COUNTDOWN_SECONDS = 3;
const WORD_COUNT = 25;
const BOT_TICK_MS = 120;

const matches = new Map(); // matchId -> match
let matchSeq = 0;

// players: [{ id, name, isBot }]. onComplete(winnerId, match) fires once.
export function createMatch(io, roomKey, players, onComplete) {
  const matchId = `${roomKey}-m${++matchSeq}`;
  const text = generateText(WORD_COUNT);

  const match = {
    id: matchId,
    roomKey,
    text,
    status: "countdown", // countdown | racing | finished
    startedAt: null,
    winnerId: null,
    onComplete,
    botTimers: [],
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: !!p.isBot,
      progress: 0,
      wpm: 0,
      accuracy: 100,
      finished: false,
      finishedAt: null,
    })),
  };
  matches.set(matchId, match);

  // Real players join a private room so progress only flows between them.
  players.forEach((p) => {
    if (!p.isBot) io.sockets.sockets.get(p.id)?.join(matchId);
  });

  match.players.forEach((p) => {
    if (p.isBot) return;
    const opponent = match.players.find((o) => o.id !== p.id);
    io.to(p.id).emit("match:start", {
      matchId,
      text,
      you: { name: p.name },
      opponent: {
        name: opponent?.name ?? "—",
        isBot: opponent?.isBot ?? false,
      },
      countdown: COUNTDOWN_SECONDS,
    });
  });

  startCountdown(io, match);
  return match;
}

function startCountdown(io, match) {
  let n = COUNTDOWN_SECONDS;
  const tick = () => {
    if (!matches.has(match.id)) return;
    if (n > 0) {
      io.to(match.id).emit("match:countdown", { n });
      n -= 1;
      setTimeout(tick, 1000);
    } else {
      match.status = "racing";
      match.startedAt = Date.now();
      io.to(match.id).emit("match:go", { startedAt: match.startedAt });
      match.players.filter((p) => p.isBot).forEach((bot) => startBot(io, match, bot));
    }
  };
  tick();
}

// A bot advances a character counter at a fixed words-per-minute pace.
function startBot(io, match, bot) {
  const targetWpm = 30 + Math.floor(Math.random() * 25); // 30–54 wpm
  const charsPerSec = (targetWpm * 5) / 60;
  let chars = 0;

  const timer = setInterval(() => {
    if (match.status !== "racing") {
      clearInterval(timer);
      return;
    }
    chars += charsPerSec * (BOT_TICK_MS / 1000);
    if (chars >= match.text.length) {
      clearInterval(timer);
      applyFinish(io, match, bot.id, { wpm: targetWpm, accuracy: 100 });
    } else {
      applyProgress(io, match, bot.id, chars, targetWpm);
    }
  }, BOT_TICK_MS);

  match.botTimers.push(timer);
}

// --- internal mechanics (shared by humans and bots) ---

function applyProgress(io, match, playerId, charIndex, wpm) {
  if (match.status !== "racing") return;
  const player = match.players.find((p) => p.id === playerId);
  if (!player || player.finished) return;

  player.progress = Math.min(1, charIndex / match.text.length);
  if (typeof wpm === "number") player.wpm = wpm;

  io.to(match.id).emit("match:progress", {
    id: playerId,
    pct: player.progress,
    wpm: player.wpm,
  });
}

function applyFinish(io, match, playerId, { wpm, accuracy }) {
  if (match.status !== "racing") return;
  const player = match.players.find((p) => p.id === playerId);
  if (!player || player.finished) return;

  player.finished = true;
  player.finishedAt = Date.now();
  player.progress = 1;
  if (typeof wpm === "number") player.wpm = wpm;
  if (typeof accuracy === "number") player.accuracy = accuracy;

  io.to(match.id).emit("match:progress", { id: playerId, pct: 1, wpm: player.wpm });

  if (!match.winnerId) match.winnerId = playerId; // first to finish wins
  endMatch(io, match);
}

// Snapshot of a live match for a spectator who just joined mid-race.
export function getPublicMatch(matchId) {
  const match = matches.get(matchId);
  if (!match) return null;
  return {
    matchId: match.id,
    text: match.text,
    status: match.status,
    players: match.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      progress: p.progress,
      wpm: p.wpm,
      finished: p.finished,
    })),
  };
}

// --- public entry points from index.js (human socket events) ---

export function handleProgress(io, matchId, socketId, { charIndex, wpm }) {
  const match = matches.get(matchId);
  if (match) applyProgress(io, match, socketId, charIndex, wpm);
}

export function handleFinish(io, matchId, socketId, { wpm, accuracy }) {
  const match = matches.get(matchId);
  if (match) applyFinish(io, match, socketId, { wpm, accuracy });
}

// If a racer leaves mid-match, their opponent wins by default.
export function handleDisconnect(io, socketId) {
  for (const match of matches.values()) {
    const player = match.players.find((p) => p.id === socketId);
    if (!player || match.status === "finished") continue;
    const opponent = match.players.find((p) => p.id !== socketId);
    match.winnerId = opponent?.id ?? null;
    endMatch(io, match);
  }
}

function endMatch(io, match) {
  if (match.status === "finished") return;
  match.status = "finished";
  match.botTimers.forEach(clearInterval);
  match.botTimers = [];

  const results = match.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    wpm: p.wpm || 0,
    accuracy: p.accuracy ?? 0,
    finished: p.finished,
    isWinner: p.id === match.winnerId,
  }));

  io.to(match.id).emit("match:result", {
    matchId: match.id,
    winnerId: match.winnerId,
    results,
  });

  matches.delete(match.id);
  match.onComplete?.(match.winnerId, match);
}
