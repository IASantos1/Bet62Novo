import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2, Activity, Users, TrendingUp, Lightbulb,
  Zap, Circle, ChevronRight, Loader2, ListOrdered
} from "lucide-react";

type MatchStatsData = {
  winProb: { home: number; draw: number; away: number };
  h2h: { homeWins: number; draws: number; awayWins: number };
  avgStats: {
    goalsScored: number;
    leagueGoals: number;
    over15: number;
    leagueOver15: number;
    over25: number;
    leagueOver25: number;
    cards: number;
    corners: number;
    btts: number;
    leagueBtts: number;
  };
  homeForm: FormEntry[];
  awayForm: FormEntry[];
  formIsReal?: boolean;
};
type FormEntry = { result: "W" | "D" | "L"; score: string; opponent: string; home: boolean };
type H2HMeeting = { date: string; team1: string; team2: string; score1: number; score2: number; league: string; country?: string };
type ConfrontosData = { homeWins: number; awayWins: number; draws: number; recentMeetings: H2HMeeting[]; team1Name: string; team2Name: string; sport: string };
type V2StatsGroup = { title: string; rows: Array<{ name: string; home: string; away: string }> };
type StandingRow = {
  pos: number;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  pts: number;
};
type StandingsGroup = { name: string; rows: StandingRow[] };

function rowMatchesTeam(rowName: string, teamName: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
  const row = norm(rowName);
  const team = norm(teamName);
  if (!row || !team) return false;
  if (row === team) return true;
  if (row.includes(team) || team.includes(row)) return true;
  return row.includes(team.slice(0, Math.min(team.length, 8)));
}

function standingsMetaForSport(sport?: string) {
  switch (sport) {
    case "basketball":
      return { played: "J", won: "V", drawn: "OT", lost: "D", gf: "PF", ga: "PA", pts: "Pts" };
    case "hockey":
      return { played: "J", won: "V", drawn: "OT", lost: "D", gf: "GM", ga: "GS", pts: "Pts" };
    case "baseball":
      return { played: "J", won: "V", drawn: "OT", lost: "D", gf: "RF", ga: "RA", pts: "Pct" };
    case "volleyball":
      return { played: "J", won: "V", drawn: "Pts", lost: "D", gf: "Sets+", ga: "Sets-", pts: "Pts" };
    default:
      return { played: "J", won: "V", drawn: "E", lost: "D", gf: "GF", ga: "GC", pts: "Pts" };
  }
}

type GoalEvent = {
  team: "home" | "away";
  minute: number;
  extraMinute?: number;
  playerName: string;
  assistName?: string;
  ownGoal?: boolean;
  penalty?: boolean;
  varCancelled?: boolean;
};
type CardEvent = {
  team: "home" | "away";
  minute: number;
  extraMinute?: number;
  playerName: string;
  cardType: "yellow" | "red";
};

type LiveExtra = {
  // Live football events (goals, cards)
  football?: {
    goals?: GoalEvent[];
    cards?: CardEvent[];
  };
  // Legacy tuple fields (kept for backwards compat)
  possession?: [number, number];
  xg?: [number, number];
  corners?: [number, number];
  shots?: [number, number];
  shotsOn?: [number, number];
  fouls?: [number, number];
  offsides?: [number, number];
  yellows?: [number, number];
  reds?: [number, number];
  goals?: [number, number];
  // Non-football sports
  vollSets?: Array<[number, number]>;
  currentPts?: [number, number];
  quarters?: Array<[number, number]>;
  periods?: Array<[number, number]>;
  innings?: Array<[number, number]>;
  outs?: number;
  homeHits?: number;
  awayHits?: number;
  homeErrors?: number;
  awayErrors?: number;
  totalPoints?: [number, number];
  fgPct?: [number, number];
  threePct?: [number, number];
  rebounds?: [number, number];
  assists?: [number, number];
  steals?: [number, number];
  blocks?: [number, number];
  turnovers?: [number, number];
  tennisSets?: Array<[number, number]>;
  currentGameScore?: string;
  currentSet?: number;
  games?: [number, number];
  // Football per-team live stats (from /match/{id}/statistics)
  cornersTotal?: number;
  cardsTotal?: number;
  cornersHome?: number;
  cornersAway?: number;
  possessionHome?: number;
  possessionAway?: number;
  shotsTotalHome?: number;
  shotsTotalAway?: number;
  shotsOnTargetHome?: number;
  shotsOnTargetAway?: number;
  foulsHome?: number;
  foulsAway?: number;
  yellowCardsHome?: number;
  yellowCardsAway?: number;
  redCardsHomeCount?: number;
  redCardsAwayCount?: number;
  offsidesHome?: number;
  offsidesAway?: number;
  savesHome?: number;
  savesAway?: number;
  dangerousAttacksHome?: number;
  dangerousAttacksAway?: number;
  attacksHome?: number;
  attacksAway?: number;
  xgHome?: number;
  xgAway?: number;
  throwInsHome?: number;
  throwInsAway?: number;
  crossesHome?: number;
  crossesAway?: number;
  passesHome?: number;
  passesAway?: number;
  passAccuracyHome?: number;
  passAccuracyAway?: number;
};

type Props = {
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;
  isLive?: boolean;
  liveMinute?: number;
  isHalfTime?: boolean;
  matchStats: MatchStatsData | null;
  matchStatsLoading: boolean;
  v2StatsGroups: V2StatsGroup[] | null;
  v2StatsLoading: boolean;
  confrontosData: ConfrontosData | null;
  onGoH2H: () => void;
  onGoLive: () => void;
  onAddInsight?: (market: string, odds: number) => void;
  liveExtra?: LiveExtra | null;
  storyline?: string | null;
  standings?: StandingRow[] | null;
  standingsGroups?: StandingsGroup[] | null;
  standingsLoading?: boolean;
  standingsLeague?: string;
};

// ── Momentum Chart ──────────────────────────────────────────────────────────
function seededBar(a: number, b: number): number {
  return Math.abs(Math.sin(a * 127.1 + b * 311.7) * 0.45 + Math.sin(a * 17.3 + b * 89.5) * 0.35 + 0.2);
}

