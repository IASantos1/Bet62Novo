import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X, BarChart2 } from "lucide-react";
import trophyImg from "/trophy-wc-nobg.png";

// ─── Theme helpers ─────────────────────────────────────────────────────────────
type Theme = "dark" | "light";
function getAutoTheme(): Theme {
  const h = new Date().getHours();
  return h >= 8 && h < 19 ? "light" : "dark";
}

// ─── Types ────────────────────────────────────────────────────────────────────

type WCMarkets = {
  doubleChance?: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  bothTeamsScore?: { yes: number; no: number };
  totalGoals?: {
    over05?: number; under05?: number;
    over15?: number; under15?: number;
    over25?: number; under25?: number;
    over35?: number; under35?: number;
    over45?: number; under45?: number;
    over55?: number; under55?: number;
    over65?: number; under65?: number;
  };
  handicap?: { homeMinusOne?: number; awayPlusOne?: number; homeMinusOneHalf?: number; awayPlusOneHalf?: number };
  halfTime?: { home: number; draw: number; away: number };
  firstGoal?: { home: number; noGoal: number; away: number };
  drawNoBet?: { home: number; away: number };
  correctScore?: Record<string, number>;
  corners?: { o85?: number; u85?: number; o95?: number; u95?: number; o105?: number; u105?: number };
  corners1H?: { o35?: number; u35?: number; o45?: number; u45?: number; o55?: number; u55?: number };
  corners2H?: { o35?: number; u35?: number; o45?: number; u45?: number; o55?: number; u55?: number };
  cards?: { o35?: number; u35?: number; o45?: number; u45?: number; o55?: number; u55?: number };
  cards1H?: { o05?: number; u05?: number; o15?: number; u15?: number; o25?: number; u25?: number };
  cards2H?: { o05?: number; u05?: number; o15?: number; u15?: number; o25?: number; u25?: number };
  winToNil?: { home: number; away: number };
  cleanSheet?: { home: number; away: number };
  goalOddEven?: { odd: number; even: number };
  exactGoals?: { g0?: number; g1?: number; g2?: number; g3?: number; g4?: number; g5plus?: number };
  btts1H?: { yes: number; no: number };
  btts2H?: { yes: number; no: number };
  teamGoals?: {
    homeOver05?: number; homeUnder05?: number;
    homeOver15?: number; homeUnder15?: number;
    homeOver25?: number; homeUnder25?: number;
    awayOver05?: number; awayUnder05?: number;
    awayOver15?: number; awayUnder15?: number;
    awayOver25?: number; awayUnder25?: number;
  };
  asianHandicap?: { line: number; home: number; away: number };
  htft?: { hh?: number; hd?: number; ha?: number; dh?: number; dd?: number; da?: number; ah?: number; ad?: number; aa?: number };
  secondHalf?: { home: number; draw: number; away: number };
  toWinBothHalves?: { home: number; away: number };
  highestScoringHalf?: { first: number; second: number; equal: number };
  // Player markets
  playerGoals?: Array<{ name: string; anytime?: number; firstHalf?: number; secondHalf?: number }>;
  playerAssists?: Array<{ name: string; anytime?: number }>;
  playerCards?: Array<{ name: string; anytime?: number; firstHalf?: number; secondHalf?: number }>;
};

type WCMatch = {
  id: string;
  home: string;
  away: string;
  homeScore?: number;
  awayScore?: number;
  league: string;
  country?: string;
  date?: string;
  time?: string;
  minute?: number;
  status?: string;
  isLive?: boolean;
  hasRealOdds?: boolean;
  odds?: { home: number; draw: number; away: number };
  markets?: WCMarkets;
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseMatchDate(date: string | undefined): Date | null {
  if (!date) return null;
  // Format: DD.MM.YYYY (from v2EventDateTime)
  const dotMatch = date.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    return new Date(`${dotMatch[3]}-${dotMatch[2].padStart(2,"0")}-${dotMatch[1].padStart(2,"0")}T12:00:00`);
  }
  // Format: YYYY-MM-DD
  const dashMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dashMatch) {
    return new Date(`${date}T12:00:00`);
  }
  // Fallback: try direct parse
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d;
}

function formatMatchDate(date: string | undefined): string {
  const d = parseMatchDate(date);
  if (!d) return "";
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
}

// ─── World Cup detection ──────────────────────────────────────────────────────

const WC_KW = ["world cup", "copa do mundo", "fifa world", "wc 2026", "mundial", "copa mundial", "coupe du monde"];
function isWCLeague(league: string): boolean {
  const l = league.toLowerCase();
  return WC_KW.some(k => l.includes(k));
}

// ─── Flag helpers ─────────────────────────────────────────────────────────────

const TEAM_CODES: Record<string, string> = {
  "eua": "us", "usa": "us", "estados unidos": "us",
  "panamá": "pa", "panama": "pa",
  "sérvia": "rs", "serbia": "rs",
  "nova zelândia": "nz", "new zealand": "nz",
  "méxico": "mx", "mexico": "mx",
  "equador": "ec", "ecuador": "ec",
  "burkina faso": "bf",
  "países baixos": "nl", "netherlands": "nl", "holanda": "nl",
  "canadá": "ca", "canada": "ca",
  "marrocos": "ma", "morocco": "ma",
  "croácia": "hr", "croatia": "hr",
  "bélgica": "be", "belgium": "be",
  "argentina": "ar",
  "chile": "cl",
  "nigéria": "ng", "nigeria": "ng",
  "hungria": "hu", "hungary": "hu",
  "espanha": "es", "spain": "es",
  "brasil": "br", "brazil": "br",
  "costa rica": "cr",
  "argélia": "dz", "algeria": "dz",
  "frança": "fr", "france": "fr",
  "polónia": "pl", "poland": "pl",
  "camarões": "cm", "cameroon": "cm", "cameroun": "cm",
  "arábia saudita": "sa", "saudi arabia": "sa",
  "portugal": "pt",
  "uruguai": "uy", "uruguay": "uy",
  "eslováquia": "sk", "slovakia": "sk",
  "alemanha": "de", "germany": "de",
  "japão": "jp", "japan": "jp",
  "colômbia": "co", "colombia": "co",
  "rep. checa": "cz", "czech": "cz", "czechia": "cz", "república checa": "cz",
  "inglaterra": "gb-eng", "england": "gb-eng",
  "irão": "ir", "iran": "ir",
  "peru": "pe",
  "senegal": "sn",
  "austrália": "au", "australia": "au",
  "venezuela": "ve",
  "iraque": "iq", "iraq": "iq",
  "cazaquistão": "kz", "kazakhstan": "kz",
  "coreia do sul": "kr", "south korea": "kr",
  "honduras": "hn",
  "suíça": "ch", "switzerland": "ch",
  "gana": "gh", "ghana": "gh",
  "turquia": "tr", "turkey": "tr",
  "dinamarca": "dk", "denmark": "dk",
  "egito": "eg", "egypt": "eg",
  "ruanda": "rw", "rwanda": "rw",
  "itália": "it", "italy": "it",
  "escócia": "gb-sct", "scotland": "gb-sct",
  "gales": "gb-wls", "wales": "gb-wls",
  "israel": "il",
  "china": "cn",
  "geórgia": "ge", "georgia": "ge",
  "áfrica do sul": "za", "south africa": "za",
  "catar": "qa", "qatar": "qa",
  "bósnia": "ba", "bosnia": "ba",
  "suécia": "se", "sweden": "se",
  "tunísia": "tn", "tunisia": "tn",
  "cabo verde": "cv", "cape verde": "cv",
  "noruega": "no", "norway": "no",
  "áustria": "at", "austria": "at",
  "jordânia": "jo", "jordan": "jo",
  "uzbequistão": "uz", "uzbekistan": "uz",
  "rd congo": "cd", "dr congo": "cd",
  "costa do marfim": "ci", "ivory coast": "ci",
  "curaçao": "cw", "curacao": "cw",
  "paraguai": "py", "paraguay": "py",
  "haiti": "ht",
};

