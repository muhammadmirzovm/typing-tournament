import { createMatch } from "./match.js";
import { isConnected, getPlayer } from "./rooms.js";

// Single-elimination knockout for the TOP THREE places only. Losing means
// you're out — you spectate the rest. The two semifinal losers play one
// bronze match for 3rd place, and the final is best-of-3 for 1st/2nd.
// Nobody else is ranked. All in-memory.

const tournaments = new Map(); // roomKey -> tournament
const ROUND_GAP_MS = 1800;
const FINAL_WINS_NEEDED = 2;

export function startTournament(io, room) {
  const players = room.players.map((p) => ({ id: p.id, name: p.name }));

  const t = {
    roomKey: room.key,
    settings: { ...room.settings },
    status: "running",
    round: 0,
    totalPlayers: players.length,
    allPlayers: players,
    alive: [...players], // still in the winners bracket
    bronze: null, // semifinal losers, set when the semifinal completes
    placements: {}, // only 1, 2, 3
    live: [],
    history: [],
    stats: new Map(),
    withdrawn: new Set(),
    timer: null,
  };
  tournaments.set(room.key, t);

  broadcast(io, t);
  runRound(io, t);
  return t;
}

export function getView(roomKey) {
  const t = tournaments.get(roomKey);
  return t ? publicView(t) : null;
}

function gone(t, playerId) {
  return t.withdrawn.has(playerId) || !isConnected(playerId);
}

function withSocket(p) {
  return { ...p, socketId: getPlayer(p.id)?.socketId ?? null };
}

function matchOpts(t, meta) {
  return {
    wordCount: t.settings.wordCount,
    wordLang: t.settings.wordLang,
    meta,
  };
}

function recordStats(t, results) {
  for (const r of results) {
    const s = t.stats.get(r.id) ?? { races: 0, sumWpm: 0, bestWpm: 0, sumAcc: 0 };
    s.races += 1;
    s.sumWpm += r.wpm;
    s.bestWpm = Math.max(s.bestWpm, r.wpm);
    s.sumAcc += r.accuracy;
    t.stats.set(r.id, s);
  }
}

function runRound(io, t) {
  const roundNo = t.round + 1;

  // Two left in the bracket → final (Bo3) plus the bronze match.
  if (t.alive.length === 2) {
    runFinalRound(io, t, roundNo);
    return;
  }

  t.live = [];
  const winners = [];
  const losers = [];
  let pending = 0;
  let setupDone = false;
  const maybeDone = () => {
    if (setupDone && pending === 0) completeRound(io, t, winners, losers);
  };
  const done = () => {
    pending -= 1;
    maybeDone();
  };

  const shuffled = shuffle([...t.alive]);
  const pairs = [];
  while (shuffled.length >= 2) pairs.push([shuffled.pop(), shuffled.pop()]);
  if (shuffled.length === 1) {
    const byePlayer = shuffled.pop();
    winners.push(byePlayer);
    t.history.push({ round: roundNo, a: pub(byePlayer), b: null, bye: true });
  }

  for (const [a, b] of pairs) {
    const aGone = gone(t, a.id);
    const bGone = gone(t, b.id);
    if (aGone || bGone) {
      const w = !aGone ? a : b;
      const l = w === a ? b : a;
      winners.push(w);
      losers.push(l);
      t.history.push({ round: roundNo, a: pub(a), b: pub(b), winnerId: w.id, wo: true });
      continue;
    }

    pending += 1;
    const m = createMatch(
      io,
      t.roomKey,
      [withSocket(a), withSocket(b)],
      matchOpts(t, { round: roundNo }),
      (winnerId, results) => {
        recordStats(t, results);
        const w = a.id === winnerId ? a : b;
        const l = a.id === winnerId ? b : a;
        winners.push(w);
        losers.push(l);
        t.history.push({
          round: roundNo,
          a: pub(a),
          b: pub(b),
          winnerId,
          aWpm: results.find((r) => r.id === a.id)?.wpm ?? 0,
          bWpm: results.find((r) => r.id === b.id)?.wpm ?? 0,
        });
        t.live = t.live.filter((x) => x.matchId !== m.id);
        broadcast(io, t);
        done();
      }
    );
    t.live.push({ matchId: m.id, a: pub(a), b: pub(b), round: roundNo });
  }

  broadcast(io, t);
  setupDone = true;
  maybeDone();
}

function completeRound(io, t, winners, losers) {
  // The round that leaves exactly two alive is the semifinal — its losers
  // (one or two, byes permitting) contend for bronze.
  if (winners.length === 2) t.bronze = losers;
  t.alive = winners;
  t.round += 1;
  broadcast(io, t);
  t.timer = setTimeout(() => {
    t.timer = null;
    if (tournaments.has(t.roomKey)) runRound(io, t);
  }, ROUND_GAP_MS);
}

