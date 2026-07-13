import { socket } from "./socket";
import { playerId } from "./identity";
import { t, ordinal, useLang } from "./i18n";
import { sound } from "./sound";
import { useEffect, useRef } from "react";
import Confetti from "./Confetti";
import ChatBox from "./ChatBox";

const medal = (place) =>
  place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : `#${place}`;

export default function Standings({ data, liveState, role, chat, onLeave, isHost, onNewTournament }) {
  useLang();
  const me = playerId;
  const standings = data.standings ?? [];
  const live = data.live ?? [];
  const remaining = data.remaining ?? [];
  const history = data.history ?? [];
  const finished = data.status === "finished";
  const currentRound = Math.min((data.round ?? 0) + 1, data.totalRounds ?? 1);
  const myPlace = standings.find((s) => s.id === me);
  const inLive = live.some((l) => l.a.id === me || l.b.id === me);
  const iAmChampion = finished && myPlace?.place === 1;
  // Fresh per-player progress keyed by matchId (tribune ticker, 2×/sec).
  const liveByMatch = {};
  for (const m of liveState?.matches ?? []) liveByMatch[m.matchId] = m;

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
      <StatusBanner
        finished={finished}
        myPlace={myPlace}
        inLive={inLive}
        spectator={role === "spectator"}
      />

      {!finished && (
        <div className="round-indicator">
          {t("roundOf", currentRound, data.totalRounds ?? currentRound)}
        </div>
      )}

      {!finished && live.length > 0 && (
        <section className="section">
          <h3 className="section-title">{t("liveNow")}</h3>
          <div className="live-grid">
            {live.map((l) => (
              <LiveMatchCard
                key={l.matchId}
                pairing={l}
                snapshot={liveByMatch[l.matchId]}
                me={me}
              />
            ))}
          </div>
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

      {history.length > 0 && (
        <section className="section">
          <h3 className="section-title">{t("historyTitle")}</h3>
          <HistoryList history={history} me={me} />
        </section>
      )}

      <ChatBox messages={chat} defaultCollapsed />

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

const REACTION_EMOJIS = ["👏", "🔥", "😂", "😮"];

// One live match in the tribune view: both players' bars, WPM, accuracy, and
// who's ahead — updates twice a second from the server's live:state ticker.
function LiveMatchCard({ pairing, snapshot, me }) {
  const players =
    snapshot?.players ??
    [pairing.a, pairing.b].map((p) => ({ ...p, progress: 0, wpm: 0, accuracy: 100 }));
  const leaderId =
    players[0].progress === players[1]?.progress
      ? null
      : players.reduce((a, b) => (a.progress >= b.progress ? a : b)).id;
  const mine = pairing.a.id === me || pairing.b.id === me;

  function react(emoji) {
    socket.emit("react:send", { matchId: pairing.matchId, emoji });
  }

  return (
    <div className={`live-card ${mine ? "mine" : ""}`}>
      <div className="live-card-head">
        <span className="live-range">
          {pairing.rangeStart === pairing.rangeEnd
            ? t("forPlace", ordinal(pairing.rangeStart))
            : t("forPlaces", pairing.rangeStart, pairing.rangeEnd)}
        </span>
        {pairing.series && (
          <span className="final-inline">
            FINAL {pairing.series.aWins}:{pairing.series.bWins}
          </span>
        )}
      </div>

      {players.map((p) => (
        <div className="live-player" key={p.id}>
          <div className="live-player-row">
            <span className={`lp-name ${p.id === leaderId ? "lead" : ""}`}>
              {p.name}
              {p.id === me ? ` (${t("you")})` : ""}
              {p.id === leaderId ? " ⚡" : ""}
              {p.finished ? " ✓" : ""}
            </span>
            <span className="lp-stats">
              {p.wpm || 0} wpm · {p.accuracy ?? 100}%
            </span>
          </div>
          <div className="bar-track slim">
            <div
              className={`bar-fill ${p.id === leaderId ? "mine" : "opp"}`}
              style={{ width: `${Math.round((p.progress || 0) * 100)}%` }}
            />
          </div>
        </div>
      ))}

      {!mine && (
        <div className="live-react">
          {REACTION_EMOJIS.map((e) => (
            <button key={e} className="react-btn tiny" onClick={() => react(e)}>
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryList({ history, me }) {
  // Group entries by round, preserving order.
  const rounds = [];
  for (const h of history) {
    let r = rounds.find((x) => x.round === h.round);
    if (!r) {
      r = { round: h.round, items: [] };
      rounds.push(r);
    }
    r.items.push(h);
  }

  return (
    <div className="history">
      {rounds.map((r) => (
        <div key={r.round} className="history-round">
          <div className="history-round-title">{t("roundLabel", r.round)}</div>
          {r.items.map((h, i) => (
            <HistoryRow key={i} h={h} me={me} />
          ))}
        </div>
      ))}
    </div>
  );
}

function HistoryRow({ h, me }) {
  const mine = h.a?.id === me || h.b?.id === me;
  if (h.bye) {
    return (
      <div className={`history-row ${mine ? "me" : ""}`}>
        <span className="h-name">{h.a.name}</span>
        <span className="h-note">{t("byeNote")}</span>
      </div>
    );
  }
  const aWon = h.winnerId === h.a.id;
  return (
    <div className={`history-row ${mine ? "me" : ""}`}>
      <span className={`h-name ${aWon ? "h-won" : "h-lost"}`}>
        {h.a.name}
        {aWon ? " ✓" : ""}
        {!h.wo && typeof h.aWpm === "number" ? ` · ${h.aWpm}` : ""}
      </span>
      <span className="h-vs">vs</span>
      <span className={`h-name ${!aWon ? "h-won" : "h-lost"}`}>
        {h.b.name}
        {!aWon ? " ✓" : ""}
        {!h.wo && typeof h.bWpm === "number" ? ` · ${h.bWpm}` : ""}
      </span>
      {h.finalGame && <span className="h-note">{t("finalGameShort", h.finalGame)}</span>}
      {h.wo && <span className="h-note">{t("woNote")}</span>}
    </div>
  );
}

function StatusBanner({ finished, myPlace, inLive, spectator }) {
  if (spectator) {
    return <div className="banner">{t("spectatorMode")}</div>;
  }
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