const TEAM_EMOJI: Record<string, string> = {
  "eua": "🇺🇸", "usa": "🇺🇸", "brasil": "🇧🇷", "brazil": "🇧🇷",
  "portugal": "🇵🇹", "argentina": "🇦🇷", "espanha": "🇪🇸", "spain": "🇪🇸",
  "alemanha": "🇩🇪", "germany": "🇩🇪", "frança": "🇫🇷", "france": "🇫🇷",
  "inglaterrra": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "england": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "mexício": "🇲🇽", "mexico": "🇲🇽",
  "canadá": "🇨🇦", "canada": "🇨🇦", "japão": "🇯🇵", "japan": "🇯🇵",
  "marrocos": "🇲🇦", "morocco": "🇲🇦", "uruguai": "🇺🇾", "uruguay": "🇺🇾",
  "países baixos": "🇳🇱", "netherlands": "🇳🇱",
};

function FlagImg({ name, size = 32 }: { name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const code = TEAM_CODES[name.toLowerCase()];
  const emoji = TEAM_EMOJI[name.toLowerCase()] ?? "🌐";
  const s = size;
  const border: React.CSSProperties = {
    width: s, height: s, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
    boxShadow: "0 0 8px 2px rgba(255,200,0,0.3), 0 2px 6px rgba(0,0,0,0.5)",
    border: "1.5px solid rgba(255,200,0,0.25)",
    position: "relative",
  };
  if (code && !err) {
    return (
      <div style={border}>
        <img
          src={`https://flagcdn.com/w80/${code}.png`}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => setErr(true)}
        />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "linear-gradient(140deg,rgba(255,255,255,0.45) 0%,transparent 45%)", pointerEvents: "none" }} />
      </div>
    );
  }
  return (
    <div style={{ ...border, display: "flex", alignItems: "center", justifyContent: "center", background: "#1c1c22", fontSize: s * 0.52 }}>
      {emoji}
    </div>
  );
}

// ─── FIFA WC 2026 Groups ──────────────────────────────────────────────────────

const WC_GROUPS = [
  { group: "A", teams: ["México","Coreia do Sul","África do Sul","Rep. Checa"] },
  { group: "B", teams: ["Canadá","Suíça","Catar","Bósnia"] },
  { group: "C", teams: ["Brasil","Marrocos","Haiti","Escócia"] },
  { group: "D", teams: ["EUA","Austrália","Paraguai","Turquia"] },
  { group: "E", teams: ["Alemanha","Costa do Marfim","Equador","Curaçao"] },
  { group: "F", teams: ["Países Baixos","Suécia","Japão","Tunísia"] },
  { group: "G", teams: ["Bélgica","Irão","Nova Zelândia","Egito"] },
  { group: "H", teams: ["Espanha","Arábia Saudita","Uruguai","Cabo Verde"] },
  { group: "I", teams: ["França","Senegal","Iraque","Noruega"] },
  { group: "J", teams: ["Argentina","Argélia","Áustria","Jordânia"] },
  { group: "K", teams: ["Portugal","Colômbia","Uzbequistão","RD Congo"] },
  { group: "L", teams: ["Inglaterra","Croácia","Gana","Panamá"] },
];

// ─── Map API response → WCMatch ───────────────────────────────────────────────

function mapToWCMatch(m: Record<string, unknown>): WCMatch {
  const statusStr = String(m.status ?? "");
  const isLive =
    !!(m.isLive) ||
    /^\d{1,3}(\+\d+)?$/.test(statusStr) ||
    ["1st half","2nd half","halftime","ht","half time","extra time","et","penalties","live"].some(s =>
      statusStr.toLowerCase().includes(s)
    );
  const hasRealOdds = m.hasRealOdds === true || m.isLive === true;
  return {
    id: String(m.id ?? m.matchId ?? Math.random()),
    home: String(m.home ?? m.homeTeam ?? ""),
    away: String(m.away ?? m.awayTeam ?? ""),
    league: String(m.league ?? "FIFA World Cup 2026"),
    country: String(m.country ?? ""),
    date: m.date as string | undefined,
    time: m.time as string | undefined,
    minute: m.minute as number | undefined,
    status: statusStr || undefined,
    homeScore: m.homeScore as number | undefined,
    awayScore: m.awayScore as number | undefined,
    isLive,
    hasRealOdds,
    odds: (() => {
      const o = m.odds as { home: number; draw: number; away: number } | undefined;
      return o && (o.home > 0 || o.away > 0) ? o : undefined;
    })(),
    markets: (m.markets ?? m.advancedMarkets ?? {}) as WCMarkets,
  };
}

// ─── Odds button (used in match card quick odds) ──────────────────────────────

