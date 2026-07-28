import { useEffect, useRef, useState } from "react";

// Our own 3D-styled mini pitch, replacing the SportScore iframe tracker.
// We have no real ball/player position telemetry from Statpal — only
// discrete signals (score, corners, cards). So the ball doesn't "track" the
// real match; it patrols the midfield when nothing is happening and plays a
// short reactive animation toward a plausible spot (goal / corner arc / foul
// area) whenever one of those signals changes. It's a dramatization built
// from real data, not a simulation of real positions.

type Vec = { x: number; y: number }; // percentages within the pitch (0-100)

const CENTER: Vec = { x: 50, y: 50 };
const IDLE_WAYPOINTS: Vec[] = [
  { x: 50, y: 50 },
  { x: 38, y: 46 },
  { x: 62, y: 54 },
  { x: 50, y: 58 },
];
// Home attacks toward the top (away goal); away attacks toward the bottom.
const HOME_GOAL: Vec = { x: 50, y: 92 };
const AWAY_GOAL: Vec = { x: 50, y: 8 };
const CORNER_SPOTS: Vec[] = [
  { x: 6, y: 8 },
  { x: 94, y: 8 },
  { x: 6, y: 92 },
  { x: 94, y: 92 },
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

  // Goals — ball heads toward the goal the scoring team just hit.
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

  // Corners — combined count only (Statpal doesn't split by team), so just
  // send the ball to a corner arc.
  useEffect(() => {
    const c = cornersTotal ?? 0;
    if (c > prevCorners.current) {
      const spot = CORNER_SPOTS[Math.floor(Math.random() * CORNER_SPOTS.length)]!;
      triggerEvent(spot, null, "ESCANTEIO");
    }
    prevCorners.current = c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cornersTotal]);

  // Cards — team-attributable, so the ball pauses on that team's own half.
  useEffect(() => {
    const yh = yellowCardsHome ?? 0;
    const ya = yellowCardsAway ?? 0;
    const rh = redCardsHome ?? 0;
    const ra = redCardsAway ?? 0;
    if (rh > prevRcHome.current) {
      triggerEvent({ x: 50, y: 68 }, "home", "CARTÃO VERMELHO");
    } else if (ra > prevRcAway.current) {
      triggerEvent({ x: 50, y: 32 }, "away", "CARTÃO VERMELHO");
    } else if (yh > prevYcHome.current) {
      triggerEvent({ x: 50, y: 68 }, "home", "CARTÃO AMARELO");
    } else if (ya > prevYcAway.current) {
      triggerEvent({ x: 50, y: 32 }, "away", "CARTÃO AMARELO");
    }
    prevYcHome.current = yh;
    prevYcAway.current = ya;
    prevRcHome.current = rh;
    prevRcAway.current = ra;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yellowCardsHome, yellowCardsAway, redCardsHome, redCardsAway]);

  // Idle patrol — gentle drift around the center circle when nothing else is happening.
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

  return (
    <div className="flex flex-col items-center">
      <div
        className="w-full max-w-[320px] rounded-xl border border-zinc-800/70 bg-zinc-950 overflow-hidden"
        style={{ height: 225, perspective: "700px" }}
      >
        <div
          className="relative w-full h-full"
          style={{
            transform: "rotateX(42deg) scale(1.15)",
            transformOrigin: "center 60%",
          }}
        >
          {/* Pitch surface */}
          <div
            className="absolute inset-2 rounded-md"
            style={{
              background:
                "repeating-linear-gradient(180deg, #16532b 0px, #16532b 22px, #1a5e30 22px, #1a5e30 44px)",
              boxShadow: "0 0 0 2px rgba(255,255,255,0.65) inset",
            }}
          >
            {/* Halfway line */}
            <div className="absolute left-0 right-0 top-1/2 h-[2px] bg-white/70" />
            {/* Center circle */}
            <div
              className="absolute rounded-full border-2 border-white/70"
              style={{ width: 56, height: 56, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
            />
            <div
              className="absolute rounded-full bg-white/80"
              style={{ width: 4, height: 4, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
            />
            {/* Goal boxes (top = away goal, bottom = home goal) */}
            <div className="absolute left-1/2 top-0 -translate-x-1/2 border-2 border-t-0 border-white/70" style={{ width: "40%", height: 26 }} />
            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 border-2 border-b-0 border-white/70" style={{ width: "40%", height: 26 }} />

            {/* Ball */}
            <div
              className="absolute rounded-full"
              style={{
                width: 10,
                height: 10,
                left: `${ballPos.x}%`,
                top: `${ballPos.y}%`,
                transform: "translate(-50%, -50%)",
                background: "radial-gradient(circle at 35% 30%, #fff, #d4d4d8 60%, #71717a)",
                boxShadow: event
                  ? `0 0 12px 4px ${eventColor}`
                  : "0 1px 3px rgba(0,0,0,0.5)",
                transition: "left 1.1s cubic-bezier(0.4,0,0.2,1), top 1.1s cubic-bezier(0.4,0,0.2,1), box-shadow 0.3s",
              }}
            />
          </div>
        </div>

        {/* Event label overlay */}
        {event && (
          <div className="absolute inset-x-0 top-2 flex justify-center pointer-events-none">
            <span
              className="text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border animate-in fade-in"
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
