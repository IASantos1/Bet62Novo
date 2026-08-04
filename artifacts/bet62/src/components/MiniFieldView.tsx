type FieldSport = "football" | "tennis" | "basketball" | "hockey" | "volleyball" | "baseball";

function normalizeFieldSport(sport?: string): FieldSport {
  const s = (sport ?? "football").toLowerCase();
  if (s.includes("tenis") || s.includes("tennis")) return "tennis";
  if (s.includes("basq") || s.includes("basket")) return "basketball";
  if (s.includes("gelo") || s.includes("hockey") || s.includes("hoquei") || s.includes("hóquei")) return "hockey";
  if (s.includes("voll") || s.includes("voley") || s.includes("volei") || s.includes("vôlei")) return "volleyball";
  if (s.includes("baseball") || s.includes("beisebol") || s.includes("béisbol")) return "baseball";
  return "football";
}

const LINE = "rgba(255,255,255,0.30)";
const LINE_SOFT = "rgba(255,255,255,0.16)";

function FootballMarkings() {
  return (
    <g fill="none" stroke={LINE} strokeWidth="0.55" vectorEffect="non-scaling-stroke">
      <rect x="0" y="0" width="105" height="68" rx="1.2" />
      <line x1="52.5" y1="0" x2="52.5" y2="68" />
      <circle cx="52.5" cy="34" r="9.15" />
      <circle cx="52.5" cy="34" r="0.55" fill={LINE} />
      <rect x="0" y="13.84" width="16.5" height="40.32" />
      <rect x="88.5" y="13.84" width="16.5" height="40.32" />
      <rect x="0" y="24.84" width="5.5" height="18.32" />
      <rect x="99.5" y="24.84" width="5.5" height="18.32" />
      <circle cx="11" cy="34" r="0.5" fill={LINE} />
      <circle cx="94" cy="34" r="0.5" fill={LINE} />
      <path d="M 16.5 26.4 A 9.15 9.15 0 0 1 16.5 41.6" />
      <path d="M 88.5 26.4 A 9.15 9.15 0 0 0 88.5 41.6" />
      <path d="M -2 30.34 L 0 30.34 L 0 37.66 L -2 37.66" />
      <path d="M 107 30.34 L 105 30.34 L 105 37.66 L 107 37.66" />
      <path d="M 3.5 0 A 3.5 3.5 0 0 1 0 3.5" strokeWidth="0.8" />
      <path d="M 105 3.5 A 3.5 3.5 0 0 1 101.5 0" strokeWidth="0.8" />
      <path d="M 0 64.5 A 3.5 3.5 0 0 1 3.5 68" strokeWidth="0.8" />
      <path d="M 101.5 68 A 3.5 3.5 0 0 1 105 64.5" strokeWidth="0.8" />
    </g>
  );
}

function TennisMarkings() {
  return (
    <g fill="none" stroke={LINE} strokeWidth="0.14" vectorEffect="non-scaling-stroke">
      <rect x="0" y="0" width="23.77" height="10.97" />
      <rect x="0" y="1.37" width="23.77" height="8.23" />
      <line x1="11.885" y1="0" x2="11.885" y2="10.97" strokeWidth="0.2" />
      <line x1="5.485" y1="1.37" x2="5.485" y2="9.6" />
      <line x1="18.285" y1="1.37" x2="18.285" y2="9.6" />
      <line x1="5.485" y1="5.485" x2="18.285" y2="5.485" />
    </g>
  );
}

function BasketballMarkings() {
  return (
    <g fill="none" stroke={LINE} strokeWidth="0.16" vectorEffect="non-scaling-stroke">
      <rect x="0" y="0" width="28" height="15" />
      <line x1="14" y1="0" x2="14" y2="15" />
      <circle cx="14" cy="7.5" r="1.8" />
      <rect x="0" y="4.6" width="5.8" height="5.8" />
      <rect x="22.2" y="4.6" width="5.8" height="5.8" />
      <circle cx="5.8" cy="7.5" r="1.8" />
      <circle cx="22.2" cy="7.5" r="1.8" />
      <path d="M 1.575 0.75 A 6.75 6.75 0 0 1 1.575 14.25" />
      <path d="M 26.425 0.75 A 6.75 6.75 0 0 0 26.425 14.25" />
    </g>
  );
}

