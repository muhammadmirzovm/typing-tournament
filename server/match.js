import { generateText } from "./words.js";

// Authoritative race engine. The server owns the text, the start time, the
// countdown, and decides the winner (first to finish correctly). Players are
// identified by persistent playerId; the socketId is just the current wire and
// can be swapped on reconnect without ending the match.

const COUNTDOWN_SECONDS = 3;

// After the first racer finishes, the opponent gets this long to finish too;
// then the higher score (wpm × accuracy) wins. Overridable for tests.
const FINISH_WINDOW_MS = Number(process.env.FINISH_WINDOW_MS || 10_000);

const matches = new Map(); // matchId -> match
let matchSeq = 0;

const scoreOf = (p) => (p.wpm || 0) * (p.accuracy ?? 100);

// players: [{ id, name, socketId }]. opts: { wordCount, wordLang, meta }.
// onComplete(winnerId, results) fires exactly once.
export function createMatch(io, roomKey, players, opts, onComplete) {
  const matchId = `${roomKey}-m${++matchSeq}`;
  const text = generateText(opts?.wordCount ?? 25, opts?.wordLang ?? "en");

  const match = {
    id: matchId,
    roomKey,
    text,
    meta: opts?.meta ?? null, // e.g. { final: {game, aWins, bWins} }
    status: "countdown", // countdown | racing | finished
    startedAt: null,
    winnerId: null,
    finishTimer: null, // window for the opponent after the first finish
    onComplete,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      socketId: p.socketId ?? null,
      progress: 0,
      wpm: 0,
      accuracy: 100,
      finished: false,
      finishedAt: null,
    })),
  };
  matches.set(matchId, match);

  match.players.forEach((p) => {
    if (!p.socketId) return;
    io.sockets.sockets.get(p.socketId)?.join(matchId);
    const opponent = match.players.find((o) => o.id !== p.id);
    io.to(p.socketId).emit("match:start", {
      matchId,
      text,
      meta: match.meta,
      you: { id: p.id, name: p.name },
      opponent: { id: opponent?.id, name: opponent?.name ?? "—" },
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
    }
  };
  tick();
}

// A refreshed/reconnected player rejoins their live match on a new socket.
// Returns a snapshot so the client can resume racing (from zero progress).
export function resumeMatch(io, playerId, socketId) {
  for (const match of matches.values()) {
    const p = match.players.find((x) => x.id === playerId);
    if (!p || match.status === "finished") continue;
    p.socketId = socketId;
    io.sockets.sockets.get(socketId)?.join(match.id);
    const opponent = match.players.find((o) => o.id !== playerId);
    return {
      matchId: match.id,
      text: match.text,
      meta: match.meta,
      resume: match.status === "racing",
      you: { id: p.id, name: p.name },
      opponent: { id: opponent?.id, name: opponent?.name ?? "—" },
      countdown: COUNTDOWN_SECONDS,
    };
  }
  return null;
}

export function handleProgress(io, matchId, playerId, { charIndex, wpm, accuracy }) {
  const match = matches.get(matchId);
  if (!match || match.status !== "racing") return;
  const player = match.players.find((p) => p.id === playerId);
  if (!player || player.finished) return;

  player.progress = Math.min(1, charIndex / match.text.length);
  if (typeof wpm === "number") player.wpm = wpm;
  if (typeof accuracy === "number") player.accuracy = accuracy;

  io.to(matchId).emit("match:progress", {
    id: playerId,
    pct: player.progress,
    wpm: player.wpm,
  });
}

export function handleFinish(io, matchId, playerId, { wpm, accuracy }) {
  const match = matches.get(matchId);
  if (!match || match.status !== "racing") return;
  const player = match.players.find((p) => p.id === playerId);
  if (!player || player.finished) return;

  player.finished = true;
  player.finishedAt = Date.now();
  player.progress = 1;
  if (typeof wpm === "number") player.wpm = wpm;
  if (typeof accuracy === "number") player.accuracy = accuracy;

  io.to(matchId).emit("match:progress", { id: playerId, pct: 1, wpm: player.wpm });

  const unfinished = match.players.filter((p) => !p.finished);
  if (unfinished.length === 0) {
    decide(io, match);
  } else if (!match.finishTimer) {
    // First finisher — give the opponent a window to finish, then score it.
    io.to(match.id).emit("match:lastchance", {
      ms: FINISH_WINDOW_MS,
      finishedId: playerId,
    });
    match.finishTimer = setTimeout(() => decide(io, match), FINISH_WINDOW_MS);
  }
}

// Winner: everyone who finished, ranked by score (wpm × accuracy), earlier
// finish breaking ties. A racer who never finished can't win.
function decide(io, match) {
  if (match.status === "finished") return;
  const finished = match.players.filter((p) => p.finished);
  if (finished.length === 0) return;
  finished.sort(
    (a, b) => scoreOf(b) - scoreOf(a) || a.finishedAt - b.finishedAt
  );
  match.winnerId = finished[0].id;
  endMatch(io, match);
}

// A racer left for good (grace expired or explicit leave) — opponent wins.
export function forfeitMatches(io, playerId) {
  for (const match of matches.values()) {
    const player = match.players.find((p) => p.id === playerId);
    if (!player || match.status === "finished") continue;
    const opponent = match.players.find((p) => p.id !== playerId);
    match.winnerId = opponent?.id ?? null;
    endMatch(io, match);
  }
}

export function getActiveRoomKeys() {
  const keys = new Set();
  for (const match of matches.values()) {
    if (match.status !== "finished") keys.add(match.roomKey);
  }
  return [...keys];
}

// Live snapshot of every active match in a room — powers the "tribune" view
// where spectators and waiting players watch all races at once.
export function getRoomLiveSnapshot(roomKey) {
  const out = [];
  for (const match of matches.values()) {
    if (match.roomKey !== roomKey || match.status === "finished") continue;
    out.push({
      matchId: match.id,
      status: match.status,
      meta: match.meta,
      players: match.players.map((p) => ({
        id: p.id,
        name: p.name,
        progress: p.progress,
        wpm: p.wpm,
        accuracy: p.accuracy,
        finished: p.finished,
      })),
    });
  }
  return out;
}

export function getPublicMatch(matchId) {
  const match = matches.get(matchId);
  if (!match) return null;
  return {
    matchId: match.id,
    text: match.text,
    meta: match.meta,
    status: match.status,
    players: match.players.map((p) => ({
      id: p.id,
      name: p.name,
      progress: p.progress,
      wpm: p.wpm,
      finished: p.finished,
    })),
  };
}

function endMatch(io, match) {
  if (match.status === "finished") return;
  match.status = "finished";
  if (match.finishTimer) {
    clearTimeout(match.finishTimer);
    match.finishTimer = null;
  }

  const results = match.players.map((p) => ({
    id: p.id,
    name: p.name,
    wpm: p.wpm || 0,
    accuracy: p.accuracy ?? 0,
    score: Math.round(scoreOf(p) / 100),
    finished: p.finished,
    isWinner: p.id === match.winnerId,
  }));

  io.to(match.id).emit("match:result", {
    matchId: match.id,
    winnerId: match.winnerId,
    results,
  });

  matches.delete(match.id);
  match.onComplete?.(match.winnerId, results);
}
