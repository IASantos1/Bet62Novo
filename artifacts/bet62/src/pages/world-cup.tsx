import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X, Clock, ChevronRight } from "lucide-react";
import trophyImg from "/trophy-wc-nobg.png";

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
  odds?: { home: number; draw: number; away: number };
  markets?: WCMarkets;
};

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
    odds: (() => {
      const o = m.odds as { home: number; draw: number; away: number } | undefined;
      return o && (o.home > 0 || o.away > 0) ? o : undefined;
    })(),
    markets: (m.markets ?? m.advancedMarkets ?? {}) as WCMarkets,
  };
}

// ─── Odds button ──────────────────────────────────────────────────────────────

function OBtn({ label, odd, active, onClick }: { label: string; odd: number; active: boolean; onClick: () => void }) {
  if (!odd || odd <= 1.001) return null;
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={`flex-1 flex flex-col items-center py-2.5 px-0.5 rounded-xl border transition-all min-w-0 ${
        active
          ? "border-red-500 bg-red-600/15 ring-1 ring-red-400/30"
          : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
      }`}
    >
      <span className="text-[10px] text-zinc-500 leading-tight text-center w-full truncate px-0.5 mb-1">{label}</span>
      <span className={`text-sm font-black tabular-nums ${active ? "text-red-400" : "text-white"}`}>{odd.toFixed(2)}</span>
    </button>
  );
}

// ─── Simple Match Card ────────────────────────────────────────────────────────

function MatchCard({ match, onOpen, activeSel, onQuickBet }: {
  match: WCMatch;
  onOpen: () => void;
  activeSel?: string;
  onQuickBet: (key: string, label: string, odd: number) => void;
}) {
  const { home, away, odds, isLive, homeScore, awayScore, minute, time, date } = match;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/95 cursor-pointer active:scale-[0.99] transition-transform"
      onClick={onOpen}
      style={{ boxShadow: isLive ? "0 0 0 1px rgba(239,68,68,0.2), 0 4px 20px rgba(0,0,0,0.4)" : "0 4px 20px rgba(0,0,0,0.3)" }}
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

      <div className="px-3.5 pt-3 pb-2.5">
        {/* League */}
        <div className="text-[9px] font-black text-zinc-600 tracking-widest mb-3 truncate pr-20">🏆 {match.league}</div>

        {/* Teams row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <FlagImg name={home} size={38} />
            <span className="text-[11px] font-black text-white text-center leading-tight px-1">{home}</span>
          </div>

          <div className="flex flex-col items-center min-w-[52px]">
            {isLive ? (
              <div className="text-2xl font-black text-white tabular-nums leading-none">{homeScore ?? 0}–{awayScore ?? 0}</div>
            ) : (
              <>
                <span className="text-xs font-black text-zinc-600">VS</span>
                {time && (
                  <div className="flex items-center gap-0.5 mt-0.5">
                    <Clock size={9} className="text-zinc-600" />
                    <span className="text-[10px] text-zinc-600">{time}</span>
                  </div>
                )}
                {date && (
                  <span className="text-[9px] text-zinc-700 mt-0.5">
                    {new Date(date + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <FlagImg name={away} size={38} />
            <span className="text-[11px] font-black text-white text-center leading-tight px-1">{away}</span>
          </div>
        </div>

        {/* Quick 1X2 odds */}
        {odds && (odds.home > 1.001 || odds.away > 1.001) && (
          <div className="flex gap-1.5 mb-2.5">
            <OBtn label={home} odd={odds.home} active={activeSel === `${match.id}:home`} onClick={() => onQuickBet(`${match.id}:home`, home, odds.home)} />
            {odds.draw > 1.001 && <OBtn label="Empate" odd={odds.draw} active={activeSel === `${match.id}:draw`} onClick={() => onQuickBet(`${match.id}:draw`, "Empate", odds.draw)} />}
            <OBtn label={away} odd={odds.away} active={activeSel === `${match.id}:away`} onClick={() => onQuickBet(`${match.id}:away`, away, odds.away)} />
          </div>
        )}

        {/* Ver mais mercados */}
        <button
          onClick={e => { e.stopPropagation(); onOpen(); }}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-zinc-700/60 bg-zinc-800/40 hover:bg-zinc-800 hover:border-zinc-600 transition-all"
        >
          <span className="text-[11px] font-black text-zinc-400">Ver todos os mercados</span>
          <ChevronRight size={13} className="text-zinc-500" />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Markets Drawer ───────────────────────────────────────────────────────────

type MTabId = "resultado" | "dupla" | "golos" | "handicap" | "marcador" | "especiais";

function SLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] font-black text-zinc-500 tracking-widest mb-1.5 mt-3 first:mt-0 uppercase">{children}</div>;
}