function MomentumChart({ homeTeam, awayTeam, isLive, liveMinute, isHalfTime, goalEvents, cardEvents }: {
  homeTeam: string; awayTeam: string; isLive?: boolean; liveMinute?: number; isHalfTime?: boolean;
  goalEvents?: GoalEvent[]; cardEvents?: CardEvent[];
}) {
  const hs = homeTeam.split("").reduce((a, c) => a + c.charCodeAt(0), 7);
  const as_ = awayTeam.split("").reduce((a, c) => a + c.charCodeAt(0), 13);
  const COLS = 45;
  const curMin = isHalfTime ? 45 : (liveMinute ?? (isLive ? 65 : 90));
  const activeCols = Math.min(Math.floor(curMin / 2), COLS);
  const W = 600; const H = 110; const midY = H / 2;
  const bw = (W / COLS) - 1;
  const maxBarH = 38;

  const bars = Array.from({ length: COLS }, (_, i) => ({
    h: seededBar(hs + i, i * 3 + 1) * maxBarH,
    a: seededBar(as_ + i, i * 7 + 5) * maxBarH,
    on: i < activeCols,
  }));

  // Goal markers: one per non-cancelled goal
  const goals = (goalEvents ?? []).filter((g) => !g.varCancelled);
  // Group by column so we can stack multiple goals at the same minute
  const goalsByCol = new Map<number, GoalEvent[]>();
  for (const g of goals) {
    const col = Math.max(0, Math.min(Math.floor(g.minute / 2), COLS - 1));
    if (!goalsByCol.has(col)) goalsByCol.set(col, []);
    goalsByCol.get(col)!.push(g);
  }

  // Card markers: one per yellow/red card
  const cardsByCol = new Map<number, CardEvent[]>();
  for (const c of cardEvents ?? []) {
    const col = Math.max(0, Math.min(Math.floor(c.minute / 2), COLS - 1));
    if (!cardsByCol.has(col)) cardsByCol.set(col, []);
    cardsByCol.get(col)!.push(c);
  }

  const colW = W / COLS;

  return (
    <div className="rounded-xl overflow-hidden mb-1" style={{ background: "#0f0f12", border: "1px solid #27272a" }}>
      <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-600" />
          <span className="text-[11px] font-black text-zinc-200 truncate max-w-[80px]">{homeTeam}</span>
        </div>
        <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Momentum</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-black text-zinc-200 truncate max-w-[80px]">{awayTeam}</span>
          <div className="w-2 h-2 rounded-full bg-white/40" />
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 84, display: "block" }}>
        <defs>
          <linearGradient id="mg-home" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dc2626" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#dc2626" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="mg-away" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0.8)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.15)" />
          </linearGradient>
        </defs>
        <line x1="0" y1={midY} x2={W} y2={midY} stroke="#3f3f46" strokeWidth="0.5" />
        {bars.map(({ h, a, on }, i) => {
          const x = i * colW + 0.5;
          return (
            <g key={i} opacity={on ? 1 : 0.1}>
              {h > 1.5 && <rect x={x} y={midY - h} width={bw} height={h} fill={on ? "url(#mg-home)" : "#dc2626"} rx="0.5" />}
              {a > 1.5 && <rect x={x} y={midY} width={bw} height={a} fill={on ? "url(#mg-away)" : "white"} rx="0.5" />}
            </g>
          );
        })}

        {/* Goal markers */}
        {Array.from(goalsByCol.entries()).map(([col, colGoals]) => {
          const cx = col * colW + bw / 2 + 0.5;
          const homeGoals = colGoals.filter((g) => g.team === "home");
          const awayGoals = colGoals.filter((g) => g.team === "away");
          // minute label: place to right for cols < 36, to left for cols ≥ 36
          const labelAnchor = col >= 36 ? "end" : "start";
          const labelXHome = col >= 36 ? cx - 9 : cx + 9;
          const labelXAway = col >= 36 ? cx - 9 : cx + 9;
          const minLabel = (g: GoalEvent) =>
            g.extraMinute ? `${g.minute}+${g.extraMinute}'` : `${g.minute}'`;
          return (
            <g key={`gm-${col}`}>
              {homeGoals.length > 0 && (
                <>
                  {/* dotted line from midY up to ball */}
                  <line x1={cx} y1={midY - 2} x2={cx} y2={9} stroke="#fbbf24" strokeWidth="0.8" strokeDasharray="2,1.5" opacity={0.7} />
                  {/* amber circle behind emoji */}
                  <circle cx={cx} cy={6} r={7} fill="#1a1a0e" stroke="#fbbf24" strokeWidth="1.2" opacity={0.9} />
                  <text x={cx} y={6} textAnchor="middle" dominantBaseline="central" fontSize="8">
                    ⚽
                  </text>
                  {/* minute label beside the ball */}
                  <text x={labelXHome} y={10} textAnchor={labelAnchor} fontSize="5.5" fill="#fbbf24" fontFamily="monospace" fontWeight="bold" opacity={0.9}>
                    {homeGoals.length > 1 ? `×${homeGoals.length}` : minLabel(homeGoals[0])}
                  </text>
                </>
              )}
              {awayGoals.length > 0 && (
                <>
                  <line x1={cx} y1={midY + 2} x2={cx} y2={H - 9} stroke="#fbbf24" strokeWidth="0.8" strokeDasharray="2,1.5" opacity={0.7} />
                  <circle cx={cx} cy={H - 6} r={7} fill="#1a1a0e" stroke="#fbbf24" strokeWidth="1.2" opacity={0.9} />
                  <text x={cx} y={H - 6} textAnchor="middle" dominantBaseline="central" fontSize="8">
                    ⚽
                  </text>
                  {/* minute label beside the ball */}
                  <text x={labelXAway} y={H - 2} textAnchor={labelAnchor} fontSize="5.5" fill="#fbbf24" fontFamily="monospace" fontWeight="bold" opacity={0.9}>
                    {awayGoals.length > 1 ? `×${awayGoals.length}` : minLabel(awayGoals[0])}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Card markers (yellow/red) */}
        {Array.from(cardsByCol.entries()).map(([col, colCards]) => {
          const cx = col * colW + bw / 2 + 0.5;
          const homeCards = colCards.filter((c) => c.team === "home");
          const awayCards = colCards.filter((c) => c.team === "away");
          const cardColor = (c: CardEvent) => (c.cardType === "red" ? "#ef4444" : "#facc15");
          const minLabel = (c: CardEvent) =>
            c.extraMinute ? `${c.minute}+${c.extraMinute}'` : `${c.minute}'`;
          const labelAnchor = col >= 36 ? "end" : "start";
          const labelX = col >= 36 ? cx - 9 : cx + 9;
          return (
            <g key={`cm-${col}`}>
              {homeCards.map((c, ci) => {
                const cy = 20 + ci * 11;
                return (
                  <g key={`cm-h-${col}-${ci}`}>
                    <line x1={cx} y1={midY - 2} x2={cx} y2={cy + 5} stroke={cardColor(c)} strokeWidth="0.7" strokeDasharray="1.5,1.2" opacity={0.55} />
                    <rect x={cx - 3.5} y={cy - 4.5} width="7" height="9" rx="1" fill={cardColor(c)} opacity={0.95} />
                    <text x={labelX} y={cy + 1} textAnchor={labelAnchor} fontSize="5" fill={cardColor(c)} fontFamily="monospace" fontWeight="bold" opacity={0.9}>
                      {minLabel(c)}
                    </text>
                  </g>
                );
              })}
              {awayCards.map((c, ci) => {
                const cy = H - 20 - ci * 11;
                return (
                  <g key={`cm-a-${col}-${ci}`}>
                    <line x1={cx} y1={midY + 2} x2={cx} y2={cy - 5} stroke={cardColor(c)} strokeWidth="0.7" strokeDasharray="1.5,1.2" opacity={0.55} />
                    <rect x={cx - 3.5} y={cy - 4.5} width="7" height="9" rx="1" fill={cardColor(c)} opacity={0.95} />
                    <text x={labelX} y={cy + 1} textAnchor={labelAnchor} fontSize="5" fill={cardColor(c)} fontFamily="monospace" fontWeight="bold" opacity={0.9}>
                      {minLabel(c)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        <line x1={W / 2} y1="14" x2={W / 2} y2={H - 14} stroke="#3f3f46" strokeWidth="1" strokeDasharray="3,2" />
        <text x={W / 2 + 3} y={H - 3} fontSize="8" fill="#52525b" fontFamily="monospace">HT</text>
        <text x={W - 2} y={H - 3} fontSize="8" fill="#52525b" fontFamily="monospace" textAnchor="end">FT</text>
        {isLive && activeCols > 0 && (() => {
          const lx = activeCols * colW;
          return <>
            <line x1={lx} y1="14" x2={lx} y2={H - 14} stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />
            <rect x={lx - 15} y={midY - 9} width={30} height={14} rx={3} fill="#1a1a1f" stroke="#52525b" strokeWidth="0.8" />
            <text x={lx} y={midY + 1} fontSize="8" fill="white" fontFamily="monospace" textAnchor="middle" fontWeight="bold">
              {isHalfTime ? "HT" : `${curMin}'`}
            </text>
          </>;
        })()}
      </svg>
    </div>
  );
}

type TabId = "prob" | "stats" | "h2h" | "classificacao" | "forma" | "eventos" | "insight";

function AnimatedBar({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
  return (
    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden flex-1">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, delay, ease: "easeOut" }}
      />
    </div>
  );
}

function SplitGauge({ homeVal, awayVal, label }: { homeVal: number; awayVal: number; label: string }) {
  const total = homeVal + awayVal;
  const homePct = total > 0 ? Math.round((homeVal / total) * 100) : 50;
  const r = 26;
  const circ = 2 * Math.PI * r;
  const homeDash = (homePct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-[60px] h-[60px]">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="#ef4444" strokeWidth="6" strokeOpacity="0.35" />
          <motion.circle
            cx="32" cy="32" r={r} fill="none"
            stroke="#3b82f6" strokeWidth="6"
            strokeLinecap="butt"
            strokeDasharray={`${circ}`}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ - homeDash }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[13px] font-black text-white leading-none">{total}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] font-black text-blue-400">{homeVal}</span>
        <span className="text-[9px] text-zinc-600">vs</span>
        <span className="text-[12px] font-black text-red-400">{awayVal}</span>
      </div>
      <div className="text-[9px] text-zinc-500 text-center leading-tight max-w-[64px]">{label}</div>
    </div>
  );
}

function CircleGauge({ pct, color, label, sublabel }: { pct: number; color: string; label: string; sublabel: string }) {
  const r = 32;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="#27272a" strokeWidth="7" />
          <motion.circle
            cx="40" cy="40" r={r} fill="none"
            stroke={color} strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${circ}`}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ - dash }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-black text-white leading-none">{pct}%</span>
        </div>
      </div>
      <div className="text-[11px] font-black text-zinc-200 text-center leading-tight truncate max-w-[72px]">{label}</div>
      <div className="text-[10px] text-zinc-500 text-center">{sublabel}</div>
    </div>
  );
}

function StatBar({ label, home, away, homePct }: { label: string; home: string | number; away: string | number; homePct: number }) {
  const awayPct = 100 - homePct;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-black text-white w-10 text-left tabular-nums">{home}</span>
        <span className="text-zinc-400 text-center flex-1 text-[10px] uppercase tracking-wide">{label}</span>
        <span className="font-black text-white w-10 text-right tabular-nums">{away}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <AnimatedBar pct={homePct} color="bg-blue-500" />
        <AnimatedBar pct={awayPct} color="bg-red-500" />
      </div>
    </div>
  );
}

function FormBubble({ f }: { f: FormEntry }) {
  const colorMap: Record<string, string> = {
    W: "bg-emerald-500 text-white",
    D: "bg-zinc-600 text-white",
    L: "bg-red-600 text-white",
  };
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black ${colorMap[f.result]}`}>
        {f.result}
      </div>
      <div className="text-[9px] text-zinc-500 text-center leading-tight w-12 truncate">{f.opponent}</div>
      <div className="text-[10px] font-bold text-zinc-300">{f.score}</div>
    </div>
  );
}

function extractKeyStats(groups: V2StatsGroup[]): Array<{ key: string; label: string; home: string; away: string }> {
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const flat = groups.flatMap((g) => g.rows.map((r) => ({ name: r.name, home: r.home, away: r.away })));
  const pick = (label: string, patterns: string[]): { label: string; home: string; away: string } | null => {
    const hit = flat.find((r) => patterns.some((p) => normalize(r.name).includes(p)));
    if (!hit || (!hit.home && !hit.away)) return null;
    return { label, home: hit.home || "-", away: hit.away || "-" };
  };
  const wanted = [
    { key: "possession", label: "Posse de bola", patterns: ["possession", "posse de bola", "ball possession"] },
    { key: "shots", label: "Remates", patterns: ["shots", "remates", "chutes"] },
    { key: "shotsOn", label: "No alvo", patterns: ["shots on target", "remates a baliza", "chutes no alvo", "on target"] },
    { key: "corners", label: "Cantos", patterns: ["corners", "cantos", "escanteios"] },
    { key: "fouls", label: "Faltas", patterns: ["fouls", "faltas"] },
    { key: "yellow", label: "Cart. Amarelos", patterns: ["yellow cards", "cartoes amarelos", "yellow"] },
    { key: "passes", label: "Passes", patterns: ["passes"] },
    { key: "dangerous", label: "Ataques Perig.", patterns: ["dangerous attacks", "ataques perigosos"] },
    { key: "xg", label: "xG", patterns: ["expected goals", "xg"] },
  ];
  return wanted.map((w) => { const r = pick(w.label, w.patterns.map(normalize)); return r ? { key: w.key, ...r } : null; }).filter(Boolean) as any[];
}

function parsePct(val: string): number {
  const n = parseFloat(val.replace("%", ""));
  return isNaN(n) ? 50 : Math.min(Math.max(n, 0), 100);
}
function parseNum(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

export default function MatchStatsPanel({
  homeTeam, awayTeam, league, sport, isLive, liveMinute, isHalfTime,
  matchStats, matchStatsLoading,
  v2StatsGroups, v2StatsLoading,
  confrontosData, onGoH2H, onGoLive, onAddInsight,
  liveExtra, storyline,
  standings, standingsGroups, standingsLoading, standingsLeague,
}: Props) {
  const isFootball = !sport || sport === "football";

  const hasEvents = (liveExtra?.football?.goals?.length ?? 0) > 0 || (liveExtra?.football?.cards?.length ?? 0) > 0;

  const availableTabs = useMemo((): Array<{ id: TabId; label: string; icon: React.ReactNode }> => {
    const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [];
    if (isFootball && matchStats) {
      tabs.push({ id: "prob", label: "Probabilidade", icon: <BarChart2 size={12} /> });
    }
    tabs.push({ id: "stats", label: "Estatísticas", icon: <Activity size={12} /> });
    if (hasEvents) {
      tabs.push({ id: "eventos", label: "Eventos", icon: <Zap size={12} /> });
    }
    if (confrontosData) {
      tabs.push({ id: "h2h", label: "H2H", icon: <Users size={12} /> });
    }
    if (standingsLoading || (standings && standings.length > 0) || (standingsGroups && standingsGroups.length > 0)) {
      tabs.push({ id: "classificacao", label: "Classificação", icon: <ListOrdered size={12} /> });
    }
    if (isFootball && matchStats?.formIsReal) {
      tabs.push({ id: "forma", label: "Forma", icon: <TrendingUp size={12} /> });
    }
    if (storyline) {
      tabs.push({ id: "insight", label: "Storyline", icon: <Lightbulb size={12} /> });
    }
    return tabs;
  }, [isFootball, matchStats, confrontosData, hasEvents, storyline, standings, standingsGroups, standingsLoading]);

  const defaultTab: TabId = isFootball && matchStats ? "prob" : "stats";
  const [tab, setTab] = useState<TabId>(defaultTab);

  const activeTab = availableTabs.find((t) => t.id === tab) ? tab : (availableTabs[0]?.id ?? "stats");

  const keyStats = useMemo(() => (v2StatsGroups ? extractKeyStats(v2StatsGroups) : []), [v2StatsGroups]);

  const xgStat = keyStats.find((s) => s.key === "xg");
  const mainStats = keyStats.filter((s) => s.key !== "xg");

  const isLoading = (isFootball && matchStatsLoading && !matchStats && !(v2StatsGroups && v2StatsGroups.length > 0))
    || (!isFootball && v2StatsLoading && !(v2StatsGroups && v2StatsGroups.length > 0));
  const isEmpty = !isLoading && !matchStats && !(v2StatsGroups && v2StatsGroups.length > 0) && !confrontosData && !hasEvents && !storyline;



  if (isLoading) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 mb-2 animate-in fade-in duration-200">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-blue-400" size={28} />
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 mb-2 animate-in fade-in duration-200">
        <div className="text-center text-zinc-500 py-8 text-sm">Estatísticas indisponíveis para este jogo.</div>
      </div>
    );
  }

  return (
    <div className="mb-2 animate-in fade-in duration-200">
      {/* Tab bar */}
      <div className="flex overflow-x-auto scrollbar-hide border-b border-zinc-800 mb-3">
        {availableTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 text-[11px] font-black transition-all border-b-2 ${
              activeTab === t.id
                ? "border-red-500 text-red-400 bg-red-950/20"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {/* ── PROBABILIDADE ── */}
          {activeTab === "prob" && matchStats && (
            <div className="space-y-3">
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Probabilidade de Resultado</div>
                <div className="flex items-start justify-around">
                  <CircleGauge pct={matchStats.winProb.home} color="#3b82f6" label={homeTeam} sublabel={`odd ${(1 / (matchStats.winProb.home / 100) * 0.95).toFixed(2)}`} />
                  <CircleGauge pct={matchStats.winProb.draw} color="#eab308" label="Empate" sublabel={`odd ${(1 / (matchStats.winProb.draw / 100) * 0.95).toFixed(2)}`} />
                  <CircleGauge pct={matchStats.winProb.away} color="#ef4444" label={awayTeam} sublabel={`odd ${(1 / (matchStats.winProb.away / 100) * 0.95).toFixed(2)}`} />
                </div>
              </div>

              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-3">
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Mercados Principais</div>
                {[
                  { label: "Mais de 1.5 Golos", pct: matchStats.avgStats.over15, odd: (1 / (matchStats.avgStats.over15 / 100) * 0.95).toFixed(2), color: "bg-emerald-500" },
                  { label: "Mais de 2.5 Golos", pct: matchStats.avgStats.over25, odd: (1 / (matchStats.avgStats.over25 / 100) * 0.95).toFixed(2), color: "bg-emerald-500" },
                  { label: "Ambas Marcam", pct: matchStats.avgStats.btts, odd: (1 / (matchStats.avgStats.btts / 100) * 0.95).toFixed(2), color: "bg-blue-500" },
                  { label: `Média golos H2H`, pct: Math.min(Math.round(matchStats.avgStats.goalsScored / 6 * 100), 99), odd: matchStats.avgStats.goalsScored.toFixed(2), color: "bg-yellow-500", isGoals: true },
                ].map((m) => (
                  <div key={m.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300">{m.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white">{m.isGoals ? `${m.odd} gls` : `${m.pct}%`}</span>
                        {!m.isGoals && (
                          <span className="text-[10px] bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-0.5 text-zinc-300 font-bold">{m.odd}</span>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${m.color}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${m.pct}%` }}
                        transition={{ duration: 0.9, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Golos/Jogo", val: matchStats.avgStats.goalsScored.toFixed(1), sub: `Liga: ${matchStats.avgStats.leagueGoals.toFixed(1)}` },
                  { label: "AEM", val: `${matchStats.avgStats.btts}%`, sub: `Liga: ${matchStats.avgStats.leagueBtts}%` },
                  { label: "Cantos/Jogo", val: matchStats.avgStats.corners.toFixed(1), sub: league.slice(0, 12) },
                ].map((s) => (
                  <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                    <div className="text-xl font-black text-red-400">{s.val}</div>
                    <div className="text-[10px] text-zinc-300 font-bold mt-0.5">{s.label}</div>
                    <div className="text-[9px] text-zinc-600 mt-0.5 truncate">{s.sub}</div>
                  </div>
                ))}
              </div>

              {matchStats.h2h.homeWins + matchStats.h2h.draws + matchStats.h2h.awayWins > 0 && (
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">H2H Resumo</div>
                    <button onClick={onGoH2H} className="text-[10px] font-bold text-blue-400 hover:text-blue-300">Ver detalhes →</button>
                  </div>
                  <div className="flex items-center justify-around mb-3">
                    {[
                      { val: matchStats.h2h.homeWins, label: homeTeam, color: "text-blue-400" },
                      { val: matchStats.h2h.draws, label: "Empates", color: "text-zinc-400" },
                      { val: matchStats.h2h.awayWins, label: awayTeam, color: "text-red-400" },
                    ].map((e) => (
                      <div key={e.label} className="text-center">
                        <div className={`text-2xl font-black ${e.color}`}>{e.val}</div>
                        <div className="text-[10px] text-zinc-500 truncate max-w-[60px]">{e.label}</div>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const total = matchStats.h2h.homeWins + matchStats.h2h.draws + matchStats.h2h.awayWins;
                    return (
                      <div className="h-2 flex rounded-full overflow-hidden gap-0.5">
                        <motion.div className="bg-blue-500" initial={{ flex: 0 }} animate={{ flex: matchStats.h2h.homeWins || 0 }} transition={{ duration: 0.8 }} />
                        <motion.div className="bg-zinc-600" initial={{ flex: 0 }} animate={{ flex: matchStats.h2h.draws || 0 }} transition={{ duration: 0.8, delay: 0.1 }} />
                        <motion.div className="bg-red-500" initial={{ flex: 0 }} animate={{ flex: matchStats.h2h.awayWins || 0 }} transition={{ duration: 0.8, delay: 0.2 }} />
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ── ESTATÍSTICAS ── */}
          {activeTab === "stats" && (
            <div className="space-y-3">
              {/* Live Extra Stats for Tennis, Basketball, Baseball, Hockey, etc. */}
              {liveExtra && (
                <>
                  {/* Tennis Stats */}
                  {(sport === "tennis" || liveExtra.tennisSets) && (
                    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-4">
                      <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">Estatísticas de Tênis</div>
                      {liveExtra.tennisSets && liveExtra.tennisSets.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Sets</div>
                          <div className="grid grid-cols-3 gap-1 text-[10px] font-bold text-zinc-500 mb-1">
                            <div></div>
                            {liveExtra.tennisSets.map((_, i) => (
                              <div key={i} className="text-center">Set {i + 1}</div>
                            ))}
                          </div>
                          {[0, 1].map((idx) => {
                            const name = idx === 0 ? homeTeam : awayTeam;
                            return (
                              <div key={idx} className="grid grid-cols-3 gap-1 text-[11px] py-1.5">
                                <div className="text-zinc-300 font-bold truncate">
                                  {name.split(" ").slice(-1)[0]}
                                </div>
                                {liveExtra.tennisSets!.map(([h, a], i) => (
                                  <div
                                    key={i}
                                    className={`text-center font-black tabular-nums ${
                                      (idx === 0 ? h > a : a > h) ? "text-white" : "text-zinc-600"
                                    }`}
                                  >
                                    {idx === 0 ? h : a}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {liveExtra.games && (
                        <div className="text-center text-[11px] text-zinc-400">
                          Games: <span className="font-black text-white">{liveExtra.games[0]} - {liveExtra.games[1]}</span>
                        </div>
                      )}
                      {liveExtra.currentGameScore && (
                        <div className="text-center text-[11px] text-yellow-400 font-bold">
                          Game Atual: {liveExtra.currentGameScore}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Volleyball Stats */}
                  {(sport === "volleyball" || liveExtra.vollSets) && (
                    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-4">
                      <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">Estatísticas de Vôlei</div>
                      {liveExtra.vollSets && liveExtra.vollSets.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Placar dos Sets</div>
                          <div className="grid grid-cols-3 gap-1 text-[10px] font-bold text-zinc-500 mb-1">
                            <div></div>
                            {liveExtra.vollSets.map((_, i) => (
                              <div key={i} className="text-center">Set {i + 1}</div>
                            ))}
                          </div>
                          {[0, 1].map((idx) => {
                            const name = idx === 0 ? homeTeam : awayTeam;
                            return (
                              <div key={idx} className="grid grid-cols-3 gap-1 text-[11px] py-1.5">
                                <div className="text-zinc-300 font-bold truncate">
                                  {name.split(" ").slice(-1)[0]}
                                </div>
                                {liveExtra.vollSets!.map(([h, a], i) => (
                                  <div
                                    key={i}
                                    className={`text-center font-black tabular-nums ${
                                      (idx === 0 ? h > a : a > h) ? "text-white" : "text-zinc-600"
                                    }`}
                                  >
                                    {idx === 0 ? h : a}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {liveExtra.currentPts && (
                        <div className="text-center text-[11px] text-yellow-400 font-bold">
                          Pontos Atuais: {liveExtra.currentPts[0]} - {liveExtra.currentPts[1]}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Basketball Stats */}
                  {(sport === "basketball" || liveExtra.quarters) && (
                    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-4">
                      <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">Estatísticas de Basquete</div>
                      {liveExtra.quarters && liveExtra.quarters.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Placar dos Quartos</div>
                          <div className="grid grid-cols-3 gap-1 text-[10px] font-bold text-zinc-500 mb-1">
                            <div></div>
                            {liveExtra.quarters.map((_, i) => (
                              <div key={i} className="text-center">Q{i + 1}</div>
                            ))}
                          </div>
                          {[0, 1].map((idx) => {
                            const name = idx === 0 ? homeTeam : awayTeam;
                            return (
                              <div key={idx} className="grid grid-cols-3 gap-1 text-[11px] py-1.5">
                                <div className="text-zinc-300 font-bold truncate">
                                  {name.split(" ").slice(-1)[0]}
                                </div>
                                {liveExtra.quarters!.map(([h, a], i) => (
                                  <div
                                    key={i}
                                    className={`text-center font-black tabular-nums ${
                                      (idx === 0 ? h > a : a > h) ? "text-white" : "text-zinc-600"
                                    }`}
                                  >
                                    {idx === 0 ? h : a}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="space-y-2">
                        {liveExtra.totalPoints && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-black text-white w-10 text-left tabular-nums">{liveExtra.totalPoints[0]}</span>
                            <span className="text-zinc-400 text-center flex-1 text-[10px] uppercase tracking-wide">Total de Pontos</span>
                            <span className="font-black text-white w-10 text-right tabular-nums">{liveExtra.totalPoints[1]}</span>
                          </div>
                        )}
                        {liveExtra.fgPct && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-black text-white w-10 text-left tabular-nums">{liveExtra.fgPct[0]}%</span>
                            <span className="text-zinc-400 text-center flex-1 text-[10px] uppercase tracking-wide">FG%</span>
                            <span className="font-black text-white w-10 text-right tabular-nums">{liveExtra.fgPct[1]}%</span>
                          </div>
                        )}
                        {liveExtra.threePct && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-black text-white w-10 text-left tabular-nums">{liveExtra.threePct[0]}%</span>
                            <span className="text-zinc-400 text-center flex-1 text-[10px] uppercase tracking-wide">3PT%</span>
                            <span className="font-black text-white w-10 text-right tabular-nums">{liveExtra.threePct[1]}%</span>
                          </div>
                        )}
                        {liveExtra.rebounds && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-black text-white w-10 text-left tabular-nums">{liveExtra.rebounds[0]}</span>
                            <span className="text-zinc-400 text-center flex-1 text-[10px] uppercase tracking-wide">Rebotes</span>
                            <span className="font-black text-white w-10 text-right tabular-nums">{liveExtra.rebounds[1]}</span>
                          </div>
                        )}
                        {liveExtra.assists && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-black text-white w-10 text-left tabular-nums">{liveExtra.assists[0]}</span>
                            <span className="text-zinc-400 text-center flex-1 text-[10px] uppercase tracking-wide">Assistências</span>
                            <span className="font-black text-white w-10 text-right tabular-nums">{liveExtra.assists[1]}</span>
                          </div>
                        )}
                        {liveExtra.steals && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-black text-white w-10 text-left tabular-nums">{liveExtra.steals[0]}</span>
                            <span className="text-zinc-400 text-center flex-1 text-[10px] uppercase tracking-wide">Roubos</span>
                            <span className="font-black text-white w-10 text-right tabular-nums">{liveExtra.steals[1]}</span>
                          </div>
                        )}
                        {liveExtra.blocks && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-black text-white w-10 text-left tabular-nums">{liveExtra.blocks[0]}</span>
                            <span className="text-zinc-400 text-center flex-1 text-[10px] uppercase tracking-wide">Bloqueios</span>
                            <span className="font-black text-white w-10 text-right tabular-nums">{liveExtra.blocks[1]}</span>
                          </div>
                        )}
                        {liveExtra.turnovers && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-black text-white w-10 text-left tabular-nums">{liveExtra.turnovers[0]}</span>
                            <span className="text-zinc-400 text-center flex-1 text-[10px] uppercase tracking-wide">Turnovers</span>
                            <span className="font-black text-white w-10 text-right tabular-nums">{liveExtra.turnovers[1]}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Baseball Stats */}
                  {(sport === "baseball" || liveExtra.innings) && (
                    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-4">
                      <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">Estatísticas de Beisebol</div>
                      {(() => {
                        const innings = liveExtra.innings;
                        if (!innings || innings.length === 0) return null;
                        return (
                          <div className="space-y-2">
                            <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Placar das Entradas</div>
                            <div className="rounded-lg border border-zinc-800 overflow-hidden">
                              <div
                                className="grid text-[10px] font-bold text-zinc-500 px-3 py-1.5 border-b border-zinc-800"
                                style={{
                                  gridTemplateColumns: `1fr repeat(${innings.length}, 2rem) 2rem 2rem 2rem`,
                                }}
                              >
                                <div></div>
                                {innings.map((_, i) => (
                                  <div key={i} className="text-center">{i < 9 ? i + 1 : `${i + 1}º Extra`}</div>
                                ))}
                                <div className="text-center">R</div>
                                <div className="text-center">H</div>
                                <div className="text-center">E</div>
                              </div>
                              {[0, 1].map((idx) => {
                                const name = idx === 0 ? homeTeam : awayTeam;
                                const totalRuns = idx === 0 ? (liveExtra.totalPoints?.[0] ?? 0) : (liveExtra.totalPoints?.[1] ?? 0);
                                const hits = idx === 0 ? (liveExtra.homeHits ?? 0) : (liveExtra.awayHits ?? 0);
                                const errors = idx === 0 ? (liveExtra.homeErrors ?? 0) : (liveExtra.awayErrors ?? 0);
                                return (
                                  <div
                                    key={idx}
                                    className={`grid text-[11px] px-3 py-1.5 ${idx === 0 ? "border-b border-zinc-800/60" : ""}`}
                                    style={{
                                      gridTemplateColumns: `1fr repeat(${innings.length}, 2rem) 2rem 2rem 2rem`,
                                    }}
                                  >
                                    <div className="text-zinc-300 font-bold truncate">
                                      {name.split(" ").slice(-1)[0]}
                                    </div>
                                    {innings.map(([h, a], i) => (
                                      <div
                                        key={i}
                                        className={`text-center font-black tabular-nums ${
                                          (idx === 0 ? h > a : a > h) ? "text-white" : "text-zinc-600"
                                        }`}
                                      >
                                        {idx === 0 ? h : a}
                                      </div>
                                    ))}
                                    <div className="text-center font-black text-white tabular-nums">{totalRuns}</div>
                                    <div className="text-center font-black text-zinc-300 tabular-nums">{hits}</div>
                                    <div className="text-center font-black text-zinc-300 tabular-nums">{errors}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                      {liveExtra.outs !== undefined && (
                        <div className="text-center text-[11px] text-zinc-400">
                          Outs: <span className="font-black text-white">{liveExtra.outs}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hockey Stats */}
                  {(sport === "hockey" || liveExtra.periods) && (
                    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-4">
                      <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">Estatísticas de Hóquei</div>
                      {liveExtra.periods && liveExtra.periods.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Placar dos Períodos</div>
                          <div className="grid grid-cols-3 gap-1 text-[10px] font-bold text-zinc-500 mb-1">
                            <div></div>
                            {liveExtra.periods.map((_, i) => (
                              <div key={i} className="text-center">P{i + 1}</div>
                            ))}
                          </div>
                          {[0, 1].map((idx) => {
                            const name = idx === 0 ? homeTeam : awayTeam;
                            return (
                              <div key={idx} className="grid grid-cols-3 gap-1 text-[11px] py-1.5">
                                <div className="text-zinc-300 font-bold truncate">
                                  {name.split(" ").slice(-1)[0]}
                                </div>
                                {liveExtra.periods!.map(([h, a], i) => (
                                  <div
                                    key={i}
                                    className={`text-center font-black tabular-nums ${
                                      (idx === 0 ? h > a : a > h) ? "text-white" : "text-zinc-600"
                                    }`}
                                  >
                                    {idx === 0 ? h : a}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Momentum chart — always visible for football */}
              {(isFootball || !liveExtra) && <MomentumChart
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                isLive={isLive}
                liveMinute={liveMinute}
                isHalfTime={isHalfTime}
                goalEvents={liveExtra?.football?.goals}
                cardEvents={liveExtra?.football?.cards}
              />}

              {/* Football live per-team stats — reference-image layout */}
              {isFootball && isLive && liveExtra && (() => {
                const hPoss    = liveExtra.possessionHome      ?? liveExtra.possession?.[0];
                const aPoss    = liveExtra.possessionAway      ?? liveExtra.possession?.[1];
                const hShots   = liveExtra.shotsTotalHome      ?? liveExtra.shots?.[0];
                const aShots   = liveExtra.shotsTotalAway      ?? liveExtra.shots?.[1];
                const hShotsOn = liveExtra.shotsOnTargetHome   ?? liveExtra.shotsOn?.[0];
                const aShotsOn = liveExtra.shotsOnTargetAway   ?? liveExtra.shotsOn?.[1];
                const hFouls   = liveExtra.foulsHome           ?? liveExtra.fouls?.[0];
                const aFouls   = liveExtra.foulsAway           ?? liveExtra.fouls?.[1];
                const hYellow  = liveExtra.yellowCardsHome     ?? liveExtra.yellows?.[0];
                const aYellow  = liveExtra.yellowCardsAway     ?? liveExtra.yellows?.[1];
                const hRed     = liveExtra.redCardsHomeCount   ?? liveExtra.reds?.[0];
                const aRed     = liveExtra.redCardsAwayCount   ?? liveExtra.reds?.[1];
                const hOff     = liveExtra.offsidesHome        ?? liveExtra.offsides?.[0];
                const aOff     = liveExtra.offsidesAway        ?? liveExtra.offsides?.[1];
                const hAttacks = liveExtra.attacksHome;
                const aAttacks = liveExtra.attacksAway;
                const hDanger  = liveExtra.dangerousAttacksHome;
                const aDanger  = liveExtra.dangerousAttacksAway;
                const hSaves   = liveExtra.savesHome;
                const aSaves   = liveExtra.savesAway;
                const hCorners = liveExtra.cornersHome ?? liveExtra.corners?.[0];
                const aCorners = liveExtra.cornersAway ?? liveExtra.corners?.[1];

                const ratioPct = (h?: number, a?: number) => {
                  const t = (h ?? 0) + (a ?? 0);
                  return t > 0 ? Math.round(((h ?? 0) / t) * 100) : 50;
                };

                // Gate on ANY per-team stat the provider might send — not just shots/attacks.
                // Previously this only checked shots/attacks/fouls, so a match where the feed
                // only supplied possession + corners + cards (common on lighter data tiers)
                // hid the whole block, and only the separately-gated possession bar ever showed.
                const hasAny = [
                  hShots, aShots, hShotsOn, aShotsOn, hAttacks, aAttacks, hDanger, aDanger,
                  hFouls, aFouls, hPoss, aPoss, hCorners, aCorners, hYellow, aYellow, hRed, aRed,
                ].some(v => v !== undefined);
                if (!hasAny) return null;

                const iconSummary = [
                  { icon: "🟥", label: "V. Verm", h: hRed,     a: aRed     },
                  { icon: "🟨", label: "V. Amar", h: hYellow,  a: aYellow  },
                  { icon: "⛳",  label: "Cantos",  h: hCorners, a: aCorners },
                  { icon: "🎯", label: "No Alvo", h: hShotsOn, a: aShotsOn },
                  { icon: "↗",  label: "Fora J.", h: hOff,     a: aOff     },
                  { icon: "🧤", label: "Defesas", h: hSaves,   a: aSaves   },
                ];

                const atacanteRows = [
                  { key: "shots",   label: "Total de Remates",    h: hShots,   a: aShots   },
                  { key: "shotsOn", label: "Remates à Baliza",    h: hShotsOn, a: aShotsOn },
                  { key: "corners", label: "Cantos no Jogo",      h: hCorners, a: aCorners },
                  { key: "offs",    label: "Foras de Jogo",       h: hOff,     a: aOff     },
                  { key: "attacks", label: "Ataques",             h: hAttacks, a: aAttacks },
                  { key: "danger",  label: "Ataques Perigosos",   h: hDanger,  a: aDanger  },
                ].filter(r => r.h !== undefined || r.a !== undefined);

                const defesaRows = [
                  { key: "fouls",  label: "Faltas",             h: hFouls,   a: aFouls   },
                  { key: "yellow", label: "Cartões Amarelos",   h: hYellow,  a: aYellow  },
                  { key: "red",    label: "Cartões Vermelhos",  h: hRed,     a: aRed     },
                ].filter(r => r.h !== undefined || r.a !== undefined);

                const showGauges = (hAttacks !== undefined && aAttacks !== undefined) ||
                                   (hShotsOn !== undefined && aShotsOn !== undefined) ||
                                   (hDanger  !== undefined && aDanger  !== undefined);

                return (
                  <div className="space-y-3">
                    {/* Summary icon row */}
                    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-3">
                      <div className="grid grid-cols-6 gap-0.5">
                        {iconSummary.map(({ icon, label, h, a }) => (
                          <div key={label} className="flex flex-col items-center gap-0.5 py-1">
                            <span className="text-[15px] leading-none">{icon}</span>
                            <span className="text-[12px] font-black text-blue-400 tabular-nums leading-tight">{h ?? "—"}</span>
                            <span className="text-[8px] text-zinc-500 leading-tight text-center">{label}</span>
                            <span className="text-[12px] font-black text-red-400 tabular-nums leading-tight">{a ?? "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Three split-ring gauges */}
                    {showGauges && (
                      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                        <div className="flex items-start justify-around">
                          {hAttacks !== undefined && aAttacks !== undefined && (
                            <SplitGauge homeVal={hAttacks} awayVal={aAttacks} label="Ataques" />
                          )}
                          {hShotsOn !== undefined && aShotsOn !== undefined && (
                            <SplitGauge homeVal={hShotsOn} awayVal={aShotsOn} label="Remates à Baliza" />
                          )}
                          {hDanger !== undefined && aDanger !== undefined && (
                            <SplitGauge homeVal={hDanger} awayVal={aDanger} label="Ataques Perig." />
                          )}
                        </div>
                      </div>
                    )}

                    {/* Possession bar */}
                    {hPoss !== undefined && aPoss !== undefined && (
                      <div className="bg-zinc-900 rounded-xl border border-zinc-800 px-4 py-3">
                        <StatBar
                          label="Posse de Bola"
                          home={`${Math.round(hPoss)}%`}
                          away={`${Math.round(aPoss)}%`}
                          homePct={Math.round(hPoss)}
                        />
                      </div>
                    )}

                    {/* Atacante section */}
                    {atacanteRows.length > 0 && (
                      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
                          <span className="text-[11px] font-black text-zinc-200 uppercase tracking-widest">Atacante</span>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                            <span className="text-[10px] font-bold text-zinc-400 truncate max-w-[70px]">{homeTeam}</span>
                            <span className="text-[9px] text-zinc-600">vs</span>
                            <span className="text-[10px] font-bold text-zinc-400 truncate max-w-[70px]">{awayTeam}</span>
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                          </div>
                        </div>
                        <div className="px-4 py-3 space-y-3.5">
                          {atacanteRows.map(row => (
                            <StatBar
                              key={row.key}
                              label={row.label}
                              home={row.h ?? "—"}
                              away={row.a ?? "—"}
                              homePct={ratioPct(row.h, row.a)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Defesa section */}
                    {defesaRows.length > 0 && (
                      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-zinc-800">
                          <span className="text-[11px] font-black text-zinc-200 uppercase tracking-widest">Defesa</span>
                        </div>
                        <div className="px-4 py-3 space-y-3.5">
                          {defesaRows.map(row => (
                            <StatBar
                              key={row.key}
                              label={row.label}
                              home={row.h ?? "—"}
                              away={row.a ?? "—"}
                              homePct={ratioPct(row.h, row.a)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* xG section */}
                    {(liveExtra.xgHome !== undefined || liveExtra.xgAway !== undefined) && (
                      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                        <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">Golos Esperados (xG)</div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-2xl font-black text-blue-400">{(liveExtra.xgHome ?? 0).toFixed(2)}</span>
                          <div className="text-center">
                            <div className="text-[9px] text-zinc-500 uppercase tracking-wide">xG Total</div>
                            <div className="text-sm font-black text-zinc-300">{((liveExtra.xgHome ?? 0) + (liveExtra.xgAway ?? 0)).toFixed(2)}</div>
                          </div>
                          <span className="text-2xl font-black text-red-400">{(liveExtra.xgAway ?? 0).toFixed(2)}</span>
                        </div>
                        {(() => {
                          const h = liveExtra.xgHome ?? 0; const a = liveExtra.xgAway ?? 0;
                          const t = h + a; const pct = t > 0 ? Math.round((h / t) * 100) : 50;
                          return (
                            <div className="flex items-center gap-1.5">
                              <AnimatedBar pct={pct} color="bg-blue-500" delay={0.2} />
                              <AnimatedBar pct={100 - pct} color="bg-red-500" delay={0.2} />
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })()}

              {(v2StatsLoading && mainStats.length === 0) ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="animate-spin text-red-400" size={22} />
                </div>
              ) : mainStats.length > 0 ? (
                <>
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                    <div className="flex items-center px-4 py-2.5 border-b border-zinc-800">
                      <div className="flex-1 flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-[11px] font-black text-zinc-200 truncate max-w-[90px]">{homeTeam}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Ao Vivo</span>
                      <div className="flex-1 flex items-center gap-1.5 justify-end">
                        <span className="text-[11px] font-black text-zinc-200 truncate max-w-[90px]">{awayTeam}</span>
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                      </div>
                    </div>
                    <div className="px-4 py-4 space-y-4">
                      {mainStats.map((s) => {
                        const isPct = s.home.includes("%") || s.away.includes("%");
                        const hNum = isPct ? parsePct(s.home) : parseNum(s.home);
                        const aNum = isPct ? parsePct(s.away) : parseNum(s.away);
                        const total = hNum + aNum;
                        const homePct = total > 0 ? Math.round((hNum / total) * 100) : 50;
                        return <StatBar key={s.key} label={s.label} home={s.home || "-"} away={s.away || "-"} homePct={homePct} />;
                      })}
                    </div>
                  </div>

                  {xgStat && (
                    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                      <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">Golos Esperados (xG)</div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl font-black text-blue-400">{xgStat.home}</span>
                        <div className="text-center">
                          <div className="text-[10px] text-zinc-500 uppercase tracking-wide">xG Total</div>
                          <div className="text-sm font-black text-zinc-300">
                            {(parseNum(xgStat.home) + parseNum(xgStat.away)).toFixed(2)}
                          </div>
                        </div>
                        <span className="text-2xl font-black text-red-400">{xgStat.away}</span>
                      </div>
                      {(() => {
                        const h = parseNum(xgStat.home);
                        const a = parseNum(xgStat.away);
                        const total = h + a;
                        const pct = total > 0 ? Math.round((h / total) * 100) : 50;
                        return (
                          <div className="flex items-center gap-1.5">
                            <AnimatedBar pct={pct} color="bg-blue-500" delay={0.2} />
                            <AnimatedBar pct={100 - pct} color="bg-red-500" delay={0.2} />
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </>
              ) : (
                // Only render the fallback card if there's content to show
                v2StatsGroups && v2StatsGroups.length > 0 ? (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Estatísticas do Jogo</div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-600">{v2StatsGroups.length} grupos</span>
                        </div>
                      </div>
                      {v2StatsGroups.map((g) => (
                        <div key={g.title} className="border border-zinc-800 rounded-lg overflow-hidden">
                          <div className="bg-zinc-800/60 px-3 py-2 text-[10px] font-black text-zinc-300">{g.title}</div>
                          <div className="divide-y divide-zinc-800">
                            {g.rows.map((r) => (
                              <div key={r.name} className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 text-xs">
                                <span className="text-zinc-400 truncate">{r.name}</span>
                                <span className="text-blue-400 font-bold tabular-nums">{r.home || "-"}</span>
                                <span className="text-red-400 font-bold tabular-nums">{r.away || "-"}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : !isLive ? (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                    <div className="text-center text-zinc-600 py-4 text-sm">
                      Estatísticas detalhadas não disponíveis.
                    </div>
                  </div>
                ) : null
              )}
            </div>
          )}

          {/* ── EVENTOS ── */}
          {activeTab === "eventos" && hasEvents && (() => {
            const goals = liveExtra?.football?.goals ?? [];
            const cards = liveExtra?.football?.cards ?? [];
            const all = [
              ...goals.map(g => ({ kind: "goal" as const, minute: g.minute, extraMinute: g.extraMinute, team: g.team, playerName: g.playerName, assistName: g.assistName, ownGoal: g.ownGoal, penalty: g.penalty, varCancelled: g.varCancelled })),
              ...cards.map(c => ({ kind: "card" as const, minute: c.minute, extraMinute: c.extraMinute, team: c.team, playerName: c.playerName, cardType: c.cardType })),
            ].sort((a, b) => (a.minute * 100 + (a.extraMinute ?? 0)) - (b.minute * 100 + (b.extraMinute ?? 0)));
            return (
              <div className="space-y-1.5">
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1 mb-2">Linha do Tempo</div>
                {all.length === 0 ? (
                  <div className="text-center text-zinc-600 py-8 text-sm">Sem eventos registados.</div>
                ) : all.map((ev, i) => {
                  const isHome = ev.team === "home";
                  const minStr = ev.extraMinute ? `${ev.minute}+${ev.extraMinute}'` : `${ev.minute}'`;
                  const cancelled = ev.kind === "goal" && ev.varCancelled;
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${cancelled ? "opacity-40" : ""} ${ev.kind === "goal" ? "bg-zinc-900 border border-zinc-800" : "bg-zinc-950 border border-zinc-800/50"}`}
                    >
                      {/* Home side */}
                      <div className="flex-1 text-right min-w-0">
                        {isHome && (
                          <div>
                            <div className={`text-[12px] font-black truncate ${cancelled ? "line-through text-zinc-500" : "text-white"}`}>{ev.playerName || "—"}</div>
                            {ev.kind === "goal" && ev.assistName && (
                              <div className="text-[10px] text-zinc-500 truncate">assist: {ev.assistName}</div>
                            )}
                            {ev.kind === "goal" && ev.ownGoal && <div className="text-[10px] text-orange-400">Autogolo</div>}
                            {ev.kind === "goal" && ev.penalty && <div className="text-[10px] text-yellow-400">Penálti</div>}
                            {cancelled && <div className="text-[10px] text-red-400">VAR Anulado</div>}
                          </div>
                        )}
                      </div>
                      {/* Centre — minute + icon */}
                      <div className="flex flex-col items-center gap-0.5 shrink-0 w-14">
                        <div className="text-[10px] font-black text-zinc-400">{minStr}</div>
                        <div className="text-base leading-none">
                          {ev.kind === "goal" ? (cancelled ? "❌" : "⚽") : ev.kind === "card" && "cardType" in ev ? (ev.cardType === "red" ? "🟥" : "🟨") : "📋"}
                        </div>
                      </div>
                      {/* Away side */}
                      <div className="flex-1 min-w-0">
                        {!isHome && (
                          <div>
                            <div className={`text-[12px] font-black truncate ${cancelled ? "line-through text-zinc-500" : "text-white"}`}>{ev.playerName || "—"}</div>
                            {ev.kind === "goal" && ev.assistName && (
                              <div className="text-[10px] text-zinc-500 truncate">assist: {ev.assistName}</div>
                            )}
                            {ev.kind === "goal" && ev.ownGoal && <div className="text-[10px] text-orange-400">Autogolo</div>}
                            {ev.kind === "goal" && ev.penalty && <div className="text-[10px] text-yellow-400">Penálti</div>}
                            {cancelled && <div className="text-[10px] text-red-400">VAR Anulado</div>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* ── STORYLINE ── */}
          {activeTab === "insight" && storyline && (
            <div className="space-y-3">
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb size={14} className="text-yellow-400 shrink-0" />
                  <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Análise ao Vivo</div>
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{storyline}</p>
              </div>
            </div>
          )}

          {/* ── H2H ── */}
          {activeTab === "h2h" && confrontosData && (
            <div className="space-y-3">
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">
                  Últimos {confrontosData.homeWins + confrontosData.draws + confrontosData.awayWins} Confrontos
                </div>
                <div className="flex items-center justify-around mb-4">
                  {[
                    { val: confrontosData.homeWins, label: homeTeam, color: "text-blue-400" },
                    { val: confrontosData.draws, label: "Empates", color: "text-zinc-400" },
                    { val: confrontosData.awayWins, label: awayTeam, color: "text-red-400" },
                  ].map((e) => (
                    <div key={e.label} className="text-center">
                      <div className={`text-3xl font-black ${e.color}`}>{e.val}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5 truncate max-w-[70px]">{e.label}</div>
                    </div>
                  ))}
                </div>
                <div className="h-2.5 flex rounded-full overflow-hidden gap-0.5">
                  <motion.div className="bg-blue-500" initial={{ flex: 0 }} animate={{ flex: confrontosData.homeWins || 0.001 }} transition={{ duration: 0.8 }} />
                  <motion.div className="bg-zinc-600" initial={{ flex: 0 }} animate={{ flex: confrontosData.draws || 0.001 }} transition={{ duration: 0.8, delay: 0.1 }} />
                  <motion.div className="bg-red-500" initial={{ flex: 0 }} animate={{ flex: confrontosData.awayWins || 0.001 }} transition={{ duration: 0.8, delay: 0.2 }} />
                </div>
                {(() => {
                  const total = confrontosData.homeWins + confrontosData.draws + confrontosData.awayWins;
                  return total > 0 ? (
                    <div className="flex text-[9px] text-zinc-500 mt-1 justify-between">
                      <span>{Math.round(confrontosData.homeWins / total * 100)}%</span>
                      <span>{Math.round(confrontosData.draws / total * 100)}%</span>
                      <span>{Math.round(confrontosData.awayWins / total * 100)}%</span>
                    </div>
                  ) : null;
                })()}
              </div>

              {confrontosData.recentMeetings.length > 0 && (
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                  <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Histórico</div>
                  {confrontosData.recentMeetings.slice(0, 6).map((m, i) => {
                    const isTeam1Home = m.team1.toLowerCase().includes(homeTeam.split(" ")[0]?.toLowerCase() ?? "");
                    const homeScore = isTeam1Home ? m.score1 : m.score2;
                    const awayScore = isTeam1Home ? m.score2 : m.score1;
                    let badge = "Empate", badgeColor = "bg-zinc-700 text-zinc-300";
                    if (homeScore > awayScore) { badge = "Vitória"; badgeColor = "bg-blue-600/30 text-blue-400"; }
                    else if (awayScore > homeScore) { badge = "Derrota"; badgeColor = "bg-red-600/30 text-red-400"; }
                    return (
                      <div key={i} className="flex items-center gap-2 py-2.5 border-b border-zinc-800/60 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-zinc-500 mb-0.5">{m.date} · {m.league}</div>
                          <div className="text-xs font-bold text-zinc-200 truncate">
                            {m.team1} <span className="text-white">{m.score1}–{m.score2}</span> {m.team2}
                          </div>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${badgeColor}`}>{badge}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── CLASSIFICAÇÃO ── */}
          {activeTab === "classificacao" && (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
              {standingsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-blue-400" size={28} />
                </div>
              ) : !standings || standings.length === 0 ? (
                <div className="text-center text-zinc-500 py-8 text-sm">
                  Classificação indisponível para esta liga.
                </div>
              ) : (
                (() => {
                  const cols = standingsMetaForSport(sport);
                  const StandingsTable = ({ rows }: { rows: StandingRow[] }) => (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-zinc-500 border-b border-zinc-800">
                          <th className="text-left py-1.5 pr-2 font-bold w-6">#</th>
                          <th className="text-left py-1.5 font-bold">Equipa</th>
                          <th className="text-center py-1.5 px-1 font-bold">{cols.played}</th>
                          <th className="text-center py-1.5 px-1 font-bold">{cols.won}</th>
                          <th className="text-center py-1.5 px-1 font-bold">{cols.drawn}</th>
                          <th className="text-center py-1.5 px-1 font-bold">{cols.lost}</th>
                          <th className="text-center py-1.5 px-1 font-bold">{cols.gf}</th>
                          <th className="text-center py-1.5 px-1 font-bold">{cols.ga}</th>
                          <th className="text-center py-1.5 px-1 font-bold text-white">{cols.pts}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, ri) => {
                          const isHome = rowMatchesTeam(row.name, homeTeam);
                          const isAway = rowMatchesTeam(row.name, awayTeam);
                          return (
                            <tr key={ri} className={`border-b border-zinc-800/50 ${isHome ? "bg-blue-500/10" : isAway ? "bg-red-500/10" : ""}`}>
                              <td className="py-2 pr-2 text-zinc-500">{row.pos}</td>
                              <td className={`py-2 font-semibold truncate max-w-[120px] ${isHome || isAway ? "text-white" : "text-zinc-300"}`}>{row.name}</td>
                              <td className="py-2 text-center text-zinc-400">{row.played}</td>
                              <td className="py-2 text-center text-green-400">{row.won}</td>
                              <td className="py-2 text-center text-yellow-400">{row.drawn}</td>
                              <td className="py-2 text-center text-red-400">{row.lost}</td>
                              <td className="py-2 text-center text-zinc-400">{row.gf}</td>
                              <td className="py-2 text-center text-zinc-400">{row.ga}</td>
                              <td className="py-2 text-center font-black text-white">{row.pts}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                  return (
                    <div>
                      <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">
                        {standingsLeague}
                      </div>
                      {standingsGroups && standingsGroups.length > 0 ? (
                        <div className="space-y-4">
                          {standingsGroups.map((group) => (
                            <div key={group.name}>
                              <div className="text-[9px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-800/60 rounded px-2 py-1 mb-2">
                                {group.name}
                              </div>
                              <div className="overflow-x-auto">
                                <StandingsTable rows={group.rows} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <StandingsTable rows={standings} />
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* ── FORMA ── */}
          {activeTab === "forma" && matchStats?.formIsReal && (
            <div className="space-y-3">
              {[
                { team: homeTeam, form: matchStats.homeForm, color: "text-blue-400", borderColor: "border-blue-500/20" },
                { team: awayTeam, form: matchStats.awayForm, color: "text-red-400", borderColor: "border-red-500/20" },
              ].map(({ team, form, color, borderColor }) => (
                <div key={team} className={`bg-zinc-900 rounded-xl border ${borderColor} border-zinc-800 p-4`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-black text-white truncate max-w-[160px]">{team}</div>
                    <div className="flex gap-0.5">
                      {form.slice(0, 5).map((f, i) => (
                        <span key={i} className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center ${
                          f.result === "W" ? "bg-emerald-600 text-white" : f.result === "D" ? "bg-yellow-500 text-black" : "bg-red-600 text-white"
                        }`}>{f.result}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-1">
                    {form.slice(0, 5).map((f, i) => <FormBubble key={i} f={f} />)}
                  </div>
                  <div className="mt-4 pt-3 border-t border-zinc-800 grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: "Vitórias", val: form.filter((f) => f.result === "W").length + "/" + form.length },
                      { label: "Golos Marcados", val: (() => { const g = form.reduce((acc, f) => acc + (parseInt(f.score.split("-")[0] ?? "0") || parseInt(f.score.split("–")[0] ?? "0") || 0), 0); return g + "/" + form.length + "j"; })() },
                      { label: "Clean Sheets", val: form.filter((f) => { const parts = f.score.split(/[-–]/); return parseInt(parts[1]?.trim() ?? "1") === 0; }).length + "/" + form.length },
                    ].map((s) => (
                      <div key={s.label}>
                        <div className={`text-base font-black ${color}`}>{s.val}</div>
                        <div className="text-[9px] text-zinc-600 mt-0.5 leading-tight">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}


        </motion.div>
      </AnimatePresence>
    </div>
  );
}
