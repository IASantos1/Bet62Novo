import { useEffect, useRef, useState } from "react";

// Our own 3D-styled mini pitch, replacing the SportScore iframe tracker.
// We have no real ball/player position telemetry from Statpal — only
// discrete signals (score, corners, cards). So the ball doesn't "track" the
// real match; it patrols the midfield when nothing is happening and plays a
// short animation toward a plausible spot (goal / corner arc / foul area)
// whenever one of those signals changes. It's a dramatization built from
// real data, not a simulation of real positions.

type Vec = { x: number; y: number }; // percentages within the pitch (0-100)

const CENTER: Vec = { x: 50, y: 50 };
const IDLE_WAYPOINTS: Vec[] = [
  { x: 50, y: 50 },
  { x: 36, y: 44 },
  { x: 64, y: 56 },
  { x: 50, y: 62 },
];
// Home attacks toward the top (away goal); away attacks toward the bottom.
const HOME_GOAL: Vec = { x: 50, y: 94 };
const AWAY_GOAL: Vec = { x: 50, y: 6 };
const CORNER_SPOTS: Vec[] = [
  { x: 4, y: 6 },
  { x: 96, y: 6 },
  { x: 4, y: 94 },
  { x: 96, y: 94 },
];

export interface Mini3DFieldProps {
  homeScore: number;
  awayScore: number;
  cornersTotal?: number;
  yellowCardsHome?: number;
  yellowCardsAway?: number;
  redCardsHome?: number;
  redCardsAway?: number;
  homeTeam: string;
  awayTeam: string;
}

function CornerFlag({ x, y }: { x: number; y: number }) {
  const flipX = x > 50;
  return (
    <div
      className="absolute"
      style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -100%)" }}
    >
      <div className="relative" style={{ width: 2, height: 16, background: "#e4e4e7" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            [flipX ? "right" : "left"]: 2,
            width: 0,
            height: 0,
            borderTop: "5px solid transparent",
            borderBottom: "5px solid transparent",
            [flipX ? "borderRight" : "borderLeft"]: "8px solid #f97316",
          } as React.CSSProperties}
        />
      </div>
    </div>
  );
}

function GoalFrame({ atTop }: { atTop: boolean }) {
  // A small pseudo-3D goal net: a wide mouth line + a narrower back line,
  // joined by two side struts, suggesting depth without real 3D geometry.
  return (
    <div
      className="absolute left-1/2"
      style={{
        [atTop ? "top" : "bottom"]: 0,
        transform: "translateX(-50%)",
        width: "26%",
        height: 16,
      } as React.CSSProperties}
    >
      <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none" style={{ overflow: "visible" }}>
        <polygon
          points={
            atTop
              ? "10,0 90,0 78,60 22,60"
              : "22,0 78,0 90,60 10,60"
          }
          fill="rgba(255,255,255,0.12)"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={2.5}
        />
      </svg>
    </div>
  );
}