function MRow({ items, activeKey, onBet }: {
  items: { k: string; label: string; odd: number }[];
  activeKey?: string;
  onBet: (k: string, label: string, odd: number) => void;
}) {
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
              : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
          }`}
        >
          <span className="text-[10px] text-zinc-500 mb-1 truncate w-full text-center px-0.5">{i.label}</span>
          <span className={`text-sm font-black tabular-nums ${activeKey === i.k ? "text-red-400" : "text-white"}`}>{i.odd.toFixed(2)}</span>
        </button>
      ))}
    </div>
  );
}

function MarketsDrawer({ match, activeKeys, onBet, onClose }: {
  match: WCMatch;
  activeKeys: Record<string, string>;
  onBet: (matchId: string, k: string, label: string, odd: number, market: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<MTabId>("resultado");
  const mk = match.markets ?? {};
  const odds = match.odds;
  const mid = match.id;
  const ak = activeKeys[mid] ?? "";
  const bet = (k: string, label: string, odd: number, market: string) => onBet(mid, k, label, odd, market);

  const hasDupla = !!(mk.doubleChance?.homeOrDraw);
  const hasGolos = !!(mk.totalGoals?.over25 || mk.bothTeamsScore?.yes || mk.exactGoals?.g0);
  const hasHandicap = !!(mk.handicap?.homeMinusOne || mk.asianHandicap?.home);
  const hasMarcador = !!(mk.correctScore && Object.keys(mk.correctScore).length > 0);
  const hasEspeciais = !!(mk.firstGoal?.home || mk.winToNil?.home || mk.corners?.o95 || mk.goalOddEven?.odd || mk.btts1H?.yes);

  const TABS: { id: MTabId; label: string }[] = [
    { id: "resultado", label: "1X2" },
    ...(hasDupla ? [{ id: "dupla" as MTabId, label: "Dupla" }] : []),
    ...(hasGolos ? [{ id: "golos" as MTabId, label: "Golos" }] : []),
    ...(hasHandicap ? [{ id: "handicap" as MTabId, label: "Handicap" }] : []),
    ...(hasMarcador ? [{ id: "marcador" as MTabId, label: "Marcador" }] : []),
    ...(hasEspeciais ? [{ id: "especiais" as MTabId, label: "Especiais" }] : []),
  ];

  const activeTab = TABS.find(t => t.id === tab) ? tab : TABS[0]?.id ?? "resultado";

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <motion.div
        key="drawer"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col"
        style={{ maxHeight: "90dvh", borderRadius: "20px 20px 0 0", background: "#111115", border: "1px solid rgba(255,255,255,0.07)", borderBottom: "none" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 pb-3 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-black text-zinc-600 tracking-widest truncate">🏆 {match.league}</div>
            <div className="text-sm font-black text-white leading-tight truncate">{match.home} vs {match.away}</div>
          </div>
          {match.isLive && (
            <div className="flex items-center gap-1 bg-red-600/20 border border-red-500/35 rounded-full px-2 py-0.5 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="text-[9px] font-black text-red-400">AO VIVO</span>
              {(match.minute ?? 0) > 0 && <span className="text-[9px] text-red-300 font-bold">{match.minute}'</span>}
            </div>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0"
          >
            <X size={15} className="text-zinc-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto scrollbar-hide flex-shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all ${
                activeTab === t.id
                  ? "bg-red-600/20 border-red-500/40 text-red-300"
                  : "bg-zinc-800/60 border-zinc-700/50 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="h-px bg-zinc-800 flex-shrink-0 mx-4" />

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-3" style={{ overscrollBehavior: "contain" }}>

          {/* ── 1X2 ── */}
          {activeTab === "resultado" && (
            <div>
              {odds && (
                <>
                  <SLabel>RESULTADO FINAL</SLabel>
                  <MRow items={[
                    { k: "r:home", label: match.home, odd: odds.home },
                    { k: "r:draw", label: "Empate", odd: odds.draw },
                    { k: "r:away", label: match.away, odd: odds.away },
                  ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "resultado")} />
                </>
              )}
              {mk.halfTime && (mk.halfTime.home > 1.001 || mk.halfTime.draw > 1.001) && (
                <>
                  <SLabel>INTERVALO</SLabel>
                  <MRow items={[
                    { k: "ht:home", label: match.home, odd: mk.halfTime.home },
                    { k: "ht:draw", label: "Empate", odd: mk.halfTime.draw },
                    { k: "ht:away", label: match.away, odd: mk.halfTime.away },
                  ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "intervalo")} />
                </>
              )}
              {mk.secondHalf && mk.secondHalf.home > 1.001 && (
                <>
                  <SLabel>2ª PARTE</SLabel>
                  <MRow items={[
                    { k: "sh:home", label: match.home, odd: mk.secondHalf.home },
                    { k: "sh:draw", label: "Empate", odd: mk.secondHalf.draw },
                    { k: "sh:away", label: match.away, odd: mk.secondHalf.away },
                  ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "2a-parte")} />
                </>
              )}
              {mk.drawNoBet && mk.drawNoBet.home > 1.001 && (
                <>
                  <SLabel>DRAW NO BET</SLabel>
                  <MRow items={[
                    { k: "dnb:home", label: match.home, odd: mk.drawNoBet.home },
                    { k: "dnb:away", label: match.away, odd: mk.drawNoBet.away },
                  ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "draw-no-bet")} />
                </>
              )}
              {mk.htft && Object.values(mk.htft).some(v => (v ?? 0) > 1.001) && (
                <>
                  <SLabel>INTERVALO / FINAL</SLabel>
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
                        className={`flex flex-col items-center py-2 px-1 rounded-xl border text-center transition-all ${ak === k ? "border-red-500 bg-red-600/15 ring-1 ring-red-400/30" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"}`}>
                        <span className="text-[9px] text-zinc-500 mb-1 leading-tight">{l}</span>
                        <span className={`text-sm font-black tabular-nums ${ak === k ? "text-red-400" : "text-white"}`}>{v!.toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Dupla Chance ── */}
          {activeTab === "dupla" && mk.doubleChance && (
            <div>
              <SLabel>DUPLA CHANCE</SLabel>
              <MRow items={[
                { k: "dc:hd", label: `${match.home} ou Empate`, odd: mk.doubleChance.homeOrDraw },
                { k: "dc:ad", label: `${match.away} ou Empate`, odd: mk.doubleChance.awayOrDraw },
                { k: "dc:ha", label: `${match.home} ou ${match.away}`, odd: mk.doubleChance.homeOrAway },
              ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "dupla-chance")} />
            </div>
          )}

          {/* ── Golos ── */}
          {activeTab === "golos" && (
            <div>
              {mk.totalGoals && (
                <>
                  <SLabel>TOTAL DE GOLOS</SLabel>
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
                      ]} activeKey={ak} onBet={(k, l, v) => bet(k, l, v, "golos")} />
                    ))}
                </>
              )}
              {mk.bothTeamsScore && mk.bothTeamsScore.yes > 1.001 && (
                <>
                  <SLabel>AMBAS MARCAM</SLabel>
                  <MRow items={[
                    { k: "bts:y", label: "Sim", odd: mk.bothTeamsScore.yes },
                    { k: "bts:n", label: "Não", odd: mk.bothTeamsScore.no },
                  ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "ambas-marcam")} />
                </>
              )}
              {mk.btts1H && mk.btts1H.yes > 1.001 && (
                <>
                  <SLabel>AMBAS MARCAM — 1ª PARTE</SLabel>
                  <MRow items={[
                    { k: "bts1h:y", label: "Sim", odd: mk.btts1H.yes },
                    { k: "bts1h:n", label: "Não", odd: mk.btts1H.no },
                  ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "ambas-1h")} />
                </>
              )}
              {mk.btts2H && mk.btts2H.yes > 1.001 && (
                <>
                  <SLabel>AMBAS MARCAM — 2ª PARTE</SLabel>
                  <MRow items={[
                    { k: "bts2h:y", label: "Sim", odd: mk.btts2H.yes },
                    { k: "bts2h:n", label: "Não", odd: mk.btts2H.no },
                  ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "ambas-2h")} />
                </>
              )}
              {mk.exactGoals && Object.values(mk.exactGoals).some(v => (v ?? 0) > 1.001) && (
                <>
                  <SLabel>GOLOS EXACTOS</SLabel>
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
                        className={`flex flex-col items-center py-2 rounded-xl border transition-all ${ak === k ? "border-red-500 bg-red-600/15" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"}`}>
                        <span className="text-[10px] text-zinc-500 mb-1">{l}</span>
                        <span className={`text-sm font-black tabular-nums ${ak === k ? "text-red-400" : "text-white"}`}>{v!.toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {mk.goalOddEven && mk.goalOddEven.odd > 1.001 && (
                <>
                  <SLabel>PAR / ÍMPAR</SLabel>
                  <MRow items={[
                    { k: "goe:o", label: "Ímpar", odd: mk.goalOddEven.odd },
                    { k: "goe:e", label: "Par", odd: mk.goalOddEven.even },
                  ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "par-impar")} />
                </>
              )}
              {mk.teamGoals && (mk.teamGoals.homeOver05 ?? 0) > 1.001 && (
                <>
                  <SLabel>GOLOS {match.home.toUpperCase()}</SLabel>
                  {([ ["0.5", mk.teamGoals.homeOver05, mk.teamGoals.homeUnder05], ["1.5", mk.teamGoals.homeOver15, mk.teamGoals.homeUnder15], ["2.5", mk.teamGoals.homeOver25, mk.teamGoals.homeUnder25] ] as [string, number | undefined, number | undefined][]).filter(([, o]) => (o ?? 0) > 1.001).map(([line, o, u]) => (
                    <MRow key={`htg${line}`} items={[{ k: `htg:o${line}`, label: `Acima ${line}`, odd: o ?? 0 }, { k: `htg:u${line}`, label: `Abaixo ${line}`, odd: u ?? 0 }]} activeKey={ak} onBet={(k, l, v) => bet(k, l, v, "golos-equipa")} />
                  ))}
                </>
              )}
              {mk.teamGoals && (mk.teamGoals.awayOver05 ?? 0) > 1.001 && (
                <>
                  <SLabel>GOLOS {match.away.toUpperCase()}</SLabel>
                  {([ ["0.5", mk.teamGoals.awayOver05, mk.teamGoals.awayUnder05], ["1.5", mk.teamGoals.awayOver15, mk.teamGoals.awayUnder15], ["2.5", mk.teamGoals.awayOver25, mk.teamGoals.awayUnder25] ] as [string, number | undefined, number | undefined][]).filter(([, o]) => (o ?? 0) > 1.001).map(([line, o, u]) => (
                    <MRow key={`atg${line}`} items={[{ k: `atg:o${line}`, label: `Acima ${line}`, odd: o ?? 0 }, { k: `atg:u${line}`, label: `Abaixo ${line}`, odd: u ?? 0 }]} activeKey={ak} onBet={(k, l, v) => bet(k, l, v, "golos-equipa")} />
                  ))}
                </>
              )}
            </div>
          )}

          {/* ── Handicap ── */}
          {activeTab === "handicap" && (
            <div>
              {mk.handicap && (mk.handicap.homeMinusOne ?? 0) > 1.001 && (
                <>
                  <SLabel>HANDICAP EUROPEU</SLabel>
                  <MRow items={[
                    { k: "hcp:-1", label: `${match.home} −1`, odd: mk.handicap.homeMinusOne ?? 0 },
                    { k: "hcp:+1", label: `${match.away} +1`, odd: mk.handicap.awayPlusOne ?? 0 },
                  ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "handicap")} />
                  {(mk.handicap.homeMinusOneHalf ?? 0) > 1.001 && (
                    <MRow items={[
                      { k: "hcp:-1.5", label: `${match.home} −1.5`, odd: mk.handicap.homeMinusOneHalf ?? 0 },
                      { k: "hcp:+1.5", label: `${match.away} +1.5`, odd: mk.handicap.awayPlusOneHalf ?? 0 },
                    ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "handicap")} />
                  )}
                </>
              )}
              {mk.asianHandicap && mk.asianHandicap.home > 1.001 && (
                <>
                  <SLabel>HANDICAP ASIÁTICO {mk.asianHandicap.line > 0 ? `+${mk.asianHandicap.line}` : mk.asianHandicap.line}</SLabel>
                  <MRow items={[
                    { k: "ah:home", label: match.home, odd: mk.asianHandicap.home },
                    { k: "ah:away", label: match.away, odd: mk.asianHandicap.away },
                  ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "handicap-asiatico")} />
                </>
              )}
              {mk.toWinBothHalves && mk.toWinBothHalves.home > 1.001 && (
                <>
                  <SLabel>GANHAR AS DUAS PARTES</SLabel>
                  <MRow items={[
                    { k: "twbh:h", label: match.home, odd: mk.toWinBothHalves.home },
                    { k: "twbh:a", label: match.away, odd: mk.toWinBothHalves.away },
                  ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "ganhar-2-partes")} />
                </>
              )}
              {mk.highestScoringHalf && mk.highestScoringHalf.first > 1.001 && (
                <>
                  <SLabel>PARTE COM MAIS GOLOS</SLabel>
                  <MRow items={[
                    { k: "hsh:1", label: "1ª Parte", odd: mk.highestScoringHalf.first },
                    { k: "hsh:eq", label: "Iguais", odd: mk.highestScoringHalf.equal },
                    { k: "hsh:2", label: "2ª Parte", odd: mk.highestScoringHalf.second },
                  ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "parte-mais-golos")} />
                </>
              )}
            </div>
          )}

          {/* ── Marcador ── */}
          {activeTab === "marcador" && mk.correctScore && (
            <div>
              <SLabel>MARCADOR CORRECTO</SLabel>
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
                      className={`flex flex-col items-center py-2 rounded-xl border transition-all ${ak === `cs:${score}` ? "border-red-500 bg-red-600/15" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"}`}>
                      <span className="text-xs font-black text-zinc-300">{score}</span>
                      <span className={`text-sm font-black tabular-nums mt-0.5 ${ak === `cs:${score}` ? "text-red-400" : "text-white"}`}>{odd.toFixed(2)}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* ── Especiais ── */}
          {activeTab === "especiais" && (
            <div>
              {mk.firstGoal && mk.firstGoal.home > 1.001 && (
                <>
                  <SLabel>1º GOLO</SLabel>
                  <MRow items={[
                    { k: "fg:h", label: match.home, odd: mk.firstGoal.home },
                    { k: "fg:no", label: "Sem Golos", odd: mk.firstGoal.noGoal },
                    { k: "fg:a", label: match.away, odd: mk.firstGoal.away },
                  ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "1o-golo")} />
                </>
              )}
              {mk.winToNil && mk.winToNil.home > 1.001 && (
                <>
                  <SLabel>GANHAR SEM SOFRER</SLabel>
                  <MRow items={[
                    { k: "wtn:h", label: match.home, odd: mk.winToNil.home },
                    { k: "wtn:a", label: match.away, odd: mk.winToNil.away },
                  ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "win-to-nil")} />
                </>
              )}
              {mk.cleanSheet && mk.cleanSheet.home > 1.001 && (
                <>
                  <SLabel>CLEAN SHEET</SLabel>
                  <MRow items={[
                    { k: "csh:h", label: match.home, odd: mk.cleanSheet.home },
                    { k: "csh:a", label: match.away, odd: mk.cleanSheet.away },
                  ]} activeKey={ak} onBet={(k, l, o) => bet(k, l, o, "clean-sheet")} />
                </>
              )}
              {mk.corners && (mk.corners.o95 ?? 0) > 1.001 && (
                <>
                  <SLabel>CANTOS</SLabel>
                  {([
                    ["8.5", mk.corners.o85, mk.corners.u85],
                    ["9.5", mk.corners.o95, mk.corners.u95],
                    ["10.5", mk.corners.o105, mk.corners.u105],
                  ] as [string, number | undefined, number | undefined][]).filter(([, o]) => (o ?? 0) > 1.001).map(([line, o, u]) => (
                    <MRow key={`cn${line}`} items={[
                      { k: `cn:o${line}`, label: `Acima ${line}`, odd: o ?? 0 },
                      { k: `cn:u${line}`, label: `Abaixo ${line}`, odd: u ?? 0 },
                    ]} activeKey={ak} onBet={(k, l, v) => bet(k, l, v, "cantos")} />
                  ))}
                </>
              )}
            </div>
          )}

          {/* padding for safe area */}
          <div className="h-8" />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Group Card ───────────────────────────────────────────────────────────────

function GroupCard({ group, teams }: { group: string; teams: string[] }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/60"
        style={{ background: "linear-gradient(90deg,rgba(234,179,8,0.07) 0%,transparent 60%)" }}>
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center text-[11px] font-black text-black">
          {group}
        </div>
        <span className="text-[10px] font-black text-zinc-500 tracking-widest">GRUPO {group}</span>
      </div>
      <div className="divide-y divide-zinc-800/40">
        {teams.map(team => (
          <div key={team} className="flex items-center gap-2.5 px-3 py-2">
            <FlagImg name={team} size={22} />
            <span className="text-[11px] font-semibold text-zinc-300">{team}</span>
          </div>
        ))}
      </div>
    </div>
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // fetch
  useEffect(() => {
    async function load() {
      try {
        const [liveData, wcData] = await Promise.all([
          fetch("/api/matches/live", { signal: AbortSignal.timeout(12_000) }).then(r => r.ok ? r.json() : { matches: [] }).catch(() => ({ matches: [] })),
          fetch("/api/matches/wc2026", { signal: AbortSignal.timeout(28_000) }).then(r => r.ok ? r.json() : { matches: [] }).catch(() => ({ matches: [] })),
        ]);

        const live: WCMatch[] = ((liveData.matches ?? []) as Record<string, unknown>[])
          .filter(m => isWCLeague(String(m.league ?? "")))
          .map(mapToWCMatch);

        const liveIds = new Set(live.map(m => m.id));
        const upcoming: WCMatch[] = ((wcData.matches ?? []) as Record<string, unknown>[])
          .map(mapToWCMatch)
          .filter(m => !liveIds.has(m.id));

        setLiveMatches(live);
        setUpcomingMatches(upcoming);
        if (live.length > 0) setPageTab("live");
      } catch { /* silent */ }
      setLoading(false);
    }
    load();
    intervalRef.current = setInterval(load, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // keep open match in sync with refreshed data
  useEffect(() => {
    if (!openMatch) return;
    const updated = [...liveMatches, ...upcomingMatches].find(m => m.id === openMatch.id);
    if (updated) setOpenMatch(updated);
  }, [liveMatches, upcomingMatches]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBet = (matchId: string, k: string, label: string, odd: number, market: string) => {
    const fullKey = `${market}:${label}`;
    setActiveKeys(prev => {
      if (prev[matchId] === fullKey) {
        const n = { ...prev }; delete n[matchId]; return n;
      }
      return { ...prev, [matchId]: fullKey };
    });
    try {
      const bet = { matchId, home: openMatch?.home ?? "", away: openMatch?.away ?? "", selection: k, market, label, odd, sport: "football" };
      const cur = JSON.parse(localStorage.getItem("wc_pending_bet") ?? "null");
      if (cur?.matchId === matchId && cur?.selection === k) localStorage.removeItem("wc_pending_bet");
      else localStorage.setItem("wc_pending_bet", JSON.stringify(bet));
    } catch { /* silent */ }
  };

  const handleQuickBet = (k: string, label: string, odd: number) => {
    const [matchId] = k.split(":");
    if (!matchId) return;
    handleBet(matchId, k, label, odd, "resultado");
  };

  const liveCount     = liveMatches.length;
  const upcomingCount = upcomingMatches.length;

  const listForTab = pageTab === "live" ? liveMatches : upcomingMatches;

  return (
    <div className="min-h-[100dvh] bg-[#090909]">
      {/* ── Sticky Header (always visible on PWA) ── */}
      <div
        className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3"
        style={{ background: "rgba(9,9,9,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700/80 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
        >
          <ArrowLeft size={17} className="text-zinc-200" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-black text-yellow-500/70 tracking-[0.28em]">BET62 · ESPECIAL</div>
          <div className="text-base font-black text-white tracking-tight leading-tight">Copa do Mundo 2026</div>
        </div>
        {liveCount > 0 && (
          <div className="flex items-center gap-1 bg-red-600/15 border border-red-500/35 rounded-full px-2.5 py-1 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[9px] font-black text-red-400">{liveCount} AO VIVO</span>
          </div>
        )}
      </div>

      {/* ── Compact Hero ── */}
      <div className="mx-4 mt-3 mb-4 overflow-hidden rounded-2xl border border-zinc-800/60"
        style={{ background: "linear-gradient(135deg,#0f0010 0%,#1a0028 40%,#160015 100%)" }}>
        {/* top glow line */}
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
                : "bg-zinc-900/60 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
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

          {/* Ao Vivo / Próximos */}
          {(pageTab === "live" || pageTab === "upcoming") && (
            <motion.div key={pageTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {loading ? (
                <div className="flex justify-center py-16">
                  <div className="w-7 h-7 border-2 border-zinc-800 border-t-red-500 rounded-full animate-spin" />
                </div>
              ) : listForTab.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-5xl mb-3">{pageTab === "live" ? "⏰" : "📅"}</div>
                  <div className="text-zinc-400 font-bold text-sm">
                    {pageTab === "live" ? "Nenhum jogo ao vivo agora" : "Sem jogos disponíveis"}
                  </div>
                  <div className="text-zinc-600 text-xs mt-1.5">
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
                        activeSel={activeKeys[m.id] ? `${m.id}:${activeKeys[m.id]?.split(":")?.[0]}` : undefined}
                        onQuickBet={handleQuickBet}
                      />
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Grupos */}
          {pageTab === "groups" && (
            <motion.div key="groups" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-2 gap-3">
                {WC_GROUPS.map(g => <GroupCard key={g.group} group={g.group} teams={g.teams} />)}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Markets Drawer ── */}
      {openMatch && (
        <MarketsDrawer
          match={openMatch}
          activeKeys={activeKeys}
          onBet={handleBet}
          onClose={() => setOpenMatch(null)}
        />
      )}
    </div>
  );
}
