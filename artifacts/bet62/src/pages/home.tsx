import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Menu, X, Trophy, Activity, Gift,
  LogOut, User, History, Loader2, Zap, TrendingUp, TrendingDown,
  ChevronRight, AlertCircle, BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";

import arsenalBanner from "@assets/file_1778342439847_1778342557288.jpeg";
import manCityBanner from "@assets/file_1778342444770_1778342557288.jpeg";
import manUnitedBanner from "@assets/file_1778342451290_1778342557288.jpeg";
import liverpoolBanner from "@assets/file_1778342461540_1778342557288.jpeg";
import astonVillaBanner from "@assets/file_1778342467588_1778342557288.jpeg";
import bournemouthBanner from "@assets/file_1778342474208_1778342557288.jpeg";
import brentfordBanner from "@assets/file_1778342479214_1778342557288.jpeg";
import brightonBanner from "@assets/file_1778342485511_1778342557288.jpeg";
import chelseaBanner from "@assets/file_1778342492556_1778342557288.jpeg";
import evertonBanner from "@assets/file_1778342400663_1778342557288.jpeg";
import realMadridBanner from "@assets/file_1778117934450_1778345179339.jpeg";
import barcelonaBanner from "@assets/file_1778117940012_1778345179339.jpeg";
import atleticoMadridBanner from "@assets/file_1778118038595_1778345179339.jpeg";
import athleticClubBanner from "@assets/file_1778118048280_1778345179339.jpeg";
import realSociedadBanner from "@assets/file_1778118054377_1778345179339.jpeg";
import sevillaBanner from "@assets/file_1778118059955_1778345179339.jpeg";
import valenciaBanner from "@assets/file_1778118068126_1778345179339.jpeg";
import villarrealBanner from "@assets/file_1778118074042_1778345179339.jpeg";
import realBetisBanner from "@assets/file_1778118081746_1778345179339.jpeg";
import gironaBanner from "@assets/file_1778118089289_1778345179339.jpeg";
import riverPlateBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836112512_1778361261646.png";
import bocaJuniorsBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836113093_1778361261646.png";
import racingClubBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836113846_1778361261645.png";
import independienteBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836114382_1778361261639.png";
import sanLorenzoBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836115074_1778361261636.png";
import velezBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836115686_1778361261636.png";
import estudiantesBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836116232_1778361261635.png";
import rosarioCentralBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836116875_1778361261635.png";
import talleresBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836117521_1778361261634.png";
import lanusBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836119764_1778361261633.png";

const TEAM_BANNERS: Record<string, string> = {
  "Real Madrid": realMadridBanner,
  "Barcelona": barcelonaBanner,
  "Atlético de Madrid": atleticoMadridBanner,
  "Atletico Madrid": atleticoMadridBanner,
  "Athletic Club": athleticClubBanner,
  "Athletic Bilbao": athleticClubBanner,
  "Ath Bilbao": athleticClubBanner,
  "Real Sociedad": realSociedadBanner,
  "Sevilla": sevillaBanner,
  "Valencia": valenciaBanner,
  "Villarreal": villarrealBanner,
  "Real Betis": realBetisBanner,
  "Betis": realBetisBanner,
  "Girona": gironaBanner,
  "Arsenal": arsenalBanner,
  "Man City": manCityBanner,
  "Manchester City": manCityBanner,
  "Man Utd": manUnitedBanner,
  "Manchester United": manUnitedBanner,
  "Liverpool": liverpoolBanner,
  "Aston Villa": astonVillaBanner,
  "Bournemouth": bournemouthBanner,
  "Brentford": brentfordBanner,
  "Brighton": brightonBanner,
  "Chelsea": chelseaBanner,
  "Everton": evertonBanner,
  "River Plate": riverPlateBanner,
  "Boca Juniors": bocaJuniorsBanner,
  "Racing Club": racingClubBanner,
  "Racing": racingClubBanner,
  "Independiente": independienteBanner,
  "San Lorenzo": sanLorenzoBanner,
  "Vélez Sarsfield": velezBanner,
  "Velez Sarsfield": velezBanner,
  "Vélez": velezBanner,
  "Velez": velezBanner,
  "Estudiantes": estudiantesBanner,
  "Estudiantes LP": estudiantesBanner,
  "Rosario Central": rosarioCentralBanner,
  "Lanús": lanusBanner,
  "Lanus": lanusBanner,
  "Talleres": talleresBanner,
  "Talleres Córdoba": talleresBanner,
};

const LEAGUE_FLAGS: Record<string, string> = {
  "La Liga": "🇪🇸", "Laliga": "🇪🇸", "Laliga2": "🇪🇸", "Segunda": "🇪🇸",
  "Premier League": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Championship": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "League One": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Champions League": "⭐", "UEFA Champions League": "⭐", "Europa League": "🌟",
  "Serie A": "🇮🇹", "Serie B": "🇮🇹",
  "Bundesliga": "🇩🇪", "2. Bundesliga": "🇩🇪",
  "Ligue 1": "🇫🇷", "Ligue 2": "🇫🇷",
  "Liga Portugal": "🇵🇹", "Primeira Liga": "🇵🇹", "Segunda Liga": "🇵🇹",
  "Eredivisie": "🇳🇱",
  "Brasileirao": "🇧🇷", "Serie A Brasil": "🇧🇷", "Brasileirão": "🇧🇷",
  "Liga Argentina": "🇦🇷", "Primera Division": "🇦🇷",
  "MLS": "🇺🇸",
};

const TEAM_COUNTRY: Record<string, string> = {
  "Real Madrid": "spain", "Barcelona": "spain", "Atlético de Madrid": "spain",
  "Atletico Madrid": "spain", "Athletic Club": "spain", "Athletic Bilbao": "spain",
  "Ath Bilbao": "spain", "Real Sociedad": "spain", "Sevilla": "spain",
  "Valencia": "spain", "Villarreal": "spain", "Real Betis": "spain",
  "Betis": "spain", "Girona": "spain", "Mallorca": "spain", "Getafe": "spain",
  "Oviedo": "spain", "Leganes": "spain", "Andorra": "spain", "Osasuna": "spain",
  "Celta Vigo": "spain", "Deportivo Alaves": "spain", "Las Palmas": "spain",
  "Rayo Vallecano": "spain", "Espanyol": "spain", "Valladolid": "spain",
  "Arsenal": "england", "Man City": "england", "Manchester City": "england",
  "Man Utd": "england", "Manchester United": "england", "Liverpool": "england",
  "Aston Villa": "england", "Bournemouth": "england", "Brentford": "england",
  "Brighton": "england", "Chelsea": "england", "Everton": "england",
  "Tottenham": "england", "Newcastle": "england", "West Ham": "england",
  "Wolves": "england", "Crystal Palace": "england", "Fulham": "england",
  "Nottingham Forest": "england", "Burnley": "england", "Sheffield Utd": "england",
  "Luton": "england", "Leicester": "england", "Ipswich": "england",
  "River Plate": "argentina", "Boca Juniors": "argentina", "Racing Club": "argentina",
  "Independiente": "argentina", "San Lorenzo": "argentina",
  "Vélez Sarsfield": "argentina", "Velez Sarsfield": "argentina",
  "Vélez": "argentina", "Velez": "argentina", "Estudiantes": "argentina",
  "Estudiantes LP": "argentina", "Rosario Central": "argentina",
  "Lanús": "argentina", "Lanus": "argentina", "Talleres": "argentina",
  "Talleres Córdoba": "argentina",
};

function getTeamBanner(teamName: string, country?: string): string | undefined {
  const banner = TEAM_BANNERS[teamName];
  if (!banner) return undefined;
  const expectedCountry = TEAM_COUNTRY[teamName];
  if (!expectedCountry || !country) return banner;
  return expectedCountry === country.toLowerCase() ? banner : undefined;
}

const COUNTRY_FLAGS: Record<string, string> = {
  england: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", wales: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  spain: "🇪🇸", germany: "🇩🇪", italy: "🇮🇹", france: "🇫🇷",
  portugal: "🇵🇹", netherlands: "🇳🇱", belgium: "🇧🇪", turkey: "🇹🇷",
  greece: "🇬🇷", austria: "🇦🇹", switzerland: "🇨🇭", russia: "🇷🇺",
  ukraine: "🇺🇦", poland: "🇵🇱", czechia: "🇨🇿", denmark: "🇩🇰",
  sweden: "🇸🇪", norway: "🇳🇴", croatia: "🇭🇷", serbia: "🇷🇸",
  romania: "🇷🇴", hungary: "🇭🇺", slovakia: "🇸🇰", bulgaria: "🇧🇬",
  slovenia: "🇸🇮", finland: "🇫🇮", israel: "🇮🇱", cyprus: "🇨🇾",
  albania: "🇦🇱", moldova: "🇲🇩", ireland: "🇮🇪", luxembourg: "🇱🇺",
  latvia: "🇱🇻", estonia: "🇪🇪", lithuania: "🇱🇹", bosnia: "🇧🇦",
  montenegro: "🇲🇪", kosovo: "🇽🇰", iceland: "🇮🇸", malta: "🇲🇹",
  georgia: "🇬🇪", armenia: "🇦🇲", azerbaijan: "🇦🇿",
  brazil: "🇧🇷", argentina: "🇦🇷", chile: "🇨🇱", colombia: "🇨🇴",
  uruguay: "🇺🇾", mexico: "🇲🇽", usa: "🇺🇸", japan: "🇯🇵",
  china: "🇨🇳", australia: "🇦🇺", africa: "🌍", europe: "🌍",
  world: "🌐",
};

