import { createMatch } from "./match.js";

// Single-elimination bracket orchestration. Each pairing in a round is one
// match (reusing match.js). Winners advance to the next round, preserving
// bracket position, until one champion remains. All in-memory.

const tournaments = new Map(); // roomKey -> tournament

const ROUND_GAP_MS = 1800; // pause between rounds so the bracket update is seen

export function startTournament(io, room) {
  const players = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: !!p.isBot,
  }));

  const t = {
    roomKey: room.key,
    status: "running",
    currentRound: 0,
    rounds: [],
    champion: null,
    withdrawn: new Set(), // ids of players who left mid-tournament
    timer: null, // pending setTimeout for the next round
  };
  tournaments.set(room.key, t);

  t.rounds.push(buildPairings(shuffle(players)));
  broadcast(io, t);
  runRound(io, t);
  return t;
}

// Pair players two at a time. An odd player out gets a bot opponent so they
// still race instead of getting a free pass.
function buildPairings(players) {
  const pairings = [];
  for (let i = 0; i < players.length; i += 2) {
    const a = players[i];
    const b = players[i + 1] || makeBot();
    pairings.push({ a, b, winner: null, winnerId: null, status: "pending" });
  }
  return pairings;
}

const BOT_NAMES = [
  "RoboTyper", "ByteBot", "KeyMash 3000", "AutoFinger", "QwertyBot",
  "TypeTron", "ClackBot", "SpeedDroid",
];
let botSeq = 0;

function makeBot() {
  const name = BOT_NAMES[botSeq % BOT_NAMES.length];
  return { id: `bot-${++botSeq}`, name, isBot: true };
}

function runRound(io, t) {
  const round = t.rounds[t.currentRound];
  let pending = 0;

  round.forEach((pairing) => {
    if (pairing.status !== "pending") return;

    // If a player left before their match starts, the present player wins by
    // walkover (no match is created). If both left, the branch dies.
    const aGone = t.withdrawn.has(pairing.a.id);
    const bGone = t.withdrawn.has(pairing.b.id);
    if (aGone || bGone) {
      const winner = aGone === bGone ? null : aGone ? pairing.b : pairing.a;
      pairing.winner = winner;
      pairing.winnerId = winner?.id ?? null;
      pairing.status = "done";
      return;
    }

    pending += 1;
    pairing.status = "racing";

    const m = createMatch(io, t.roomKey, [pairing.a, pairing.b], (winnerId) => {
      pairing.winnerId = winnerId;
      pairing.winner = pairing.a.id === winnerId ? pairing.a : pairing.b;
      pairing.status = "done";
      pairing.matchId = null;
      broadcast(io, t);
      pending -= 1;
      if (pending === 0) onRoundComplete(io, t);
    });
    pairing.matchId = m.id; // lets spectators watch this live match
  });

  broadcast(io, t);
  if (pending === 0) onRoundComplete(io, t); // every pairing resolved without a live match
}

function onRoundComplete(io, t) {
  const winners = t.rounds[t.currentRound]
    .map((p) => p.winner)
    .filter(Boolean);

  if (winners.length <= 1) {
    t.status = "finished";
    t.champion = winners[0] || null;
    broadcast(io, t);
    io.to(t.roomKey).emit("tournament:over", {
      champion: t.champion ? { id: t.champion.id, name: t.champion.name } : null,
    });
    tournaments.delete(t.roomKey);
    return;
  }

  t.rounds.push(buildPairings(winners));
  t.currentRound += 1;
  broadcast(io, t);
  t.timer = setTimeout(() => {
    t.timer = null;
    if (tournaments.has(t.roomKey)) runRound(io, t);
  }, ROUND_GAP_MS);
}

// A player left mid-tournament. Their active match (if any) is already ended by
// match.js; here we mark them so any *future* pairing forfeits to the opponent.
export function withdrawFromTournament(io, socketId) {
  for (const t of tournaments.values()) {
    const inIt = t.rounds.some((r) =>
      r.some((p) => p.a?.id === socketId || p.b?.id === socketId)
    );
    if (!inIt) continue;
    t.withdrawn.add(socketId);
    broadcast(io, t);
  }
}

// Tear down a tournament whose room has emptied (all humans gone).
export function cancelTournament(roomKey) {
  const t = tournaments.get(roomKey);
  if (!t) return;
  if (t.timer) clearTimeout(t.timer);
  tournaments.delete(roomKey);
}

function publicBracket(t) {
  return {
    status: t.status,
    currentRound: t.currentRound,
    champion: t.champion
      ? { id: t.champion.id, name: t.champion.name }
      : null,
    rounds: t.rounds.map((round) =>
      round.map((p) => ({
        a: p.a ? { id: p.a.id, name: p.a.name, isBot: p.a.isBot } : null,
        b: p.b ? { id: p.b.id, name: p.b.name, isBot: p.b.isBot } : null,
        matchId: p.status === "racing" ? p.matchId ?? null : null,
        winnerId: p.winnerId ?? null,
        status: p.status,
      }))
    ),
  };
}

function broadcast(io, t) {
  io.to(t.roomKey).emit("bracket:update", publicBracket(t));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
