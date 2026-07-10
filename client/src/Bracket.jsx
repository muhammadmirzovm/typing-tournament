import { socket } from "./socket";

export default function Bracket({ bracket, onLeave, isHost, onNewTournament, onWatch }) {
  const me = socket.id;
  const status = playerStatus(bracket, me);
  const roundName = (i, total) => {
    const fromEnd = total - 1 - i;
    if (fromEnd === 0) return "Final";
    if (fromEnd === 1) return "Semifinal";
    if (fromEnd === 2) return "Quarterfinal";
    return `Round ${i + 1}`;
  };

  return (
    <div className="card bracket">
      <StatusBanner bracket={bracket} status={status} me={me} />

      <div className="rounds">
        {bracket.rounds.map((round, ri) => (
          <div className="round" key={ri}>
            <div className="round-title">
              {roundName(ri, bracket.rounds.length)}
            </div>
            {round.map((p, pi) => (
              <Pairing
                key={pi}
                pairing={p}
                me={me}
                active={ri === bracket.currentRound}
                onWatch={onWatch}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="lobby-actions">
        {bracket.status === "finished" && isHost && (
          <button className="btn block" onClick={onNewTournament}>
            New tournament (same players)
          </button>
        )}
        <button className="btn ghost block" onClick={onLeave}>
          Leave
        </button>
      </div>
    </div>
  );
}

function Pairing({ pairing, me, active, onWatch }) {
  const { a, b, winnerId, status, matchId } = pairing;
  // Show a Watch button for a live match you're not playing in.
  const canWatch =
    status === "racing" && matchId && a?.id !== me && b?.id !== me;
  return (
    <div className={`pairing ${active ? "active" : ""} ${status}`}>
      <Slot player={a} winnerId={winnerId} me={me} />
      <div className="vs">{status === "bye" ? "bye" : "vs"}</div>
      <Slot player={b} winnerId={winnerId} me={me} />
      {canWatch && (
        <button className="btn small watch" onClick={() => onWatch(matchId)}>
          👁 Watch
        </button>
      )}
    </div>
  );
}

function Slot({ player, winnerId, me }) {
  if (!player) return <div className="slot empty">—</div>;
  const isWinner = winnerId === player.id;
  const isMe = player.id === me;
  return (
    <div className={`slot ${isWinner ? "won" : winnerId ? "lost" : ""} ${isMe ? "me" : ""}`}>
      {player.name}
      {player.isBot ? " 🤖" : ""}
      {isMe ? " (you)" : ""}
      {isWinner ? " ✓" : ""}
    </div>
  );
}

function StatusBanner({ bracket, status, me }) {
  if (bracket.status === "finished" && bracket.champion) {
    const youWon = bracket.champion.id === me;
    return (
      <div className={`banner ${youWon ? "win" : ""}`}>
        🏆 {youWon ? "You are the champion!" : `${bracket.champion.name} wins the tournament`}
      </div>
    );
  }
  if (status === "eliminated") {
    return <div className="banner lose">❌ Eliminated — spectating</div>;
  }
  return <div className="banner">⏳ Waiting for your next match…</div>;
}

// Am I still in it? Find the furthest round I appear in; if I lost a decided
// pairing there, I'm out.
function playerStatus(bracket, me) {
  for (let ri = bracket.rounds.length - 1; ri >= 0; ri--) {
    for (const p of bracket.rounds[ri]) {
      const inIt = p.a?.id === me || p.b?.id === me;
      if (!inIt) continue;
      if (p.winnerId && p.winnerId !== me) return "eliminated";
      return "alive";
    }
  }
  return "alive";
}