function OBtn({ label, odd, active, onClick, theme }: { label: string; odd: number; active: boolean; onClick: () => void; theme: Theme }) {
  if (!odd || odd <= 1.001) return null;
  const isDark = theme === "dark";
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={`flex-1 flex flex-col items-center py-2.5 px-0.5 rounded-xl border transition-all min-w-0 ${
        active
          ? "border-red-500 bg-red-600/15 ring-1 ring-red-400/30"
          : isDark
            ? "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
            : "border-zinc-200 bg-white hover:border-zinc-300"
      }`}
    >
      <span className={`text-[10px] leading-tight text-center w-full truncate px-0.5 mb-1 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{label}</span>
      <span className={`text-sm font-black tabular-nums ${active ? "text-red-400" : isDark ? "text-white" : "text-zinc-900"}`}>{odd.toFixed(2)}</span>
    </button>
  );
}

// ─── Simple Match Card ────────────────────────────────────────────────────────

function MatchCard({ match, onOpen, activeSel, onQuickBet, theme }: {
  match: WCMatch;
  onOpen: () => void;
  activeSel?: string;
  onQuickBet: (key: string, label: string, odd: number) => void;
  theme: Theme;
}) {
  const { home, away, odds, isLive, homeScore, awayScore, minute, time, date } = match;
  const isDark = theme === "dark";
  const dateStr = formatMatchDate(date);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border cursor-pointer active:scale-[0.99] transition-transform ${
        isDark ? "border-zinc-800/80 bg-zinc-900/95" : "border-zinc-200 bg-white"
      }`}
      onClick={onOpen}
      style={{ boxShadow: isLive ? "0 0 0 1px rgba(239,68,68,0.2), 0 4px 20px rgba(0,0,0,0.4)" : "0 4px 20px rgba(0,0,0,0.15)" }}
    >
      {/* top accent */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-yellow-500 via-orange-500 to-red-600" />

      {/* live badge */}
      {isLive && (
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-red-600/20 border border-red-500/40 rounded-full px-2 py-0.5 z-10">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          <span className="text-[9px] font-black text-red-400 tracking-widest">AO VIVO</span>
          {(minute ?? 0) > 0 && <span className="text-[9px] text-red-300 font-bold ml-0.5">{minute}'</span>}
        </div>
      )}

      <div className="px-3.5 pt-3 pb-3">
        {/* League */}
        <div className={`text-[9px] font-black tracking-widest mb-3 truncate pr-20 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>🏆 {match.league}</div>

        {/* Teams row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <FlagImg name={home} size={38} />
            <span className={`text-[11px] font-black text-center leading-tight px-1 ${isDark ? "text-white" : "text-zinc-900"}`}>{home}</span>
          </div>

          <div className="flex flex-col items-center min-w-[60px]">
            {isLive ? (
              <div className={`text-2xl font-black tabular-nums leading-none ${isDark ? "text-white" : "text-zinc-900"}`}>{homeScore ?? 0}–{awayScore ?? 0}</div>
            ) : (
              <>
                <span className={`text-xs font-black ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>VS</span>
                {time && (
                  <div className="flex items-center gap-0.5 mt-1">
                    <span className={`text-[13px] font-black ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{time}</span>
                  </div>
                )}
                {dateStr && (
                  <span className={`text-[10px] font-semibold mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{dateStr}</span>
                )}
              </>
            )}
          </div>

          <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <FlagImg name={away} size={38} />
            <span className={`text-[11px] font-black text-center leading-tight px-1 ${isDark ? "text-white" : "text-zinc-900"}`}>{away}</span>
          </div>
        </div>

        {/* Quick 1X2 odds */}
        {odds && (odds.home > 1.001 || odds.away > 1.001) && (
          <div className="flex flex-col gap-1">
            <div className="flex gap-1.5">
              <OBtn label={home} odd={odds.home} active={activeSel === `${match.id}:home`} onClick={() => onQuickBet(`${match.id}:home`, home, odds.home)} theme={theme} />
              {odds.draw > 1.001 && <OBtn label="Empate" odd={odds.draw} active={activeSel === `${match.id}:draw`} onClick={() => onQuickBet(`${match.id}:draw`, "Empate", odds.draw)} theme={theme} />}
              <OBtn label={away} odd={odds.away} active={activeSel === `${match.id}:away`} onClick={() => onQuickBet(`${match.id}:away`, away, odds.away)} theme={theme} />
            </div>
            {!match.hasRealOdds && (
              <div className="flex items-center justify-center gap-1">
                <span className="w-1 h-1 rounded-full bg-amber-500/60" />
                <span className={`text-[8px] font-semibold tracking-wide ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>ODDS ESTIMADAS</span>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Group Card ───────────────────────────────────────────────────────────────

function GroupCard({ group, teams, theme }: { group: string; teams: string[]; theme: Theme }) {
  const isDark = theme === "dark";
  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? "border-zinc-800 bg-zinc-900/80" : "border-zinc-200 bg-white"}`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/60"
        style={{ background: "linear-gradient(90deg,rgba(234,179,8,0.07) 0%,transparent 60%)" }}>
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center text-[11px] font-black text-black">
          {group}
        </div>
        <span className={`text-[10px] font-black tracking-widest ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>GRUPO {group}</span>
      </div>
      <div className={`divide-y ${isDark ? "divide-zinc-800/40" : "divide-zinc-100"}`}>
        {teams.map(team => (
          <div key={team} className="flex items-center gap-2.5 px-3 py-2">
            <FlagImg name={team} size={22} />
            <span className={`text-[11px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{team}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Market components ────────────────────────────────────────────────────────

function SLabel({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  return <div className={`text-[9px] font-black tracking-widest mb-1.5 mt-3 first:mt-0 uppercase ${theme === "dark" ? "text-zinc-500" : "text-zinc-400"}`}>{children}</div>;
}

function MRow({ items, activeKey, onBet, theme }: {
  items: { k: string; label: string; odd: number }[];
  activeKey?: string;
  onBet: (k: string, label: string, odd: number) => void;
  theme: Theme;
}) {
  const isDark = theme === "dark";
  const valid = items.filter(i => i.odd > 1.001);
  if (!valid.length) return null;
  return (
    <div className="flex gap-1.5 mb-2">
      {valid.map(i => (
        <button
          key={i.k}
          onClick={() => onBet(i.k, i.label, i.odd)}
          className={`flex-1 flex flex-col items-center py-2.5 px-1 rounded-xl border transition-all min-w-0 ${
            activeKey === i.k
              ? "border-red-500 bg-red-600/15 ring-1 ring-red-400/30"
              : isDark
                ? "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"
          }`}
        >
          <span className={`text-[10px] mb-1 truncate w-full text-center px-0.5 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{i.label}</span>
          <span className={`text-sm font-black tabular-nums ${activeKey === i.k ? "text-red-400" : isDark ? "text-white" : "text-zinc-900"}`}>{i.odd.toFixed(2)}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Markets Full Page ────────────────────────────────────────────────────────

type MTabId = "todos" | "resultado" | "dupla" | "golos" | "handicap" | "marcador" | "cantos" | "cartoes" | "especiais" | "jogadores";

function MarketsPage({ match, activeKeys, onBet, onClose, theme }: {
  match: WCMatch;
  activeKeys: Record<string, string>;
  onBet: (matchId: string, k: string, label: string, odd: number, market: string) => void;
  onClose: () => void;
  theme: Theme;
}) {
  const [tab, setTab] = useState<MTabId>("todos");
  const [showStats, setShowStats] = useState(false);
  const mk = match.markets ?? {};
  const odds = match.odds;
  const mid = match.id;
  const ak = activeKeys[mid] ?? "";
  const isDark = theme === "dark";
  const bet = (k: string, label: string, odd: number, market: string) => onBet(mid, k, label, odd, market);
  const dateStr = formatMatchDate(match.date);

  const hasDupla = !!(mk.doubleChance?.homeOrDraw);
  const hasGolos = !!(mk.totalGoals?.over25 || mk.bothTeamsScore?.yes || mk.exactGoals?.g0 !== undefined);
  const hasHandicap = !!(mk.handicap?.homeMinusOne || mk.asianHandicap?.home);
  const hasMarcador = !!(mk.correctScore && Object.keys(mk.correctScore).length > 0);
  const hasCantos = !!(mk.corners?.o95 || mk.corners1H?.o45 || mk.corners2H?.o45);
  const hasCartoes = !!(mk.cards?.o35 || mk.cards1H?.o15 || mk.cards2H?.o05);
  const hasEspeciais = !!(mk.firstGoal?.home || mk.winToNil?.home || mk.goalOddEven?.odd || mk.btts1H?.yes || mk.toWinBothHalves?.home);
  const hasJogadores = !!(mk.playerGoals?.length || mk.playerAssists?.length || mk.playerCards?.length);

  const TABS: { id: MTabId; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "resultado", label: "1X2" },
    ...(hasDupla ? [{ id: "dupla" as MTabId, label: "Dupla" }] : []),
    ...(hasGolos ? [{ id: "golos" as MTabId, label: "Golos" }] : []),
    ...(hasHandicap ? [{ id: "handicap" as MTabId, label: "Handicap" }] : []),
    ...(hasMarcador ? [{ id: "marcador" as MTabId, label: "Marcador" }] : []),
    ...(hasCantos ? [{ id: "cantos" as MTabId, label: "Cantos" }] : []),
    ...(hasCartoes ? [{ id: "cartoes" as MTabId, label: "Cartões" }] : []),
    ...(hasEspeciais ? [{ id: "especiais" as MTabId, label: "Especiais" }] : []),
    ...(hasJogadores ? [{ id: "jogadores" as MTabId, label: "Jogadores" }] : []),
  ];

  const activeTab = TABS.find(t => t.id === tab) ? tab : "todos";

  // ── Helper: render result markets ──
  const renderResultado = () => (
    <>
      {odds && (
        <>
          <SLabel theme={theme}>RESULTADO FINAL</SLabel>
          <MRow items={[
            { k: "r:home", label: match.home, odd: odds.home },
            { k: "r:draw", label: "Empate", odd: odds.draw },
            { k: "r:away", label: match.away, odd: odds.away },
          ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "resultado")} theme={theme} />
        </>
      )}
      {mk.halfTime && (mk.halfTime.home > 1.001 || mk.halfTime.draw > 1.001) && (
        <>
          <SLabel theme={theme}>INTERVALO (1ª PARTE)</SLabel>
          <MRow items={[
            { k: "ht:home", label: match.home, odd: mk.halfTime.home },
            { k: "ht:draw", label: "Empate", odd: mk.halfTime.draw },
            { k: "ht:away", label: match.away, odd: mk.halfTime.away },
          ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "intervalo")} theme={theme} />
        </>
      )}
      {mk.secondHalf && mk.secondHalf.home > 1.001 && (
        <>
          <SLabel theme={theme}>2ª PARTE</SLabel>
          <MRow items={[
            { k: "sh:home", label: match.home, odd: mk.secondHalf.home },
            { k: "sh:draw", label: "Empate", odd: mk.secondHalf.draw },
            { k: "sh:away", label: match.away, odd: mk.secondHalf.away },
          ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "2a-parte")} theme={theme} />
        </>
      )}
      {mk.drawNoBet && mk.drawNoBet.home > 1.001 && (
        <>
          <SLabel theme={theme}>DRAW NO BET</SLabel>
          <MRow items={[
            { k: "dnb:home", label: match.home, odd: mk.drawNoBet.home },
            { k: "dnb:away", label: match.away, odd: mk.drawNoBet.away },
          ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "draw-no-bet")} theme={theme} />
        </>
      )}
      {mk.htft && Object.values(mk.htft).some(v => (v ?? 0) > 1.001) && (
        <>
          <SLabel theme={theme}>INTERVALO / FINAL</SLabel>
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {([
              ["htft:hh", `${match.home}/${match.home}`, mk.htft.hh],
              ["htft:hd", `${match.home}/Emp`, mk.htft.hd],
              ["htft:ha", `${match.home}/${match.away}`, mk.htft.ha],
              ["htft:dh", `Emp/${match.home}`, mk.htft.dh],
              ["htft:dd", "Emp/Emp", mk.htft.dd],
              ["htft:da", `Emp/${match.away}`, mk.htft.da],
              ["htft:ah", `${match.away}/${match.home}`, mk.htft.ah],
              ["htft:ad", `${match.away}/Emp`, mk.htft.ad],
              ["htft:aa", `${match.away}/${match.away}`, mk.htft.aa],
            ] as [string, string, number | undefined][]).filter(([, , v]) => (v ?? 0) > 1.001).map(([k, l, v]) => (
              <button key={k} onClick={() => bet(k, l, v!, "htft")}
                className={`flex flex-col items-center py-2 px-1 rounded-xl border text-center transition-all ${
                  ak === k ? "border-red-500 bg-red-600/15 ring-1 ring-red-400/30" : isDark ? "border-zinc-800 bg-zinc-900 hover:border-zinc-700" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"
                }`}>
                <span className={`text-[9px] mb-1 leading-tight ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{l}</span>
                <span className={`text-sm font-black tabular-nums ${ak === k ? "text-red-400" : isDark ? "text-white" : "text-zinc-900"}`}>{v!.toFixed(2)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );

  const renderDupla = () => mk.doubleChance ? (
    <>
      <SLabel theme={theme}>DUPLA CHANCE</SLabel>
      <MRow items={[
        { k: "dc:hd", label: `${match.home} ou Empate`, odd: mk.doubleChance.homeOrDraw },
        { k: "dc:ad", label: `${match.away} ou Empate`, odd: mk.doubleChance.awayOrDraw },
        { k: "dc:ha", label: `${match.home} ou ${match.away}`, odd: mk.doubleChance.homeOrAway },
      ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "dupla-chance")} theme={theme} />
    </>
  ) : null;

  const renderGolos = () => (
    <>
      {mk.totalGoals && (
        <>
          <SLabel theme={theme}>TOTAL DE GOLOS</SLabel>
          {([
            ["0.5", mk.totalGoals.over05, mk.totalGoals.under05],
            ["1.5", mk.totalGoals.over15, mk.totalGoals.under15],
            ["2.5", mk.totalGoals.over25, mk.totalGoals.under25],
            ["3.5", mk.totalGoals.over35, mk.totalGoals.under35],
            ["4.5", mk.totalGoals.over45, mk.totalGoals.under45],
            ["5.5", mk.totalGoals.over55, mk.totalGoals.under55],
            ["6.5", mk.totalGoals.over65, mk.totalGoals.under65],
          ] as [string, number | undefined, number | undefined][])
            .filter(([, o, u]) => (o ?? 0) > 1.001 || (u ?? 0) > 1.001)
            .map(([line, o, u]) => (
              <MRow key={line} items={[
                { k: `tg:o${line}`, label: `Acima ${line}`, odd: o ?? 0 },
                { k: `tg:u${line}`, label: `Abaixo ${line}`, odd: u ?? 0 },
              ]} activeKey={ak} onBet={(k, l, v) => bet(k, l, v, "golos")} theme={theme} />
            ))}
        </>
      )}
      {mk.bothTeamsScore && mk.bothTeamsScore.yes > 1.001 && (
        <>
          <SLabel theme={theme}>AMBAS MARCAM</SLabel>
          <MRow items={[
            { k: "bts:y", label: "Sim", odd: mk.bothTeamsScore.yes },
            { k: "bts:n", label: "Não", odd: mk.bothTeamsScore.no },
          ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "ambas-marcam")} theme={theme} />
        </>
      )}
      {mk.btts1H && mk.btts1H.yes > 1.001 && (
        <>
          <SLabel theme={theme}>AMBAS MARCAM — 1ª PARTE</SLabel>
          <MRow items={[
            { k: "bts1h:y", label: "Sim", odd: mk.btts1H.yes },
            { k: "bts1h:n", label: "Não", odd: mk.btts1H.no },
          ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "ambas-1h")} theme={theme} />
        </>
      )}
      {mk.btts2H && mk.btts2H.yes > 1.001 && (
        <>
          <SLabel theme={theme}>AMBAS MARCAM — 2ª PARTE</SLabel>
          <MRow items={[
            { k: "bts2h:y", label: "Sim", odd: mk.btts2H.yes },
            { k: "bts2h:n", label: "Não", odd: mk.btts2H.no },
          ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "ambas-2h")} theme={theme} />
        </>
      )}
      {mk.exactGoals && Object.values(mk.exactGoals).some(v => (v ?? 0) > 1.001) && (
        <>
          <SLabel theme={theme}>GOLOS EXACTOS</SLabel>
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {([
              ["eg:0", "0 Golos", mk.exactGoals.g0],
              ["eg:1", "1 Golo", mk.exactGoals.g1],
              ["eg:2", "2 Golos", mk.exactGoals.g2],
              ["eg:3", "3 Golos", mk.exactGoals.g3],
              ["eg:4", "4 Golos", mk.exactGoals.g4],
              ["eg:5+", "5+ Golos", mk.exactGoals.g5plus],
            ] as [string, string, number | undefined][]).filter(([,, v]) => (v ?? 0) > 1.001).map(([k, l, v]) => (
              <button key={k} onClick={() => bet(k, l, v!, "golos-exactos")}
                className={`flex flex-col items-center py-2 rounded-xl border transition-all ${ak === k ? "border-red-500 bg-red-600/15" : isDark ? "border-zinc-800 bg-zinc-900 hover:border-zinc-700" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"}`}>
                <span className={`text-[10px] mb-1 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{l}</span>
                <span className={`text-sm font-black tabular-nums ${ak === k ? "text-red-400" : isDark ? "text-white" : "text-zinc-900"}`}>{v!.toFixed(2)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {mk.goalOddEven && mk.goalOddEven.odd > 1.001 && (
        <>
          <SLabel theme={theme}>PAR / ÍMPAR GOLOS</SLabel>
          <MRow items={[
            { k: "goe:o", label: "Ímpar", odd: mk.goalOddEven.odd },
            { k: "goe:e", label: "Par", odd: mk.goalOddEven.even },
          ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "par-impar")} theme={theme} />
        </>
      )}
      {mk.teamGoals && (mk.teamGoals.homeOver05 ?? 0) > 1.001 && (
        <>
          <SLabel theme={theme}>GOLOS {match.home.toUpperCase()}</SLabel>
          {([["0.5", mk.teamGoals.homeOver05, mk.teamGoals.homeUnder05], ["1.5", mk.teamGoals.homeOver15, mk.teamGoals.homeUnder15], ["2.5", mk.teamGoals.homeOver25, mk.teamGoals.homeUnder25]] as [string, number | undefined, number | undefined][]).filter(([, o]) => (o ?? 0) > 1.001).map(([line, o, u]) => (
            <MRow key={`htg${line}`} items={[{ k: `htg:o${line}`, label: `Acima ${line}`, odd: o ?? 0 }, { k: `htg:u${line}`, label: `Abaixo ${line}`, odd: u ?? 0 }]} activeKey={ak} onBet={(k, l, v) => bet(k, l, v, "golos-equipa")} theme={theme} />
          ))}
        </>
      )}
      {mk.teamGoals && (mk.teamGoals.awayOver05 ?? 0) > 1.001 && (
        <>
          <SLabel theme={theme}>GOLOS {match.away.toUpperCase()}</SLabel>
          {([["0.5", mk.teamGoals.awayOver05, mk.teamGoals.awayUnder05], ["1.5", mk.teamGoals.awayOver15, mk.teamGoals.awayUnder15], ["2.5", mk.teamGoals.awayOver25, mk.teamGoals.awayUnder25]] as [string, number | undefined, number | undefined][]).filter(([, o]) => (o ?? 0) > 1.001).map(([line, o, u]) => (
            <MRow key={`atg${line}`} items={[{ k: `atg:o${line}`, label: `Acima ${line}`, odd: o ?? 0 }, { k: `atg:u${line}`, label: `Abaixo ${line}`, odd: u ?? 0 }]} activeKey={ak} onBet={(k, l, v) => bet(k, l, v, "golos-equipa")} theme={theme} />
          ))}
        </>
      )}
    </>
  );

  const renderHandicap = () => (
    <>
      {mk.handicap && (mk.handicap.homeMinusOne ?? 0) > 1.001 && (
        <>
          <SLabel theme={theme}>HANDICAP EUROPEU</SLabel>
          <MRow items={[
            { k: "hcp:-1", label: `${match.home} −1`, odd: mk.handicap.homeMinusOne ?? 0 },
            { k: "hcp:+1", label: `${match.away} +1`, odd: mk.handicap.awayPlusOne ?? 0 },
          ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "handicap")} theme={theme} />
          {(mk.handicap.homeMinusOneHalf ?? 0) > 1.001 && (
            <MRow items={[
              { k: "hcp:-1.5", label: `${match.home} −1.5`, odd: mk.handicap.homeMinusOneHalf ?? 0 },
              { k: "hcp:+1.5", label: `${match.away} +1.5`, odd: mk.handicap.awayPlusOneHalf ?? 0 },
            ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "handicap")} theme={theme} />
          )}
        </>
      )}
      {mk.asianHandicap && mk.asianHandicap.home > 1.001 && (
        <>
          <SLabel theme={theme}>HANDICAP ASIÁTICO {mk.asianHandicap.line > 0 ? `+${mk.asianHandicap.line}` : mk.asianHandicap.line}</SLabel>
          <MRow items={[
            { k: "ah:home", label: match.home, odd: mk.asianHandicap.home },
            { k: "ah:away", label: match.away, odd: mk.asianHandicap.away },
          ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "handicap-asiatico")} theme={theme} />
        </>
      )}
      {mk.toWinBothHalves && mk.toWinBothHalves.home > 1.001 && (
        <>
          <SLabel theme={theme}>GANHAR AS DUAS PARTES</SLabel>
          <MRow items={[
            { k: "twbh:h", label: match.home, odd: mk.toWinBothHalves.home },
            { k: "twbh:a", label: match.away, odd: mk.toWinBothHalves.away },
          ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "ganhar-2-partes")} theme={theme} />
        </>
      )}
      {mk.highestScoringHalf && mk.highestScoringHalf.first > 1.001 && (
        <>
          <SLabel theme={theme}>PARTE COM MAIS GOLOS</SLabel>
          <MRow items={[
            { k: "hsh:1", label: "1ª Parte", odd: mk.highestScoringHalf.first },
            { k: "hsh:eq", label: "Iguais", odd: mk.highestScoringHalf.equal },
            { k: "hsh:2", label: "2ª Parte", odd: mk.highestScoringHalf.second },
          ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "parte-mais-golos")} theme={theme} />
        </>
      )}
    </>
  );

  const renderMarcador = () => mk.correctScore ? (
    <>
      <SLabel theme={theme}>MARCADOR CORRECTO</SLabel>
      <div className="grid grid-cols-3 gap-1.5">
        {Object.entries(mk.correctScore)
          .filter(([, v]) => v > 1.001)
          .sort(([a], [b]) => {
            const pa = a.split("-").map(Number);
            const pb = b.split("-").map(Number);
            return ((pa[0]! + pa[1]!) - (pb[0]! + pb[1]!)) || a.localeCompare(b);
          })
          .map(([score, odd]) => (
            <button key={score} onClick={() => bet(`cs:${score}`, score, odd, "marcador")}
              className={`flex flex-col items-center py-2 rounded-xl border transition-all ${ak === `cs:${score}` ? "border-red-500 bg-red-600/15" : isDark ? "border-zinc-800 bg-zinc-900 hover:border-zinc-700" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"}`}>
              <span className={`text-xs font-black ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{score}</span>
              <span className={`text-sm font-black tabular-nums mt-0.5 ${ak === `cs:${score}` ? "text-red-400" : isDark ? "text-white" : "text-zinc-900"}`}>{odd.toFixed(2)}</span>
            </button>
          ))}
      </div>
    </>
  ) : null;

  const renderCantos = () => (
    <>
      {mk.corners && (mk.corners.o85 ?? mk.corners.o95 ?? 0) > 1.001 && (
        <>
          <SLabel theme={theme}>CANTOS — JOGO COMPLETO</SLabel>
          {([
            ["8.5", mk.corners.o85, mk.corners.u85],
            ["9.5", mk.corners.o95, mk.corners.u95],
            ["10.5", mk.corners.o105, mk.corners.u105],
          ] as [string, number | undefined, number | undefined][]).filter(([, o]) => (o ?? 0) > 1.001).map(([line, o, u]) => (
            <MRow key={`cn${line}`} items={[
              { k: `cn:o${line}`, label: `Acima ${line}`, odd: o ?? 0 },
              { k: `cn:u${line}`, label: `Abaixo ${line}`, odd: u ?? 0 },
            ]} activeKey={ak} onBet={(k, l, v) => bet(k, l, v, "cantos")} theme={theme} />
          ))}
        </>
      )}
      {mk.corners1H && Object.values(mk.corners1H).some(v => (v ?? 0) > 1.001) && (
        <>
          <SLabel theme={theme}>CANTOS — 1ª PARTE</SLabel>
          {([
            ["3.5", mk.corners1H.o35, mk.corners1H.u35],
            ["4.5", mk.corners1H.o45, mk.corners1H.u45],
            ["5.5", mk.corners1H.o55, mk.corners1H.u55],
          ] as [string, number | undefined, number | undefined][]).filter(([, o]) => (o ?? 0) > 1.001).map(([line, o, u]) => (
            <MRow key={`cn1h${line}`} items={[
              { k: `cn1h:o${line}`, label: `Acima ${line}`, odd: o ?? 0 },
              { k: `cn1h:u${line}`, label: `Abaixo ${line}`, odd: u ?? 0 },
            ]} activeKey={ak} onBet={(k, l, v) => bet(k, l, v, "cantos-1h")} theme={theme} />
          ))}
        </>
      )}
      {mk.corners2H && Object.values(mk.corners2H).some(v => (v ?? 0) > 1.001) && (
        <>
          <SLabel theme={theme}>CANTOS — 2ª PARTE</SLabel>
          {([
            ["3.5", mk.corners2H.o35, mk.corners2H.u35],
            ["4.5", mk.corners2H.o45, mk.corners2H.u45],
            ["5.5", mk.corners2H.o55, mk.corners2H.u55],
          ] as [string, number | undefined, number | undefined][]).filter(([, o]) => (o ?? 0) > 1.001).map(([line, o, u]) => (
            <MRow key={`cn2h${line}`} items={[
              { k: `cn2h:o${line}`, label: `Acima ${line}`, odd: o ?? 0 },
              { k: `cn2h:u${line}`, label: `Abaixo ${line}`, odd: u ?? 0 },
            ]} activeKey={ak} onBet={(k, l, v) => bet(k, l, v, "cantos-2h")} theme={theme} />
          ))}
        </>
      )}
    </>
  );

  const renderCartoes = () => (
    <>
      {mk.cards && Object.values(mk.cards).some(v => (v ?? 0) > 1.001) && (
        <>
          <SLabel theme={theme}>CARTÕES — JOGO COMPLETO</SLabel>
          {([
            ["3.5", mk.cards.o35, mk.cards.u35],
            ["4.5", mk.cards.o45, mk.cards.u45],
            ["5.5", mk.cards.o55, mk.cards.u55],
          ] as [string, number | undefined, number | undefined][]).filter(([, o]) => (o ?? 0) > 1.001).map(([line, o, u]) => (
            <MRow key={`cd${line}`} items={[
              { k: `cd:o${line}`, label: `Acima ${line}`, odd: o ?? 0 },
              { k: `cd:u${line}`, label: `Abaixo ${line}`, odd: u ?? 0 },
            ]} activeKey={ak} onBet={(k, l, v) => bet(k, l, v, "cartoes")} theme={theme} />
          ))}
        </>
      )}
      {mk.cards1H && Object.values(mk.cards1H).some(v => (v ?? 0) > 1.001) && (
        <>
          <SLabel theme={theme}>CARTÕES — 1ª PARTE</SLabel>
          {([
            ["0.5", mk.cards1H.o05, mk.cards1H.u05],
            ["1.5", mk.cards1H.o15, mk.cards1H.u15],
            ["2.5", mk.cards1H.o25, mk.cards1H.u25],
          ] as [string, number | undefined, number | undefined][]).filter(([, o]) => (o ?? 0) > 1.001).map(([line, o, u]) => (
            <MRow key={`cd1h${line}`} items={[
              { k: `cd1h:o${line}`, label: `Acima ${line}`, odd: o ?? 0 },
              { k: `cd1h:u${line}`, label: `Abaixo ${line}`, odd: u ?? 0 },
            ]} activeKey={ak} onBet={(k, l, v) => bet(k, l, v, "cartoes-1h")} theme={theme} />
          ))}
        </>
      )}
      {mk.cards2H && Object.values(mk.cards2H).some(v => (v ?? 0) > 1.001) && (
        <>
          <SLabel theme={theme}>CARTÕES — 2ª PARTE</SLabel>
          {([
            ["0.5", mk.cards2H.o05, mk.cards2H.u05],
            ["1.5", mk.cards2H.o15, mk.cards2H.u15],
            ["2.5", mk.cards2H.o25, mk.cards2H.u25],
          ] as [string, number | undefined, number | undefined][]).filter(([, o]) => (o ?? 0) > 1.001).map(([line, o, u]) => (
            <MRow key={`cd2h${line}`} items={[
              { k: `cd2h:o${line}`, label: `Acima ${line}`, odd: o ?? 0 },
              { k: `cd2h:u${line}`, label: `Abaixo ${line}`, odd: u ?? 0 },
            ]} activeKey={ak} onBet={(k, l, v) => bet(k, l, v, "cartoes-2h")} theme={theme} />
          ))}
        </>
      )}
    </>
  );

  const renderEspeciais = () => (
    <>
      {mk.firstGoal && mk.firstGoal.home > 1.001 && (
        <>
          <SLabel theme={theme}>1º GOLO</SLabel>
          <MRow items={[
            { k: "fg:h", label: match.home, odd: mk.firstGoal.home },
            { k: "fg:no", label: "Sem Golos", odd: mk.firstGoal.noGoal },
            { k: "fg:a", label: match.away, odd: mk.firstGoal.away },
          ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "1o-golo")} theme={theme} />
        </>
      )}
      {mk.winToNil && mk.winToNil.home > 1.001 && (
        <>
          <SLabel theme={theme}>GANHAR SEM SOFRER</SLabel>
          <MRow items={[
            { k: "wtn:h", label: match.home, odd: mk.winToNil.home },
            { k: "wtn:a", label: match.away, odd: mk.winToNil.away },
          ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "win-to-nil")} theme={theme} />
        </>
      )}
      {mk.cleanSheet && mk.cleanSheet.home > 1.001 && (
        <>
          <SLabel theme={theme}>CLEAN SHEET</SLabel>
          <MRow items={[
            { k: "csh:h", label: match.home, odd: mk.cleanSheet.home },
            { k: "csh:a", label: match.away, odd: mk.cleanSheet.away },
          ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "clean-sheet")} theme={theme} />
        </>
      )}
    </>
  );

  const renderJogadores = () => (
    <>
      {mk.playerGoals && mk.playerGoals.length > 0 && (
        <>
          <SLabel theme={theme}>MARCADOR — QUALQUER MOMENTO</SLabel>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {mk.playerGoals.filter(p => (p.anytime ?? 0) > 1.001).map(p => (
              <button key={`pg:${p.name}`} onClick={() => bet(`pg:${p.name}`, p.name, p.anytime!, "marcador-jogador")}
                className={`flex flex-col items-center py-2.5 px-2 rounded-xl border transition-all text-center ${ak === `pg:${p.name}` ? "border-red-500 bg-red-600/15" : isDark ? "border-zinc-800 bg-zinc-900 hover:border-zinc-700" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"}`}>
                <span className={`text-[10px] mb-1 font-semibold truncate w-full ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{p.name}</span>
                <span className={`text-sm font-black tabular-nums ${ak === `pg:${p.name}` ? "text-red-400" : isDark ? "text-white" : "text-zinc-900"}`}>{p.anytime!.toFixed(2)}</span>
              </button>
            ))}
          </div>
          {mk.playerGoals.some(p => (p.firstHalf ?? 0) > 1.001) && (
            <>
              <SLabel theme={theme}>MARCADOR — 1ª PARTE</SLabel>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {mk.playerGoals.filter(p => (p.firstHalf ?? 0) > 1.001).map(p => (
                  <button key={`pg1h:${p.name}`} onClick={() => bet(`pg1h:${p.name}`, `${p.name} (1ªP)`, p.firstHalf!, "marcador-1h-jogador")}
                    className={`flex flex-col items-center py-2.5 px-2 rounded-xl border transition-all text-center ${ak === `pg1h:${p.name}` ? "border-red-500 bg-red-600/15" : isDark ? "border-zinc-800 bg-zinc-900 hover:border-zinc-700" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"}`}>
                    <span className={`text-[10px] mb-1 font-semibold truncate w-full ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{p.name}</span>
                    <span className={`text-sm font-black tabular-nums ${ak === `pg1h:${p.name}` ? "text-red-400" : isDark ? "text-white" : "text-zinc-900"}`}>{p.firstHalf!.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {mk.playerGoals.some(p => (p.secondHalf ?? 0) > 1.001) && (
            <>
              <SLabel theme={theme}>MARCADOR — 2ª PARTE</SLabel>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {mk.playerGoals.filter(p => (p.secondHalf ?? 0) > 1.001).map(p => (
                  <button key={`pg2h:${p.name}`} onClick={() => bet(`pg2h:${p.name}`, `${p.name} (2ªP)`, p.secondHalf!, "marcador-2h-jogador")}
                    className={`flex flex-col items-center py-2.5 px-2 rounded-xl border transition-all text-center ${ak === `pg2h:${p.name}` ? "border-red-500 bg-red-600/15" : isDark ? "border-zinc-800 bg-zinc-900 hover:border-zinc-700" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"}`}>
                    <span className={`text-[10px] mb-1 font-semibold truncate w-full ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{p.name}</span>
                    <span className={`text-sm font-black tabular-nums ${ak === `pg2h:${p.name}` ? "text-red-400" : isDark ? "text-white" : "text-zinc-900"}`}>{p.secondHalf!.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {mk.playerAssists && mk.playerAssists.length > 0 && (
        <>
          <SLabel theme={theme}>ASSISTÊNCIA</SLabel>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {mk.playerAssists.filter(p => (p.anytime ?? 0) > 1.001).map(p => (
              <button key={`pa:${p.name}`} onClick={() => bet(`pa:${p.name}`, p.name, p.anytime!, "assist-jogador")}
                className={`flex flex-col items-center py-2.5 px-2 rounded-xl border transition-all text-center ${ak === `pa:${p.name}` ? "border-red-500 bg-red-600/15" : isDark ? "border-zinc-800 bg-zinc-900 hover:border-zinc-700" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"}`}>
                <span className={`text-[10px] mb-1 font-semibold truncate w-full ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{p.name}</span>
                <span className={`text-sm font-black tabular-nums ${ak === `pa:${p.name}` ? "text-red-400" : isDark ? "text-white" : "text-zinc-900"}`}>{p.anytime!.toFixed(2)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {mk.playerCards && mk.playerCards.length > 0 && (
        <>
          <SLabel theme={theme}>CARTÃO — QUALQUER MOMENTO</SLabel>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {mk.playerCards.filter(p => (p.anytime ?? 0) > 1.001).map(p => (
              <button key={`pc:${p.name}`} onClick={() => bet(`pc:${p.name}`, p.name, p.anytime!, "cartao-jogador")}
                className={`flex flex-col items-center py-2.5 px-2 rounded-xl border transition-all text-center ${ak === `pc:${p.name}` ? "border-red-500 bg-red-600/15" : isDark ? "border-zinc-800 bg-zinc-900 hover:border-zinc-700" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"}`}>
                <span className={`text-[10px] mb-1 font-semibold truncate w-full ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{p.name}</span>
                <span className={`text-sm font-black tabular-nums ${ak === `pc:${p.name}` ? "text-red-400" : isDark ? "text-white" : "text-zinc-900"}`}>{p.anytime!.toFixed(2)}</span>
              </button>
            ))}
          </div>
          {mk.playerCards.some(p => (p.firstHalf ?? 0) > 1.001) && (
            <>
              <SLabel theme={theme}>CARTÃO — 1ª PARTE</SLabel>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {mk.playerCards.filter(p => (p.firstHalf ?? 0) > 1.001).map(p => (
                  <button key={`pc1h:${p.name}`} onClick={() => bet(`pc1h:${p.name}`, `${p.name} (1ªP)`, p.firstHalf!, "cartao-1h-jogador")}
                    className={`flex flex-col items-center py-2.5 px-2 rounded-xl border transition-all text-center ${ak === `pc1h:${p.name}` ? "border-red-500 bg-red-600/15" : isDark ? "border-zinc-800 bg-zinc-900 hover:border-zinc-700" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"}`}>
                    <span className={`text-[10px] mb-1 font-semibold truncate w-full ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{p.name}</span>
                    <span className={`text-sm font-black tabular-nums ${ak === `pc1h:${p.name}` ? "text-red-400" : isDark ? "text-white" : "text-zinc-900"}`}>{p.firstHalf!.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {mk.playerCards.some(p => (p.secondHalf ?? 0) > 1.001) && (
            <>
              <SLabel theme={theme}>CARTÃO — 2ª PARTE</SLabel>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {mk.playerCards.filter(p => (p.secondHalf ?? 0) > 1.001).map(p => (
                  <button key={`pc2h:${p.name}`} onClick={() => bet(`pc2h:${p.name}`, `${p.name} (2ªP)`, p.secondHalf!, "cartao-2h-jogador")}
                    className={`flex flex-col items-center py-2.5 px-2 rounded-xl border transition-all text-center ${ak === `pc2h:${p.name}` ? "border-red-500 bg-red-600/15" : isDark ? "border-zinc-800 bg-zinc-900 hover:border-zinc-700" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"}`}>
                    <span className={`text-[10px] mb-1 font-semibold truncate w-full ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{p.name}</span>
                    <span className={`text-sm font-black tabular-nums ${ak === `pc2h:${p.name}` ? "text-red-400" : isDark ? "text-white" : "text-zinc-900"}`}>{p.secondHalf!.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );

  return (
    <motion.div
      key="markets-page"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className={`min-h-[100dvh] flex flex-col ${isDark ? "bg-[#090909]" : "bg-zinc-50"}`}
    >
      {/* ── Match header ── */}
      <div
        className={`flex-shrink-0 border-b ${isDark ? "border-zinc-800/60" : "border-zinc-200"}`}
        style={{
          background: isDark ? "rgba(9,9,9,0.98)" : "rgba(250,250,252,0.98)",
          backdropFilter: "blur(12px)",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        {/* Top bar: back + league + live badge */}
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <button
            onClick={onClose}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform ${isDark ? "bg-zinc-800 border-zinc-700/80" : "bg-white border-zinc-200"}`}
          >
            <ArrowLeft size={17} className={isDark ? "text-zinc-200" : "text-zinc-700"} />
          </button>
          <div className="flex-1 min-w-0">
            <div className={`text-[9px] font-black tracking-widest truncate ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>🏆 {match.league}</div>
            {match.date && <div className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-500"}`}>{dateStr}{match.time ? ` · ${match.time}` : ""}</div>}
          </div>
          {match.isLive ? (
            <div className="flex items-center gap-1 bg-red-600/20 border border-red-500/35 rounded-full px-2 py-0.5 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="text-[9px] font-black text-red-400">AO VIVO</span>
              {(match.minute ?? 0) > 0 && <span className="text-[9px] text-red-300 font-bold ml-0.5">{match.minute}'</span>}
            </div>
          ) : null}
        </div>

        {/* Teams + score + stats button */}
        <div className="flex items-center justify-between gap-2 px-4 pb-3">
          <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <FlagImg name={match.home} size={44} />
            <span className={`text-[12px] font-black text-center leading-tight ${isDark ? "text-white" : "text-zinc-900"}`}>{match.home}</span>
          </div>

          <div className="flex flex-col items-center gap-1.5 min-w-[70px]">
            {match.isLive ? (
              <div className={`text-2xl font-black tabular-nums ${isDark ? "text-white" : "text-zinc-900"}`}>
                {match.homeScore ?? 0}–{match.awayScore ?? 0}
              </div>
            ) : (
              <div className={`text-xs font-black ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>VS</div>
            )}
            <button
              onClick={() => setShowStats(s => !s)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[10px] font-black transition-all ${
                showStats
                  ? "bg-red-600/20 border-red-500/40 text-red-300"
                  : isDark
                    ? "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                    : "bg-zinc-100 border-zinc-200 text-zinc-500 hover:text-zinc-700"
              }`}
            >
              <BarChart2 size={11} />
              <span>Stats</span>
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <FlagImg name={match.away} size={44} />
            <span className={`text-[12px] font-black text-center leading-tight ${isDark ? "text-white" : "text-zinc-900"}`}>{match.away}</span>
          </div>
        </div>

        {/* Stats panel */}
        <AnimatePresence>
          {showStats && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className={`overflow-hidden border-t ${isDark ? "border-zinc-800/60" : "border-zinc-100"}`}
            >
              <div className="px-4 py-3">
                {match.isLive ? (
                  <div className={`text-xs text-center ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>Estatísticas ao vivo disponíveis em breve</div>
                ) : (
                  <div className="space-y-1.5">
                    <div className={`text-[9px] font-black tracking-widest text-center mb-2 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>INFORMAÇÃO DO JOGO</div>
                    {dateStr && (
                      <div className={`flex justify-between text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                        <span className={isDark ? "text-zinc-600" : "text-zinc-400"}>Data</span>
                        <span className="font-bold">{dateStr}{match.time ? ` às ${match.time}` : ""}</span>
                      </div>
                    )}
                    <div className={`flex justify-between text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                      <span className={isDark ? "text-zinc-600" : "text-zinc-400"}>Competição</span>
                      <span className="font-bold">FIFA World Cup 2026</span>
                    </div>
                    {match.odds && (
                      <>
                        <div className={`flex justify-between text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                          <span className={isDark ? "text-zinc-600" : "text-zinc-400"}>Favorito</span>
                          <span className="font-bold">{match.odds.home < match.odds.away ? match.home : match.odds.away < match.odds.home ? match.away : "Equilíbrado"}</span>
                        </div>
                        <div className={`flex justify-between text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                          <span className={isDark ? "text-zinc-600" : "text-zinc-400"}>Odds 1X2</span>
                          <span className="font-bold tabular-nums">{match.odds.home.toFixed(2)} / {match.odds.draw.toFixed(2)} / {match.odds.away.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Market tabs */}
        <div className={`flex gap-1.5 px-4 py-2.5 overflow-x-auto scrollbar-hide border-t ${isDark ? "border-zinc-800/40" : "border-zinc-100"}`}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all ${
                activeTab === t.id
                  ? "bg-red-600/20 border-red-500/40 text-red-300"
                  : isDark
                    ? "bg-zinc-800/60 border-zinc-700/50 text-zinc-500 hover:text-zinc-300"
                    : "bg-zinc-100 border-zinc-200 text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable markets content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-24" style={{ overscrollBehavior: "contain" }}>

        {/* TODOS — show all markets */}
        {activeTab === "todos" && (
          <>
            {renderResultado()}
            {hasDupla && renderDupla()}
            {hasGolos && renderGolos()}
            {hasHandicap && renderHandicap()}
            {hasMarcador && renderMarcador()}
            {hasCantos && renderCantos()}
            {hasCartoes && renderCartoes()}
            {hasEspeciais && renderEspeciais()}
            {hasJogadores && renderJogadores()}
            {!odds && !hasDupla && !hasGolos && !hasHandicap && !hasMarcador && !hasCantos && !hasCartoes && !hasEspeciais && !hasJogadores && (
              <div className="text-center py-16">
                <div className="text-4xl mb-3">📊</div>
                <div className={`font-bold text-sm ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>Mercados a carregar</div>
                <div className={`text-xs mt-1.5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>As odds serão publicadas em breve</div>
              </div>
            )}
          </>
        )}

        {activeTab === "resultado" && renderResultado()}
        {activeTab === "dupla" && renderDupla()}
        {activeTab === "golos" && renderGolos()}
        {activeTab === "handicap" && renderHandicap()}
        {activeTab === "marcador" && renderMarcador()}
        {activeTab === "cantos" && renderCantos()}
        {activeTab === "cartoes" && renderCartoes()}
        {activeTab === "especiais" && renderEspeciais()}
        {activeTab === "jogadores" && renderJogadores()}

        <div className="h-8" />
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorldCupPage() {
  const [, navigate] = useLocation();
  const [liveMatches, setLiveMatches]       = useState<WCMatch[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<WCMatch[]>([]);
  const [loading, setLoading]               = useState(true);
  const [pageTab, setPageTab]               = useState<"live" | "upcoming" | "groups">("upcoming");
  const [openMatch, setOpenMatch]           = useState<WCMatch | null>(null);
  const [activeKeys, setActiveKeys]         = useState<Record<string, string>>({});
  const [theme, setTheme]                   = useState<Theme>(getAutoTheme);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Automatic theme: light 08:00-19:00, dark otherwise
  useEffect(() => {
    const tick = () => setTheme(getAutoTheme());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const isDark = theme === "dark";

  // fetch — wc2026 resolves loading; live runs independently in background
  useEffect(() => {
    let cancelled = false;

    async function loadWC() {
      try {
        const wcData = await fetch("/api/matches/wc2026", { signal: AbortSignal.timeout(20_000) })
          .then(r => r.ok ? r.json() : { matches: [] }).catch(() => ({ matches: [] }));
        if (cancelled) return;
        setUpcomingMatches(((wcData.matches ?? []) as Record<string, unknown>[]).map(mapToWCMatch));
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    }

    async function loadLive() {
      try {
        const liveData = await fetch("/api/matches/live", { signal: AbortSignal.timeout(8_000) })
          .then(r => r.ok ? r.json() : { matches: [] }).catch(() => ({ matches: [] }));
        if (cancelled) return;
        const live: WCMatch[] = ((liveData.matches ?? []) as Record<string, unknown>[])
          .filter(m => isWCLeague(String(m.league ?? "")))
          .map(mapToWCMatch);
        setLiveMatches(live);
        if (live.length > 0) setPageTab("live");
      } catch { /* silent */ }
    }

    async function load() {
      // Start both; don't block WC on live
      void loadLive();
      await loadWC();
    }

    load();
    intervalRef.current = setInterval(load, 30_000);
    return () => { cancelled = true; if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // keep open match in sync with refreshed data
  useEffect(() => {
    if (!openMatch) return;
    const updated = [...liveMatches, ...upcomingMatches].find(m => m.id === openMatch.id);
    if (updated) setOpenMatch(updated);
  }, [liveMatches, upcomingMatches]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBet = (matchId: string, k: string, label: string, odd: number, market: string) => {
    setActiveKeys(prev => {
      if (prev[matchId] === k) {
        const n = { ...prev }; delete n[matchId]; return n;
      }
      return { ...prev, [matchId]: k };
    });
    try {
      const bet = { matchId, home: openMatch?.home ?? "", away: openMatch?.away ?? "", selection: k, market, label, odd, sport: "football" };
      const cur = JSON.parse(localStorage.getItem("wc_pending_bet") ?? "null");
      if (cur?.matchId === matchId && cur?.selection === k) {
        localStorage.removeItem("wc_pending_bet");
      } else {
        localStorage.setItem("wc_pending_bet", JSON.stringify(bet));
        navigate("/");
      }
    } catch { /* silent */ }
  };

  const handleQuickBet = (k: string, label: string, odd: number) => {
    const parts = k.split(":");
    const matchId = parts[0];
    if (!matchId) return;
    handleBet(matchId, k, label, odd, "resultado");
  };

  const liveCount     = liveMatches.length;
  const upcomingCount = upcomingMatches.length;
  const listForTab = pageTab === "live" ? liveMatches : upcomingMatches;

  // ── If a match is open, show ONLY the markets page ──────────────────────────
  if (openMatch) {
    return (
      <AnimatePresence mode="wait">
        <MarketsPage
          key={openMatch.id}
          match={openMatch}
          activeKeys={activeKeys}
          onBet={handleBet}
          onClose={() => setOpenMatch(null)}
          theme={theme}
        />
      </AnimatePresence>
    );
  }

  // ── Match list page ──────────────────────────────────────────────────────────
  return (
    <div className={`min-h-[100dvh] ${isDark ? "bg-[#090909]" : "bg-zinc-50"}`}>
      {/* ── Sticky Header ── */}
      <div
        className={`sticky top-0 z-30 flex items-center gap-3 px-4 py-3 ${isDark ? "border-zinc-800/40" : "border-zinc-200"}`}
        style={{
          background: isDark ? "rgba(9,9,9,0.95)" : "rgba(250,250,252,0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.08)",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
        }}
      >
        <button
          onClick={() => navigate("/")}
          className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform ${isDark ? "bg-zinc-800 border-zinc-700/80" : "bg-white border-zinc-200"}`}
        >
          <ArrowLeft size={17} className={isDark ? "text-zinc-200" : "text-zinc-700"} />
        </button>
        <div className="flex-1 min-w-0">
          <div className={`text-[9px] font-black tracking-[0.28em] ${isDark ? "text-yellow-500/70" : "text-yellow-600/80"}`}>BET62 · ESPECIAL</div>
          <div className={`text-base font-black tracking-tight leading-tight ${isDark ? "text-white" : "text-zinc-900"}`}>Copa do Mundo 2026</div>
        </div>
        <div className="flex items-center gap-2">
          {liveCount > 0 && (
            <div className="flex items-center gap-1 bg-red-600/15 border border-red-500/35 rounded-full px-2.5 py-1 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="text-[9px] font-black text-red-400">{liveCount} AO VIVO</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Compact Hero ── */}
      <div className="mx-4 mt-3 mb-4 overflow-hidden rounded-2xl border border-zinc-800/60"
        style={{ background: "linear-gradient(135deg,#0f0010 0%,#1a0028 40%,#160015 100%)" }}>
        <div className="h-[2px] bg-gradient-to-r from-transparent via-yellow-500/60 to-transparent" />
        <div className="flex items-center gap-3 px-4 py-3">
          <motion.div
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            style={{ filter: "drop-shadow(0 0 14px rgba(255,165,0,0.7))" }}
            className="flex-shrink-0"
          >
            <img src={trophyImg} alt="Troféu" style={{ width: 72, height: 72, objectFit: "contain" }} />
          </motion.div>
          <div>
            <div className="text-[9px] font-black tracking-[0.28em] text-yellow-500/80 mb-0.5">FIFA · CAN · MEX · USA</div>
            <div className="text-xl font-black text-white leading-none">WORLD CUP</div>
            <div className="text-xl font-black leading-none" style={{ backgroundImage: "linear-gradient(90deg,#FFD700,#FF6B00)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>2026</div>
            <div className="text-[10px] text-zinc-500 mt-1">48 seleções · 104 jogos · 11 Jun – 19 Jul</div>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-2 px-4 mb-4">
        {([
          { key: "live",     label: "🔴 Ao Vivo",  count: liveCount },
          { key: "upcoming", label: "📅 Próximos",  count: upcomingCount },
          { key: "groups",   label: "🏆 Grupos",    count: WC_GROUPS.length },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setPageTab(key)}
            className={`flex-1 py-2 rounded-xl text-[11px] font-black border transition-all ${
              pageTab === key
                ? "bg-red-600/15 border-red-500/40 text-red-300"
                : isDark
                  ? "bg-zinc-900/60 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                  : "bg-white border-zinc-200 text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {label}
            {count > 0 && <span className="ml-1 opacity-50 text-[10px]">({count})</span>}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="px-4 pb-16">
        <AnimatePresence mode="wait">

          {(pageTab === "live" || pageTab === "upcoming") && (
            <motion.div key={pageTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {loading ? (
                <div className="flex justify-center py-16">
                  <div className="w-7 h-7 border-2 border-zinc-800 border-t-red-500 rounded-full animate-spin" />
                </div>
              ) : listForTab.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-5xl mb-3">{pageTab === "live" ? "⏰" : "📅"}</div>
                  <div className={`font-bold text-sm ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                    {pageTab === "live" ? "Nenhum jogo ao vivo agora" : "Sem jogos disponíveis"}
                  </div>
                  <div className={`text-xs mt-1.5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                    {pageTab === "live" ? "Os jogos ao vivo aparecerão aqui automaticamente" : "Os próximos jogos serão carregados em breve"}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {listForTab.map((m, i) => (
                    <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                      <MatchCard
                        match={m}
                        onOpen={() => setOpenMatch(m)}
                        activeSel={activeKeys[m.id]}
                        onQuickBet={handleQuickBet}
                        theme={theme}
                      />
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {pageTab === "groups" && (
            <motion.div key="groups" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-2 gap-3">
                {WC_GROUPS.map(g => <GroupCard key={g.group} group={g.group} teams={g.teams} theme={theme} />)}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