function formatMatchDate(dateStr: string): string {
  const parts = dateStr.split(".");
  if (parts.length !== 3) return dateStr;
  const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

const RIVALRY_TAGS: Record<string, string> = {
  "Barcelona|Real Madrid": "⚡ El Clásico",
  "Real Madrid|Barcelona": "⚡ El Clásico",
  "Atletico Madrid|Real Madrid": "🔥 Derby de Madrid",
  "Real Madrid|Atletico Madrid": "🔥 Derby de Madrid",
  "Atletico Madrid|Barcelona": "🔥 Clásico Español",
  "Barcelona|Atletico Madrid": "🔥 Clásico Español",
  "Real Betis|Sevilla": "🔥 Derbi Sevillano",
  "Sevilla|Real Betis": "🔥 Derbi Sevillano",
  "Betis|Sevilla": "🔥 Derbi Sevillano",
  "Sevilla|Betis": "🔥 Derbi Sevillano",
  "Ath Bilbao|Real Sociedad": "🔥 Derbi Vasco",
  "Real Sociedad|Ath Bilbao": "🔥 Derbi Vasco",
  "Athletic Club|Real Sociedad": "🔥 Derbi Vasco",
  "Real Sociedad|Athletic Club": "🔥 Derbi Vasco",
  "Manchester City|Manchester United": "🔥 Manchester Derby",
  "Manchester United|Manchester City": "🔥 Manchester Derby",
  "Man City|Man Utd": "🔥 Manchester Derby",
  "Man Utd|Man City": "🔥 Manchester Derby",
  "Liverpool|Everton": "🔥 Merseyside Derby",
  "Everton|Liverpool": "🔥 Merseyside Derby",
  "Arsenal|Chelsea": "🔥 London Derby",
  "Chelsea|Arsenal": "🔥 London Derby",
  "Arsenal|Tottenham": "⚡ North London Derby",
  "Tottenham|Arsenal": "⚡ North London Derby",
  "Chelsea|Tottenham": "🔥 London Derby",
  "Tottenham|Chelsea": "🔥 London Derby",
  "Boca Juniors|River Plate": "⚡ Superclásico",
  "River Plate|Boca Juniors": "⚡ Superclásico",
  "AC Milan|Internazionale": "⚡ Derby della Madonnina",
  "Internazionale|AC Milan": "⚡ Derby della Madonnina",
  "Roma|Lazio": "⚡ Derby della Capitale",
  "Lazio|Roma": "⚡ Derby della Capitale",
  "Bayern Munich|Dortmund": "⚡ Der Klassiker",
  "Dortmund|Bayern Munich": "⚡ Der Klassiker",
  "PSG|Marseille": "⚡ Le Classique",
  "Marseille|PSG": "⚡ Le Classique",
  "Ajax|PSV": "🔥 De Topper",
  "PSV|Ajax": "🔥 De Topper",
  "Benfica|Porto": "⚡ O Clássico",
  "Porto|Benfica": "⚡ O Clássico",
  "Benfica|Sporting CP": "🔥 Derby de Lisboa",
  "Sporting CP|Benfica": "🔥 Derby de Lisboa",
};

// --- Types ---
type Odds = { home: number; draw: number; away: number };
type AdvancedMarkets = {
  doubleChance: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  bothTeamsScore: { yes: number; no: number };
  totalGoals: { over15: number; under15: number; over25: number; under25: number; over35: number; under35: number };
  handicap: { homeMinusOne: number; awayPlusOne: number; homeMinusOneHalf: number; awayPlusOneHalf: number };
  halfTime: { home: number; draw: number; away: number };
  firstGoal: { home: number; noGoal: number; away: number };
  _spread?: number;
  _total?: number;
  _total1H?: number;
  _spreadLine?: number;
};

type Match = {
  id: string | number;
  home: string;
  away: string;
  league: string;
  country?: string;
  time?: string;
  date?: string;
  sport?: string;
  hasRealOdds?: boolean;
  odds: Odds;
  isLive?: boolean;
  homeScore?: number;
  awayScore?: number;
  minute?: number;
  markets?: AdvancedMarkets;
  events?: Array<{ type: string; team: string; minute: number; player: string }>;
};

type BetSelection = {
  matchId: string | number;
  matchTitle: string;
  selection: string;
  odd: number;
  market?: string;
  label?: string;
};

type UserBet = {
  id: number;
  matchTitle: string;
  selections: unknown;
  stake: string;
  potentialWin: string;
  totalOdds: string;
  status: string;
  createdAt: string;
};

type PlatformStats = {
  totalUsers: number;
  totalBets: number;
  totalWon: number;
  totalPaidOut: number;
};

type FormEntry = { result: "W" | "D" | "L"; score: string; opponent: string; home: boolean };
type MatchStatsData = {
  winProb: { home: number; draw: number; away: number };
  h2h: { homeWins: number; draws: number; awayWins: number };
  avgStats: {
    goalsScored: number; leagueGoals: number;
    over15: number; leagueOver15: number;
    over25: number; leagueOver25: number;
    cards: number; corners: number; btts: number; leagueBtts: number;
  };
  homeForm: FormEntry[];
  awayForm: FormEntry[];
};
type StandingRow = { pos: number; name: string; played: number; won: number; drawn: number; lost: number; gf: number; ga: number; pts: number };

function cpfMask(value: string) {
  return value
    .replace(/\D/g, "")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$2")
    .replace(/(-\d{2})\d+?$/, "$1");
}

const TennisBallIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="11" fill="#C8E600" />
    <path d="M3.5 8.5C6.5 8.5 8.5 6.5 8.5 3.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    <path d="M20.5 8.5C17.5 8.5 15.5 6.5 15.5 3.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    <path d="M3.5 15.5C6.5 15.5 8.5 17.5 8.5 20.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    <path d="M20.5 15.5C17.5 15.5 15.5 17.5 15.5 20.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
  </svg>
);

function seededRng(seed: number) {
  return (n: number) => {
    const x = Math.sin(seed * 9301 + n * 49297 + 233) * 10000;
    return x - Math.floor(x);
  };
}