function HockeyMarkings() {
  return (
    <g fill="none" stroke={LINE} strokeWidth="0.22" vectorEffect="non-scaling-stroke">
      <rect x="0" y="0" width="60" height="30" rx="8.5" />
      <line x1="30" y1="0" x2="30" y2="30" stroke="rgba(255,90,90,0.4)" strokeWidth="0.35" />
      <line x1="20" y1="0" x2="20" y2="30" stroke="rgba(120,170,255,0.4)" strokeWidth="0.3" />
      <line x1="40" y1="0" x2="40" y2="30" stroke="rgba(120,170,255,0.4)" strokeWidth="0.3" />
      <circle cx="30" cy="15" r="4.5" />
      <circle cx="30" cy="15" r="0.4" fill={LINE} />
      <circle cx="10" cy="7" r="2.2" />
      <circle cx="10" cy="23" r="2.2" />
      <circle cx="50" cy="7" r="2.2" />
      <circle cx="50" cy="23" r="2.2" />
      <path d="M 4 11 A 1.8 1.8 0 0 1 4 19" />
      <path d="M 56 11 A 1.8 1.8 0 0 0 56 19" />
    </g>
  );
}

function VolleyballMarkings() {
  return (
    <g fill="none" stroke={LINE} strokeWidth="0.16" vectorEffect="non-scaling-stroke">
      <rect x="0" y="0" width="18" height="9" />
      <line x1="9" y1="0" x2="9" y2="9" strokeWidth="0.26" />
      <line x1="6" y1="0" x2="6" y2="9" />
      <line x1="12" y1="0" x2="12" y2="9" />
    </g>
  );
}

function BaseballMarkings() {
  return (
    <g fill="none" stroke={LINE} strokeWidth="0.6" vectorEffect="non-scaling-stroke">
      <path d="M 50 95 L 95 55 M 50 95 L 5 55" />
      <path d="M 5 55 A 64 64 0 0 1 95 55" />
      <path d="M 50 95 L 78 67 L 50 39 L 22 67 Z" />
      <circle cx="50" cy="67" r="1.6" fill={LINE} />
      <rect x="47" y="91" width="6" height="6" transform="rotate(45 50 94)" fill={LINE} opacity="0.7" />
      <circle cx="78" cy="67" r="1.4" fill={LINE_SOFT} />
      <circle cx="50" cy="39" r="1.4" fill={LINE_SOFT} />
      <circle cx="22" cy="67" r="1.4" fill={LINE_SOFT} />
    </g>
  );
}

const SURFACE: Record<FieldSport, { viewBox: string; markings: () => React.ReactNode; ar: string }> = {
  football:   { viewBox: "-3 -3 111 74",  markings: FootballMarkings,   ar: "105/68" },
  tennis:     { viewBox: "-1 -1 25.77 12.97", markings: TennisMarkings, ar: "24/13" },
  basketball: { viewBox: "-1 -1 30 17",   markings: BasketballMarkings, ar: "28/15" },
  hockey:     { viewBox: "-1 -1 62 32",   markings: HockeyMarkings,     ar: "60/30" },
  volleyball: { viewBox: "-1 -1 20 11",   markings: VolleyballMarkings, ar: "18/9" },
  baseball:   { viewBox: "0 0 100 100",   markings: BaseballMarkings,   ar: "1/1" },
};

