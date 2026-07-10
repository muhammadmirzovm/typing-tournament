import { socket } from "./socket";

const medal = (place) => (place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : `#${place}`);

export default function Standings({ data, onLeave, isHost, onNewTournament, onWatch }) {
  const me = socket.id;
  const finished = data.status === "finished";
  const myPlace = data.standings.find((s) => s.id === me);
  const inLive = data.live.some((l) => l.a.id === me || l.b.id === me);

  return (
    <div className="card standings">
      <StatusBanner finished={finished} myPlace={myPlace} inLive={inLive} />

      {/* Live matches you can watch */}
      {!finished && data.live.length > 0 && (
        <section className="section">
          <h3 className="section-title">🔴 Live now</h3>
          {data.live.map((l) => {
            const mine = l.a.id === me || l.b.id === me;
            return (
              <div className="live-row" key={l.matchId}>
                <span className="live-players">
                  {l.a.name} vs {l.b.name}
                </span>
                <span className="live-range">
                  {rangeLabel(l.rangeStart, l.rangeEnd)}
                </span>
                {!mine && (
                  <button className="btn small watch" onClick={() => onWatch(l.matchId)}>
                    👁 Watch
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Players still fighting for a place */}
      {!finished && data.remaining.length > 0 && (
        <section className="section">
          <h3 className="section-title">
            Still competing <span className="muted">({data.remaining.length})</span>
          </h3>
          <div className="chips">
            {data.remaining.map((p) => (
              <span key={p.id} className={`chip ${p.id === me ? "me" : ""}`}>
                {p.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Final standings as they lock in */}
      <section className="section">
        <h3 className="section-title">
          {finished ? "🏆 Final standings" : "Places so far"}
        </h3>
        {data.standings.length === 0 ? (
          <p className="muted small">No places decided yet…</p>
        ) : (
          <ol className="rank-list">
            {data.standings.map((s) => (
              <li key={s.id} className={`rank-row ${s.id === me ? "me" : ""} ${s.place <= 3 ? "podium" : ""}`}>
                <span className="rank-place">{medal(s.place)}</span>
                <span className="rank-name">
                  {s.name}
                  {s.id === me ? " (you)" : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="lobby-actions">
        {finished && isHost && (
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

function StatusBanner({ finished, myPlace, inLive }) {
  if (finished && myPlace) {
    const top = myPlace.place === 1;
    return (
      <div className={`banner ${top ? "win" : ""}`}>
        {top ? "🏆 You are the champion!" : `You finished ${ordinal(myPlace.place)}`}
      </div>
    );
  }
  if (myPlace) {
    return <div className="banner">Your place is locked: {ordinal(myPlace.place)} — spectating</div>;
  }
  if (inLive) {
    return <div className="banner">You're racing now…</div>;
  }
  return <div className="banner">⏳ Waiting for your next match — watch the live races below</div>;
}

function rangeLabel(start, end) {
  if (start === end) return `for ${ordinal(start)}`;
  return `for places ${start}–${end}`;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