export default function Mini3DField({
  homeScore,
  awayScore,
  cornersTotal,
  yellowCardsHome,
  yellowCardsAway,
  redCardsHome,
  redCardsAway,
  homeTeam,
  awayTeam,
}: Mini3DFieldProps) {
  const [ballPos, setBallPos] = useState<Vec>(CENTER);
  const [event, setEvent] = useState<{
    label: string;
    team: "home" | "away" | null;
  } | null>(null);

  const prevHomeScore = useRef(homeScore);
  const prevAwayScore = useRef(awayScore);
  const prevCorners = useRef(cornersTotal ?? 0);
  const prevYcHome = useRef(yellowCardsHome ?? 0);
  const prevYcAway = useRef(yellowCardsAway ?? 0);
  const prevRcHome = useRef(redCardsHome ?? 0);
  const prevRcAway = useRef(redCardsAway ?? 0);
  const idleStepRef = useRef(0);
  const eventTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerEvent = (pos: Vec, team: "home" | "away" | null, label: string) => {
    if (eventTimeoutRef.current) clearTimeout(eventTimeoutRef.current);
    setBallPos(pos);
    setEvent({ label, team });
    eventTimeoutRef.current = setTimeout(() => {
      setEvent(null);
      setBallPos(CENTER);
      eventTimeoutRef.current = null;
    }, 2800);
  };

  useEffect(() => {
    if (homeScore > prevHomeScore.current) {
      triggerEvent(AWAY_GOAL, "home", "GOLO!");
    } else if (awayScore > prevAwayScore.current) {
      triggerEvent(HOME_GOAL, "away", "GOLO!");
    }
    prevHomeScore.current = homeScore;
    prevAwayScore.current = awayScore;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeScore, awayScore]);

  useEffect(() => {
    const c = cornersTotal ?? 0;
    if (c > prevCorners.current) {
      const spot = CORNER_SPOTS[Math.floor(Math.random() * CORNER_SPOTS.length)]!;
      triggerEvent(spot, null, "ESCANTEIO");
    }
    prevCorners.current = c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cornersTotal]);

  useEffect(() => {
    const yh = yellowCardsHome ?? 0;
    const ya = yellowCardsAway ?? 0;
    const rh = redCardsHome ?? 0;
    const ra = redCardsAway ?? 0;
    if (rh > prevRcHome.current) {
      triggerEvent({ x: 50, y: 70 }, "home", "CARTÃO VERMELHO");
    } else if (ra > prevRcAway.current) {
      triggerEvent({ x: 50, y: 30 }, "away", "CARTÃO VERMELHO");
    } else if (yh > prevYcHome.current) {
      triggerEvent({ x: 50, y: 70 }, "home", "CARTÃO AMARELO");
    } else if (ya > prevYcAway.current) {
      triggerEvent({ x: 50, y: 30 }, "away", "CARTÃO AMARELO");
    }
    prevYcHome.current = yh;
    prevYcAway.current = ya;
    prevRcHome.current = rh;
    prevRcAway.current = ra;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yellowCardsHome, yellowCardsAway, redCardsHome, redCardsAway]);

  useEffect(() => {
    if (event) return;
    const id = setInterval(() => {
      idleStepRef.current = (idleStepRef.current + 1) % IDLE_WAYPOINTS.length;
      setBallPos(IDLE_WAYPOINTS[idleStepRef.current]!);
    }, 3200);
    return () => clearInterval(id);
  }, [event]);

  useEffect(() => {
    return () => {
      if (eventTimeoutRef.current) clearTimeout(eventTimeoutRef.current);
    };
  }, []);

  const eventColor =
    event?.label === "GOLO!"
      ? "#22c55e"
      : event?.label === "CARTÃO VERMELHO"
        ? "#ef4444"
        : event?.label === "CARTÃO AMARELO"
          ? "#eab308"
          : "#f97316";

  const ballStyle = (delayMs: number, size: number, opacity: number): React.CSSProperties => ({
    position: "absolute",
    width: size,
    height: size,
    left: `${ballPos.x}%`,
    top: `${ballPos.y}%`,
    transform: "translate(-50%, -50%)",
    borderRadius: "50%",
    background: "radial-gradient(circle at 35% 30%, #fff, #d4d4d8 60%, #71717a)",
    opacity,
    boxShadow: event ? `0 0 10px 3px ${eventColor}` : "0 1px 3px rgba(0,0,0,0.5)",
    transition: `left 1.1s cubic-bezier(0.4,0,0.2,1) ${delayMs}ms, top 1.1s cubic-bezier(0.4,0,0.2,1) ${delayMs}ms, box-shadow 0.3s`,
  });

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative w-full max-w-[320px] rounded-xl overflow-hidden border border-zinc-800/70"
        style={{
          height: 225,
          background:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.09) 1px, transparent 0) 0 0/7px 7px, linear-gradient(180deg, #1e1b4b 0%, #2e2a5c 55%, #1a1740 100%)",
        }}
      >
        {/* Perspective wrapper */}
        <div className="absolute inset-0" style={{ perspective: 420 }}>
          {/* Centers the pitch in plain 2D first — translateX must happen
              BEFORE rotateX, in a separate element, otherwise it moves along
              the already-rotated 3D axis instead of the screen's horizontal
              axis and the pitch drifts off to one side. */}
          <div
            className="absolute left-1/2"
            style={{
              bottom: 8,
              width: "88%",
              height: "82%",
              transform: "translateX(-50%)",
              // Without this, the parent's `perspective` doesn't reach the
              // rotateX() child below — it gets flattened to 2D at this
              // boundary and rotateX just looks like a vertical squish
              // instead of a real trapezoid.
              transformStyle: "preserve-3d",
            }}
          >
            {/* Tilted pitch — bottom-anchored so the near edge stays full
                width and the far edge recedes, matching a behind-the-goal
                broadcast angle */}
            <div
              className="absolute inset-0"
              style={{
                transform: "rotateX(58deg)",
                transformOrigin: "50% 100%",
                background:
                  "repeating-linear-gradient(180deg, #1e6b34 0px, #1e6b34 11%, #227a3b 11%, #227a3b 22%)",
                border: "2px solid rgba(255,255,255,0.85)",
                borderRadius: 3,
                boxShadow: "0 0 24px rgba(0,0,0,0.5)",
              }}
            >
            {/* Halfway line */}
            <div className="absolute left-0 right-0 top-1/2 h-[2px] bg-white/85" />
            {/* Center circle + spot */}
            <div
              className="absolute rounded-full border-2 border-white/85"
              style={{ width: 46, height: 46, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
            />
            <div
              className="absolute rounded-full bg-white/90"
              style={{ width: 4, height: 4, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
            />
            {/* Penalty boxes */}
            <div className="absolute left-1/2 top-0 -translate-x-1/2 border-2 border-t-0 border-white/85" style={{ width: "56%", height: 30 }} />
            <div className="absolute left-1/2 top-0 -translate-x-1/2 border-2 border-t-0 border-white/85" style={{ width: "30%", height: 14 }} />
            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 border-2 border-b-0 border-white/85" style={{ width: "56%", height: 30 }} />
            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 border-2 border-b-0 border-white/85" style={{ width: "30%", height: 14 }} />

            {/* Goal frames */}
            <GoalFrame atTop />
            <GoalFrame atTop={false} />

            {/* Corner flags */}
            <CornerFlag x={2} y={3} />
            <CornerFlag x={98} y={3} />
            <CornerFlag x={2} y={97} />
            <CornerFlag x={98} y={97} />

            {/* Ball + trailing ghosts (comet effect) */}
            <div style={ballStyle(220, 6, 0.25)} />
            <div style={ballStyle(90, 8, 0.45)} />
            <div style={ballStyle(0, 10, 1)} />
            </div>
          </div>
        </div>

        {/* Event label overlay */}
        {event && (
          <div className="absolute inset-x-0 top-2 flex justify-center pointer-events-none">
            <span
              className="text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border"
              style={{
                color: eventColor,
                borderColor: `${eventColor}80`,
                backgroundColor: "rgba(9,9,11,0.85)",
              }}
            >
              {event.team === "home" ? `${homeTeam} — ` : event.team === "away" ? `${awayTeam} — ` : ""}
              {event.label}
            </span>
          </div>
        )}
      </div>
      <span className="mt-1 text-[9px] text-zinc-600">
        Campo 3D — animação baseada nos eventos reais da partida
      </span>
    </div>
  );
}