export default function MiniFieldView({
  sport,
  homeTeam,
  awayTeam,
  liveClockLabel,
  homeFormation,
  awayFormation,
  homeHalfTimeScore,
  awayHalfTimeScore,
  lineupConfirmed,
  incidents,
}: {
  sport?: string;
  homeTeam: string;
  awayTeam: string;
  liveClockLabel?: string | null;
  homeFormation?: string | null;
  awayFormation?: string | null;
  homeHalfTimeScore?: number | null;
  awayHalfTimeScore?: number | null;
  lineupConfirmed?: boolean | null;
  incidents?: Array<{ type: string; team: string; minute: number; player: string }>;
}) {
  const kind = normalizeFieldSport(sport);
  const surface = SURFACE[kind];
  const Markings = surface.markings;

  // Pull last goal incident (if any) to show as a small live badge above
  // the pitch: makes the SVG feel "live" without needing an iframe.
  let lastGoalText: string | null = null;
  if (incidents && incidents.length > 0) {
    for (let i = incidents.length - 1; i >= 0; i--) {
      const inc = incidents[i]!;
      if (!inc) continue;
      if (
        inc.type === "goal" ||
        inc.type === "own_goal" ||
        inc.type === "penalty"
      ) {
        const who = inc.team ? inc.team : inc.player ? inc.player : "";
        const label =
          inc.type === "own_goal"
            ? "Gol contra"
            : inc.type === "penalty"
              ? "Gol (Pênalti)"
              : "Gol";
        lastGoalText = `${label} · ${inc.minute}' · ${who}`.trim();
        if (lastGoalText.length > 58) lastGoalText = lastGoalText.slice(0, 57) + "…";
        break;
      }
    }
  }

  return (
    <div
      className="rounded-2xl overflow-hidden border border-zinc-800/70"
      style={{ background: "linear-gradient(160deg, #1a1a1f 0%, #0d0d10 100%)" }}
    >
      {/* Top bar: team names (outer edges) + central formations/score/HT */}
      <div className="flex items-center justify-between px-3 pt-2.5 gap-2">
        {/* Home side: name + formation */}
        <div className="flex-1 min-w-0 flex flex-col items-start gap-0.5">
          <div className="flex items-center gap-1.5 w-full min-w-0">
            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            <span className="text-[10px] font-black text-zinc-300 truncate">{homeTeam}</span>
          </div>
          {homeFormation ? (
            <span className="pl-3.5 text-[9px] font-bold uppercase tracking-widest text-blue-300/70">
              {homeFormation}
            </span>
          ) : null}
        </div>

        {/* CENTER — clock / formations confirmed / last-goal pill */}
        <div className="flex flex-col items-center gap-1.5 shrink-0 px-1.5">
          {liveClockLabel ? (
            <span className="flex items-center gap-1.5 text-[10px] font-black text-red-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
              </span>
              {liveClockLabel}
            </span>
          ) : (
            <span
              className="text-[9px] font-black uppercase tracking-widest"
              style={{
                backgroundImage: "linear-gradient(90deg,#facc15,#f97316,#dc2626)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {kind === "football" && "Campo"}
              {kind === "tennis" && "Quadra"}
              {kind === "basketball" && "Quadra"}
              {kind === "hockey" && "Pista"}
              {kind === "volleyball" && "Quadra"}
              {kind === "baseball" && "Diamante"}
            </span>
          )}
          {homeHalfTimeScore != null && awayHalfTimeScore != null && (
            <span className="text-[9px] font-bold text-zinc-400/80 uppercase tracking-wider">
              HT {homeHalfTimeScore} × {awayHalfTimeScore}
            </span>
          )}
          {lineupConfirmed === true ? (
            <span className="text-[8px] font-black text-emerald-400/80 uppercase tracking-widest">
              Escalação confirmada
            </span>
          ) : lineupConfirmed === false ? (
            <span className="text-[8px] font-black text-amber-400/80 uppercase tracking-widest">
              Escalação provisória
            </span>
          ) : null}
        </div>

        {/* Away side: name + formation */}
        <div className="flex-1 min-w-0 flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-1.5 w-full min-w-0 justify-end">
            <span className="text-[10px] font-black text-zinc-300 truncate">{awayTeam}</span>
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          </div>
          {awayFormation ? (
            <span className="pr-3.5 text-[9px] font-bold uppercase tracking-widest text-red-300/70">
              {awayFormation}
            </span>
          ) : null}
        </div>
      </div>

      {/* Last-goal banner */}
      {lastGoalText ? (
        <div className="px-3 pt-2">
          <div className="mx-auto max-w-[360px] rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-center text-[9px] font-bold uppercase tracking-wider text-amber-300 truncate">
            🔥 {lastGoalText}
          </div>
        </div>
      ) : null}

      {/* SVG Pitch */}
      <div className="px-4 py-3">
        <div className="mx-auto w-full max-w-[360px]" style={{ aspectRatio: surface.ar }}>
          <svg viewBox={surface.viewBox} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
            <rect
              x={surface.viewBox.split(" ")[0]}
              y={surface.viewBox.split(" ")[1]}
              width={surface.viewBox.split(" ")[2]}
              height={surface.viewBox.split(" ")[3]}
              fill="rgba(255,255,255,0.02)"
            />
            <Markings />
          </svg>
        </div>
      </div>
    </div>
  );
}
