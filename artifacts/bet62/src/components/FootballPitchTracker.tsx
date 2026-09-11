// 2D mini-pitch live tracker (football only) — user-requested 2026-09-11:
// ball movement driven by the arrival of new commentary lines
// (LiveMatchState._commentary, GOAL API's /fixtures/:id/commentary — see
// buildGoalApiCommentary, services/goalapi/common.ts).
//
// IMPORTANT — what this does and doesn't claim: GOAL API has no live
// ball/player coordinate feed (confirmed across this whole integration —
// every "live tracking" provider evaluated this project only ever gave
// score/events/stats/commentary, never x/y positions). The ball's position
// here is an illustrative approximation derived from two 100%-real signals
// in each commentary line — which team is acting (the line always starts
// with "{TeamName} ...", confirmed from real captured responses) and what
// kind of action it is ("free kick", "corner", "goal kick", "dangerous
// attack", ...) — mapped to the pitch zone that action type actually
// happens in. It is not a claim of exact real-time ball tracking, the same
// honest "derived, not fabricated" convention this app already applies
// everywhere else.
//
// Revised 2026-09-11 per user feedback on the first version:
// - Dropped the whole side event-panel (live-status ticker, current-event
//   card, full timeline) — that's what made the pitch render tiny on
//   desktop (a hardcoded 245px side column ate almost all the width of
//   the 384px-wide slot this renders inside on desktop). The component is
//   single-column now, so the pitch gets the full width.
// - The removed space is now a 3-way tab row (Mini Campo / Estatísticas /
//   H2H) that swaps what's shown inside the SAME bounded box — reusing
//   data the app already fetches elsewhere (v2StatsGroups, confrontosData)
//   rather than triggering any new request.
// - The whole component renders nothing at all when there's no commentary
//   for this match — that's the signal this specific fixture has no
//   commentary feed, so the page falls back to the traditional layout
//   with no mini pitch, exactly as before this feature existed.
//
// Revised again 2026-09-11 — replay queue: the backend now polls
// /fixtures/:id/commentary every 3s (kvCache TTL), and each entry carries
// a stable `id`. Previously this component only ever reacted to
// commentary[0] (whatever was newest at fetch time), so if more than one
// new line landed between two polls the ball would silently skip straight
// to the latest one. Now every commentary update is diffed against the
// ids already shown, and any truly-new ones are queued in chronological
// order and animated one at a time (each held for ~950ms, matching the
// ball's own 900ms CSS transition) instead of only ever showing the most
// recent. In practice this rarely fires more than one at a time — GOAL
// API's own commentary feed only writes new rows in batches roughly every
// 2 minutes (see the COMMENTARY TTL comment in services/goalapi/index.ts)
// — but it's cheap correctness for the rare case a poll catches two.
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Activity, Users } from "lucide-react";

export type PitchTrackerCommentaryEntry = { id: string; time: string; text: string };
export type PitchTrackerStatsGroup = { title: string; rows: Array<{ name: string; home: string; away: string }> };
export type PitchTrackerH2HMeeting = {
  date: string;
  team1: string;
  team2: string;
  score1: number;
  score2: number;
  league: string;
};

type Props = {
  home: string;
  away: string;
  homeScore?: number;
  awayScore?: number;
  commentary?: PitchTrackerCommentaryEntry[] | null; // newest-first
  v2StatsGroups?: PitchTrackerStatsGroup[] | null;
  confrontosRecentMeetings?: PitchTrackerH2HMeeting[] | null;
};

type BallSpot = { x: number; y: number };
type View = "pitch" | "stats" | "h2h";

const CENTER: BallSpot = { x: 50, y: 50 };

/** Deterministic 20-80% y-jitter seeded by the entry's own time label, so
 * the same commentary line always renders at the same y (no jitter on
 * re-render) without needing a real cross-axis signal. */
function seededY(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return 22 + (h % 56);
}

/** Maps one commentary line's action text to a pitch zone for the acting
 * side — home always attacks left-to-right (own goal at x≈0), away
 * right-to-left (own goal at x≈100), matching the header layout (home
 * left-aligned, away right-aligned). Administrative lines (cards, subs,
 * half time) return null — the ball simply stays where it last was. */
