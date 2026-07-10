import { createMatch } from "./match.js";
import { isConnected, getPlayer } from "./rooms.js";

// Full-placement tournament: every player is ranked 1st..Nth. Each round, every
// still-competing GROUP pairs up and races. Winners drop into the top half of
// their group's placement range, losers into the bottom half. Groups shrink
// until each is size 1 — that player's exact place is locked in. Losers keep
// playing other losers all the way down. Odd player out gets a bye.
//
// The FINAL (the 2-player group for places 1–2) is a best-of-3 series: first
// to 2 game wins is champion.

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
    groups: [{ players, placeStart: 1 }],
    placements: {}, // place -> player
    live: [],
    stats: new Map(), // playerId -> { races, sumWpm, bestWpm, sumAcc }
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
  const playing = [];
  for (const g of t.groups) {
    if (g.players.length === 1) t.placements[g.placeStart] = g.players[0];
    else if (g.players.length >= 2) playing.push(g);
  }

  if (playing.length === 0) {
    finish(io, t);
    return;
  }

  t.live = [];
  // A pairing may resolve synchronously (walkover inside the final series), so
  // only declare the round complete once the setup loop has finished AND every
  // started pairing has reported back.
  let pending = 0;
  let setupDone = false;
  const maybeDone = () => {
    if (setupDone && pending === 0) onRoundDone(io, t, playing);
  };
  const done = () => {
    pending -= 1;
    maybeDone();
  };

  for (const g of playing) {
    g._winners = [];
    g._losers = [];

    // The final is a best-of-3 series, not a single race.
    if (g.players.length === 2 && g.placeStart === 1) {
      pending += 1;
      runFinalSeries(io, t, g, done);
      continue;
    }

    const shuffled = shuffle([...g.players]);
    const pairs = [];
    while (shuffled.length >= 2) pairs.push([shuffled.pop(), shuffled.pop()]);
    if (shuffled.length === 1) g._winners.push(shuffled.pop()); // bye

    for (const [a, b] of pairs) {
      // Walkover if someone already left or is offline right now.
      const aGone = gone(t, a.id);
      const bGone = gone(t, b.id);
      if (aGone || bGone) {
        const w = !aGone ? a : b;
        const l = w === a ? b : a;
        g._winners.push(w);
        g._losers.push(l);
        continue;
      }

      pending += 1;
      const m = createMatch(
        io,
        t.roomKey,
        [withSocket(a), withSocket(b)],
        { wordCount: t.settings.wordCount, wordLang: t.settings.wordLang },
        (winnerId, results) => {
          recordStats(t, results);
          const w = a.id === winnerId ? a : b;
          const l = a.id === winnerId ? b : a;
          g._winners.push(w);
          g._losers.push(l);
          t.live = t.live.filter((x) => x.matchId !== m.id);
          broadcast(io, t);
          done();
        }
      );
      t.live.push({
        matchId: m.id,
        a: pub(a),
        b: pub(b),
        rangeStart: g.placeStart,
        rangeEnd: g.placeStart + g.players.length - 1,
      });
    }
  }

  broadcast(io, t);
  setupDone = true;
  maybeDone();
}

// Best-of-3 final between g.players[0] and g.players[1].
function runFinalSeries(io, t, g, done) {
  const [a, b] = g.players;
  const series = { game: 0, aWins: 0, bWins: 0 };

  const playGame = () => {
    if (!tournaments.has(t.roomKey)) return;

    // Someone left mid-series — the other takes the title.
    const aGone = gone(t, a.id);
    const bGone = gone(t, b.id);
    if (aGone || bGone) {
      settle(!aGone ? a : b, aGone && bGone ? null : undefined);
      return;
    }

    series.game += 1;
    const meta = {
      final: { game: series.game, aWins: series.aWins, bWins: series.bWins, wins: FINAL_WINS_NEEDED },
    };
    const m = createMatch(
      io,
      t.roomKey,
      [withSocket(a), withSocket(b)],
      { wordCount: t.settings.wordCount, wordLang: t.settings.wordLang, meta },
      (winnerId, results) => {
        recordStats(t, results);
        if (winnerId === a.id) series.aWins += 1;
        else if (winnerId === b.id) series.bWins += 1;
        t.live = t.live.filter((x) => x.matchId !== m.id);

        if (series.aWins >= FINAL_WINS_NEEDED) return settle(a);
        if (series.bWins >= FINAL_WINS_NEEDED) return settle(b);
        broadcast(io, t);
        setTimeout(playGame, ROUND_GAP_MS);
      }
    );
    t.live.push({
      matchId: m.id,
      a: pub(a),
      b: pub(b),
      rangeStart: 1,
      rangeEnd: 2,
      series: { game: series.game, aWins: series.aWins, bWins: series.bWins },
    });
    broadcast(io, t);
  };

  const settle = (winner) => {
    const loser = winner === a ? b : a;
    g._winners.push(winner);
    g._losers.push(loser);
    broadcast(io, t);
    done();
  };

  playGame();
}

function onRoundDone(io, t, playing) {
  const next = [];
  for (const g of playing) {
    if (g._winners.length) next.push({ players: g._winners, placeStart: g.placeStart });
    if (g._losers.length)
      next.push({ players: g._losers, placeStart: g.placeStart + g._winners.length });
  }
  t.groups = next;
  t.round += 1;
  broadcast(io, t);
  t.timer = setTimeout(() => {
    t.timer = null;
    if (tournaments.has(t.roomKey)) runRound(io, t);
  }, ROUND_GAP_MS);
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
  const placed = new Set(Object.values(t.placements).map((p) => p.id));
  return {
    mode: "placement",
    status: t.status,
    round: t.round,
    totalPlayers: t.totalPlayers,
    standings: standings(t),
    live: t.live,
    remaining: t.allPlayers.filter((p) => !placed.has(p.id)).map(pub),
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
