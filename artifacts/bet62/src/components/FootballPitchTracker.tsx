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

export type PitchTrackerRealBallPosition = {
  x: number;
  y: number;
  side: "home" | "away" | null;
  situation: string;
  updatedAt: number; // ms epoch
};

type Props = {
  home: string;
  away: string;
  homeScore?: number;
  awayScore?: number;
  commentary?: PitchTrackerCommentaryEntry[] | null; // newest-first
  v2StatsGroups?: PitchTrackerStatsGroup[] | null;
  confrontosRecentMeetings?: PitchTrackerH2HMeeting[] | null;
  // GOAL API + sports.bzzoiro.com hybrid (2026-09-11): when present and
  // fresh, this real x/y (from bzzoiro's WebSocket `livedata` frame)
  // drives the ball's actual rendered position instead of the
  // commentary-derived zoneForAction guess below. Absent whenever this
  // fixture hasn't been matched/isn't covered by bzzoiro yet — the
  // existing heuristic remains the fallback, never a hard requirement.
  realBallPosition?: PitchTrackerRealBallPosition | null;
};

/** How stale realBallPosition can be before falling back to the
 * commentary-derived guess — bzzoiro's own livedata cadence is ~5s per
 * the docs, so anything past ~3x that is treated as no longer live
 * (match ended, fixture unmatched again, WS hiccup, etc.) rather than
 * shown frozen. */
const REAL_BALL_POSITION_MAX_AGE_MS = 15_000;

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
  if (/\bgoal\b/.test(a) && !a.includes("goal kick")) return { x: mirror(97), y: 50 }; // into the net
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

/** Localized label for the compact event badge — mirrors the same action
 * fragments zoneForAction already recognizes, translated for display only
 * (the underlying signal is still the same 100%-real action keyword from
 * the commentary line, this is just presentation, same "derived, not
 * fabricated" convention as the rest of this component). Falls back to a
 * capitalized version of the raw fragment for anything unrecognized. */
function translateAction(action: string): string {
  const a = action.toLowerCase();
  if (/\bgoal\b/.test(a) && !a.includes("goal kick")) return "Golo!";
  if (a.includes("goal kick")) return "Tiro de meta";
  if (a.includes("penalty")) return "Pênalti";
  if (a.includes("corner")) return "Escanteio";
  if (a.includes("shot")) return "Finalização";
  if (a.includes("dangerous attack")) return "Ataque perigoso";
  if (a.includes("free kick")) return "Falta";
  if (a.includes("attack")) return "Em ataque";
  if (a.includes("in possession")) return "Bola segura";
  if (a.includes("throw in")) return "Lançamento lateral";
  if (a.includes("yellow card")) return "Cartão amarelo";
  if (a.includes("red card")) return "Cartão vermelho";
  if (a.includes("substitution")) return "Substituição";
  if (a.includes("half time")) return "Intervalo";
  if (!action) return "";
  return action.charAt(0).toUpperCase() + action.slice(1);
}

/** Real sports.bzzoiro.com `livedata.situation` values, translated for the
 * event badge — confirmed real ones from a live capture: "safe" and
 * "dangerous_attack" (matching the reference bookmaker UI's own "Bola
 * segura"/"Ataque Perigoso" badges). Any other value bzzoiro sends is
 * humanized (underscores → spaces, capitalized) rather than guessed at,
 * same "derived, not fabricated" rule the rest of this file follows —
 * bzzoiro has no published enum of every possible situation string. */
function translateBzzoiroSituation(situation: string): string {
  const s = situation.toLowerCase();
  if (s === "safe") return "Bola segura";
  if (s === "dangerous_attack") return "Ataque perigoso";
  if (s === "attack") return "Em ataque";
  if (s === "corner") return "Escanteio";
  if (s === "free_kick") return "Falta";
  if (s === "penalty") return "Pênalti";
  if (s === "shot" || s === "shot_on_target") return "Finalização";
  if (s === "goal") return "Golo!";
  if (!situation) return "";
  return situation.charAt(0).toUpperCase() + situation.slice(1).replace(/_/g, " ");
}

/** Real bzzoiro situations that count as a dangerous moment for the arrow's
 * color escalation and badge styling — same set of concepts
 * translateBzzoiroSituation recognizes by name (goal excluded here since
 * that's handled by the existing goalFlash celebration, not the danger
 * tint). */
