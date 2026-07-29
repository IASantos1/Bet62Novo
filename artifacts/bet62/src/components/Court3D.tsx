import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// 3D-styled tennis court, shown for live tennis matches the same way
// Field3D is shown for football. The rally loop (ball, shadow, both rackets
// swinging) is ambient/continuous — Statpal-style real point-by-point ball
// physics isn't something any provider gives us — but unlike the original
// version, this component now reacts to the REAL match state that already
// flows into _liveExtra from buildTennisLiveV1 (SportsAPI Pro): who's
// serving, the current game score, and sets won. Same "trigger event ->
// label + highlight" strategy already proven in Field3D for goals/corners/
// cards, applied here to point/game/set/serve changes instead.

export interface Court3DProps {
  homeTeam?: string;
  awayTeam?: string;
  /** Sets won by each side */
  homeScore?: number;
  awayScore?: number;
  sets?: Array<[number, number]>;
  currentPoints?: [number | string, number | string];
  serving?: [boolean, boolean];
}

const pointRank = (v: number | string | undefined): number => {
  if (v === undefined) return -1;
  if (v === "AD") return 4;
  if (v === "D") return 3.5;
  const n = typeof v === "number" ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : -1;
};

// Real tennis rule, not a guess: the server starts each game from the
// deuce (right) court, and the side alternates after every single point —
// including through deuce/advantage. Deuce (40-40) is always served from
// the right and advantage always from the left, regardless of how many
// times the game has gone back to deuce, so those two cases are fixed;
// everything else falls out of the parity of total points played.
type ServeSide = "deuce" | "ad";
const pointCount = (v: number | string | undefined): number => {
  if (v === 15 || v === "15") return 1;
  if (v === 30 || v === "30") return 2;
  if (v === 40 || v === "40") return 3;
  return 0;
};
const computeServeSide = (
  pts: [number | string, number | string] | undefined,
): ServeSide => {
  if (!pts) return "deuce";
  const [h, a] = pts;
  if (h === "D" && a === "D") return "deuce";
  if (h === "AD" || a === "AD") return "ad";
  const total = pointCount(h) + pointCount(a);
  return total % 2 === 0 ? "deuce" : "ad";
};

