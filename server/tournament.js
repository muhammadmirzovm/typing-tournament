import { createMatch } from "./match.js";

// Full-placement tournament: every player is ranked 1st..Nth. Each round, every
// still-competing GROUP pairs up and races. Winners drop into the top half of
// their group's placement range, losers into the bottom half. Groups shrink
// until each is size 1 — that player's exact place is locked in. Losers keep
// playing other losers the whole way down. Odd player out gets a bye (advances).
// All in-memory.

const tournaments = new Map(); // roomKey -> tournament
const ROUND_GAP_MS = 1800;

export function startTournament(io, room) {
  const players = room.players.map((p) => ({ id: p.id, name: p.name }));

  const t = {
    roomKey: room.key,
    status: "running",
    round: 0,
    totalPlayers: players.length,
    allPlayers: players,
    groups: [{ players, placeStart: 1 }], // one group competing for [1..N]
    placements: {}, // place(number) -> player
    live: [], // matches currently being raced (for spectating)
    withdrawn: new Set(),
    timer: null,
  };
  tournaments.set(room.key, t);

  broadcast(io, t);
  runRound(io, t);
  return t;
}

function runRound(io, t) {
  // Finalize any size-1 groups; collect groups that still need to play.
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
  let pending = 0;

  for (const g of playing) {
    const shuffled = shuffle([...g.players]);
    g._winners = [];
    g._losers = [];

    const pairs = [];
    while (shuffled.length >= 2) pairs.push([shuffled.pop(), shuffled.pop()]);
    if (shuffled.length === 1) g._winners.push(shuffled.pop()); // bye advances

    for (const [a, b] of pairs) {
      // Walkover if someone left before the match.
      const aGone = t.withdrawn.has(a.id);
      const bGone = t.withdrawn.has(b.id);
      if (aGone || bGone) {
        const w = !aGone ? a : b;
        const l = w === a ? b : a;
        g._winners.push(w);
        g._losers.push(l);
        continue;
      }

      pending += 1;
      const m = createMatch(io, t.roomKey, [a, b], (winnerId) => {
        const w = a.id === winnerId ? a : b;
        const l = a.id === winnerId ? b : a;
        g._winners.push(w);
        g._losers.push(l);
        t.live = t.live.filter((x) => x.matchId !== m.id);
        broadcast(io, t);
        pending -= 1;
        if (pending === 0) onRoundDone(io, t, playing);
      });
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
  if (pending === 0) onRoundDone(io, t, playing); // whole round resolved by walkovers
}

function onRoundDone(io, t, playing) {
  const next = [];
  for (const g of playing) {
    // Winners take the top of the range, losers the bottom.
    if (g._winners.length) {
      next.push({ players: g._winners, placeStart: g.placeStart });
    }
    if (g._losers.length) {
      next.push({
        players: g._losers,
        placeStart: g.placeStart + g._winners.length,
      });
    }
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

export function withdrawFromTournament(io, socketId) {
  const t = [...tournaments.values()].find((tt) =>
    tt.allPlayers.some((p) => p.id === socketId)
  );
  if (!t) return;
  t.withdrawn.add(socketId);
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

function standings(t) {
  return Object.entries(t.placements)
    .map(([place, p]) => ({ place: Number(place), id: p.id, name: p.name }))
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
    live: t.live.map((l) => ({
      matchId: l.matchId,
      a: l.a,
      b: l.b,
      rangeStart: l.rangeStart,
      rangeEnd: l.rangeEnd,
    })),
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