function zoneForAction(action: string, side: "home" | "away", seed: string): BallSpot | null {
  const a = action.toLowerCase();
  const y = seededY(seed);
  const mirror = (x: number) => (side === "home" ? x : 100 - x);
  if (/\bgoal\b/.test(a) && !a.includes("goal kick")) return CENTER; // kickoff spot after a goal
  if (a.includes("goal kick")) return { x: mirror(8), y };
  if (a.includes("penalty")) return { x: mirror(83), y: 50 };
  if (a.includes("corner")) return { x: mirror(96), y: y < 50 ? 8 : 92 };
  if (a.includes("shot")) return { x: mirror(84), y };
  if (a.includes("dangerous attack")) return { x: mirror(76), y };
  if (a.includes("free kick")) return { x: mirror(58), y };
  if (a.includes("attack")) return { x: mirror(64), y };
  if (a.includes("in possession")) return { x: mirror(42), y };
  if (a.includes("throw in")) return { x: mirror(50), y: y < 50 ? 4 : 96 };
  return null; // card/substitution/half time/etc — no ball movement
}

/** Splits "{TeamName} action text" (the only shape GOAL API's commentary
 * has ever sent — confirmed on real captures) into the acting side + the
 * bare action. Falls back to "home" with the untouched text when neither
 * team name prefixes the line (shouldn't happen, but never crashes). */
function parseCommentaryLine(
  text: string,
  home: string,
  away: string,
): { side: "home" | "away"; action: string } {
  if (text.startsWith(home)) return { side: "home", action: text.slice(home.length).trim() };
  if (text.startsWith(away)) return { side: "away", action: text.slice(away.length).trim() };
  return { side: "home", action: text };
}

/** Same key stat rows the Força panel (home.tsx's MomentumChart) already
 * picks out of v2StatsGroups — duplicated here at a smaller scope (just
 * the 4 the user asked for) since that extraction isn't exported. */
function extractCompactStats(groups: PitchTrackerStatsGroup[] | null | undefined) {
  if (!groups || groups.length === 0) return [];
  const flat = groups.flatMap((g) => g.rows.map((r) => ({ n: r.name, h: r.home, a: r.away })));
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const wanted = [
    { label: "Posse de Bola", pats: ["posse de bola", "possession"] },
    { label: "Remates à Baliza", pats: ["remates a baliza", "shots on target", "no alvo"] },
    { label: "Cantos", pats: ["cantos", "corners", "escanteios"] },
    { label: "Faltas", pats: ["faltas", "fouls"] },
  ];
  const rows: Array<{ label: string; home: string; away: string; homePct: number }> = [];
  for (const w of wanted) {
    const hit = flat.find((r) => w.pats.some((p) => norm(r.n).includes(p)));
    if (!hit || (!hit.h && !hit.a)) continue;
    const hN = parseFloat((hit.h || "0").replace(/[^0-9.]/g, "")) || 0;
    const aN = parseFloat((hit.a || "0").replace(/[^0-9.]/g, "")) || 0;
    const tot = hN + aN;
    rows.push({ label: w.label, home: hit.h || "-", away: hit.a || "-", homePct: tot > 0 ? Math.round((hN / tot) * 100) : 50 });
  }
  return rows;
}