// Final round: Bo3 final for 1st/2nd and the bronze match for 3rd, run
// concurrently.
function runFinalRound(io, t, roundNo) {
  t.live = [];
  let pending = 0;
  let setupDone = false;
  const maybeDone = () => {
    if (setupDone && pending === 0) finish(io, t);
  };
  const done = () => {
    pending -= 1;
    maybeDone();
  };

  // --- Bronze (3rd place) ---
  const bc = (t.bronze ?? []).filter(Boolean);
  if (bc.length === 1) {
    // Only one semifinal loser (odd bracket) — 3rd place by default.
    t.placements[3] = bc[0];
  } else if (bc.length === 2) {
    const [a, b] = bc;
    const aGone = gone(t, a.id);
    const bGone = gone(t, b.id);
    if (aGone || bGone) {
      const w = !aGone ? a : b;
      t.placements[3] = w;
      t.history.push({ round: roundNo, a: pub(a), b: pub(b), winnerId: w.id, wo: true, bronze: true });
    } else {
      pending += 1;
      const m = createMatch(
        io,
        t.roomKey,
        [withSocket(a), withSocket(b)],
        matchOpts(t, { round: roundNo, bronze: true }),
        (winnerId, results) => {
          recordStats(t, results);
          t.placements[3] = winnerId === a.id ? a : b;
          t.history.push({
            round: roundNo,
            a: pub(a),
            b: pub(b),
            winnerId,
            aWpm: results.find((r) => r.id === a.id)?.wpm ?? 0,
            bWpm: results.find((r) => r.id === b.id)?.wpm ?? 0,
            bronze: true,
          });
          t.live = t.live.filter((x) => x.matchId !== m.id);
          broadcast(io, t);
          done();
        }
      );
      t.live.push({ matchId: m.id, a: pub(a), b: pub(b), bronze: true, round: roundNo });
    }
  }

  // --- Final (best of 3) ---
  const [fa, fb] = t.alive;
  pending += 1;
  runFinalSeries(io, t, fa, fb, roundNo, (winner, loser) => {
    t.placements[1] = winner;
    t.placements[2] = loser;
    broadcast(io, t);
    done();
  });

  broadcast(io, t);
  setupDone = true;
  maybeDone();
}

function runFinalSeries(io, t, a, b, roundNo, onDecided) {
  const series = { game: 0, aWins: 0, bWins: 0 };

  const playGame = () => {
    if (!tournaments.has(t.roomKey)) return;

    const aGone = gone(t, a.id);
    const bGone = gone(t, b.id);
    if (aGone || bGone) {
      const w = !aGone ? a : b;
      t.history.push({
        round: roundNo, a: pub(a), b: pub(b), winnerId: w.id, wo: true, finalGame: series.game + 1,
      });
      onDecided(w, w === a ? b : a);
      return;
    }

    series.game += 1;
    const meta = {
      round: roundNo,
      final: { game: series.game, aWins: series.aWins, bWins: series.bWins, wins: FINAL_WINS_NEEDED },
    };
    const m = createMatch(
      io,
      t.roomKey,
      [withSocket(a), withSocket(b)],
      matchOpts(t, meta),
      (winnerId, results) => {
        recordStats(t, results);
        if (winnerId === a.id) series.aWins += 1;
        else if (winnerId === b.id) series.bWins += 1;
        t.history.push({
          round: roundNo,
          a: pub(a),
          b: pub(b),
          winnerId,
          aWpm: results.find((r) => r.id === a.id)?.wpm ?? 0,
          bWpm: results.find((r) => r.id === b.id)?.wpm ?? 0,
          finalGame: series.game,
        });
        t.live = t.live.filter((x) => x.matchId !== m.id);

        if (series.aWins >= FINAL_WINS_NEEDED) return onDecided(a, b);
        if (series.bWins >= FINAL_WINS_NEEDED) return onDecided(b, a);
        broadcast(io, t);
        setTimeout(playGame, ROUND_GAP_MS);
      }
    );
    t.live.push({
      matchId: m.id,
      a: pub(a),
      b: pub(b),
      round: roundNo,
      series: { game: series.game, aWins: series.aWins, bWins: series.bWins },
    });
    broadcast(io, t);
  };

  playGame();
}

function finish(io, t) {
  t.status = "finished";
  t.live = [];
  broadcast(io, t);
  io.to(t.roomKey).emit("tournament:over", { standings: standings(t) });
  tournaments.delete(t.roomKey);
}

export function withdrawFromTournament(io, playerId) {
  const t = [...tournaments.values()].find((tt) =>
    tt.allPlayers.some((p) => p.id === playerId)
  );
  if (!t) return;
  t.withdrawn.add(playerId);
  broadcast(io, t);
}

export function cancelTournament(roomKey) {
  const t = tournaments.get(roomKey);
  if (!t) return;
  if (t.timer) clearTimeout(t.timer);
  tournaments.delete(roomKey);
}

// --- serialization ---

const pub = (p) => ({ id: p.id, name: p.name });

function statsFor(t, id) {
  const s = t.stats.get(id);
  if (!s || s.races === 0) return null;
  return {
    races: s.races,
    avgWpm: Math.round(s.sumWpm / s.races),
    bestWpm: s.bestWpm,
    accuracy: Math.round(s.sumAcc / s.races),
  };
}

function standings(t) {
  return Object.entries(t.placements)
    .map(([place, p]) => ({
      place: Number(place),
      id: p.id,
      name: p.name,
      stats: statsFor(t, p.id),
    }))
    .sort((a, b) => a.place - b.place);
}

function publicView(t) {
  const placedIds = new Set(Object.values(t.placements).map((p) => p.id));
  const contenders = new Map();
  if (t.status !== "finished") {
    for (const p of t.alive) contenders.set(p.id, p);
    for (const p of t.bronze ?? []) contenders.set(p.id, p);
  }
  const remaining = [...contenders.values()]
    .filter((p) => !placedIds.has(p.id))
    .map(pub);

  return {
    mode: "knockout",
    status: t.status,
    round: t.round,
    totalRounds: Math.max(1, Math.ceil(Math.log2(t.totalPlayers))),
    totalPlayers: t.totalPlayers,
    standings: standings(t),
    live: t.live,
    history: t.history,
    remaining,
  };
}

function broadcast(io, t) {
  io.to(t.roomKey).emit("bracket:update", publicView(t));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
