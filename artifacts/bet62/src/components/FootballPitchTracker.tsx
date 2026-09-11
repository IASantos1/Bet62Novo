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
// everywhere else (e.g. the Momentum chart's bars are purely decorative;
// this is a step up from that — real event-driven, just not pixel-exact).
import { useEffect, useMemo, useRef, useState } from "react";

export type PitchTrackerCommentaryEntry = { time: string; text: string };

type Props = {
  home: string;
  away: string;
  homeScore?: number;
  awayScore?: number;
  minute?: number;
  isHalfTime?: boolean;
  commentary?: PitchTrackerCommentaryEntry[] | null; // newest-first
};

type BallSpot = { x: number; y: number };

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

export default function FootballPitchTracker({
  home,
  away,
  homeScore,
  awayScore,
  minute,
  isHalfTime,
  commentary,
}: Props) {
  const latest = commentary && commentary.length > 0 ? commentary[0]! : null;
  const parsed = latest ? parseCommentaryLine(latest.text, home, away) : null;

  const ballRef = useRef<BallSpot>(CENTER);
  const [ball, setBall] = useState<BallSpot>(CENTER);
  const [goalFlash, setGoalFlash] = useState(false);
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!latest || !parsed) return;
    const key = `${latest.time}-${latest.text}`;
    if (key === lastKeyRef.current) return; // same line, no new event
    lastKeyRef.current = key;

    const spot = zoneForAction(parsed.action, parsed.side, key);
    if (spot) {
      ballRef.current = spot;
      setBall(spot);
    }
    if (/\bgoal\b/i.test(parsed.action) && !/goal kick/i.test(parsed.action)) {
      setGoalFlash(true);
      const t = setTimeout(() => setGoalFlash(false), 900);
      return () => clearTimeout(t);
    }
  }, [latest?.time, latest?.text]); // eslint-disable-line react-hooks/exhaustive-deps

  const actionLower = (parsed?.action ?? "").toLowerCase();
  const isDangerZone =
    actionLower.includes("dangerous") ||
    actionLower.includes("shot") ||
    actionLower.includes("corner") ||
    actionLower.includes("penalty");

  const timelineItems = useMemo(() => (commentary ?? []).slice(0, 30), [commentary]);

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

      <div className="bet62-tracker-body">
        <div className="bet62-pitch-wrapper">
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
            <div className="pitch-goal pitch-goal-left" />
            <div className="pitch-goal pitch-goal-right" />

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

            {latest && (
              <div className={`bet62-event-badge ${goalFlash ? "event-goal" : isDangerZone ? "event-danger" : ""}`}>
                <small>{latest.time}</small>
                {parsed?.action || latest.text}
              </div>
            )}

            {goalFlash && <div className="bet62-goal-animation">GOLO!</div>}
          </div>
        </div>

        <div className="bet62-event-panel">
          <div className="bet62-live-status">
            <span className="live-indicator" />
            AO VIVO {isHalfTime ? "· HT" : minute != null ? `· ${minute}'` : ""}
          </div>

          {latest && (
            <div className="bet62-current-event">
              <small>ÚLTIMO LANCE</small>
              <strong>{parsed?.action || latest.text}</strong>
              <span>
                {parsed?.side === "away" ? away : home} · {latest.time}
              </span>
            </div>
          )}

          <div className="bet62-timeline">
            {timelineItems.map((c, i) => {
              const p = parseCommentaryLine(c.text, home, away);
              return (
                <div key={`${c.time}-${i}`} className={`bet62-timeline-item ${i === 0 ? "active" : ""}`}>
                  <span className="timeline-minute">{c.time}</span>
                  <span>
                    <span className="timeline-type">{p.side === "home" ? home : away}</span> {p.action}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const PITCH_TRACKER_CSS = `
.bet62-tracker {
  width: 100%;
  max-width: 1050px;
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
.bet62-tracker-body { display: grid; grid-template-columns: minmax(0, 1fr) 245px; min-height: 470px; }
.bet62-pitch-wrapper {
  padding: 18px;
  background: radial-gradient(circle at center, rgba(255, 255, 255, 0.035), transparent 65%), #08090a;
}
.bet62-pitch {
  position: relative;
  width: 100%;
  aspect-ratio: 1.72 / 1;
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
.pitch-goal { position: absolute; top: 42%; width: 2.5%; height: 16%; border: 2px solid rgba(255, 255, 255, 0.9); background: rgba(255, 255, 255, 0.05); }
.pitch-goal-left { left: -2.5%; border-left: 0; }
.pitch-goal-right { right: -2.5%; border-right: 0; }
.pitch-player {
  position: absolute; z-index: 4; width: 25px; height: 25px;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.95); border-radius: 50%;
  color: #fff; font-size: 9px; font-weight: 800;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.45), 0 0 7px rgba(255, 255, 255, 0.15);
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
.bet62-event-panel { display: flex; flex-direction: column; border-left: 1px solid #242424; background: #0d0d10; }
.bet62-live-status { display: flex; align-items: center; gap: 7px; padding: 14px 16px; border-bottom: 1px solid #242424; font-size: 11px; font-weight: 900; letter-spacing: 0.8px; }
.live-indicator { width: 7px; height: 7px; border-radius: 50%; background: #31d158; box-shadow: 0 0 8px #31d158; animation: bet62LivePulse 1.2s infinite; }
.bet62-current-event { padding: 18px 16px; border-bottom: 1px solid #242424; }
.bet62-current-event small { display: block; margin-bottom: 8px; color: #777; font-size: 9px; font-weight: 800; letter-spacing: 1px; }
.bet62-current-event strong { display: block; font-size: 16px; font-weight: 900; }
.bet62-current-event span { display: block; margin-top: 5px; color: #999; font-size: 12px; }
.bet62-timeline { overflow-y: auto; flex: 1; }
.bet62-timeline-item { display: grid; grid-template-columns: 42px 1fr; gap: 6px; padding: 8px 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.035); opacity: 0.55; font-size: 10px; }
.bet62-timeline-item.active { opacity: 1; background: rgba(255, 255, 255, 0.045); }
.timeline-minute { color: #777; }
.timeline-type { font-weight: 700; }
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
@keyframes bet62LivePulse {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.75); }
  100% { opacity: 1; transform: scale(1); }
}
@media (max-width: 760px) {
  .bet62-tracker-body { grid-template-columns: 1fr; }
  .bet62-event-panel { border-top: 1px solid #242424; border-left: 0; }
  .bet62-timeline { max-height: 180px; }
  .bet62-pitch-wrapper { padding: 10px; }
  .pitch-player { width: 21px; height: 21px; font-size: 8px; }
}
`;