export default function FootballPitchTracker({
  home,
  away,
  homeScore,
  awayScore,
  commentary,
  v2StatsGroups,
  confrontosRecentMeetings,
}: Props) {
  const ballRef = useRef<BallSpot>(CENTER);
  const [ball, setBall] = useState<BallSpot>(CENTER);
  const [goalFlash, setGoalFlash] = useState(false);
  const [view, setView] = useState<View>("pitch");
  const [current, setCurrent] = useState<PitchTrackerCommentaryEntry | null>(null);
  const [queue, setQueue] = useState<PitchTrackerCommentaryEntry[]>([]);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const matchKey = `${home}__${away}`;
  const prevMatchKeyRef = useRef(matchKey);

  // Different match than last render (list scrolled to a new one, or the
  // same component instance got reused) → wipe all replay state instead
  // of treating the new match's whole history as "new" to animate through.
  useEffect(() => {
    if (prevMatchKeyRef.current === matchKey) return;
    prevMatchKeyRef.current = matchKey;
    initializedRef.current = false;
    seenIdsRef.current = new Set();
    setQueue([]);
    setCurrent(null);
    setGoalFlash(false);
    ballRef.current = CENTER;
    setBall(CENTER);
  }, [matchKey]);

  // Diff each commentary update against what's already been shown; queue
  // only the truly-new rows, oldest first, so a rare multi-line catch-up
  // still replays in the order it actually happened (see header comment).
  useEffect(() => {
    if (!commentary || commentary.length === 0) return;
    if (!initializedRef.current) {
      // First load for this match — establish the baseline silently,
      // snap straight to the latest line without animating through
      // history that already happened before the tracker was open.
      initializedRef.current = true;
      for (const c of commentary) seenIdsRef.current.add(c.id);
      const first = commentary[0]!;
      setCurrent(first);
      const p = parseCommentaryLine(first.text, home, away);
      const spot = zoneForAction(p.action, p.side, first.id) ?? CENTER;
      ballRef.current = spot;
      setBall(spot);
      return;
    }
    const newOnes = commentary.filter((c) => !seenIdsRef.current.has(c.id));
    if (newOnes.length === 0) return;
    for (const c of newOnes) seenIdsRef.current.add(c.id);
    // commentary arrives newest-first — reverse just the new slice so the
    // queue plays oldest-missed-line first.
    setQueue((prev) => [...prev, ...[...newOnes].reverse()]);
  }, [commentary]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drain the queue one entry at a time — only re-triggers when the HEAD
  // of the queue actually changes (not on every append to the tail), so a
  // new arrival mid-animation doesn't reset the item currently showing.
  const queueHeadId = queue[0]?.id;
  useEffect(() => {
    if (queue.length === 0) return;
    const next = queue[0]!;
    setCurrent(next);
    const p = parseCommentaryLine(next.text, home, away);
    const spot = zoneForAction(p.action, p.side, next.id);
    if (spot) {
      ballRef.current = spot;
      setBall(spot);
    }
    let goalTimer: ReturnType<typeof setTimeout> | undefined;
    if (/\bgoal\b/i.test(p.action) && !/goal kick/i.test(p.action)) {
      setGoalFlash(true);
      goalTimer = setTimeout(() => setGoalFlash(false), 900);
    }
    const advanceTimer = setTimeout(() => setQueue((prev) => prev.slice(1)), 950);
    return () => {
      clearTimeout(advanceTimer);
      if (goalTimer) clearTimeout(goalTimer);
    };
  }, [queueHeadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = current ? parseCommentaryLine(current.text, home, away) : null;
  const actionLower = (parsed?.action ?? "").toLowerCase();
  const isDangerZone =
    actionLower.includes("dangerous") ||
    actionLower.includes("shot") ||
    actionLower.includes("corner") ||
    actionLower.includes("penalty");

  const compactStats = useMemo(() => extractCompactStats(v2StatsGroups), [v2StatsGroups]);
  const lastThreeMeetings = useMemo(() => (confrontosRecentMeetings ?? []).slice(0, 3), [confrontosRecentMeetings]);

  // No commentary feed at all for this fixture → don't show the mini
  // pitch in any form, same traditional layout as before this feature.
  if (!commentary || commentary.length === 0) return null;

  return (
    <div className="bet62-tracker">
      <style>{PITCH_TRACKER_CSS}</style>

      <div className="bet62-tracker-header">
        <div className="bet62-team">
          <span className="bet62-team-dot" style={{ color: "#ff5050" }} />
          <span className="truncate">{home}</span>
        </div>
        <div className="bet62-score">
          <strong>{homeScore ?? 0}</strong>
          <span>-</span>
          <strong>{awayScore ?? 0}</strong>
        </div>
        <div className="bet62-team bet62-team-away">
          <span className="truncate">{away}</span>
          <span className="bet62-team-dot" style={{ color: "#5096ff" }} />
        </div>
      </div>

      <div className="bet62-pitch-wrapper">
        {view === "pitch" && (
          <div className="bet62-pitch">
            <div className="pitch-halfline" />
            <div className="pitch-center-circle" />
            <div className="pitch-center-dot" />
            <div className="pitch-box pitch-box-left" />
            <div className="pitch-box pitch-box-right" />
            <div className="pitch-small-box pitch-small-left" />
            <div className="pitch-small-box pitch-small-right" />
            <div className="pitch-penalty-dot pitch-penalty-left" />
            <div className="pitch-penalty-dot pitch-penalty-right" />
            <div className="pitch-arc-d pitch-arc-d-left" />
            <div className="pitch-arc-d pitch-arc-d-right" />
            <div className="pitch-corner corner-tl" />
            <div className="pitch-corner corner-tr" />
            <div className="pitch-corner corner-bl" />
            <div className="pitch-corner corner-br" />
            <div className="pitch-goal pitch-goal-left">
              <div className="pitch-goal-net" />
            </div>
            <div className="pitch-goal pitch-goal-right">
              <div className="pitch-goal-net" />
            </div>

            <div
              className={`bet62-ball-trail ${parsed?.side === "away" ? "trail-away" : "trail-home"} ${isDangerZone ? "trail-danger" : ""}`}
              style={{ left: `${ball.x}%`, top: `${ball.y}%` }}
            />
            <div
              className={`bet62-ball ${goalFlash ? "ball-goal" : ""}`}
              style={{ left: `${ball.x}%`, top: `${ball.y}%` }}
            >
              ⚽
            </div>

            {current && (
              <div className={`bet62-event-badge ${goalFlash ? "event-goal" : isDangerZone ? "event-danger" : ""}`}>
                <small>{current.time}</small>
                {parsed?.action || current.text}
              </div>
            )}

            {goalFlash && <div className="bet62-goal-animation">GOLO!</div>}
          </div>
        )}

        {view === "stats" && (
          <div className="bet62-mini-panel">
            {compactStats.length === 0 ? (
              <div className="bet62-mini-empty">Estatísticas indisponíveis para este jogo.</div>
            ) : (
              <div className="bet62-mini-stats">
                {compactStats.map((s) => (
                  <div key={s.label} className="bet62-mini-stat-row">
                    <div className="bet62-mini-stat-labels">
                      <span>{s.home}</span>
                      <span className="bet62-mini-stat-name">{s.label}</span>
                      <span>{s.away}</span>
                    </div>
                    <div className="bet62-mini-stat-bar">
                      <div className="bet62-mini-stat-bar-home" style={{ width: `${s.homePct}%` }} />
                      <div className="bet62-mini-stat-bar-away" style={{ width: `${100 - s.homePct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === "h2h" && (
          <div className="bet62-mini-panel">
            {lastThreeMeetings.length === 0 ? (
              <div className="bet62-mini-empty">Sem confrontos recentes registados.</div>
            ) : (
              <div className="bet62-mini-h2h">
                {lastThreeMeetings.map((m, i) => (
                  <div key={`${m.date}-${i}`} className="bet62-mini-h2h-row">
                    <span className="bet62-mini-h2h-date">{m.date || "—"}</span>
                    <span className="bet62-mini-h2h-score">
                      {m.team1} <strong>{m.score1} - {m.score2}</strong> {m.team2}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bet62-tab-row">
        <button
          type="button"
          title="Mini Campo"
          aria-label="Mini Campo"
          className={`bet62-tab-btn ${view === "pitch" ? "active" : ""}`}
          onClick={() => setView("pitch")}
        >
          <Play size={16} />
        </button>
        <button
          type="button"
          title="Estatísticas"
          aria-label="Estatísticas"
          className={`bet62-tab-btn ${view === "stats" ? "active" : ""}`}
          onClick={() => setView("stats")}
        >
          <Activity size={16} />
        </button>
        <button
          type="button"
          title="H2H"
          aria-label="H2H"
          className={`bet62-tab-btn ${view === "h2h" ? "active" : ""}`}
          onClick={() => setView("h2h")}
        >
          <Users size={16} />
        </button>
      </div>
    </div>
  );
}

const PITCH_TRACKER_CSS = `
.bet62-tracker {
  width: 100%;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid #252525;
  border-radius: 14px;
  background: #0b0b0d;
  color: #fff;
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  box-shadow: 0 15px 45px rgba(0, 0, 0, 0.35);
}
.bet62-tracker-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 20px;
  padding: 14px 18px;
  border-bottom: 1px solid #242424;
  background: #111114;
}
.bet62-team { display: flex; align-items: center; gap: 9px; min-width: 0; font-size: 14px; font-weight: 700; }
.bet62-team-away { justify-content: flex-end; }
.bet62-team-dot { width: 9px; height: 9px; border-radius: 50%; box-shadow: 0 0 8px currentColor; background: currentColor; }
.bet62-score { display: flex; align-items: center; gap: 8px; font-size: 20px; }
.bet62-score span { color: #666; }
.bet62-pitch-wrapper {
  padding: 8px;
  background: radial-gradient(circle at center, rgba(255, 255, 255, 0.035), transparent 65%), #08090a;
}
.bet62-pitch {
  position: relative;
  width: 100%;
  aspect-ratio: 1.55 / 1;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.75);
  border-radius: 5px;
  background: repeating-linear-gradient(90deg, #176b35 0, #176b35 8%, #196f38 8%, #196f38 16%);
}
.pitch-halfline { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; background: rgba(255, 255, 255, 0.72); transform: translateX(-50%); }
.pitch-center-circle { position: absolute; width: 19%; aspect-ratio: 1; top: 50%; left: 50%; border: 2px solid rgba(255, 255, 255, 0.72); border-radius: 50%; transform: translate(-50%, -50%); }
.pitch-center-dot { position: absolute; width: 7px; height: 7px; top: 50%; left: 50%; background: #fff; border-radius: 50%; transform: translate(-50%, -50%); }
.pitch-box { position: absolute; top: 28%; width: 16%; height: 44%; border: 2px solid rgba(255, 255, 255, 0.72); }
.pitch-box-left { left: 0; border-left: 0; }
.pitch-box-right { right: 0; border-right: 0; }
.pitch-small-box { position: absolute; top: 39%; width: 7%; height: 22%; border: 2px solid rgba(255, 255, 255, 0.72); }
.pitch-small-left { left: 0; border-left: 0; }
.pitch-small-right { right: 0; border-right: 0; }
.pitch-penalty-dot { position: absolute; top: 50%; width: 6px; height: 6px; background: #fff; border-radius: 50%; transform: translateY(-50%); }
.pitch-penalty-left { left: 11%; }
.pitch-penalty-right { right: 11%; }
.pitch-arc-d {
  position: absolute;
  width: 19%;
  aspect-ratio: 1;
  top: 50%;
  border: 2px solid rgba(255, 255, 255, 0.72);
  border-radius: 50%;
  transform: translateY(-50%);
  background: transparent;
}
.pitch-arc-d-left { left: 1.5%; clip-path: inset(0 0 0 76.3%); }
.pitch-arc-d-right { left: 79.5%; clip-path: inset(0 76.3% 0 0); }
.pitch-corner {
  position: absolute;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.72);
  border-radius: 50%;
  background: transparent;
}
.corner-tl { top: -9px; left: -9px; }
.corner-tr { top: -9px; right: -9px; }
.corner-bl { bottom: -9px; left: -9px; }
.corner-br { bottom: -9px; right: -9px; }
.pitch-goal { position: absolute; top: 42%; width: 2.5%; height: 16%; border: 2px solid rgba(255, 255, 255, 0.9); background: rgba(255, 255, 255, 0.05); overflow: hidden; }
.pitch-goal-left { left: -2.5%; border-left: 0; }
.pitch-goal-right { right: -2.5%; border-right: 0; }
.pitch-goal-net {
  position: absolute;
  inset: 0;
  background-image:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.4) 0, rgba(255, 255, 255, 0.4) 1px, transparent 1px, transparent 4px),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.4) 0, rgba(255, 255, 255, 0.4) 1px, transparent 1px, transparent 4px);
}
.bet62-ball {
  position: absolute; z-index: 10; width: 25px; height: 25px;
  display: flex; align-items: center; justify-content: center; font-size: 18px;
  transform: translate(-50%, -50%);
  transition: left 900ms cubic-bezier(0.22, 1, 0.36, 1), top 900ms cubic-bezier(0.22, 1, 0.36, 1);
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5));
}
.ball-goal { animation: bet62GoalBall 900ms ease-out; }
.bet62-ball-trail {
  position: absolute; z-index: 7; width: 45px; height: 8px; border-radius: 100%;
  background: rgba(255, 255, 255, 0.7);
  transform: translate(-50%, -50%) rotate(-18deg);
  filter: blur(2px); opacity: 0.55;
  transition: left 900ms cubic-bezier(0.22, 1, 0.36, 1), top 900ms cubic-bezier(0.22, 1, 0.36, 1);
  animation: bet62TrailPulse 700ms ease-in-out infinite;
}
.trail-home { background: rgba(255, 80, 80, 0.8); }
.trail-away { background: rgba(80, 150, 255, 0.8); }
.trail-danger { width: 70px; opacity: 0.9; }
.bet62-event-badge {
  position: absolute; z-index: 20; left: 50%; bottom: 12px;
  display: flex; align-items: center; gap: 8px; padding: 7px 11px;
  border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px;
  background: rgba(0, 0, 0, 0.76); backdrop-filter: blur(8px);
  transform: translateX(-50%); font-size: 11px; font-weight: 800;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.25);
  animation: bet62EventIn 250ms ease-out;
  max-width: 92%;
}
.bet62-event-badge small { color: #aaa; font-size: 10px; }
.event-danger { border-color: rgba(255, 130, 30, 0.7); box-shadow: 0 0 18px rgba(255, 100, 0, 0.22); }
.event-goal { border-color: #fff; background: rgba(190, 0, 20, 0.9); }
.bet62-goal-animation {
  position: absolute; z-index: 30; top: 50%; left: 50%;
  font-size: 34px; font-weight: 950; letter-spacing: 2px; color: #fff;
  text-shadow: 0 0 10px rgba(255, 0, 0, 0.8), 0 0 25px rgba(255, 0, 0, 0.5);
  transform: translate(-50%, -50%);
  animation: bet62GoalText 900ms ease-out forwards;
  pointer-events: none;
}
.bet62-mini-panel {
  position: relative;
  width: 100%;
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 5px;
  background: #101012;
  padding: 14px;
}
.bet62-mini-empty { color: #777; font-size: 12px; text-align: center; }
.bet62-mini-stats { width: 100%; display: flex; flex-direction: column; gap: 12px; }
.bet62-mini-stat-labels { display: flex; align-items: center; justify-content: space-between; font-size: 11px; margin-bottom: 4px; }
.bet62-mini-stat-labels span:first-child, .bet62-mini-stat-labels span:last-child { font-weight: 900; color: #fff; width: 40px; text-align: center; }
.bet62-mini-stat-name { color: #888; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
.bet62-mini-stat-bar { display: flex; height: 5px; border-radius: 3px; overflow: hidden; background: #232326; }
.bet62-mini-stat-bar-home { background: #ff5050; }
.bet62-mini-stat-bar-away { background: #5096ff; }
.bet62-mini-h2h { width: 100%; display: flex; flex-direction: column; gap: 10px; }
.bet62-mini-h2h-row { display: flex; flex-direction: column; gap: 2px; font-size: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); padding-bottom: 8px; }
.bet62-mini-h2h-date { color: #666; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
.bet62-mini-h2h-score { color: #ddd; }
.bet62-mini-h2h-score strong { color: #fff; font-weight: 900; }
.bet62-tab-row { display: flex; border-top: 1px solid #242424; }
.bet62-tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 6px;
  background: transparent;
  border: none;
  border-right: 1px solid #242424;
  color: #777;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease;
}
.bet62-tab-btn:last-child { border-right: none; }
.bet62-tab-btn:hover { color: #ccc; }
.bet62-tab-btn.active { color: #fff; background: rgba(255, 255, 255, 0.05); box-shadow: inset 0 -2px 0 #dc2626; }
@keyframes bet62TrailPulse {
  0% { opacity: 0.25; transform: translate(-50%, -50%) scaleX(0.7) rotate(-18deg); }
  50% { opacity: 0.85; transform: translate(-50%, -50%) scaleX(1) rotate(-18deg); }
  100% { opacity: 0.25; transform: translate(-50%, -50%) scaleX(0.7) rotate(-18deg); }
}
@keyframes bet62EventIn {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes bet62GoalBall {
  0% { transform: translate(-50%, -50%) scale(1); }
  45% { transform: translate(-50%, -50%) scale(1.7); }
  100% { transform: translate(-50%, -50%) scale(1); }
}
@keyframes bet62GoalText {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
  35% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.4); }
}
`;