export default function Court3D({
  homeTeam = "Casa",
  awayTeam = "Fora",
  homeScore = 0,
  awayScore = 0,
  sets = [],
  currentPoints,
  serving,
}: Court3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [event, setEvent] = useState<{
    label: string;
    team: "home" | "away" | null;
  } | null>(null);
  const eventColorRef = useRef("#ccff00");
  const eventTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Big centered number that pops up over the court when a point is won —
  // e.g. "15" -> "30" — instead of a generic label pill.
  const [pointFlash, setPointFlash] = useState<{
    id: number;
    value: string;
    team: "home" | "away";
  } | null>(null);
  const pointFlashIdRef = useRef(0);
  const pointFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevSetsWon = useRef({ home: homeScore, away: awayScore });
  const prevGames = useRef<[number, number]>(
    sets.length ? sets[sets.length - 1]! : [0, 0],
  );
  const prevPoints = useRef(currentPoints);

  const triggerEvent = (
    team: "home" | "away" | null,
    label: string,
    color: string,
    durationMs: number,
  ) => {
    if (eventTimeoutRef.current) clearTimeout(eventTimeoutRef.current);
    eventColorRef.current = color;
    setEvent({ label, team });
    // GAME/SET GANHO is the more significant signal — don't let a leftover
    // point-flash number linger on top of it.
    if (pointFlashTimeoutRef.current) clearTimeout(pointFlashTimeoutRef.current);
    setPointFlash(null);
    eventTimeoutRef.current = setTimeout(() => {
      setEvent(null);
      eventTimeoutRef.current = null;
    }, durationMs);
  };

  const triggerPointFlash = (team: "home" | "away", value: string) => {
    if (pointFlashTimeoutRef.current) clearTimeout(pointFlashTimeoutRef.current);
    pointFlashIdRef.current += 1;
    setPointFlash({ id: pointFlashIdRef.current, value, team });
    pointFlashTimeoutRef.current = setTimeout(() => {
      setPointFlash(null);
      pointFlashTimeoutRef.current = null;
    }, 1100);
  };

  // Game won — current set's game tally going up. When a set finishes and
  // a new one starts, the tally drops back toward 0 instead of rising, so
  // this naturally stays silent on that transition (the set effect below
  // already covers it). Declared BEFORE the set-won effect so that when a
  // game and a set complete in the same tick (the last game of a set), the
  // set effect's triggerEvent call runs afterward and wins — React commits
  // effects in declaration order, so ordering here doubles as event
  // priority: "SET GANHO" is the more significant signal and should be
  // what's visible, not "GAME".
  useEffect(() => {
    const cur: [number, number] = sets.length ? sets[sets.length - 1]! : [0, 0];
    const prev = prevGames.current;
    if (cur[0] > prev[0]) {
      triggerEvent("home", "GAME", "#38bdf8", 1900);
    } else if (cur[1] > prev[1]) {
      triggerEvent("away", "GAME", "#38bdf8", 1900);
    }
    prevGames.current = cur;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets]);

  // Set won — biggest signal, keyed off the sets-won counters (already
  // computed correctly upstream for tiebreaks/super-tiebreaks).
  useEffect(() => {
    if (homeScore > prevSetsWon.current.home) {
      triggerEvent("home", "SET GANHO", "#22c55e", 2800);
    } else if (awayScore > prevSetsWon.current.away) {
      triggerEvent("away", "SET GANHO", "#22c55e", 2800);
    }
    prevSetsWon.current = { home: homeScore, away: awayScore };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeScore, awayScore]);

  // Point won — only fires on a genuine rank increase for exactly one
  // side; a game-ending reset (e.g. 40 -> 0) drops rank, so it's ignored
  // here and left to the game effect above.
  useEffect(() => {
    const [h, a] = currentPoints ?? [0, 0];
    const [ph, pa] = prevPoints.current ?? [0, 0];
    const rh = pointRank(h);
    const ra = pointRank(a);
    const prh = pointRank(ph);
    const pra = pointRank(pa);
    if (rh > prh && ra <= pra) {
      triggerPointFlash("home", String(h));
    } else if (ra > pra && rh <= prh) {
      triggerPointFlash("away", String(a));
    }
    prevPoints.current = currentPoints;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPoints]);

  useEffect(() => {
    return () => {
      if (eventTimeoutRef.current) clearTimeout(eventTimeoutRef.current);
      if (pointFlashTimeoutRef.current) clearTimeout(pointFlashTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const scaleX = (width * 1.08) / 1200;
      const scaleY = (height * 1.05) / 370;
      setScale(Math.max(0.2, Math.min(1.8, Math.min(scaleX, scaleY))));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rkRot  = [0, -30, 30, 10, 0];
  const rkT    = [0, 0.1, 0.35, 0.6, 1];

  // Who's serving decides which racket swings first (serve) vs second
  // (return) — defaults to home when no real serve data is known yet.
  const homeServing = serving ? serving[0] : true;
  const leftDelay = homeServing ? 0 : 1.5;
  const rightDelay = homeServing ? 1.5 : 0;
  const ballSide: "home" | "away" = homeServing ? "home" : "away";
  const serveSide = computeServeSide(currentPoints);
  // Deuce/ad court sit on opposite sides of the server's own baseline —
  // in our side-on camera that's a vertical (not horizontal) shift, since
  // the net runs across the screen's width and each baseline's own left/
  // right corresponds to depth in the world, not screen-left/right.
  const ballTop = ballSide === "home"
    ? (serveSide === "deuce" ? 26 : 44)
    : (serveSide === "deuce" ? 29 : 47);
  const ballLeft = ballSide === "home" ? 23 : 75;

  const currentGames = sets.length ? sets[sets.length - 1]! : undefined;
  const pts = currentPoints;
  const isDeuce = pts?.[0] === "D" && pts?.[1] === "D";
  const hasScoreboard = currentGames !== undefined || pts !== undefined;

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center [perspective:1400px] overflow-hidden pointer-events-none"
      >
        <div
          style={{
            transform: `rotateX(52deg) translateY(-40px) translateZ(-60px) scale(${scale})`,
            transformStyle: "preserve-3d",
          }}
          className="relative origin-center"
        >
          <motion.div
            className="relative w-[1200px] h-[600px] origin-center"
            animate={{ rotateZ: [-0.7, 0.7, -0.7] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformStyle: "preserve-3d" }}
          >

            {/* ── Outer Surround — US Open medium blue ── */}
            <div
              className="absolute inset-0 rounded-xl overflow-hidden"
              style={{
                background: "#4a90c8",
                border: "3px solid #3a7ab0",
                boxShadow: "0 30px 60px rgba(0,0,0,0.5)",
              }}
            >
              {/* Inner court SVG */}
              <svg
                viewBox="0 0 780 360"
                style={{ position: "absolute", left: "17.5%", top: "14%", width: "65%", height: "72%" }}
              >
                {/* Playing surface */}
                <rect x="0" y="0" width="780" height="360" fill="#1a6ab8" />

                {/* BET62 watermark */}
                <text x="390" y="180" fontSize="70" fontWeight="900"
                  fill="rgba(255,255,255,0.07)"
                  textAnchor="middle" dominantBaseline="central" letterSpacing="0.06em">
                  BET62
                </text>

                {/* Court lines */}
                <g stroke="rgba(255,255,255,0.85)" strokeWidth="3" fill="none">
                  <rect x="0" y="0" width="780" height="360" />
                  <line x1="0"   y1="45"  x2="780" y2="45" />
                  <line x1="0"   y1="315" x2="780" y2="315" />
                  <line x1="180" y1="45"  x2="180" y2="315" />
                  <line x1="600" y1="45"  x2="600" y2="315" />
                  <line x1="180" y1="180" x2="600" y2="180" />
                  <line x1="0"   y1="180" x2="12"  y2="180" />
                  <line x1="768" y1="180" x2="780" y2="180" />
                </g>

                {/* Net shadow on court surface */}
                <line x1="390" y1="0" x2="390" y2="360"
                  stroke="rgba(0,0,0,0.35)" strokeWidth="5" />
              </svg>

              {/* ── Net posts inside the surround ──
                  Two dark bars running from the court top edge and bottom edge.
                  The posts sit outside the inner court area (in the surround). */}
            </div>

            {/*
              ── 3D NET PANEL ──
              translateZ(20px) → small, realistic rise above the court surface.
              The net appears as a dark bar with white top tape, centered on the
              court's width (left: 50%).
            */}
            <div
              style={{
                position: "absolute",
                left: "calc(50% - 3px)",
                top: "14%",
                height: "72%",
                width: "6px",
                transform: "translateZ(20px)",
                transformStyle: "preserve-3d",
                zIndex: 60,
                borderRadius: "1px",
                overflow: "hidden",
              }}
            >
              {/* Net mesh body */}
              <div style={{
                position: "absolute",
                inset: 0,
                background: "rgba(8,18,38,0.95)",
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.15) 1.5px, transparent 1.5px), " +
                  "linear-gradient(90deg, rgba(255,255,255,0.15) 1.5px, transparent 1.5px)",
                backgroundSize: "6px 6px",
              }} />
              {/* White top tape */}
              <div style={{
                position: "absolute",
                top: 0, left: 0, right: 0, height: "6px",
                background: "rgba(245,248,255,0.95)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
              }} />
            </div>

            {/* Net post caps at the two ends of the net */}
            <div style={{
              position: "absolute",
              left: "calc(50% - 4px)",
              top: "14%",
              width: "8px", height: "8px",
              transform: "translateZ(20px)",
              background: "#7a9cb8",
              borderRadius: "50%",
              zIndex: 61,
            }} />
            <div style={{
              position: "absolute",
              left: "calc(50% - 4px)",
              top: "calc(14% + 72% - 8px)",
              width: "8px", height: "8px",
              transform: "translateZ(20px)",
              background: "#7a9cb8",
              borderRadius: "50%",
              zIndex: 61,
            }} />

            {/* ── Tennis Racket SVG (reusable inline) ── */}
            {/* Left-side racket — serves first when home is serving */}
            <motion.div
              style={{ position: "absolute", left: "17%", top: "35%", transformOrigin: "50% 88%", zIndex: 30 }}
              animate={{ rotate: rkRot, x: [0, -8, 12, 4, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", times: rkT, delay: leftDelay }}
            >
              <svg width="36" height="80" viewBox="0 0 36 80" fill="none">
                {/* ── Head frame ── */}
                <ellipse cx="18" cy="20" rx="15" ry="18"
                  stroke="rgba(255,255,255,0.90)" strokeWidth="2.8"
                  fill="rgba(255,255,255,0.05)" />
                {/* Strings — vertical */}
                {[-10,-5,0,5,10].map((dx) => {
                  const half = Math.sqrt(Math.max(0, 225 - dx*dx));
                  return <line key={`v${dx}`}
                    x1={18+dx} y1={20 - half + 2} x2={18+dx} y2={20 + half - 2}
                    stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" />;
                })}
                {/* Strings — horizontal */}
                {[-13,-8,-3,2,7,12].map((dy) => {
                  const half = Math.sqrt(Math.max(0, 324 - dy*dy));
                  return <line key={`h${dy}`}
                    x1={18 - half + 2} y1={20+dy} x2={18 + half - 2} y2={20+dy}
                    stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" />;
                })}
                {/* ── Throat ── two converging lines */}
                <path d="M11 36 L16 50 M25 36 L20 50"
                  stroke="rgba(255,255,255,0.80)" strokeWidth="2.2"
                  strokeLinecap="round" />
                {/* ── Grip / Handle — black with wrap texture ── */}
                <rect x="14.5" y="50" width="7" height="28" rx="3"
                  fill="#111111" />
                {/* Grip wrapping lines */}
                {[54,59,64,69,72].map((y) => (
                  <line key={y} x1="14.5" y1={y} x2="21.5" y2={y}
                    stroke="rgba(255,255,255,0.25)" strokeWidth="0.9" />
                ))}
                {/* Butt cap */}
                <rect x="13" y="76" width="10" height="3" rx="1.5"
                  fill="rgba(80,80,80,0.9)" />
              </svg>
              {homeServing && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px]"
                  style={{ filter: "drop-shadow(0 0 3px rgba(250,204,21,0.9))" }}
                >
                  🎾
                </span>
              )}
            </motion.div>

            {/* Right-side racket — serves first when away is serving, mirrored */}
            <motion.div
              style={{ position: "absolute", left: "79%", top: "38%", transformOrigin: "50% 88%", zIndex: 30,
                transform: "scaleX(-1)" /* mirror horizontally */ }}
              animate={{ rotate: rkRot.map(r => -r), x: [0, 8, -12, -4, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", times: rkT, delay: rightDelay }}
            >
              <svg width="36" height="80" viewBox="0 0 36 80" fill="none">
                <ellipse cx="18" cy="20" rx="15" ry="18"
                  stroke="rgba(255,255,255,0.90)" strokeWidth="2.8"
                  fill="rgba(255,255,255,0.05)" />
                {[-10,-5,0,5,10].map((dx) => {
                  const half = Math.sqrt(Math.max(0, 225 - dx*dx));
                  return <line key={`v${dx}`}
                    x1={18+dx} y1={20 - half + 2} x2={18+dx} y2={20 + half - 2}
                    stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" />;
                })}
                {[-13,-8,-3,2,7,12].map((dy) => {
                  const half = Math.sqrt(Math.max(0, 324 - dy*dy));
                  return <line key={`h${dy}`}
                    x1={18 - half + 2} y1={20+dy} x2={18 + half - 2} y2={20+dy}
                    stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" />;
                })}
                <path d="M11 36 L16 50 M25 36 L20 50"
                  stroke="rgba(255,255,255,0.80)" strokeWidth="2.2"
                  strokeLinecap="round" />
                <rect x="14.5" y="50" width="7" height="28" rx="3"
                  fill="#111111" />
                {[54,59,64,69,72].map((y) => (
                  <line key={y} x1="14.5" y1={y} x2="21.5" y2={y}
                    stroke="rgba(255,255,255,0.25)" strokeWidth="0.9" />
                ))}
                <rect x="13" y="76" width="10" height="3" rx="1.5"
                  fill="rgba(80,80,80,0.9)" />
              </svg>
              {!homeServing && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px]"
                  style={{ transform: "scaleX(-1)", filter: "drop-shadow(0 0 3px rgba(250,204,21,0.9))" }}
                >
                  🎾
                </span>
              )}
            </motion.div>

            {/* No real ball-position telemetry exists for tennis (same
                situation as football), so instead of a fabricated flight
                path we show a "loading" cluster of pulsing ball dots — the
                same visual language SportScore uses to mark "about to
                serve" — parked at the server's box. It sits on the deuce
                (right) or ad (left) side of that box per the real service
                rule, and crosses over the instant either the server or the
                side changes. */}
            <AnimatePresence>
              <motion.div
                key={`${ballSide}-${serveSide}`}
                className="absolute pointer-events-none"
                style={{
                  left: `${ballLeft}%`,
                  top: `${ballTop}%`,
                  transform: "translate(-50%, -50%)",
                  zIndex: 35,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      width: 7 - i,
                      height: 7 - i,
                      left: i * 4 - 4,
                      top: -i * 3,
                      background:
                        "radial-gradient(circle at 35% 30%, #eaff6b, #b9db00 60%, #92b800)",
                      boxShadow: "0 0 4px rgba(220,255,0,0.75)",
                    }}
                    animate={{ opacity: [0.15, 1, 0.15], scale: [0.7, 1.05, 0.7] }}
                    transition={{
                      duration: 1.1,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.25,
                    }}
                  />
                ))}
              </motion.div>
            </AnimatePresence>

          </motion.div>
        </div>
      </div>

      {/* Small scoreboard, tucked in the corner — same treatment as Field3D */}
      {hasScoreboard && (
        <div className="absolute top-1.5 left-1.5 pointer-events-none">
          <div
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-black tabular-nums"
            style={{
              backgroundColor: "rgba(9,9,11,0.75)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
            }}
          >
            <span className="text-zinc-400 uppercase tracking-wide">
              {homeTeam.slice(0, 3)}
            </span>
            {serving?.[0] && <span className="text-yellow-400">🎾</span>}
            <span>{currentGames?.[0] ?? 0}</span>
            <span className="text-zinc-500">-</span>
            <span>{currentGames?.[1] ?? 0}</span>
            {serving?.[1] && <span className="text-yellow-400">🎾</span>}
            <span className="text-zinc-400 uppercase tracking-wide">
              {awayTeam.slice(0, 3)}
            </span>
            {pts && (
              <>
                <span className="w-px h-3 bg-white/15 mx-0.5" />
                <span className="text-orange-300 normal-case tracking-normal">
                  {isDeuce ? "DUE" : `${pts[0]}-${pts[1]}`}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {event && (
        <div className="absolute inset-x-0 top-[26px] flex justify-center pointer-events-none">
          <span
            className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border"
            style={{
              color: eventColorRef.current,
              borderColor: `${eventColorRef.current}80`,
              backgroundColor: "rgba(9,9,11,0.85)",
            }}
          >
            {event.team === "home" ? `${homeTeam} — ` : event.team === "away" ? `${awayTeam} — ` : ""}
            {event.label}
          </span>
        </div>
      )}

      {/* Big centered number when a point is won — e.g. "15" flips to "30"
          right over the court, instead of just updating the corner badge. */}
      <AnimatePresence>
        {pointFlash && (
          <motion.div
            key={pointFlash.id}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.25 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <span
              className="text-3xl font-black tabular-nums"
              style={{
                color: pointFlash.team === "home" ? "#7dd3fc" : "#fca5a5",
                textShadow:
                  "0 2px 10px rgba(0,0,0,0.85), 0 0 18px currentColor",
              }}
            >
              {pointFlash.value}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
