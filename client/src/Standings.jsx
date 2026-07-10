import { playerId } from "./identity";
import { t, ordinal, useLang } from "./i18n";
import { sound } from "./sound";
import { useEffect, useRef } from "react";
import Confetti from "./Confetti";
import ChatBox from "./ChatBox";

const medal = (place) =>
  place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : `#${place}`;

export default function Standings({ data, chat, onLeave, isHost, onNewTournament, onWatch }) {
  useLang();
  const me = playerId;
  const standings = data.standings ?? [];
  const live = data.live ?? [];
  const remaining = data.remaining ?? [];
  const finished = data.status === "finished";
  const myPlace = standings.find((s) => s.id === me);
  const inLive = live.some((l) => l.a.id === me || l.b.id === me);
  const iAmChampion = finished && myPlace?.place === 1;

  // Champion fanfare, once.
  const cheered = useRef(false);
  useEffect(() => {
    if (finished && !cheered.current) {
      cheered.current = true;
      if (iAmChampion) sound.champion();
    }
  }, [finished, iAmChampion]);

  return (
    <div className="card standings">
      {finished && <Confetti />}
      <StatusBanner finished={finished} myPlace={myPlace} inLive={inLive} />

      {!finished && live.length > 0 && (
        <section className="section">
          <h3 className="section-title">{t("liveNow")}</h3>
          {live.map((l) => {
            const mine = l.a.id === me || l.b.id === me;
            return (
              <div className="live-row" key={l.matchId}>
                <span className="live-players">
                  {l.a.name} vs {l.b.name}
                  {l.series && (
                    <span className="final-inline">
                      {" "}
                      · FINAL {l.series.aWins}:{l.series.bWins}
                    </span>
                  )}
                </span>
                <span className="live-range">
                  {l.rangeStart === l.rangeEnd
                    ? t("forPlace", ordinal(l.rangeStart))
                    : t("forPlaces", l.rangeStart, l.rangeEnd)}
                </span>
                {!mine && (
                  <button className="btn small watch" onClick={() => onWatch(l.matchId)}>
                    {t("watch")}
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      {!finished && remaining.length > 0 && (
        <section className="section">
          <h3 className="section-title">
            {t("stillCompeting")} <span className="muted">({remaining.length})</span>
          </h3>
          <div className="chips">
            {remaining.map((p) => (
              <span key={p.id} className={`chip ${p.id === me ? "me" : ""}`}>
                {p.name}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h3 className="section-title">
          {finished ? t("finalStandings") : t("placesSoFar")}
        </h3>
        {standings.length === 0 ? (
          <p className="muted small">{t("noPlaces")}</p>
        ) : (
          <ol className="rank-list">
            {standings.map((s) => (
              <li
                key={s.id}
                className={`rank-row ${s.id === me ? "me" : ""} ${s.place <= 3 ? "podium" : ""}`}
              >
                <span className="rank-place">{medal(s.place)}</span>
                <span className="rank-name">
                  {s.name}
                  {s.id === me ? ` (${t("you")})` : ""}
                </span>
                {s.stats && (
                  <span className="rank-stats">
                    {s.stats.avgWpm} wpm {t("avg")} · {s.stats.bestWpm} {t("best")} ·{" "}
                    {s.stats.accuracy}%
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <ChatBox messages={chat} />

      <div className="lobby-actions">
        {finished && isHost && (
          <button className="btn block" onClick={onNewTournament}>
            {t("newTournament")}
          </button>
        )}
        <button className="btn ghost block" onClick={onLeave}>
          {t("leave")}
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
        {top ? t("champion") : t("finishedAs", ordinal(myPlace.place))}
      </div>
    );
  }
  if (myPlace) {
    return <div className="banner">{t("lockedPlace", ordinal(myPlace.place))}</div>;
  }
  if (inLive) {
    return <div className="banner">{t("racingNow")}</div>;
  }
  return <div className="banner">{t("waitingNext")}</div>;
}