function MomentumChart({ match }: { match: { id: string | number; home: string; away: string; homeScore?: number; awayScore?: number; minute?: number; events?: Array<{ type: string; team: string; minute: number; player: string }> } }) {
  const minute = match.minute ?? 0;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1800);
    return () => clearInterval(interval);
  }, []);

  const seedNum = parseInt(String(match.id).replace(/\D/g, "").slice(0, 7) || "1234567", 10);
  const rng = seededRng(seedNum);

  const totalBars = Math.max(4, Math.ceil((minute || 1) / 2));
  const bars = Array.from({ length: totalBars }, (_, i) => {
    const t = (i + 1) * 2;
    const isHalf = t >= 44 && t <= 46;
    const homeScore = match.homeScore ?? 0;
    const awayScore = match.awayScore ?? 0;
    const scoreBias = (homeScore - awayScore) * 0.06;
    const homeBase = rng(i * 4) * 0.7 + 0.15 + scoreBias;
    const awayBase = rng(i * 4 + 1) * 0.7 + 0.15 - scoreBias;
    const isLast = i === totalBars - 1;
    const pulse = isLast && tick % 3 === 0 ? 0.75 : 1;
    return {
      t,
      isHalf,
      home: isHalf ? 0.08 : Math.min(0.95, Math.max(0.08, homeBase)) * pulse,
      away: isHalf ? 0.08 : Math.min(0.95, Math.max(0.08, awayBase)) * pulse,
    };
  });

  const isHT = minute === 45;
  const events = match.events ?? [];

  const eventIcon = (type: string) =>
    type === "goal" ? "⚽" : type === "yellow_card" ? "🟨" : type === "red_card" ? "🟥" : "⚡";

  return (
    <div className="space-y-4">
      <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Pressão em Tempo Real</div>

      {/* Legend */}
      <div className="flex justify-between text-xs font-bold">
        <span className="text-red-400">{match.home}</span>
        <span className="text-[10px] text-zinc-600 font-normal">{minute}'</span>
        <span className="text-green-400">{match.away}</span>
      </div>

      {/* Chart */}
      <div className="relative h-36">
        {/* Center axis */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-zinc-700" />
        {/* Phase labels */}
        <div className="absolute left-0 top-1/2 -translate-y-3 text-[9px] text-zinc-600">1º Tempo</div>
        {minute > 46 && (
          <div className="absolute right-0 top-1/2 -translate-y-3 text-[9px] text-zinc-600">2º Tempo</div>
        )}

        <div className="flex h-full items-stretch gap-px overflow-hidden">
          {bars.map((bar, i) => (
            <div key={i} className="flex-1 flex flex-col items-center min-w-0">
              {/* Home bar (top half) */}
              <div className="flex-1 flex items-end justify-center w-full pb-px">
                <motion.div
                  animate={{ height: `${Math.round(bar.home * 100)}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  style={{ width: "70%" }}
                  className={`rounded-t-sm ${bar.isHalf ? "bg-zinc-700/50" : "bg-red-500"}`}
                />
              </div>
              {/* Away bar (bottom half) */}
              <div className="flex-1 flex items-start justify-center w-full pt-px">
                <motion.div
                  animate={{ height: `${Math.round(bar.away * 100)}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  style={{ width: "70%" }}
                  className={`rounded-b-sm ${bar.isHalf ? "bg-zinc-700/50" : "bg-green-500"}`}
                />
              </div>
            </div>
          ))}
        </div>

        {/* HT overlay */}
        {isHT && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-yellow-400 text-sm font-black animate-pulse bg-zinc-900/90 px-3 py-1 rounded border border-yellow-500/30">
              ● INTERVALO
            </span>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="flex justify-between text-[10px] text-zinc-600 -mt-2">
        <span>0'</span>
        {minute > 45 && <span className="text-zinc-500 font-bold">HT</span>}
        <span>{minute > 0 ? `${minute}'` : "90'"}</span>
      </div>

      {/* Legend colors */}
      <div className="flex gap-4 text-[11px]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2.5 bg-red-500 rounded-sm" />
          <span className="text-zinc-400">Ataque {match.home.split(" ")[0]}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2.5 bg-green-500 rounded-sm" />
          <span className="text-zinc-400">Ataque {match.away.split(" ")[0]}</span>
        </div>
      </div>

      {/* Events */}
      {events.length > 0 && (
        <div className="border-t border-zinc-800 pt-3">
          <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Eventos da Partida</div>
          <div className="space-y-1.5">
            {events.map((ev, i) => (
              <div key={i} className="flex items-center gap-2.5 text-xs">
                <span className="text-base leading-none shrink-0">{eventIcon(ev.type)}</span>
                <span className="text-zinc-500 shrink-0 w-7 text-right font-mono">{ev.minute}'</span>
                <span className={`font-bold shrink-0 text-[11px] ${ev.team === "home" ? "text-red-400" : "text-green-400"}`}>
                  {ev.team === "home" ? match.home.split(" ")[0] : match.away.split(" ")[0]}
                </span>
                <span className="text-zinc-400 truncate">{ev.player}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {events.length === 0 && (
        <div className="text-center text-zinc-600 text-xs py-1">
          Nenhum evento registado neste momento.
        </div>
      )}
    </div>
  );
}

function phoneMask(value: string) {
  return value
    .replace(/\D/g, "")
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2")
    .replace(/(-\d{4})\d+?$/, "$1");
}

export default function Home() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<"sports" | "live" | "promos" | "mybets">("sports");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bets, setBets] = useState<BetSelection[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [expandedMatch, setExpandedMatch] = useState<Match | null>(null);
  const [betSlipOpenMobile, setBetSlipOpenMobile] = useState(false);
  const [isPlacingBet, setIsPlacingBet] = useState(false);

  // Auth form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regCpf, setRegCpf] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regDob, setRegDob] = useState("");
  const [regTerms, setRegTerms] = useState(false);
  const [regAge, setRegAge] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // My bets
  const [myBets, setMyBets] = useState<UserBet[]>([]);
  const [myBetsLoading, setMyBetsLoading] = useState(false);
  const [cashingOut, setCashingOut] = useState<number | null>(null);
  const [cashoutConfirm, setCashoutConfirm] = useState<UserBet | null>(null);

  // Live matches
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const prevLiveOdds = useRef<Record<string, Odds>>({});
  // Live minute ticker — interpolates clock between API refreshes
  const liveDataFetchedAt = useRef(0);
  const apiMinutesRef = useRef<Record<string, number>>({});
  const seenMatchIds = useRef(new Set<string>());
  const [, setMinuteTick] = useState(0);

  // Upcoming matches
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [selectedSport, setSelectedSport] = useState<string>("all");

  // Platform stats for hero
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);

  // Match detail view tab: "markets" | "stats" | "standings" | "live"
  const [matchViewTab, setMatchViewTab] = useState<"markets" | "stats" | "standings" | "live">("markets");
  const [matchStats, setMatchStats] = useState<MatchStatsData | null>(null);
  const [matchStatsLoading, setMatchStatsLoading] = useState(false);
  const [standings, setStandings] = useState<StandingRow[] | null>(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsLeague, setStandingsLeague] = useState("");

  // Minute ticker — ticks every 30s so displayed clock interpolates between API calls
  useEffect(() => {
    const interval = setInterval(() => setMinuteTick(t => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Compute displayed minute for a live match (local interpolation between API refreshes)
  const getDisplayMinute = (match: Match): number => {
    const apiMin = apiMinutesRef.current[String(match.id)] ?? match.minute ?? 0;
    const fetchedAt = liveDataFetchedAt.current;
    if (fetchedAt === 0 || apiMin === 45 || apiMin === 90) return apiMin;
    const elapsed = Math.floor((Date.now() - fetchedAt) / 60000);
    const computed = apiMin + elapsed;
    if (apiMin < 45) return Math.min(45, computed);
    return Math.min(90, computed);
  };

  // Sync expandedMatch with live data silently (score/odds update without closing panel)
  useEffect(() => {
    if (!expandedMatch?.isLive) return;
    const updated = liveMatches.find(m => String(m.id) === String(expandedMatch.id));
    if (updated) setExpandedMatch({ ...updated });
  }, [liveMatches]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear seenMatchIds when leaving live tab so new entries animate on return
  useEffect(() => {
    if (activeTab !== "live") seenMatchIds.current.clear();
  }, [activeTab]);

  // Reset match view state when expanded match changes
  useEffect(() => {
    setMatchViewTab("markets");
    setMatchStats(null);
    setStandings(null);
    setStandingsLeague("");
  }, [expandedMatch?.id]);

  // Fetch match stats when stats tab is active
  useEffect(() => {
    if (matchViewTab !== "stats" || !expandedMatch || matchStats) return;
    setMatchStatsLoading(true);
    const p = new URLSearchParams({
      home: expandedMatch.home,
      away: expandedMatch.away,
      homeOdd: String(expandedMatch.odds.home),
      drawOdd: String(expandedMatch.odds.draw),
      awayOdd: String(expandedMatch.odds.away),
    });
    fetch(`/api/matches/stats?${p}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMatchStats(d as MatchStatsData); })
      .catch(() => {})
      .finally(() => setMatchStatsLoading(false));
  }, [matchViewTab, expandedMatch?.id]);

  // Fetch standings when standings tab is active
  useEffect(() => {
    if (matchViewTab !== "standings" || !expandedMatch || standings) return;
    setStandingsLoading(true);
    const league = expandedMatch.league ?? "";
    setStandingsLeague(league);
    fetch(`/api/matches/standings?league=${encodeURIComponent(league)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && Array.isArray(d.teams)) {
          setStandingsLeague(d.league ?? league);
          setStandings(d.teams as StandingRow[]);
        }
      })
      .catch(() => {})
      .finally(() => setStandingsLoading(false));
  }, [matchViewTab, expandedMatch?.id]);

  // Fetch platform stats on mount
  useEffect(() => {
    fetch("/api/stats")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPlatformStats(d); })
      .catch(() => { /* non-critical */ });
  }, []);

  // Fetch upcoming matches when sport changes
  useEffect(() => {
    setUpcomingLoading(true);
    const param = selectedSport === "all" ? "" : `?sport=${selectedSport}`;
    fetch(`/api/matches/upcoming${param}`)
      .then(r => r.ok ? r.json() : { matches: [] })
      .then(data => {
        const matches = (data.matches || []) as Array<{
          id: string; home: string; away: string; league: string; country?: string;
          time?: string; date?: string; sport?: string; hasRealOdds?: boolean; odds: Odds; markets?: AdvancedMarkets;
        }>;
        setUpcomingMatches(matches.map(m => ({ ...m, isLive: false })));
      })
      .catch(() => { /* keep empty */ })
      .finally(() => setUpcomingLoading(false));
  }, [selectedSport]);

  // WebSocket — real-time live match updates
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    let ws: WebSocket | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
        ws = new WebSocket(`${proto}//${window.location.host}/api/ws`);
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data as string);
            if (data.type === "live" && Array.isArray(data.matches)) {
              // Record API minutes for local ticker interpolation
              const newMins: Record<string, number> = {};
              for (const m of data.matches as Record<string, unknown>[]) {
                newMins[String(m["id"])] = (m["minute"] as number) ?? 0;
              }
              apiMinutesRef.current = newMins;
              liveDataFetchedAt.current = Date.now();
              // Merge silently — preserve prevLiveOdds for trend arrows
              setLiveMatches(prev => {
                const newPrev: Record<string, Odds> = {};
                for (const m of prev) newPrev[String(m.id)] = m.odds;
                prevLiveOdds.current = newPrev;
                return (data.matches as Record<string, unknown>[]).map(m => ({ ...m, isLive: true } as unknown as Match));
              });
            }
          } catch { /* ignore parse errors */ }
        };
        ws.onclose = () => {
          retryTimeout = setTimeout(connect, 10000);
        };
      } catch { /* ignore connection errors */ }
    };

    connect();
    return () => {
      clearTimeout(retryTimeout);
      ws?.close();
    };
  }, []);

  // Fetch live matches — polls every 30s while on live tab
  const fetchLive = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLiveLoading(true);
    try {
      const res = await fetch("/api/matches/live");
      if (res.ok) {
        const data = await res.json();
        const matches = (data.matches || []) as Array<{
          id: string; home: string; away: string; league: string;
          homeScore: number; awayScore: number; minute: number;
          hasRealOdds?: boolean; odds: Odds; markets?: AdvancedMarkets;
          events?: Array<{ type: string; team: string; minute: number; player: string }>;
        }>;
        // Record API minutes for local ticker interpolation
        const newMins: Record<string, number> = {};
        for (const m of matches) newMins[String(m.id)] = m.minute;
        apiMinutesRef.current = newMins;
        liveDataFetchedAt.current = Date.now();
        // Merge silently — preserve prevLiveOdds for trend arrows
        setLiveMatches(prev => {
          const newPrev: Record<string, Odds> = {};
          for (const m of prev) newPrev[String(m.id)] = m.odds;
          prevLiveOdds.current = newPrev;
          return matches.map(m => ({ ...m, isLive: true }));
        });
      }
    } catch {
      /* keep stale */
    } finally {
      if (showSpinner) setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "live") {
      fetchLive(true);
      const interval = setInterval(() => fetchLive(false), 30000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [activeTab, fetchLive]);

  const fetchMyBets = useCallback(async () => {
    if (!auth.token) return;
    setMyBetsLoading(true);
    try {
      const res = await fetch("/api/bets/my", {
        headers: { Authorization: `Bearer ${auth.token}` }
      });
      if (res.ok) setMyBets(await res.json());
    } catch {
      toast.error("Erro ao carregar apostas");
    } finally {
      setMyBetsLoading(false);
    }
  }, [auth.token]);

  const handleCashout = async (bet: UserBet) => {
    setCashingOut(bet.id);
    try {
      const res = await fetch(`/api/bets/${bet.id}/cashout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.token}` }
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erro ao fazer cash out"); return; }
      toast.success(`Cash Out realizado! R$ ${parseFloat(data.cashoutValue).toFixed(2)} adicionado ao seu saldo.`);
      auth.refreshUser();
      fetchMyBets();
    } catch {
      toast.error("Erro ao fazer cash out");
    } finally {
      setCashingOut(null);
      setCashoutConfirm(null);
    }
  };

  const toggleBet = (match: Match, selection: string, odd: number, market = "result", label?: string) => {
    setBets(prev => {
      const existing = prev.find(b => b.matchId === match.id && b.market === market && b.selection === selection);
      if (existing) {
        return prev.filter(b => !(b.matchId === match.id && b.market === market && b.selection === selection));
      }
      const filtered = market === "result"
        ? prev.filter(b => !(b.matchId === match.id && b.market === "result"))
        : prev;
      return [...filtered, {
        matchId: match.id,
        matchTitle: `${match.home} vs ${match.away}`,
        selection,
        odd,
        market,
        label: label || selection,
      }];
    });
  };

  const removeBet = (matchId: string | number, market: string, selection: string) => {
    setBets(prev => prev.filter(b => !(b.matchId === matchId && b.market === market && b.selection === selection)));
  };

  const totalOdds = bets.reduce((acc, bet) => acc * bet.odd, 1).toFixed(2);
  const [stake, setStake] = useState<string>("");

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      await auth.login(loginEmail, loginPassword);
      setAuthModalOpen(false);
      toast.success("Bem-vindo de volta!");
      setLoginEmail(""); setLoginPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao fazer login");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regDob) {
      const dob = new Date(regDob);
      const age = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (age < 18) { toast.error("Você precisa ter pelo menos 18 anos para se cadastrar."); return; }
    }
    if (!regTerms || !regAge) { toast.error("Você deve aceitar os termos e confirmar a sua idade."); return; }
    setAuthLoading(true);
    try {
      await auth.register(regName, regEmail, regPassword);
      setAuthModalOpen(false);
      toast.success("Conta criada com sucesso! Bônus de R$ 1.000 adicionado!");
      setRegName(""); setRegEmail(""); setRegPassword(""); setRegCpf(""); setRegPhone(""); setRegDob(""); setRegTerms(false); setRegAge(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar conta");
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePlaceBet = async () => {
    if (!stake) { toast.error("Insira um valor para apostar"); return; }
    if (!auth.user) { setAuthModalOpen(true); return; }
    const stakeNum = parseFloat(stake);
    if (stakeNum > parseFloat(auth.user.balance)) { toast.error("Saldo insuficiente"); return; }
    setIsPlacingBet(true);
    try {
      const matchId = bets.map(b => b.matchId).join("-");
      const matchTitle = bets.map(b => b.matchTitle).join(" + ");
      const potentialWin = (stakeNum * parseFloat(totalOdds)).toFixed(2);
      const res = await fetch("/api/bets/place", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({
          matchId,
          matchTitle,
          selections: bets.map(b => ({ matchTitle: b.matchTitle, selection: b.selection, odd: b.odd, market: b.market })),
          stake: stakeNum.toFixed(2),
          potentialWin,
          totalOdds,
        })
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erro ao realizar aposta"); return; }
      toast.success(`Aposta realizada! Potencial de ganho: R$ ${potentialWin}`);
      setBets([]);
      setStake("");
      setBetSlipOpenMobile(false);
      auth.refreshUser();
    } catch {
      toast.error("Erro ao realizar aposta");
    } finally {
      setIsPlacingBet(false);
    }
  };

  // --- UI Components ---

  const OddsButton = ({ match, selection, odd, market = "result", label, grow }: {
    match: Match; selection: string; odd: number; market?: string; label: string; grow?: boolean;
  }) => {
    const isSelected = !!bets.find(b => b.matchId === match.id && b.market === market && b.selection === selection);
    const prevOdd = match.isLive ? prevLiveOdds.current[String(match.id)]?.[selection as keyof Odds] : undefined;
    const oddsUp = prevOdd !== undefined && odd > prevOdd;
    const oddsDown = prevOdd !== undefined && odd < prevOdd;
    return (
      <button
        onClick={() => toggleBet(match, selection, odd, market, label)}
        className={`relative flex flex-col items-center py-2.5 px-2 rounded-md transition-all text-xs ${grow ? "flex-1" : ""} ${isSelected ? "bg-red-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}
      >
        <span className="mb-0.5 text-[10px] leading-tight opacity-70">{label}</span>
        <span className="font-bold text-sm flex items-center gap-0.5">
          {odd.toFixed(2)}
          {oddsUp && <TrendingUp size={10} className="text-green-400 shrink-0" />}
          {oddsDown && <TrendingDown size={10} className="text-red-400 shrink-0" />}
        </span>
      </button>
    );
  };

  // Compact league/meta row (no banner)
  const CompactLeagueRow = ({ match, rightSlot }: { match: Match; rightSlot?: ReactNode }) => {
    const flag = COUNTRY_FLAGS[match.country?.toLowerCase() ?? ""] ?? "⚽";
    // For live matches: never show scheduled time — live badge already carries minute info
    const timeStr = match.isLive ? "" : [
      match.date ? formatMatchDate(match.date) : "",
      match.time ? match.time : "",
    ].filter(Boolean).join(" • ");
    return (
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-zinc-800 text-sm leading-none">
            {flag}
            <span className="absolute -bottom-0.5 -right-1 bg-zinc-950 rounded-full text-[9px] w-3.5 h-3.5 flex items-center justify-center border border-zinc-800">⚽</span>
          </div>
          <span className="text-[11px] text-zinc-500 truncate">{match.league}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {rightSlot}
          {timeStr && <span className="text-[11px] text-zinc-500">{timeStr}</span>}
        </div>
      </div>
    );
  };

  const LiveMatchCard = ({ match }: { match: Match }) => {
    // Use locally interpolated minute — ticks between API refreshes
    const minute = getDisplayMinute(match);
    const progress = Math.min(100, (minute / 90) * 100);
    const flag = COUNTRY_FLAGS[match.country?.toLowerCase() ?? ""] ?? "⚽";
    const bannerImg = getTeamBanner(match.home, match.country);
    // Suppress fade-in animation for already-seen matches (silent background update)
    const matchKey = String(match.id);
    const isNew = !seenMatchIds.current.has(matchKey);
    if (isNew) seenMatchIds.current.add(matchKey);
    const liveBadge = (
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
        </span>
        <span className="text-[10px] font-bold text-red-500">
          {minute === 45 ? "HT" : minute === 105 ? "ET" : `${minute}'`}
        </span>
      </div>
    );

    const rivalry = RIVALRY_TAGS[`${match.home}|${match.away}`];
    const motionProps = isNew
      ? { layout: true as const, initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }
      : { layout: true as const };

    if (bannerImg) {
      return (
        <motion.div
          {...motionProps}
          className="relative aspect-video rounded-xl border border-zinc-800 hover:border-red-500/40 transition-colors cursor-pointer overflow-hidden"
          onClick={() => setExpandedMatch(match)}
        >
          <img src={bannerImg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/10" />
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/10 overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-red-600 to-red-400" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 1 }} />
          </div>
          {/* Top: league + live badge */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-3">
            <div className="flex items-center gap-2">
              <span className="text-sm leading-none">{flag}</span>
              <span className="text-xs text-white/80 font-medium drop-shadow">{match.league}</span>
            </div>
            <div className="flex items-center gap-2">{liveBadge}</div>
          </div>
          {/* Bottom: score + teams horizontal + rivalry + odds */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-4" onClick={e => e.stopPropagation()}>
            {rivalry && <div className="text-[11px] font-black text-red-400 uppercase tracking-widest mb-1 drop-shadow">{rivalry}</div>}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-baseline gap-2 flex-1 min-w-0">
                <span className="font-black text-white text-base leading-tight drop-shadow truncate">{match.home}</span>
                <span className="text-white/40 text-xs shrink-0">vs</span>
                <span className="font-black text-white text-base leading-tight drop-shadow truncate">{match.away}</span>
              </div>
              <div className="text-3xl font-black text-white tabular-nums shrink-0 drop-shadow-lg">
                {match.homeScore ?? 0}<span className="text-white/40 text-xl mx-0.5">-</span>{match.awayScore ?? 0}
              </div>
            </div>
            {match.hasRealOdds && (
              <div className="flex gap-2 w-full">
                <OddsButton match={match} selection="home" odd={match.odds.home} market="result" label="Casa" grow />
                <OddsButton match={match} selection="draw" odd={match.odds.draw} market="result" label="Emp." grow />
                <OddsButton match={match} selection="away" odd={match.odds.away} market="result" label="Fora" grow />
              </div>
            )}
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div
        {...motionProps}
        className="bg-zinc-900 rounded-lg border border-zinc-800 hover:border-red-500/30 transition-colors cursor-pointer overflow-hidden"
        onClick={() => setExpandedMatch(match)}
      >
        <CompactLeagueRow match={match} rightSlot={liveBadge} />
        <div className="w-full h-0.5 bg-zinc-800 overflow-hidden">
          <motion.div className="h-full bg-gradient-to-r from-red-600 to-red-400" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 1 }} />
        </div>
        <div className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="font-bold text-white text-sm truncate flex-1 text-right">{match.home}</span>
            <div className="text-xl font-black text-white tabular-nums shrink-0 px-2 text-center">
              {match.homeScore ?? 0}<span className="text-zinc-600 mx-0.5">-</span>{match.awayScore ?? 0}
            </div>
            <span className="font-bold text-white text-sm truncate flex-1">{match.away}</span>
          </div>
          {match.hasRealOdds && (
            <div className="flex gap-2 w-full">
              <OddsButton match={match} selection="home" odd={match.odds.home} market="result" label="Casa" grow />
              <OddsButton match={match} selection="draw" odd={match.odds.draw} market="result" label="Emp." grow />
              <OddsButton match={match} selection="away" odd={match.odds.away} market="result" label="Fora" grow />
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  const MatchCard = ({ match }: { match: Match }) => {
    const flag = COUNTRY_FLAGS[match.country?.toLowerCase() ?? ""] ?? (match.sport === "basketball" ? "🏀" : match.sport === "tennis" ? "🎾" : "⚽");
    const dateStr = match.date ? formatMatchDate(match.date) : "";
    const bannerImg = getTeamBanner(match.home, match.country);
    const rivalry = RIVALRY_TAGS[`${match.home}|${match.away}`];
    const hasDraw = match.odds.draw > 0;
    const sportIcon = match.sport === "basketball" ? "🏀" : match.sport === "tennis" ? "🎾" : null;

    const OddsRow = () => match.hasRealOdds ? (
      <div className="flex gap-2 w-full">
        <OddsButton match={match} selection="home" odd={match.odds.home} market="result" label={hasDraw ? "Casa" : match.home.split(" ").slice(-1)[0]} grow />
        {hasDraw && <OddsButton match={match} selection="draw" odd={match.odds.draw} market="result" label="Emp." grow />}
        <OddsButton match={match} selection="away" odd={match.odds.away} market="result" label={hasDraw ? "Fora" : match.away.split(" ").slice(-1)[0]} grow />
      </div>
    ) : null;

    if (bannerImg) {
      return (
        <div
          className="relative aspect-video rounded-xl border border-zinc-800 hover:border-red-500/40 transition-colors cursor-pointer overflow-hidden"
          onClick={() => setExpandedMatch(match)}
        >
          <img src={bannerImg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/10" />
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-3">
            <div className="flex items-center gap-2">
              <span className="text-sm leading-none">{sportIcon ?? flag}</span>
              <span className="text-xs text-white/80 font-medium drop-shadow">{match.league}</span>
            </div>
            <span className="text-xs text-white/60">{dateStr}{match.time ? ` • ${match.time}` : ""}</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-4" onClick={e => e.stopPropagation()}>
            {rivalry && <div className="text-[11px] font-black text-red-400 uppercase tracking-widest mb-1 drop-shadow">{rivalry}</div>}
            <div className="flex items-baseline gap-2 mb-3 min-w-0">
              <span className="font-black text-white text-xl leading-tight drop-shadow truncate">{match.home}</span>
              <span className="text-white/40 text-sm shrink-0">vs</span>
              <span className="font-black text-white text-xl leading-tight drop-shadow truncate">{match.away}</span>
            </div>
            <OddsRow />
          </div>
        </div>
      );
    }

    return (
      <div
        className="bg-zinc-900 rounded-lg border border-zinc-800 hover:border-red-500/30 transition-colors cursor-pointer overflow-hidden"
        onClick={() => setExpandedMatch(match)}
      >
        <CompactLeagueRow match={match} />
        <div className="px-3 pb-3 pt-1" onClick={e => e.stopPropagation()}>
          <div className="flex items-baseline gap-1.5 mb-2 min-w-0">
            <span className="font-bold text-white text-sm truncate">{match.home}</span>
            <span className="text-zinc-600 text-xs shrink-0">vs</span>
            <span className="font-bold text-white text-sm truncate">{match.away}</span>
          </div>
          <OddsRow />
        </div>
      </div>
    );
  };

  const BetSlipContent = () => (
    <div className="flex flex-col h-full bg-zinc-950/50">
      <div className="p-4 border-b border-zinc-800 bg-zinc-900 flex justify-between items-center">
        <h3 className="font-bold text-lg text-white">Boletim de Apostas</h3>
        <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full">{bets.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {bets.length === 0 ? (
          <div className="text-center text-zinc-500 py-10">
            <Trophy className="mx-auto h-12 w-12 opacity-20 mb-3" />
            <p>Seu boletim está vazio.</p>
            <p className="text-sm mt-1">Adicione seleções para apostar.</p>
          </div>
        ) : (
          <AnimatePresence>
            {bets.map(bet => (
              <motion.div
                key={`${bet.matchId}-${bet.market}-${bet.selection}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-zinc-900 p-3 rounded-lg border border-zinc-800 relative"
              >
                <button
                  onClick={() => removeBet(bet.matchId, bet.market || "result", bet.selection)}
                  className="absolute top-2 right-2 text-zinc-500 hover:text-red-500 transition-colors"
                >
                  <X size={16} />
                </button>
                <div className="text-xs text-zinc-400 mb-1">{bet.matchTitle}</div>
                <div className="font-bold text-white text-sm">{bet.label}</div>
                <div className="text-red-500 font-bold mt-1">{bet.odd.toFixed(2)}</div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {bets.length > 0 && (
        <div className="p-4 bg-zinc-900 border-t border-zinc-800 space-y-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-zinc-400">Odds Totais</span>
            <span className="font-bold text-lg text-white">{totalOdds}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stake" className="text-zinc-400 text-xs">Valor da Aposta (R$)</Label>
            <Input
              id="stake"
              type="number"
              placeholder="0.00"
              value={stake}
              onChange={e => setStake(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-white font-mono"
            />
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-zinc-400">Ganhos Potenciais</span>
            <span className="font-bold text-green-500">
              R$ {(parseFloat(stake || "0") * parseFloat(totalOdds)).toFixed(2)}
            </span>
          </div>
          <Button
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-12"
            onClick={handlePlaceBet}
            disabled={isPlacingBet}
          >
            {isPlacingBet ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
            {auth.user ? "APOSTAR AGORA" : "ENTRAR PARA APOSTAR"}
          </Button>
        </div>
      )}
    </div>
  );

  const MarketOddsBtn = ({ match, sel, odd, market, label }: { match: Match; sel: string; odd: number; market: string; label: string }) => {
    const active = !!bets.find(b => b.matchId === match.id && b.market === market && b.selection === sel);
    return (
      <button
        onClick={() => toggleBet(match, sel, odd, market, label)}
        className={`flex-1 flex flex-col items-center py-2.5 px-1 rounded-lg border transition-all min-w-0 ${active ? "border-red-600 bg-red-600/15 ring-1 ring-red-500/40" : "border-zinc-800 bg-zinc-900/80 hover:border-red-500/40 hover:bg-zinc-800"}`}
      >
        <span className="text-[11px] text-zinc-400 mb-1 leading-tight text-center truncate w-full px-0.5">{label}</span>
        <span className={`font-bold text-base tabular-nums ${active ? "text-red-400" : "text-white"}`}>{odd.toFixed(2)}</span>
      </button>
    );
  };

  const MarketGroup = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="mb-4 last:mb-0">
      <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 px-0.5">{title}</div>
      <div className="flex gap-2">{children}</div>
    </div>
  );

  const MatchModalMarkets = ({ match }: { match: Match }) => {
    const sport = match.sport ?? "football";
    const isBasketball = sport === "basketball";
    const isTennis = sport === "tennis";
    const isFootball = !isBasketball && !isTennis;

    const tabs = isBasketball
      ? [
          { key: "resultado", label: "Vencedor" },
          { key: "totais", label: "Totais" },
          { key: "spread", label: "Spread" },
          { key: "1tempo", label: "1º Quarto" },
        ]
      : isTennis
        ? [
            { key: "resultado", label: "Vencedor" },
            { key: "sets", label: "Sets" },
            { key: "handicap", label: "Handicap" },
          ]
        : [
            { key: "resultado", label: "Resultado" },
            { key: "dupla", label: "Dupla Chance" },
            { key: "gols", label: "Gols" },
            { key: "handicap", label: "Handicap" },
            { key: "1tempo", label: "1º Tempo" },
          ];

    const defaultTab = tabs[0]!.key;
    const [modalTab, setModalTab] = useState(defaultTab);
    const m = match.markets;

    if (!match.hasRealOdds) {
      return (
        <div className="mt-4 text-center py-10 text-zinc-500">
          <div className="text-3xl mb-3">📊</div>
          <div className="text-sm font-medium">Odds não disponíveis para esta partida.</div>
          <div className="text-xs mt-1 text-zinc-600">Apenas partidas com odds confirmadas são apresentadas.</div>
        </div>
      );
    }

    return (
      <div className="mt-2">
        <div className="flex gap-1 overflow-x-auto no-scrollbar mb-4 pb-1 border-b border-zinc-800">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setModalTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap transition-colors ${modalTab === t.key ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── RESULTADO / VENCEDOR ── */}
        {modalTab === "resultado" && (
          <MarketGroup title={isBasketball ? "Vencedor da Partida" : isTennis ? "Vencedor do Jogo" : "Resultado Final"}>
            <MarketOddsBtn match={match} sel="home" odd={match.odds.home} market="result" label={match.home} />
            {match.odds.draw > 0 && <MarketOddsBtn match={match} sel="draw" odd={match.odds.draw} market="result" label="Empate" />}
            <MarketOddsBtn match={match} sel="away" odd={match.odds.away} market="result" label={match.away} />
          </MarketGroup>
        )}

        {/* ── FUTEBOL: DUPLA CHANCE ── */}
        {isFootball && modalTab === "dupla" && m && m.doubleChance.homeOrDraw > 0 && (
          <div>
            <MarketGroup title="Dupla Chance">
              <MarketOddsBtn match={match} sel="homeOrDraw" odd={m.doubleChance.homeOrDraw} market="dupla" label={`${match.home} ou X`} />
              <MarketOddsBtn match={match} sel="awayOrDraw" odd={m.doubleChance.awayOrDraw} market="dupla" label={`${match.away} ou X`} />
              <MarketOddsBtn match={match} sel="homeOrAway" odd={m.doubleChance.homeOrAway} market="dupla" label="1 ou 2" />
            </MarketGroup>
            {m.bothTeamsScore.yes > 0 && (
              <MarketGroup title="Ambas as Equipas Marcam">
                <MarketOddsBtn match={match} sel="bts-yes" odd={m.bothTeamsScore.yes} market="dupla" label="Sim" />
                <MarketOddsBtn match={match} sel="bts-no" odd={m.bothTeamsScore.no} market="dupla" label="Não" />
              </MarketGroup>
            )}
          </div>
        )}
        {isFootball && modalTab === "dupla" && m && m.doubleChance.homeOrDraw === 0 && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── FUTEBOL: GOLS ── */}
        {isFootball && modalTab === "gols" && m && m.totalGoals.over25 > 0 && (
          <div>
            {m.totalGoals.over15 > 0 && (
              <MarketGroup title="Total de Gols — 1.5">
                <MarketOddsBtn match={match} sel="o15" odd={m.totalGoals.over15} market="gols" label="Mais de 1.5" />
                <MarketOddsBtn match={match} sel="u15" odd={m.totalGoals.under15} market="gols" label="Menos de 1.5" />
              </MarketGroup>
            )}
            <MarketGroup title="Total de Gols — 2.5">
              <MarketOddsBtn match={match} sel="o25" odd={m.totalGoals.over25} market="gols" label="Mais de 2.5" />
              <MarketOddsBtn match={match} sel="u25" odd={m.totalGoals.under25} market="gols" label="Menos de 2.5" />
            </MarketGroup>
            {m.totalGoals.over35 > 0 && (
              <MarketGroup title="Total de Gols — 3.5">
                <MarketOddsBtn match={match} sel="o35" odd={m.totalGoals.over35} market="gols" label="Mais de 3.5" />
                <MarketOddsBtn match={match} sel="u35" odd={m.totalGoals.under35} market="gols" label="Menos de 3.5" />
              </MarketGroup>
            )}
          </div>
        )}
        {isFootball && modalTab === "gols" && m && m.totalGoals.over25 === 0 && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── BASQUETE: TOTAIS ── */}
        {isBasketball && modalTab === "totais" && m && (
          <div>
            {m._total && m.totalGoals.over25 > 0 && (
              <MarketGroup title={`Total Jogo — ${m._total}`}>
                <MarketOddsBtn match={match} sel="o25" odd={m.totalGoals.over25} market="totais" label={`Mais de ${m._total}`} />
                <MarketOddsBtn match={match} sel="u25" odd={m.totalGoals.under25} market="totais" label={`Menos de ${m._total}`} />
              </MarketGroup>
            )}
            {m._total1H && m.totalGoals.over15 > 0 && (
              <MarketGroup title={`Total 1º Tempo — ${m._total1H}`}>
                <MarketOddsBtn match={match} sel="o15" odd={m.totalGoals.over15} market="totais" label={`Mais de ${m._total1H}`} />
                <MarketOddsBtn match={match} sel="u15" odd={m.totalGoals.under15} market="totais" label={`Menos de ${m._total1H}`} />
              </MarketGroup>
            )}
            {m.totalGoals.over35 > 0 && (
              <MarketGroup title={`Total ${match.home}`}>
                <MarketOddsBtn match={match} sel="o35" odd={m.totalGoals.over35} market="totais" label="Acima" />
                <MarketOddsBtn match={match} sel="u35" odd={m.totalGoals.under35} market="totais" label="Abaixo" />
              </MarketGroup>
            )}
          </div>
        )}
        {isBasketball && modalTab === "1tempo" && m && m.totalGoals.over15 > 0 && (
          <MarketGroup title={`Total 1º Quarto — ${m._total1H ? Math.round((m._total1H as number) / 2) : "—"}`}>
            <MarketOddsBtn match={match} sel="o15" odd={m.totalGoals.over15} market="1tempo" label="Acima" />
            <MarketOddsBtn match={match} sel="u15" odd={m.totalGoals.under15} market="1tempo" label="Abaixo" />
          </MarketGroup>
        )}

        {/* ── BASQUETE: SPREAD ── */}
        {isBasketball && modalTab === "spread" && m && m.handicap.homeMinusOne > 0 && (
          <div>
            {m._spread !== undefined && (
              <MarketGroup title={`Spread — ${match.home} ${m._spread > 0 ? `−${m._spread}` : `+${Math.abs(m._spread)}`}`}>
                <MarketOddsBtn match={match} sel="hm1" odd={m.handicap.homeMinusOne} market="spread" label={`${match.home} cobre`} />
                <MarketOddsBtn match={match} sel="ap1" odd={m.handicap.awayPlusOne} market="spread" label={`${match.away} cobre`} />
              </MarketGroup>
            )}
          </div>
        )}
        {isBasketball && modalTab === "spread" && m && m.handicap.homeMinusOne === 0 && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── TÉNIS: SETS ── */}
        {isTennis && modalTab === "sets" && m && (
          <div>
            {m.totalGoals.over15 > 0 && (
              <MarketGroup title="Vencedor do 1º Set">
                <MarketOddsBtn match={match} sel="set1-home" odd={m.totalGoals.over15} market="sets" label={match.home} />
                <MarketOddsBtn match={match} sel="set1-away" odd={m.totalGoals.under15} market="sets" label={match.away} />
              </MarketGroup>
            )}
            {m.totalGoals.over25 > 0 && (
              <MarketGroup title="Total de Sets — O/U 2.5">
                <MarketOddsBtn match={match} sel="osets" odd={m.totalGoals.over25} market="sets" label="Mais de 2.5 sets" />
                <MarketOddsBtn match={match} sel="usets" odd={m.totalGoals.under25} market="sets" label="Menos de 2.5 sets" />
              </MarketGroup>
            )}
            {m.bothTeamsScore.yes > 0 && (
              <MarketGroup title="Tie-Break no Jogo">
                <MarketOddsBtn match={match} sel="tie-yes" odd={m.bothTeamsScore.yes} market="sets" label="Sim" />
                <MarketOddsBtn match={match} sel="tie-no" odd={m.bothTeamsScore.no} market="sets" label="Não" />
              </MarketGroup>
            )}
          </div>
        )}

        {/* ── HANDICAP (futebol + ténis) ── */}
        {!isBasketball && modalTab === "handicap" && m && m.handicap.homeMinusOne > 0 && (
          <div>
            {isFootball ? (
              <>
                <MarketGroup title={`Handicap Europeu — ${match.home}`}>
                  <MarketOddsBtn match={match} sel="hm1" odd={m.handicap.homeMinusOne} market="handicap" label={`${match.home} −1`} />
                  <MarketOddsBtn match={match} sel="hm1h" odd={m.handicap.homeMinusOneHalf} market="handicap" label={`${match.home} −1.5`} />
                </MarketGroup>
                <MarketGroup title={`Handicap Europeu — ${match.away}`}>
                  <MarketOddsBtn match={match} sel="ap1" odd={m.handicap.awayPlusOne} market="handicap" label={`${match.away} +1`} />
                  <MarketOddsBtn match={match} sel="ap1h" odd={m.handicap.awayPlusOneHalf} market="handicap" label={`${match.away} +1.5`} />
                </MarketGroup>
              </>
            ) : (
              <MarketGroup title="Handicap de Games">
                <MarketOddsBtn match={match} sel="hcap-home" odd={m.handicap.homeMinusOne} market="handicap" label={`${match.home} cobre`} />
                <MarketOddsBtn match={match} sel="hcap-away" odd={m.handicap.awayPlusOne} market="handicap" label={`${match.away} cobre`} />
              </MarketGroup>
            )}
          </div>
        )}
        {!isBasketball && modalTab === "handicap" && m && m.handicap.homeMinusOne === 0 && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── FUTEBOL: 1º TEMPO ── */}
        {isFootball && modalTab === "1tempo" && m && m.halfTime.home > 0 && (
          <div>
            <MarketGroup title="Resultado — 1º Tempo">
              <MarketOddsBtn match={match} sel="ht-home" odd={m.halfTime.home} market="1tempo" label={match.home} />
              {m.halfTime.draw > 0 && <MarketOddsBtn match={match} sel="ht-draw" odd={m.halfTime.draw} market="1tempo" label="Empate" />}
              <MarketOddsBtn match={match} sel="ht-away" odd={m.halfTime.away} market="1tempo" label={match.away} />
            </MarketGroup>
            {m.firstGoal.home > 0 && (
              <MarketGroup title="1º Gol">
                <MarketOddsBtn match={match} sel="fg-home" odd={m.firstGoal.home} market="1tempo" label={match.home} />
                <MarketOddsBtn match={match} sel="fg-none" odd={m.firstGoal.noGoal} market="1tempo" label="Sem Gols" />
                <MarketOddsBtn match={match} sel="fg-away" odd={m.firstGoal.away} market="1tempo" label={match.away} />
              </MarketGroup>
            )}
          </div>
        )}
        {isFootball && modalTab === "1tempo" && m && m.halfTime.home === 0 && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {!m && <div className="text-center text-zinc-500 py-6 text-sm">Mercados adicionais indisponíveis para esta partida.</div>}
      </div>
    );
  };

  const cashoutEstimate = (bet: UserBet) => {
    const s = parseFloat(bet.stake);
    const originalOdds = parseFloat(bet.totalOdds);
    const currentOdds = originalOdds * 1.1;
    return Math.max(0, (s * originalOdds) / currentOdds * 0.92).toFixed(2);
  };

  return (
    <div className="min-h-[100dvh] w-full bg-zinc-950 text-white flex flex-col dark font-sans">

      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-zinc-950 border-b border-zinc-900">
        <div className="flex items-center justify-between px-4 h-16 max-w-[1600px] mx-auto">
          <div className="flex items-center gap-4">
            <button className="lg:hidden p-2 -ml-2 text-zinc-400 hover:text-white transition-colors" onClick={() => setSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <div className="font-black text-2xl tracking-tighter italic">
              <span className="text-white">BET</span><span className="text-red-600">62</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {auth.user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs text-zinc-400">Saldo</span>
                  <span className="font-bold text-green-400 text-sm">R$ {parseFloat(auth.user.balance).toFixed(2)}</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg transition-colors">
                      <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center text-xs font-bold">
                        {auth.user.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="hidden sm:block text-sm font-medium max-w-[100px] truncate">{auth.user.name}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-zinc-900 border-zinc-700 text-white" align="end">
                    <div className="px-3 py-2 text-xs text-zinc-400">
                      <div className="font-medium text-white truncate">{auth.user.name}</div>
                      <div className="text-zinc-500 truncate">{auth.user.email}</div>
                      <div className="text-green-400 font-bold mt-1">R$ {parseFloat(auth.user.balance).toFixed(2)}</div>
                    </div>
                    <DropdownMenuSeparator className="bg-zinc-700" />
                    <DropdownMenuItem className="hover:bg-zinc-800 cursor-pointer" onClick={() => { setActiveTab("mybets"); fetchMyBets(); }}>
                      <History size={14} className="mr-2" /> Minhas Apostas
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-zinc-700" />
                    <DropdownMenuItem className="hover:bg-zinc-800 cursor-pointer text-red-400" onClick={auth.logout}>
                      <LogOut size={14} className="mr-2" /> Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <Button onClick={() => setAuthModalOpen(true)} className="bg-red-600 hover:bg-red-700 text-white font-bold px-6">
                ENTRAR
              </Button>
            )}
          </div>
        </div>

        {/* TABS */}
        <div className="px-4 max-w-[1600px] mx-auto flex gap-6 overflow-x-auto no-scrollbar">
          {[
            { id: "sports", icon: <Trophy size={16} />, label: "ESPORTES" },
            { id: "live", icon: <Activity size={16} />, label: "AO VIVO", badge: true },
            { id: "promos", icon: <Gift size={16} />, label: "PROMOÇÕES" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`py-3 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap flex items-center gap-2 ${activeTab === tab.id ? "border-red-600 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
            >
              {tab.icon}
              {tab.label}
              {tab.badge && (
                <span className="relative flex h-2 w-2 ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              )}
            </button>
          ))}
          {auth.user && (
            <button
              onClick={() => { setActiveTab("mybets"); fetchMyBets(); }}
              className={`py-3 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap flex items-center gap-2 ${activeTab === "mybets" ? "border-red-600 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
            >
              <History size={16} />
              MINHAS APOSTAS
            </button>
          )}
        </div>
      </header>

      {/* MOBILE SIDEBAR OVERLAY */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 z-50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
            <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", bounce: 0, duration: 0.4 }} className="fixed top-0 left-0 bottom-0 w-72 bg-zinc-950 border-r border-zinc-800 z-50 flex flex-col lg:hidden">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="font-black text-xl tracking-tighter italic"><span className="text-white">BET</span><span className="text-red-600">62</span></div>
                <button onClick={() => setSidebarOpen(false)} className="text-zinc-400 hover:text-white"><X size={20} /></button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto">
                <div className="mb-8">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Principais Ligas</h4>
                  <ul className="space-y-2">
                    {["La Liga", "Premier League", "Champions League", "Serie A", "Bundesliga", "Ligue 1"].map(league => (
                      <li key={league}>
                        <button className="flex items-center gap-3 w-full p-2 rounded-md hover:bg-zinc-900 text-sm text-zinc-300 hover:text-white transition-colors">
                          <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm leading-none shrink-0">
                            {LEAGUE_FLAGS[league] ?? "⚽"}
                          </div>
                          {league}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Esportes</h4>
                  <ul className="space-y-2">
                    {[
                      { icon: <span className="text-base leading-none">🏆</span>, label: "Todos", key: "all" },
                      { icon: <span className="text-base leading-none">⚽</span>, label: "Futebol", key: "football" },
                      { icon: <span className="text-base leading-none">🏀</span>, label: "Basquete", key: "basketball" },
                      { icon: <TennisBallIcon size={18} />, label: "Tênis", key: "tennis" },
                    ].map(sport => (
                      <li key={sport.key}>
                        <button
                          onClick={() => { setSelectedSport(sport.key); setActiveTab("sports"); setSidebarOpen(false); }}
                          className={`flex items-center gap-3 w-full p-2 rounded-md text-sm transition-colors ${selectedSport === sport.key ? "bg-red-600/20 text-red-400 border border-red-500/30" : "hover:bg-zinc-900 text-zinc-300 hover:text-white"}`}
                        >
                          <div className={selectedSport === sport.key ? "text-red-400" : "text-red-500"}>{sport.icon}</div>
                          {sport.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* MAIN — 3-column desktop layout */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">

        {/* DESKTOP LEFT SIDEBAR — always visible on lg+ */}
        <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-zinc-900 bg-zinc-950 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="p-4">
            <div className="mb-6">
              <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Principais Ligas</h4>
              <ul className="space-y-0.5">
                {["La Liga", "Premier League", "Champions League", "Serie A", "Bundesliga", "Ligue 1", "Liga Portugal", "Eredivisie"].map(league => (
                  <li key={league}>
                    <button className="flex items-center gap-2.5 w-full px-2 py-2 rounded-md hover:bg-zinc-900 text-sm text-zinc-400 hover:text-white transition-colors">
                      <span className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-800 flex items-center justify-center text-sm leading-none shrink-0">
                        {LEAGUE_FLAGS[league] ?? "⚽"}
                      </span>
                      <span className="truncate text-[13px]">{league}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Esportes</h4>
              <ul className="space-y-0.5">
                {[
                  { icon: <span className="text-sm leading-none">🏆</span>, label: "Todos", key: "all" },
                  { icon: <span className="text-sm leading-none">⚽</span>, label: "Futebol", key: "football" },
                  { icon: <span className="text-sm leading-none">🏀</span>, label: "Basquete", key: "basketball" },
                  { icon: <TennisBallIcon size={15} />, label: "Tênis", key: "tennis" },
                ].map(sport => (
                  <li key={sport.key}>
                    <button
                      onClick={() => { setSelectedSport(sport.key); setActiveTab("sports"); }}
                      className={`flex items-center gap-2.5 w-full px-2 py-2 rounded-md text-[13px] transition-colors ${selectedSport === sport.key ? "bg-red-600/20 text-red-400 border border-red-500/30" : "hover:bg-zinc-900 text-zinc-400 hover:text-white"}`}
                    >
                      <span className={selectedSport === sport.key ? "text-red-400" : "text-red-500"}>{sport.icon}</span>
                      {sport.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        <main className="flex-1 pb-32 lg:pb-8 overflow-hidden min-w-0">

          {/* HERO — sports tab only, hidden when a match is expanded */}
          {activeTab === "sports" && !expandedMatch && (
            <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-950 to-black border-b border-zinc-900">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-20 -left-20 w-96 h-96 bg-red-600/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-red-900/10 rounded-full blur-3xl" />
              </div>

              <div className="relative z-10 px-4 lg:px-8 pt-10 pb-10 max-w-4xl">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 bg-red-600/20 border border-red-500/30 text-red-400 text-xs font-bold px-3 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                      PLATAFORMA OFICIAL
                    </span>
                  </div>
                  <h1 className="text-5xl lg:text-7xl font-black italic tracking-tighter mb-3 leading-none">
                    <span className="text-white">BET</span><span className="text-red-600">62</span>
                  </h1>
                  <p className="text-lg lg:text-xl text-zinc-400 mb-8 max-w-xl">
                    Onde cada jogo é uma oportunidade. As melhores odds da Europa, ao vivo ou pré-jogo.
                  </p>

                  {/* Real stats from API */}
                  {platformStats && (
                    <div className="flex flex-wrap gap-6 mb-8">
                      <div className="flex items-center gap-2 text-sm text-zinc-300">
                        <User size={14} className="text-red-500" />
                        <span>{platformStats.totalUsers.toLocaleString("pt-BR")} usuários cadastrados</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-zinc-300">
                        <TrendingUp size={14} className="text-red-500" />
                        <span>{platformStats.totalBets.toLocaleString("pt-BR")} apostas realizadas</span>
                      </div>
                      {platformStats.totalPaidOut > 0 && (
                        <div className="flex items-center gap-2 text-sm text-zinc-300">
                          <Zap size={14} className="text-red-500" />
                          <span>R$ {platformStats.totalPaidOut.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em prêmios pagos</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    {auth.user ? (
                      <Button size="lg" className="bg-red-600 hover:bg-red-700 text-white font-black text-base px-8 h-12 italic">
                        FAZER DEPÓSITO <ChevronRight size={18} className="ml-1" />
                      </Button>
                    ) : (
                      <>
                        <Button size="lg" onClick={() => setAuthModalOpen(true)} className="bg-red-600 hover:bg-red-700 text-white font-black text-base px-8 h-12 italic">
                          CRIAR CONTA <ChevronRight size={18} className="ml-1" />
                        </Button>
                        <Button size="lg" variant="outline" onClick={() => setAuthModalOpen(true)} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-12 px-8">
                          JÁ TENHO CONTA
                        </Button>
                      </>
                    )}
                  </div>
                </motion.div>
              </div>
            </div>
          )}

          <div className="p-4 lg:p-8">
            {/* Inline market detail view — replaces match list when a match is expanded */}
            {expandedMatch && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                {/* Back button */}
                <button
                  onClick={() => setExpandedMatch(null)}
                  className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors mb-4 group"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="group-hover:-translate-x-0.5 transition-transform"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  Voltar aos eventos
                </button>

                {/* Match header */}
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden mb-2">
                  <CompactLeagueRow match={expandedMatch} rightSlot={
                    expandedMatch.isLive ? (
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                        </span>
                        <span className="text-[10px] font-bold text-red-500">AO VIVO {getDisplayMinute(expandedMatch)}'</span>
                      </div>
                    ) : undefined
                  } />
                  {expandedMatch.isLive ? (
                    <div className="px-4 pt-3 pb-2">
                      <div className="flex items-center gap-2 min-w-0 mb-2">
                        <span className="font-bold text-white text-sm truncate flex-1 text-right">{expandedMatch.home}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setMatchViewTab(matchViewTab === "stats" || matchViewTab === "standings" ? "markets" : "stats")}
                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${matchViewTab === "stats" || matchViewTab === "standings" ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600"}`}
                            title="Estatísticas"
                          >
                            <BarChart2 size={12} />
                          </button>
                          <button
                            onClick={() => setMatchViewTab(matchViewTab === "live" ? "markets" : "live")}
                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${matchViewTab === "live" ? "border-red-500 bg-red-500/10 text-red-400" : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600"}`}
                            title="Visualização Ao Vivo"
                          >
                            <Activity size={12} />
                          </button>
                        </div>
                        <span className="font-bold text-white text-sm truncate flex-1">{expandedMatch.away}</span>
                      </div>
                      <div className="text-center">
                        <span className="text-3xl font-black text-white tabular-nums">
                          {expandedMatch.homeScore ?? 0}<span className="text-zinc-500 mx-1.5">-</span>{expandedMatch.awayScore ?? 0}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-white text-base truncate flex-1 text-right">{expandedMatch.home}</span>
                        <button
                          onClick={() => setMatchViewTab(matchViewTab === "markets" ? "stats" : "markets")}
                          className={`shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${matchViewTab !== "markets" ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600"}`}
                          title="Estatísticas"
                        >
                          <BarChart2 size={12} />
                          <span className="hidden sm:inline">Stats</span>
                        </button>
                        <span className="text-zinc-600 text-[11px] shrink-0 font-medium">vs</span>
                        <span className="font-bold text-white text-base truncate flex-1">{expandedMatch.away}</span>
                      </div>
                    </div>
                  )}

                  {/* Stats/Standings/Live sub-tabs */}
                  {matchViewTab !== "markets" && (
                    <div className="flex border-t border-zinc-800">
                      {(expandedMatch.isLive
                        ? (["stats", "standings", "live"] as const)
                        : (["stats", "standings"] as const)
                      ).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setMatchViewTab(tab)}
                          className={`flex-1 py-2 text-xs font-bold transition-colors ${matchViewTab === tab ? (tab === "live" ? "text-red-400 border-b-2 border-red-500" : "text-blue-400 border-b-2 border-blue-500") : "text-zinc-500 hover:text-white"}`}
                        >
                          {tab === "stats" ? "Estatísticas" : tab === "standings" ? "Classificação" : "⚡ Ao Vivo"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stats panel */}
                {matchViewTab === "stats" && (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 mb-2 animate-in fade-in duration-200">
                    {matchStatsLoading || !matchStats ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="animate-spin text-blue-400" size={28} />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Grid: H2H stats + Win Probability */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* H2H & Avg Stats */}
                          <div className="bg-zinc-950/60 rounded-lg border border-zinc-800 p-4">
                            <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">
                              Frente a Frente — Média
                            </div>
                            <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                              {[
                                { label: "Golos Marcados", val: matchStats.avgStats.goalsScored.toFixed(2), sub: `Liga: ${matchStats.avgStats.leagueGoals.toFixed(2)}` },
                                { label: "AEM", val: `${matchStats.avgStats.btts}%`, sub: `Liga: ${matchStats.avgStats.leagueBtts}%` },
                                { label: "Mais de 1.5", val: `${matchStats.avgStats.over15}%`, sub: `Liga: ${matchStats.avgStats.leagueOver15}%` },
                                { label: "Mais de 2.5", val: `${matchStats.avgStats.over25}%`, sub: `Liga: ${matchStats.avgStats.leagueOver25}%` },
                                { label: "Total Cartões", val: matchStats.avgStats.cards.toFixed(2), sub: "" },
                                { label: "Cantos", val: matchStats.avgStats.corners.toFixed(2), sub: "" },
                              ].map(s => (
                                <div key={s.label}>
                                  <div className="text-[11px] text-zinc-400">{s.label}</div>
                                  <div className="font-black text-white text-lg leading-tight">{s.val}</div>
                                  {s.sub && <div className="text-[10px] text-zinc-600">{s.sub}</div>}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Win Probability */}
                          <div className="bg-zinc-950/60 rounded-lg border border-zinc-800 p-4">
                            <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">
                              Probabilidade de Vitória
                            </div>
                            <div className="space-y-2.5 mb-4">
                              {[
                                { label: expandedMatch.home, pct: matchStats.winProb.home, color: "bg-blue-500" },
                                { label: "Empate", pct: matchStats.winProb.draw, color: "bg-yellow-400" },
                                { label: expandedMatch.away, pct: matchStats.winProb.away, color: "bg-red-500" },
                              ].map(row => (
                                <div key={row.label}>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="text-zinc-300 truncate max-w-[120px]">{row.label}</span>
                                    <span className="font-bold text-white shrink-0">{row.pct}%</span>
                                  </div>
                                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${row.pct}%` }}
                                      transition={{ duration: 0.7, ease: "easeOut" }}
                                      className={`h-full rounded-full ${row.color}`}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-3 gap-1 pt-3 border-t border-zinc-800 text-center">
                              <div>
                                <div className="text-xl font-black text-blue-400">{matchStats.h2h.homeWins}</div>
                                <div className="text-[10px] text-zinc-500">Vitórias {expandedMatch.home.split(" ")[0]}</div>
                              </div>
                              <div>
                                <div className="text-xl font-black text-yellow-400">{matchStats.h2h.draws}</div>
                                <div className="text-[10px] text-zinc-500">Empates</div>
                              </div>
                              <div>
                                <div className="text-xl font-black text-red-400">{matchStats.h2h.awayWins}</div>
                                <div className="text-[10px] text-zinc-500">Vitórias {expandedMatch.away.split(" ")[0]}</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Recent Form */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {[
                            { title: `Últimos Jogos — ${expandedMatch.home}`, form: matchStats.homeForm },
                            { title: `Últimos Jogos — ${expandedMatch.away}`, form: matchStats.awayForm },
                          ].map(block => (
                            <div key={block.title} className="bg-zinc-950/60 rounded-lg border border-zinc-800 p-4">
                              <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">{block.title}</div>
                              <div className="space-y-2">
                                {block.form.map((f, i) => (
                                  <div key={i} className="flex items-center gap-3">
                                    <span className={`w-5 h-5 rounded text-[11px] font-black flex items-center justify-center shrink-0 ${f.result === "W" ? "bg-green-600 text-white" : f.result === "D" ? "bg-yellow-500 text-black" : "bg-red-600 text-white"}`}>
                                      {f.result}
                                    </span>
                                    <span className="font-mono text-sm font-bold text-white shrink-0">{f.score}</span>
                                    <span className="text-xs text-zinc-400 truncate">{f.home ? "vs" : "@"} {f.opponent}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Standings panel */}
                {matchViewTab === "standings" && (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 mb-2 animate-in fade-in duration-200">
                    {standingsLoading || !standings ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="animate-spin text-blue-400" size={28} />
                        {!standings && !standingsLoading && <p className="text-zinc-500 ml-3 text-sm">Classificação indisponível</p>}
                      </div>
                    ) : standings.length === 0 ? (
                      <div className="text-center text-zinc-500 py-8 text-sm">Classificação indisponível para esta liga.</div>
                    ) : (
                      <div>
                        <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">{standingsLeague}</div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-zinc-500 border-b border-zinc-800">
                                <th className="text-left py-1.5 pr-2 font-bold w-6">#</th>
                                <th className="text-left py-1.5 font-bold">Equipa</th>
                                <th className="text-center py-1.5 px-1 font-bold">J</th>
                                <th className="text-center py-1.5 px-1 font-bold">V</th>
                                <th className="text-center py-1.5 px-1 font-bold">E</th>
                                <th className="text-center py-1.5 px-1 font-bold">D</th>
                                <th className="text-center py-1.5 px-1 font-bold">GF</th>
                                <th className="text-center py-1.5 px-1 font-bold">GC</th>
                                <th className="text-center py-1.5 px-1 font-bold text-white">Pts</th>
                              </tr>
                            </thead>
                            <tbody>
                              {standings.map(row => {
                                const isHome = row.name.toLowerCase().includes(expandedMatch.home.toLowerCase().slice(0, 5));
                                const isAway = row.name.toLowerCase().includes(expandedMatch.away.toLowerCase().slice(0, 5));
                                return (
                                  <tr key={row.pos} className={`border-b border-zinc-800/50 ${isHome ? "bg-blue-500/10" : isAway ? "bg-red-500/10" : ""}`}>
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
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Live momentum/pressure chart */}
                {matchViewTab === "live" && expandedMatch.isLive && (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 mb-2 animate-in fade-in duration-200">
                    <MomentumChart match={expandedMatch} />
                  </div>
                )}

                {/* Market tabs inline — only visible in markets view */}
                {matchViewTab === "markets" && (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                    <MatchModalMarkets match={expandedMatch} />
                  </div>
                )}
              </div>
            )}

            {!expandedMatch && activeTab === "sports" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-2xl font-black italic uppercase tracking-tight mb-4 flex items-center gap-2">
                  <Trophy className="text-red-600" /> Próximos Eventos
                </h2>
                {upcomingLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="animate-spin text-red-600" size={32} />
                  </div>
                ) : upcomingMatches.length === 0 ? (
                  <div className="py-20 text-center text-zinc-500 bg-zinc-900/50 rounded-xl border border-zinc-800">
                    <Trophy className="mx-auto mb-4 opacity-20" size={48} />
                    <p className="font-medium">Nenhum evento programado no momento.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upcomingMatches.map(match => <MatchCard key={match.id} match={match} />)}
                  </div>
                )}
              </div>
            )}

            {!expandedMatch && activeTab === "live" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-black italic uppercase tracking-tight flex items-center gap-2">
                    <Activity className="text-red-600" /> Ao Vivo
                    {liveMatches.length > 0 && (
                      <span className="text-sm font-normal text-zinc-400 ml-1">({liveMatches.length} jogos)</span>
                    )}
                  </h2>
                  <button
                    onClick={() => fetchLive(true)}
                    disabled={liveLoading}
                    className="text-xs text-zinc-500 hover:text-white transition-colors border border-zinc-800 hover:border-zinc-600 px-3 py-1.5 rounded-md flex items-center gap-1.5"
                  >
                    {liveLoading ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
                    Atualizar
                  </button>
                </div>

                {liveLoading && liveMatches.length === 0 ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="animate-spin text-red-600" size={32} />
                  </div>
                ) : liveMatches.length === 0 ? (
                  <div className="py-20 text-center text-zinc-500 bg-zinc-900/50 rounded-xl border border-zinc-800">
                    <Activity className="mx-auto mb-4 opacity-20" size={48} />
                    <p className="font-medium">Nenhum jogo ao vivo no momento.</p>
                    <p className="text-sm mt-1">Volte em breve para acompanhar as partidas em tempo real.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {liveMatches.map(match => <LiveMatchCard key={match.id} match={match} />)}
                  </div>
                )}
              </div>
            )}

            {activeTab === "promos" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-2xl font-black italic uppercase tracking-tight mb-6 flex items-center gap-2">
                  <Gift className="text-red-600" /> Promoções Bet62
                </h2>
                <div className="space-y-6">
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-900 to-zinc-900 border border-red-500/30 p-8 lg:p-12">
                    <div className="absolute top-0 right-0 p-12 opacity-10 transform translate-x-1/4 -translate-y-1/4"><Trophy size={200} /></div>
                    <div className="relative z-10 max-w-2xl">
                      <div className="inline-block bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full mb-4">NOVO CLIENTE</div>
                      <h3 className="text-4xl lg:text-5xl font-black italic tracking-tighter mb-4">BÔNUS DE ATÉ <span className="text-red-500">R$ 500</span></h3>
                      <p className="text-lg text-zinc-300 mb-8 max-w-xl">100% no primeiro depósito. Cadastre-se, deposite e dobre seu saldo instantaneamente.</p>
                      <Button size="lg" className="bg-red-600 hover:bg-red-700 text-white font-bold text-lg px-8 h-14" onClick={() => toast.success("Bônus ativado com sucesso!")}>ATIVAR BÔNUS</Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-800 flex flex-col justify-between">
                      <div><h4 className="text-xl font-bold italic mb-2">Cashback de Sexta</h4><p className="text-zinc-400 text-sm mb-6">Receba 10% de volta em todas as suas apostas perdidas durante a sexta-feira.</p></div>
                      <Button variant="outline" className="w-full border-zinc-700 text-white hover:bg-zinc-800">Saber Mais</Button>
                    </div>
                    <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-800 flex flex-col justify-between">
                      <div><h4 className="text-xl font-bold italic mb-2">Múltipla Turbinada</h4><p className="text-zinc-400 text-sm mb-6">Aumente seus ganhos em até 50% fazendo apostas múltiplas com 4+ seleções.</p></div>
                      <Button variant="outline" className="w-full border-zinc-700 text-white hover:bg-zinc-800">Saber Mais</Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "mybets" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-2xl font-black italic uppercase tracking-tight mb-6 flex items-center gap-2">
                  <History className="text-red-600" /> Minhas Apostas
                </h2>
                {myBetsLoading ? (
                  <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-red-600" size={32} /></div>
                ) : myBets.length === 0 ? (
                  <div className="py-20 text-center text-zinc-500 bg-zinc-900/50 rounded-xl border border-zinc-800">
                    <Trophy className="mx-auto mb-4 opacity-20" size={48} />
                    <p className="font-medium">Nenhuma aposta realizada ainda.</p>
                    <p className="text-sm mt-1">Escolha um jogo e faça sua primeira aposta!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myBets.map(bet => (
                      <div key={bet.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-white truncate">{bet.matchTitle}</div>
                            <div className="text-xs text-zinc-400 mt-1">{new Date(bet.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                          </div>
                          <div className="flex gap-6 items-center shrink-0 flex-wrap">
                            <div className="text-center">
                              <div className="text-xs text-zinc-500">Aposta</div>
                              <div className="font-bold text-white">R$ {parseFloat(bet.stake).toFixed(2)}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-zinc-500">Odds</div>
                              <div className="font-bold text-red-400">{parseFloat(bet.totalOdds).toFixed(2)}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-zinc-500">Potencial</div>
                              <div className="font-bold text-green-400">R$ {parseFloat(bet.potentialWin).toFixed(2)}</div>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${bet.status === "won" ? "bg-green-900 text-green-400" : bet.status === "lost" ? "bg-red-900/50 text-red-400" : bet.status === "cashed_out" ? "bg-yellow-900/50 text-yellow-400" : "bg-zinc-800 text-zinc-400"}`}>
                              {bet.status === "won" ? "Ganhou" : bet.status === "lost" ? "Perdeu" : bet.status === "cashed_out" ? "Cash Out" : "Pendente"}
                            </div>
                          </div>
                        </div>

                        {bet.status === "pending" && (
                          <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between gap-3">
                            <div className="text-xs text-zinc-400 flex items-center gap-1">
                              <Zap size={12} className="text-green-500" />
                              Valor estimado de Cash Out:
                              <span className="font-bold text-green-400 ml-1">R$ {cashoutEstimate(bet)}</span>
                            </div>
                            <motion.button
                              animate={{ boxShadow: ["0 0 0px #22c55e00", "0 0 12px #22c55e55", "0 0 0px #22c55e00"] }}
                              transition={{ duration: 2, repeat: Infinity }}
                              onClick={() => setCashoutConfirm(bet)}
                              disabled={cashingOut === bet.id}
                              className="shrink-0 bg-green-600 hover:bg-green-500 text-white text-xs font-black px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {cashingOut === bet.id ? <Loader2 className="animate-spin" size={14} /> : "CASH OUT"}
                            </motion.button>
                          </div>
                        )}
                        {(bet.status === "won" || bet.status === "lost") && (
                          <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center gap-2 text-xs text-zinc-600">
                            <AlertCircle size={12} />
                            Cash Out indisponível — aposta encerrada
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* DESKTOP BET SLIP */}
        <aside className="hidden lg:block w-96 border-l border-zinc-900 bg-zinc-950 sticky top-16 h-[calc(100vh-4rem)]">
          <BetSlipContent />
        </aside>
      </div>

      {/* MOBILE BET SLIP */}
      <div className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        {bets.length > 0 && (
          <Drawer open={betSlipOpenMobile} onOpenChange={setBetSlipOpenMobile}>
            <DrawerTrigger asChild>
              <Button className="bg-red-600 hover:bg-red-700 text-white rounded-full shadow-lg shadow-red-900/20 px-6 h-14 font-bold flex gap-3">
                BOLETIM <span className="bg-white text-red-600 rounded-full w-6 h-6 flex items-center justify-center text-xs">{bets.length}</span>
              </Button>
            </DrawerTrigger>
            <DrawerContent className="bg-zinc-950 border-zinc-800 text-white h-[85vh] p-0">
              <BetSlipContent />
            </DrawerContent>
          </Drawer>
        )}
      </div>

      {/* FOOTER */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-12 mt-auto">
        <div className="max-w-[1600px] mx-auto px-4 text-center">
          <div className="font-black text-3xl tracking-tighter italic opacity-20 mb-8"><span>BET</span><span>62</span></div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-zinc-500 mb-8">
            <a href="#" className="hover:text-white transition-colors">Termos e Condições</a>
            <a href="#" className="hover:text-white transition-colors">Política de Privacidade</a>
            <a href="#" className="hover:text-white transition-colors">Jogo Responsável</a>
          </div>
          <div className="flex items-center justify-center gap-3 text-xs text-zinc-600">
            <div className="w-8 h-8 rounded-full border border-zinc-700 flex items-center justify-center font-bold">18+</div>
            <span>© 2026 Bet62 • Apostas Responsáveis</span>
          </div>
        </div>
      </footer>

      {/* CASH OUT CONFIRM */}
      <Dialog open={!!cashoutConfirm} onOpenChange={(open) => !open && setCashoutConfirm(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Zap className="text-green-500" size={20} /> Confirmar Cash Out
            </DialogTitle>
          </DialogHeader>
          {cashoutConfirm && (
            <div className="space-y-4">
              <p className="text-zinc-400 text-sm">Tem certeza que deseja fazer o Cash Out desta aposta?</p>
              <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                <div className="text-sm text-zinc-400 mb-1 truncate">{cashoutConfirm.matchTitle}</div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-zinc-500">Valor apostado</span>
                  <span className="font-bold text-white">R$ {parseFloat(cashoutConfirm.stake).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-zinc-500">Potencial de ganho</span>
                  <span className="font-bold text-zinc-300">R$ {parseFloat(cashoutConfirm.potentialWin).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-zinc-800">
                  <span className="text-sm font-bold text-zinc-300">Cash Out estimado</span>
                  <span className="font-black text-green-400 text-lg">R$ {cashoutEstimate(cashoutConfirm)}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => setCashoutConfirm(null)}>Cancelar</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold" onClick={() => handleCashout(cashoutConfirm)} disabled={cashingOut === cashoutConfirm.id}>
                  {cashingOut === cashoutConfirm.id ? <Loader2 className="animate-spin" size={16} /> : "CONFIRMAR"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AUTH MODAL */}
      <Dialog open={authModalOpen} onOpenChange={setAuthModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-md p-0 overflow-hidden max-h-[95vh] overflow-y-auto">
          <div className="bg-zinc-900 p-6 border-b border-zinc-800 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-red-600/10 blur-xl"></div>
            <div className="relative font-black text-3xl tracking-tighter italic">
              <span className="text-white">BET</span><span className="text-red-600">62</span>
            </div>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="w-full bg-zinc-950 border-b border-zinc-800 rounded-none p-0 h-auto">
              <TabsTrigger value="login" className="flex-1 rounded-none data-[state=active]:bg-zinc-900 data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-600 py-4 text-sm font-bold uppercase">Entrar</TabsTrigger>
              <TabsTrigger value="register" className="flex-1 rounded-none data-[state=active]:bg-zinc-900 data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-600 py-4 text-sm font-bold uppercase">Criar Conta</TabsTrigger>
            </TabsList>

            <div className="p-6">
              <TabsContent value="login" className="mt-0 space-y-4">
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">E-mail</Label>
                    <Input id="login-email" type="email" placeholder="seu@email.com" className="bg-zinc-900 border-zinc-800 text-white" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <Input id="login-password" type="password" placeholder="••••••••" className="bg-zinc-900 border-zinc-800 text-white" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-12 mt-2" disabled={authLoading}>
                    {authLoading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}ENTRAR
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register" className="mt-0">
                <form onSubmit={handleRegisterSubmit} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-name" className="text-sm">Nome Completo</Label>
                    <Input id="reg-name" type="text" placeholder="Seu nome completo" className="bg-zinc-900 border-zinc-800 text-white" required value={regName} onChange={e => setRegName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-cpf" className="text-sm">CPF</Label>
                      <Input id="reg-cpf" type="text" placeholder="000.000.000-00" className="bg-zinc-900 border-zinc-800 text-white" required maxLength={14} value={regCpf} onChange={e => setRegCpf(cpfMask(e.target.value))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-phone" className="text-sm">Celular</Label>
                      <Input id="reg-phone" type="tel" placeholder="(11) 99999-9999" className="bg-zinc-900 border-zinc-800 text-white" required maxLength={15} value={regPhone} onChange={e => setRegPhone(phoneMask(e.target.value))} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-email" className="text-sm">E-mail</Label>
                    <Input id="reg-email" type="email" placeholder="seu@email.com" className="bg-zinc-900 border-zinc-800 text-white" required value={regEmail} onChange={e => setRegEmail(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-dob" className="text-sm">Data de Nascimento</Label>
                      <Input id="reg-dob" type="date" className="bg-zinc-900 border-zinc-800 text-white" required value={regDob} onChange={e => setRegDob(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-password" className="text-sm">Senha</Label>
                      <Input id="reg-password" type="password" placeholder="••••••••" className="bg-zinc-900 border-zinc-800 text-white" required value={regPassword} onChange={e => setRegPassword(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2 pt-1">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" className="mt-0.5 accent-red-600" checked={regTerms} onChange={e => setRegTerms(e.target.checked)} required />
                      <span className="text-xs text-zinc-400 leading-relaxed">
                        Li e aceito os <a href="#" className="text-red-400 hover:underline">Termos de Uso</a> e a <a href="#" className="text-red-400 hover:underline">Política de Privacidade</a>
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" className="mt-0.5 accent-red-600" checked={regAge} onChange={e => setRegAge(e.target.checked)} required />
                      <span className="text-xs text-zinc-400">Confirmo que tenho 18 anos ou mais</span>
                    </label>
                  </div>
                  <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-12 mt-1" disabled={authLoading}>
                    {authLoading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}CRIAR CONTA
                  </Button>
                </form>
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

    </div>
  );
}