function isDangerousBzzoiroSituation(situation: string): boolean {
  const s = situation.toLowerCase();
  return s === "dangerous_attack" || s === "corner" || s === "penalty" || s === "shot" || s === "shot_on_target";
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
  realBallPosition,
}: Props) {
  const ballRef = useRef<BallSpot>(CENTER);
  const [ball, setBall] = useState<BallSpot>(CENTER);
  const [goalFlash, setGoalFlash] = useState(false);
  // Where the ball was right before its latest move — captured so a
  // fading directional trail can be drawn from there to wherever it just
  // went (dissolving after the move, rather than a static blob), and so
  // a goal specifically can draw its shot-trail line from the real spot
  // it was struck from instead of appearing out of nowhere at the net.
  const [moveOrigin, setMoveOrigin] = useState<BallSpot | null>(null);
  // Bumped on every drawn trail (commentary-driven or real-position-driven)
  // so the trail div's `key` changes and React remounts it, restarting the
  // CSS fade animation — decoupled from `current.id` specifically since a
  // real bzzoiro move has no commentary entry to key off of.
  const [trailKey, setTrailKey] = useState(0);
  const [view, setView] = useState<View>("pitch");
  const [current, setCurrent] = useState<PitchTrackerCommentaryEntry | null>(null);
  const [queue, setQueue] = useState<PitchTrackerCommentaryEntry[]>([]);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  // Last real bzzoiro fix seen for this match — separate from `ballRef`
  // (the commentary-driven resting spot) so a real move can draw its own
  // trail without disturbing the commentary state machine.
  const realBallSpotRef = useRef<BallSpot | null>(null);
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
    setMoveOrigin(null);
    ballRef.current = CENTER;
    setBall(CENTER);
    realBallSpotRef.current = null;
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
    const isGoal = /\bgoal\b/i.test(p.action) && !/goal kick/i.test(p.action);
    if (spot) {
      setMoveOrigin(ballRef.current); // where it came from, for the fading movement trail
      setTrailKey((k) => k + 1);
      ballRef.current = spot;
      setBall(spot);
    }
    let goalTimer: ReturnType<typeof setTimeout> | undefined;
    if (isGoal) {
      setGoalFlash(true);
      goalTimer = setTimeout(() => setGoalFlash(false), 900);
    }
    const advanceTimer = setTimeout(() => setQueue((prev) => prev.slice(1)), 950);
    return () => {
      clearTimeout(advanceTimer);
      if (goalTimer) clearTimeout(goalTimer);
    };
  }, [queueHeadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real bug fixed 2026-09-12 (user-reported: the fading movement trail
  // never appeared once real bzzoiro position data started flowing —
  // only the commentary queue above ever triggered it, and GOAL API's
  // commentary only writes a new line every ~2 minutes). Mirrors that
  // same moveOrigin/trailKey mechanism, driven by realBallPosition.
  // updatedAt changing instead — every genuinely new real fix that moved
  // the ball a meaningful distance draws its own trail.
  useEffect(() => {
    if (!realBallPosition) return;
    const spot: BallSpot = { x: realBallPosition.x, y: realBallPosition.y };
    const prev = realBallSpotRef.current;
    realBallSpotRef.current = spot;
    if (!prev) return; // first fix for this match — nothing to draw a trail from yet
    const dx = spot.x - prev.x;
    const dy = spot.y - prev.y;
    if (Math.sqrt(dx * dx + dy * dy) < 2) return; // negligible movement — no trail
    setMoveOrigin(prev);
    setTrailKey((k) => k + 1);
  }, [realBallPosition?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = current ? parseCommentaryLine(current.text, home, away) : null;

  // The ball's actual rendered position — real coordinates when bzzoiro
  // has a fresh fix on this fixture, otherwise the commentary-derived
  // zoneForAction guess.
  const hasFreshRealBall =
    !!realBallPosition && Date.now() - realBallPosition.updatedAt < REAL_BALL_POSITION_MAX_AGE_MS;
  const displayBall: BallSpot = hasFreshRealBall
    ? { x: realBallPosition!.x, y: realBallPosition!.y }
    : ball;

  // Real bug fixed 2026-09-12 (user-reported, screenshots vs a reference
  // bookmaker's own mini-pitch): the event badge, momentum arrow and
  // danger-zone tint were ALWAYS driven by `parsed` (GOAL API's own
  // commentary, which only writes new lines every ~2 minutes) even once
  // real bzzoiro position data started flowing every ~5s — so once the
  // ball visually moved to the away side, the badge kept showing whichever
  // team GOAL API's last commentary line happened to name. Real bzzoiro
  // data (side + situation) now takes priority whenever fresh, with the
  // commentary-derived guess only as a fallback when bzzoiro hasn't
  // matched/covered this fixture (or its fix has gone stale).
  const activeSide: "home" | "away" = hasFreshRealBall
    ? (realBallPosition!.side ?? parsed?.side ?? "home")
    : (parsed?.side ?? "home");
  const activeLabelText = hasFreshRealBall
    ? translateBzzoiroSituation(realBallPosition!.situation)
    : parsed
      ? translateAction(parsed.action) || current?.text || ""
      : current?.text ?? "";
  const isDangerZone = hasFreshRealBall
    ? isDangerousBzzoiroSituation(realBallPosition!.situation)
    : (() => {
        const a = (parsed?.action ?? "").toLowerCase();
        return a.includes("dangerous") || a.includes("shot") || a.includes("corner") || a.includes("penalty");
      })();
  const hasActiveSignal = hasFreshRealBall || (!!current && !!parsed);

  // How deep into the attacking third the acting side currently is —
  // reuses the same left-to-right/right-to-left mirroring convention as
  // zoneForAction (home attacks toward x≈100, away toward x≈0) so the
  // momentum arrow always points at whichever goal is under pressure,
  // and its color escalates with how threatening the current action is.
  const attackDepth = hasActiveSignal ? (activeSide === "home" ? displayBall.x : 100 - displayBall.x) : 0;
  const momentumTier: "neutral" | "attacking" | "danger" = isDangerZone
    ? "danger"
    : attackDepth > 60
      ? "attacking"
      : "neutral";

  // The momentum shape always starts at the attacking side's OWN goal
  // line (how much of the pitch they've advanced through from their own
  // box, not just "since midfield") and reaches toward wherever the ball
  // currently is — it grows as the acting side pushes further forward and
  // shrinks back for a deeper build-up action. Shaped as a block with a
  // mild taper at the ball end (not a thin sharp dagger).
  const ARROW_TAPER = 6;
  const arrowClipPath = (() => {
    if (!hasActiveSignal) return undefined;
    const nearX = activeSide === "home" ? 0 : 100;
    const farX = displayBall.x;
    const dir = farX >= nearX ? 1 : -1;
    const bodyEdge = dir === 1 ? Math.max(nearX, farX - ARROW_TAPER) : Math.min(nearX, farX + ARROW_TAPER);
    return `polygon(${nearX}% 0%, ${bodyEdge}% 0%, ${farX}% 50%, ${bodyEdge}% 100%, ${nearX}% 100%)`;
  })();

  // Light near the own goal line, strongest right at the tip (the ball) —
  // same tone family as momentumTier, just as a gradient instead of a
  // flat fill, per user request.
  const ARROW_GRADIENT: Record<typeof momentumTier, [string, string]> = {
    neutral: ["rgba(90, 90, 90, 0.24)", "rgba(45, 45, 45, 0.5)"],
    attacking: ["rgba(220, 130, 40, 0.22)", "rgba(214, 60, 20, 0.5)"],
    danger: ["rgba(255, 120, 120, 0.2)", "rgba(210, 10, 10, 0.58)"],
  };
  const arrowBackground = (() => {
    if (!hasActiveSignal) return undefined;
    const [from, to] = ARROW_GRADIENT[momentumTier];
    const towardHome = activeSide === "home"; // home's own goal is at x≈0, so the gradient runs left→right
    return `linear-gradient(to ${towardHome ? "right" : "left"}, ${from}, ${to})`;
  })();

  // A comet-style line from where the ball just was to where it is now —
  // shown on every move (fading out as it "dissolves" behind the ball),
  // whether the move came from a new commentary line or a fresh real
  // bzzoiro position (see the realBallSpotRef effect below) — not only
  // goals; a goal reuses the exact same geometry but in the bolder gold
  // "shot map" style since that's a real strike on net. Angle/length are
  // computed in the same 0-100% coordinate space everything else here
  // uses (a stylized approximation, not literal pixel physics). Anchored
  // to displayBall (whichever position is actually rendered) rather than
  // the commentary-only `ball` state, so the trail always ends exactly
  // where the ball icon itself is.
  const moveTrail = (() => {
    if (!moveOrigin) return null;
    const dx = displayBall.x - moveOrigin.x;
    const dy = displayBall.y - moveOrigin.y;
    const lengthPct = Math.sqrt(dx * dx + dy * dy);
    if (lengthPct < 2) return null; // negligible/no movement — nothing to draw
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    return { x: moveOrigin.x, y: moveOrigin.y, lengthPct, angleDeg };
  })();

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
            {hasActiveSignal && (
              <div
                className={`bet62-momentum-arrow ${momentumTier === "danger" ? "tier-danger" : ""}`}
                style={{ clipPath: arrowClipPath, background: arrowBackground }}
              />
            )}
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
            <div className="corner-flag-pole flag-tl-pole" />
            <div className="corner-flag-pennant flag-tl-pennant" />
            <div className="corner-flag-pole flag-tr-pole" />
            <div className="corner-flag-pennant flag-tr-pennant" />
            <div className="corner-flag-pole flag-bl-pole" />
            <div className="corner-flag-pennant flag-bl-pennant" />
            <div className="corner-flag-pole flag-br-pole" />
            <div className="corner-flag-pennant flag-br-pennant" />
            <div className="pitch-goal pitch-goal-left">
              <div className="pitch-goal-net" />
            </div>
            <div className="pitch-goal pitch-goal-right">
              <div className="pitch-goal-net" />
            </div>

            {moveTrail && (
              <div
                key={trailKey}
                className={`bet62-shot-line ${goalFlash ? "trail-goal" : "trail-move"}`}
                style={{
                  left: `${moveTrail.x}%`,
                  top: `${moveTrail.y}%`,
                  width: `${moveTrail.lengthPct}%`,
                  transform: `rotate(${moveTrail.angleDeg}deg)`,
                }}
              />
            )}
            <div
              className={`bet62-ball-trail ${activeSide === "away" ? "trail-away" : "trail-home"} ${isDangerZone ? "trail-danger" : ""}`}
              style={{ left: `${displayBall.x}%`, top: `${displayBall.y}%` }}
            />
            {goalFlash && (
              <>
                <div className="bet62-impact-ring ring-2" style={{ left: `${displayBall.x}%`, top: `${displayBall.y}%` }} />
                <div className="bet62-impact-ring" style={{ left: `${displayBall.x}%`, top: `${displayBall.y}%` }} />
              </>
            )}
            <div
              className={`bet62-ball ${goalFlash ? "ball-goal" : ""}`}
              style={{ left: `${displayBall.x}%`, top: `${displayBall.y}%` }}
            >
              ⚽
            </div>

            {hasActiveSignal && (
              <div
                className={`bet62-event-badge badge-floating ${goalFlash ? "event-goal" : isDangerZone ? "event-danger" : ""}`}
                style={{
                  left: `clamp(20%, ${displayBall.x}%, 80%)`,
                  top: `clamp(14%, ${displayBall.y > 55 ? displayBall.y - 20 : displayBall.y + 20}%, 86%)`,
                }}
              >
                <span className={`bet62-event-bar ${activeSide === "away" ? "bar-away" : "bar-home"}`} />
                <div className="bet62-event-text">
                  <div className="bet62-event-team truncate">{activeSide === "away" ? away : home}</div>
                  <div className="bet62-event-action truncate">
                    {!hasFreshRealBall && current && <small>{current.time}</small>} {activeLabelText}
                  </div>
                </div>
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
            <div className="bet62-mini-h2h-wrap">
              <div className="bet62-mini-h2h-label">H2H Direto</div>
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
/* "área técnica" — a green turf margin OUTSIDE the white touchline
 * (same idea as the grass strip visible around the pitch in a broadcast
 * graphic), between the playing field and the card's rounded corner.
 * overflow:hidden lives HERE (not on .bet62-pitch below) specifically so
 * the goal boxes — positioned at left/right: -2.5%, i.e. fully outside
 * the 0-100% line-marked field — bleed into this margin instead of
 * being invisibly clipped to nothing (that was a real bug: with
 * overflow:hidden on .bet62-pitch itself, the goal net never rendered
 * at all since the whole goal box sat outside the clipped area). */
.bet62-pitch-wrapper {
  padding: 10px 9px;
  overflow: hidden;
  border-radius: 8px;
  background: repeating-linear-gradient(90deg, #146030 0, #146030 8%, #17693a 8%, #17693a 16%);
}
.bet62-pitch {
  position: relative;
  width: 100%;
  aspect-ratio: 1.55 / 1;
  border: 2px solid rgba(255, 255, 255, 0.75);
  background:
    radial-gradient(ellipse at 50% 0%, rgba(255, 255, 255, 0.08), transparent 55%),
    repeating-linear-gradient(90deg, #1c8a44 0, #1c8a44 8%, #22964c 8%, #22964c 16%);
}
.bet62-momentum-arrow {
  position: absolute;
  inset: 0;
  transition: clip-path 900ms cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}
.bet62-momentum-arrow.tier-danger {
  animation: bet62ArrowPulse 900ms ease-in-out infinite;
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
/* Each corner circle is centered exactly on the pitch's true corner
 * point, so only ONE quarter of it is actually "inside" the field — the
 * other three quarters used to be invisible only because a parent had
 * overflow:hidden right at the pitch edge. That clipping now lives
 * further out (on .bet62-pitch-wrapper, to fit the goal net bleeding
 * into the green margin), so each corner needs its own clip-path to
 * keep just the correct quarter-arc instead of rendering as a full
 * circle. */
.corner-tl { top: -9px; left: -9px; clip-path: inset(50% 0 0 50%); }
.corner-tr { top: -9px; right: -9px; clip-path: inset(50% 50% 0 0); }
.corner-bl { bottom: -9px; left: -9px; clip-path: inset(0 0 50% 50%); }
.corner-br { bottom: -9px; right: -9px; clip-path: inset(0 50% 50% 0); }
/* Small corner flags — a thin pole planted right at the corner point,
 * poking into the green "área técnica" margin, with a red pennant near
 * the top, so the corners read as a real pitch instead of just the arc
 * line. */
.corner-flag-pole {
  position: absolute;
  width: 1.5px;
  height: 8px;
  background: rgba(255, 255, 255, 0.85);
}
.corner-flag-pennant {
  position: absolute;
  width: 0;
  height: 0;
  border-top: 2.5px solid transparent;
  border-bottom: 2.5px solid transparent;
  border-left: 5px solid #dc2626;
}
.flag-tl-pole { top: -8px; left: -1px; }
.flag-tl-pennant { top: -8px; left: 0.5px; }
.flag-tr-pole { top: -8px; right: -1px; }
.flag-tr-pennant { top: -8px; right: 0.5px; }
.flag-bl-pole { bottom: -8px; left: -1px; }
.flag-bl-pennant { bottom: -8px; left: 0.5px; }
.flag-br-pole { bottom: -8px; right: -1px; }
.flag-br-pennant { bottom: -8px; right: 0.5px; }
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
/* A comet line drawn once per move, from where the ball was to where it
 * is now, then dissolving — see the moveTrail calc in the component
 * body. .trail-move is the subtle default for every regular pass/dribble;
 * .trail-goal reuses the exact same geometry but in the bolder gold
 * "shot map" style for an actual strike on net. */
.bet62-shot-line {
  position: absolute; z-index: 8; height: 3px;
  border-radius: 3px;
  transform-origin: left center;
  animation: bet62ShotLineFade 900ms ease-out forwards;
}
.bet62-shot-line.trail-move {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.55) 100%);
}
.bet62-shot-line.trail-goal {
  height: 4px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 214, 90, 0.9) 55%, #fff 100%);
  filter: drop-shadow(0 0 6px rgba(255, 200, 60, 0.65));
}
.bet62-impact-ring {
  position: absolute; z-index: 9; width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.9);
  transform: translate(-50%, -50%);
  animation: bet62ImpactRing 700ms ease-out forwards;
}
.bet62-impact-ring.ring-2 { border-color: rgba(255, 214, 90, 0.75); animation-delay: 80ms; }
.bet62-event-badge {
  position: absolute; z-index: 20; left: 50%; bottom: 12px;
  display: flex; align-items: stretch; gap: 10px; padding: 8px 14px 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px;
  background: rgba(0, 0, 0, 0.76); backdrop-filter: blur(8px);
  transform: translateX(-50%);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.25);
  animation: bet62EventIn 250ms ease-out;
  max-width: 92%;
}
/* Real bug fixed 2026-09-12 (user-reported, screenshots vs a reference
 * bookmaker's own mini-pitch): the badge should float near wherever the
 * ball actually is and read as translucent overlay chrome, following the
 * momentum arrow — not sit pinned at a fixed spot at the bottom of the
 * pitch. This applies regardless of whether displayBall's position came
 * from real bzzoiro data or the commentary-derived zoneForAction guess —
 * it's a presentation choice, not tied to data-source freshness (a first
 * version of this fix wrongly gated it on hasFreshRealBall, so the
 * commentary-only fallback — the common case for most matches — kept the
 * old fixed/opaque look). left/top come from the inline style (computed
 * from the live ball position), transitioning smoothly on the same
 * cadence as the ball/arrow so it visibly "follows" the play. */
.bet62-event-badge.badge-floating {
  bottom: auto;
  transform: translate(-50%, -50%);
  background: rgba(10, 10, 12, 0.55);
  border-color: rgba(255, 255, 255, 0.12);
  transition: left 900ms cubic-bezier(0.22, 1, 0.36, 1), top 900ms cubic-bezier(0.22, 1, 0.36, 1);
}
.bet62-event-bar { width: 4px; border-radius: 3px; background: currentColor; flex-shrink: 0; }
.bet62-event-bar.bar-home { color: #ff5050; }
.bet62-event-bar.bar-away { color: #5096ff; }
.bet62-event-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.bet62-event-team { font-size: 13px; font-weight: 900; color: #fff; }
.bet62-event-action { font-size: 11px; font-weight: 600; color: #bbb; }
.bet62-event-action small { color: #888; font-size: 10px; font-weight: 700; margin-right: 2px; }
.event-danger { border-color: rgba(255, 130, 30, 0.7); box-shadow: 0 0 18px rgba(255, 100, 0, 0.22); }
.event-goal { border-color: #fff; background: rgba(190, 0, 20, 0.9); }
.event-goal .bet62-event-action { color: #ffd9d9; }
.event-goal .bet62-event-action small { color: #ffb3b3; }
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
.bet62-mini-h2h-wrap { width: 100%; display: flex; flex-direction: column; gap: 10px; }
.bet62-mini-h2h-label { color: #888; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; }
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

/* LIGHT MODE — same html.light-mode convention as the rest of the app
 * (see src/lib/theme.ts + src/index.css). The pitch turf itself stays
 * green in both themes (it's a real field, not chrome); only the card
 * chrome around it (header, wrapper background, side panels, badges,
 * tab bar) flips to a light palette. */
html.light-mode .bet62-tracker {
  background: #ffffff;
  color: #18181b;
  border-color: #e4e4e7;
  box-shadow: 0 15px 45px rgba(0, 0, 0, 0.08);
}
html.light-mode .bet62-tracker-header {
  background: #f5f5f7;
  border-color: #e4e4e7;
}
html.light-mode .bet62-score span { color: #a1a1aa; }
html.light-mode .bet62-event-badge {
  border-color: rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.9);
  color: #18181b;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
}
html.light-mode .bet62-event-badge.badge-floating {
  background: rgba(255, 255, 255, 0.62);
}
html.light-mode .bet62-event-team { color: #18181b; }
html.light-mode .bet62-event-action { color: #52525b; }
html.light-mode .bet62-event-action small { color: #71717a; }
html.light-mode .event-goal { border-color: #be0014; background: rgba(190, 0, 20, 0.94); }
html.light-mode .event-goal .bet62-event-team,
html.light-mode .event-goal .bet62-event-action,
html.light-mode .event-goal .bet62-event-action small { color: #fff; }
html.light-mode .bet62-mini-panel {
  border-color: #e4e4e7;
  background: #f5f5f7;
}
html.light-mode .bet62-mini-empty { color: #71717a; }
html.light-mode .bet62-mini-stat-labels span:first-child,
html.light-mode .bet62-mini-stat-labels span:last-child { color: #18181b; }
html.light-mode .bet62-mini-stat-name { color: #71717a; }
html.light-mode .bet62-mini-stat-bar { background: #dadadd; }
html.light-mode .bet62-mini-h2h-label { color: #71717a; }
html.light-mode .bet62-mini-h2h-row { border-color: #e4e4e7; }
html.light-mode .bet62-mini-h2h-date { color: #a1a1aa; }
html.light-mode .bet62-mini-h2h-score { color: #3f3f46; }
html.light-mode .bet62-mini-h2h-score strong { color: #18181b; }
html.light-mode .bet62-tab-row { border-color: #e4e4e7; }
html.light-mode .bet62-tab-btn { color: #a1a1aa; border-color: #e4e4e7; }
html.light-mode .bet62-tab-btn:hover { color: #3f3f46; }
html.light-mode .bet62-tab-btn.active { color: #18181b; background: rgba(0, 0, 0, 0.04); }
@keyframes bet62ArrowPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
@keyframes bet62ShotLineFade {
  0% { opacity: 0; }
  25% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes bet62ImpactRing {
  0% { transform: translate(-50%, -50%) scale(0.4); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
}
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
