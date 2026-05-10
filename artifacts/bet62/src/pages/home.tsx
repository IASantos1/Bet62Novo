import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Menu, X, Trophy, Activity, Gift,
  LogOut, User, History, Loader2, Zap, TrendingUp,
  ChevronRight, ChevronLeft, AlertCircle, BarChart2, Wallet, ArrowDownCircle, ArrowUpCircle, Plus,
} from "lucide-react";
import ProfileTab from "@/components/ProfileTab";
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
  "La Liga": "🇪🇸", "Laliga": "🇪🇸", "Laliga2": "🇪🇸", "Segunda": "🇪🇸", "LaLiga Hypermotion": "🇪🇸", "Copa del Rey": "🇪🇸",
  "Premier League": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "EFL Championship": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Championship": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "League One": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "FA Cup": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Champions League": "⭐", "UEFA Champions League": "⭐", "Europa League": "🌟", "Conference League": "🟢",
  "Serie A": "🇮🇹", "Serie B": "🇮🇹", "Coppa Italia": "🇮🇹",
  "Bundesliga": "🇩🇪", "2. Bundesliga": "🇩🇪", "DFB-Pokal": "🇩🇪",
  "Ligue 1": "🇫🇷", "Ligue 2": "🇫🇷", "Coupe de France": "🇫🇷",
  "Liga Portugal": "🇵🇹", "Primeira Liga": "🇵🇹", "Segunda Liga": "🇵🇹", "Liga Portugal 2": "🇵🇹", "Taça de Portugal": "🇵🇹",
  "Eredivisie": "🇳🇱", "Eerste Divisie": "🇳🇱", "KNVB Cup": "🇳🇱",
  "Belgian Pro League": "🇧🇪", "Pro League": "🇧🇪", "Belgian Cup": "🇧🇪", "Jupiler Pro League": "🇧🇪",
  "Süper Lig": "🇹🇷", "Super Lig": "🇹🇷", "TFF First League": "🇹🇷", "Turkish Cup": "🇹🇷",
  "Super League Greece": "🇬🇷", "Super League 2": "🇬🇷", "Greek Cup": "🇬🇷",
  "Austrian Bundesliga": "🇦🇹", "Austrian Cup": "🇦🇹",
  "Scottish Premiership": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Scottish Championship": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Scottish Cup": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Swiss Super League": "🇨🇭", "Challenge League": "🇨🇭",
  "Danish Superliga": "🇩🇰", "Danish 1st Division": "🇩🇰",
  "Eliteserien": "🇳🇴", "Norwegian Cup": "🇳🇴",
  "Allsvenskan": "🇸🇪", "Superettan": "🇸🇪",
  "HNL": "🇭🇷", "Croatian Football Cup": "🇭🇷",
  "Serbian SuperLiga": "🇷🇸", "Serbian Cup": "🇷🇸",
  "Brasileirao": "🇧🇷", "Brasileirão": "🇧🇷", "Série A Brasil": "🇧🇷", "Campeonato Brasileiro": "🇧🇷", "Copa do Brasil": "🇧🇷", "Campeonato Paulista": "🇧🇷", "Campeonato Carioca": "🇧🇷",
  "Primera División": "🇦🇷", "Primera Division": "🇦🇷", "Liga Argentina": "🇦🇷", "Copa Argentina": "🇦🇷",
  "MLS": "🇺🇸", "NBA": "🇺🇸", "NHL": "🇺🇸",
  "EuroLeague": "⭐", "NBB — Brasil": "🇧🇷",
  "ATP 500": "🎾", "ATP 250": "🎾", "WTA 1000": "🎾", "WTA 250": "🎾", "Roland Garros": "🇫🇷",
  "NHL — Playoffs": "🏒", "KHL — Playoff": "🏒",
  "Volleyball Nations League": "🏐", "Superlega — Itália": "🏐", "Superliga — Rússia": "🏐", "Superliga — Brasil": "🏐",
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

const ARENA_BANNER = "/arena-banner.png";

function getMatchBanner(match: { home: string; country?: string; sport?: string }): string | undefined {
  // Only use football team banners for football — no image for basketball/tennis/hockey/volleyball
  if (!match.sport || match.sport === "football") {
    return getTeamBanner(match.home, match.country);
  }
  return undefined;
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

// ─── Sidebar tree data ────────────────────────────────────────────────────────

const FOOTBALL_COUNTRIES: { name: string; flag: string; leagues: string[] }[] = [
  { name: "Europa", flag: "⭐", leagues: ["Champions League", "Europa League", "Conference League"] },
  { name: "Inglaterra", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", leagues: ["Premier League", "EFL Championship", "League One", "FA Cup"] },
  { name: "Espanha", flag: "🇪🇸", leagues: ["La Liga", "LaLiga Hypermotion", "Copa del Rey"] },
  { name: "Alemanha", flag: "🇩🇪", leagues: ["Bundesliga", "2. Bundesliga", "DFB-Pokal"] },
  { name: "Itália", flag: "🇮🇹", leagues: ["Serie A", "Serie B", "Coppa Italia"] },
  { name: "França", flag: "🇫🇷", leagues: ["Ligue 1", "Ligue 2", "Coupe de France"] },
  { name: "Portugal", flag: "🇵🇹", leagues: ["Liga Portugal", "Liga Portugal 2", "Taça de Portugal"] },
  { name: "Holanda", flag: "🇳🇱", leagues: ["Eredivisie", "Eerste Divisie"] },
  { name: "Bélgica", flag: "🇧🇪", leagues: ["Jupiler Pro League", "Belgian Cup"] },
  { name: "Turquia", flag: "🇹🇷", leagues: ["Süper Lig", "TFF First League", "Turkish Cup"] },
  { name: "Grécia", flag: "🇬🇷", leagues: ["Super League Greece", "Super League 2", "Greek Cup"] },
  { name: "Áustria", flag: "🇦🇹", leagues: ["Austrian Bundesliga", "Austrian Cup"] },
  { name: "Escócia", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", leagues: ["Scottish Premiership", "Scottish Championship", "Scottish Cup"] },
  { name: "Suíça", flag: "🇨🇭", leagues: ["Swiss Super League", "Challenge League"] },
  { name: "Dinamarca", flag: "🇩🇰", leagues: ["Danish Superliga", "Danish 1st Division"] },
  { name: "Noruega", flag: "🇳🇴", leagues: ["Eliteserien", "Norwegian Cup"] },
  { name: "Suécia", flag: "🇸🇪", leagues: ["Allsvenskan", "Superettan"] },
  { name: "Croácia", flag: "🇭🇷", leagues: ["HNL", "Croatian Football Cup"] },
  { name: "Sérvia", flag: "🇷🇸", leagues: ["Serbian SuperLiga", "Serbian Cup"] },
  { name: "Brasil", flag: "🇧🇷", leagues: ["Brasileirão", "Copa do Brasil", "Campeonato Paulista", "Campeonato Carioca"] },
  { name: "Argentina", flag: "🇦🇷", leagues: ["Primera División", "Copa Argentina"] },
  { name: "EUA", flag: "🇺🇸", leagues: ["MLS"] },
];

const OTHER_SPORTS: { key: string; label: string; icon: string; leagues: string[] }[] = [
  { key: "basketball", label: "Basquete", icon: "🏀", leagues: ["NBA", "EuroLeague", "NBB — Brasil"] },
  { key: "tennis", label: "Tênis", icon: "🎾", leagues: ["Roland Garros", "ATP 500", "ATP 250", "WTA 1000", "WTA 250"] },
  { key: "hockey", label: "Hóquei", icon: "🏒", leagues: ["NHL — Playoffs", "KHL — Playoff"] },
  { key: "volleyball", label: "Voleibol", icon: "🏐", leagues: ["Volleyball Nations League", "Superlega — Itália", "Superliga — Rússia", "Superliga — Brasil"] },
];

type TopLeagueEntry = { league: string; country: string; sport: string };

type SidebarTreeContentProps = {
  selectedSport: string;
  setSelectedSport: (s: string) => void;
  setActiveTab: (tab: "sports" | "live" | "promos" | "mybets" | "wallet") => void;
  onClose?: () => void;
  expandedSport: string | null;
  setExpandedSport: (s: string | null) => void;
  expandedCountry: string | null;
  setExpandedCountry: (c: string | null) => void;
  compact?: boolean;
  topLeagues?: TopLeagueEntry[];
  selectedLeague?: string | null;
  setSelectedLeague?: (l: string | null) => void;
};

function SidebarTreeContent({
  selectedSport, setSelectedSport, setActiveTab, onClose,
  expandedSport, setExpandedSport, expandedCountry, setExpandedCountry, compact,
  topLeagues, selectedLeague, setSelectedLeague,
}: SidebarTreeContentProps) {
  const py = compact ? "py-1.5" : "py-2";
  const textSize = compact ? "text-[12px]" : "text-[13px]";

  function go(sport: string) {
    setSelectedSport(sport);
    setActiveTab("sports");
    onClose?.();
  }

  function toggleSport(key: string) {
    if (expandedSport === key) {
      setExpandedSport(null);
      setExpandedCountry(null);
    } else {
      setExpandedSport(key);
      setExpandedCountry(null);
    }
  }

  return (
    <div className="space-y-0.5">
      {/* Top Competições */}
      {topLeagues && topLeagues.length > 0 && setSelectedLeague && (
        <div className="mb-3">
          <div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest px-2 mb-1.5">Top Competições</div>
          <div className="space-y-0.5">
            {topLeagues.map(l => {
              const flag = COUNTRY_FLAGS[l.country?.toLowerCase() ?? ""] ?? (l.sport === "basketball" ? "🏀" : l.sport === "tennis" ? "🎾" : l.sport === "hockey" ? "🏒" : l.sport === "volleyball" ? "🏐" : "⚽");
              const active = selectedLeague === l.league;
              return (
                <button
                  key={l.league}
                  onClick={() => { setSelectedLeague(active ? null : l.league); setActiveTab("sports"); onClose?.(); }}
                  className={`flex items-center gap-2 w-full px-2 ${py} rounded-md ${textSize} transition-colors ${active ? "bg-red-600/20 text-red-400 border border-red-500/30" : "hover:bg-zinc-900 text-zinc-400 hover:text-white"}`}
                >
                  <span className="text-xs leading-none shrink-0">{flag}</span>
                  <span className="truncate text-left flex-1">{l.league}</span>
                </button>
              );
            })}
          </div>
          <div className="h-px bg-zinc-800 mx-2 mt-2 mb-2" />
          <div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest px-2 mb-1.5">Esportes</div>
        </div>
      )}

      {/* Todos */}
      <button
        onClick={() => { go("all"); setSelectedLeague?.(null); }}
        className={`flex items-center gap-2.5 w-full px-2 ${py} rounded-md ${textSize} transition-colors ${selectedSport === "all" && !selectedLeague ? "bg-red-600/20 text-red-400 border border-red-500/30" : "hover:bg-zinc-900 text-zinc-400 hover:text-white"}`}
      >
        <span className="text-sm leading-none text-red-500">🏆</span>
        <span>Todos</span>
      </button>

      {/* Futebol */}
      <div>
        <button
          onClick={() => toggleSport("football")}
          className={`flex items-center gap-2.5 w-full px-2 ${py} rounded-md ${textSize} transition-colors ${expandedSport === "football" ? "bg-zinc-800 text-white" : selectedSport === "football" ? "bg-red-600/20 text-red-400 border border-red-500/30" : "hover:bg-zinc-900 text-zinc-400 hover:text-white"}`}
        >
          <span className="text-sm leading-none text-red-500">⚽</span>
          <span className="flex-1 text-left">Futebol</span>
          <ChevronRight size={12} className={`transition-transform ${expandedSport === "football" ? "rotate-90 text-red-400" : "text-zinc-600"}`} />
        </button>
        {expandedSport === "football" && (
          <div className="ml-2 mt-0.5 space-y-0.5 border-l border-zinc-800 pl-2">
            {FOOTBALL_COUNTRIES.map(({ name, flag, leagues }) => (
              <div key={name}>
                <button
                  onClick={() => setExpandedCountry(expandedCountry === name ? null : name)}
                  className={`flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[12px] transition-colors ${expandedCountry === name ? "bg-zinc-800 text-white" : "hover:bg-zinc-900 text-zinc-400 hover:text-white"}`}
                >
                  <span className="text-xs leading-none shrink-0">{flag}</span>
                  <span className="flex-1 text-left truncate">{name}</span>
                  <ChevronRight size={10} className={`transition-transform shrink-0 ${expandedCountry === name ? "rotate-90 text-red-400" : "text-zinc-600"}`} />
                </button>
                {expandedCountry === name && (
                  <div className="ml-2 mt-0.5 space-y-0.5 border-l border-zinc-800 pl-2">
                    {leagues.map(league => (
                      <button
                        key={league}
                        onClick={() => go("football")}
                        className="flex items-center gap-1.5 w-full px-2 py-1 rounded-md text-[11px] text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors"
                      >
                        <span className="text-xs leading-none shrink-0">{LEAGUE_FLAGS[league] ?? "⚽"}</span>
                        <span className="truncate">{league}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Other sports */}
      {OTHER_SPORTS.map(({ key, label, icon, leagues }) => (
        <div key={key}>
          <button
            onClick={() => toggleSport(key)}
            className={`flex items-center gap-2.5 w-full px-2 ${py} rounded-md ${textSize} transition-colors ${expandedSport === key ? "bg-zinc-800 text-white" : selectedSport === key ? "bg-red-600/20 text-red-400 border border-red-500/30" : "hover:bg-zinc-900 text-zinc-400 hover:text-white"}`}
          >
            <span className="text-sm leading-none text-red-500">{icon}</span>
            <span className="flex-1 text-left">{label}</span>
            <ChevronRight size={12} className={`transition-transform ${expandedSport === key ? "rotate-90 text-red-400" : "text-zinc-600"}`} />
          </button>
          {expandedSport === key && (
            <div className="ml-2 mt-0.5 space-y-0.5 border-l border-zinc-800 pl-2">
              {leagues.map(league => (
                <button
                  key={league}
                  onClick={() => go(key)}
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[12px] text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                >
                  <span className="text-xs leading-none shrink-0">{LEAGUE_FLAGS[league] ?? "🏆"}</span>
                  <span className="truncate">{league}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Types ---
type Odds = { home: number; draw: number; away: number };
type AdvancedMarkets = {
  doubleChance: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  bothTeamsScore: { yes: number; no: number };
  totalGoals: { over05: number; under05: number; over15: number; under15: number; over25: number; under25: number; over35: number; under35: number; over45: number; under45: number; over55: number; under55: number };
  handicap: { homeMinusOne: number; awayPlusOne: number; homeMinusOneHalf: number; awayPlusOneHalf: number };
  halfTime: { home: number; draw: number; away: number };
  firstGoal: { home: number; noGoal: number; away: number };
  _spread?: number;
  _total?: number;
  _total1H?: number;
  _spreadLine?: number;
  // Extended football markets
  drawNoBet?: { home: number; away: number };
  asianHandicap?: { line: number; home: number; away: number };
  asianTotals?: { o05: number; u05: number; o45: number; u45: number; o55: number; u55: number; o225: number; u225: number; o275: number; u275: number };
  htft?: { hh: number; hd: number; ha: number; dh: number; dd: number; da: number; ah: number; ad: number; aa: number };
  correctScore?: Record<string, number>;
  corners?: { o85: number; u85: number; o95: number; u95: number; o105: number; u105: number };
  cards?: { o35: number; u35: number; o45: number; u45: number };
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
  // market key → reopen timestamp (ms); if in future, market is suspended
  marketSuspension?: Record<string, number>;
  // reason for current suspension (GOLO!, PENÁLTI, REVISÃO AO VAR, etc.)
  _suspensionReason?: string;
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

function nifMask(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 9)
    .replace(/(\d{3})(\d)/, "$1 $2")
    .replace(/(\d{3})(\d)/, "$1 $2");
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
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

const USER_EMOJIS = ["🦁","🐯","🦊","🐺","🦅","🦋","🐉","🦄","🐬","🦈","🦝","🐻","🦸","🧙","🏆","⚡","🔥","💎","🎯","🚀"];
function userEmoji(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return USER_EMOJIS[hash % USER_EMOJIS.length]!;
}

function cardMask(value: string) {
  return value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}

function sportEmoji(sport?: string): string {
  if (sport === "basketball") return "🏀";
  if (sport === "tennis") return "🎾";
  if (sport === "hockey") return "🏒";
  if (sport === "volleyball") return "🏐";
  return "⚽";
}

export default function Home() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<"sports" | "live" | "promos" | "mybets" | "wallet" | "profile">("sports");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bets, setBets] = useState<BetSelection[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [expandedMatch, setExpandedMatch] = useState<Match | null>(null);
  const [betSlipOpenMobile, setBetSlipOpenMobile] = useState(false);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [betMode, setBetMode] = useState<"simples" | "multipla">("multipla");
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);

  // Auth form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regNif, setRegNif] = useState("");
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

  // Deposit modal
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [promoNotif, setPromoNotif] = useState<null | { type: "freebets20" | "bonus100" | "cashback"; amount?: number }>(null);

  // Cashback state
  const [cashbackData, setCashbackData] = useState<{ totalLost: number; cashback: number; bets: number } | null>(null);

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

  // Sidebar tree state
  const [sidebarExpandedSport, setSidebarExpandedSport] = useState<string | null>(null);
  const [sidebarExpandedCountry, setSidebarExpandedCountry] = useState<string | null>(null);

  // Top Competições — computed from live + upcoming matches
  const PRIORITY_LEAGUES = [
    "UEFA Champions League", "Champions League",
    "Premier League", "La Liga", "Bundesliga", "Serie A",
    "Ligue 1", "Liga Portugal", "Eredivisie",
    "Copa do Brasil", "Brasileirão", "Serie B",
    "Copa del Rey", "DFB-Pokal", "FA Cup",
    "Europa League", "UEFA Europa League",
    "Conference League", "Liga MX",
  ];
  const sidebarTopLeagues = (() => {
    const leagueMap = new Map<string, TopLeagueEntry>();
    [...liveMatches, ...upcomingMatches].forEach(m => {
      if (!leagueMap.has(m.league)) {
        leagueMap.set(m.league, { league: m.league, country: m.country || "", sport: m.sport || "football" });
      }
    });
    const available = Array.from(leagueMap.values());
    const priority = available.filter(l => PRIORITY_LEAGUES.some(p => l.league.toLowerCase().includes(p.toLowerCase())));
    return (priority.length > 0 ? priority : available).slice(0, 8);
  })();

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
      sport: expandedMatch.sport ?? "football",
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

  // Fetch live matches — polls every 5s
  const fetchLive = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLiveLoading(true);
    try {
      const res = await fetch("/api/matches/live");
      if (res.ok) {
        const data = await res.json();
        const matches = (data.matches || []) as Array<{
          id: string; home: string; away: string; league: string;
          country?: string; sport?: string;
          homeScore: number; awayScore: number; minute: number;
          hasRealOdds?: boolean; odds: Odds; markets?: AdvancedMarkets;
          events?: Array<{ type: string; team: string; minute: number; player: string }>;
          marketSuspension?: Record<string, number>;
          _suspensionReason?: string;
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
      const interval = setInterval(() => fetchLive(false), 5000);
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
      toast.success(`Cash Out realizado! € ${parseFloat(data.cashoutValue).toFixed(2)} adicionado ao seu saldo.`);
      auth.refreshUser();
      fetchMyBets();
    } catch {
      toast.error("Erro ao fazer cash out");
    } finally {
      setCashingOut(null);
      setCashoutConfirm(null);
    }
  };

  // Fetch cashback when opening promos tab
  const fetchCashback = useCallback(async () => {
    if (!auth.user) return;
    try {
      const token = localStorage.getItem("bet62_token");
      const r = await fetch("/api/auth/cashback", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setCashbackData(await r.json());
    } catch { /* non-critical */ }
  }, [auth.user]);


  const toggleBet = (match: Match, selection: string, odd: number, market = "result", label?: string) => {
    setBets(prev => {
      const isSelected = prev.find(b => b.matchId === match.id && b.market === market && b.selection === selection);
      if (isSelected) {
        return prev.filter(b => !(b.matchId === match.id && b.market === market && b.selection === selection));
      }
      const hasFromSameMatch = prev.some(b => b.matchId === match.id && !(b.market === market && b.selection === selection));
      if (hasFromSameMatch) {
        setBetMode("simples");
      }
      return [...prev, {
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

  const hasDuplicateMatches = bets.length > 1 && new Set(bets.map(b => String(b.matchId))).size < bets.length;
  const effectiveBetMode: "simples" | "multipla" = hasDuplicateMatches ? "simples" : betMode;
  const totalOdds = bets.reduce((acc, bet) => acc * bet.odd, 1).toFixed(2);
  const [stake, setStake] = useState<string>("");
  const [betStakes, setBetStakes] = useState<Record<string, string>>({});
  const betKey = (b: BetSelection) => `${b.matchId}-${b.market}-${b.selection}`;
  const simplesPotential = bets.reduce((sum, b) => sum + b.odd * parseFloat(betStakes[betKey(b)] || "0"), 0).toFixed(2);

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
      toast.success("Conta criada com sucesso! Bem-vindo à Bet62!");
      setRegName(""); setRegEmail(""); setRegPassword(""); setRegNif(""); setRegPhone(""); setRegDob(""); setRegTerms(false); setRegAge(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar conta");
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePlaceBet = async () => {
    if (!auth.user) { setAuthModalOpen(true); return; }

    if (effectiveBetMode === "simples") {
      const missing = bets.some(b => !betStakes[betKey(b)] || parseFloat(betStakes[betKey(b)] || "0") <= 0);
      if (missing) { toast.error("Insira o valor para cada aposta no boletim"); return; }
      const totalCost = bets.reduce((s, b) => s + parseFloat(betStakes[betKey(b)] || "0"), 0);
      if (totalCost > parseFloat(auth.user.balance)) { toast.error("Saldo insuficiente"); return; }
      setIsPlacingBet(true);
      try {
        let allOk = true;
        for (const bet of bets) {
          const sNum = parseFloat(betStakes[betKey(bet)] || "0");
          const potentialWin = (sNum * bet.odd).toFixed(2);
          const res = await fetch("/api/bets/place", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
            body: JSON.stringify({
              matchId: String(bet.matchId),
              matchTitle: bet.matchTitle,
              selections: [{ matchTitle: bet.matchTitle, selection: bet.selection, odd: bet.odd, market: bet.market }],
              stake: sNum.toFixed(2),
              potentialWin,
              totalOdds: bet.odd.toFixed(2),
            })
          });
          const data = await res.json();
          if (!res.ok) { toast.error(data.error || "Erro ao realizar aposta"); allOk = false; break; }
        }
        if (allOk) {
          toast.success(`${bets.length} aposta${bets.length > 1 ? "s" : ""} realizada${bets.length > 1 ? "s" : ""}! Total: € ${totalCost.toFixed(2)}`);
          setBets([]); setBetStakes({}); setStake(""); setBetSlipOpenMobile(false); auth.refreshUser();
        }
      } catch { toast.error("Erro ao realizar aposta"); } finally { setIsPlacingBet(false); }
      return;
    }

    // Múltipla mode
    if (!stake) { toast.error("Insira um valor para apostar"); return; }
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
      toast.success(`Aposta múltipla realizada! Potencial de ganho: € ${potentialWin}`);
      setBets([]); setBetStakes({}); setStake(""); setBetSlipOpenMobile(false); auth.refreshUser();
    } catch { toast.error("Erro ao realizar aposta"); } finally { setIsPlacingBet(false); }
  };

  // --- UI Components ---

  const OddsButton = ({ match, selection, odd, market = "result", label, grow }: {
    match: Match; selection: string; odd: number; market?: string; label: string; grow?: boolean;
  }) => {
    const now = Date.now();
    const suspendedUntil = match.marketSuspension?.[market];
    const isSuspended = suspendedUntil !== undefined && suspendedUntil > now;
    const isSelected = !!bets.find(b => b.matchId === match.id && b.market === market && b.selection === selection);
    const prevOdd = match.isLive ? prevLiveOdds.current[String(match.id)]?.[selection as keyof Odds] : undefined;
    const oddsUp = !isSuspended && prevOdd !== undefined && odd > prevOdd;
    const oddsDown = !isSuspended && prevOdd !== undefined && odd < prevOdd;

    if (isSuspended) {
      return null;
    }

    if (match.isLive && market === "result" && odd <= 1.01) {
      return (
        <div className={`relative flex flex-col items-center py-2.5 px-2 rounded-md text-xs ${grow ? "flex-1" : ""} bg-amber-900/20 border border-amber-600/30`}>
          <span className="mb-0.5 text-[10px] leading-tight opacity-50">{label}</span>
          <span className="font-bold text-[9px] text-amber-400 uppercase tracking-wider">Aposta Já</span>
        </div>
      );
    }

    return (
      <button
        onClick={() => toggleBet(match, selection, odd, market, label)}
        className={`relative flex flex-col items-center py-2.5 px-2 rounded-md transition-all text-xs ${grow ? "flex-1" : ""} ${isSelected ? "bg-red-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}
      >
        <span className="mb-0.5 text-[10px] leading-tight opacity-70">{label}</span>
        <span className="font-bold text-sm flex items-center gap-0.5">
          {odd.toFixed(2)}
          {oddsUp && <span className="text-green-400 text-[9px] font-black leading-none shrink-0">▲</span>}
          {oddsDown && <span className="text-red-400 text-[9px] font-black leading-none shrink-0">▼</span>}
        </span>
      </button>
    );
  };

  // Returns a single wide red button when match markets are suspended, null otherwise
  const SuspensionBanner = ({ match }: { match: Match }) => {
    const now = Date.now();
    const isActive = match.marketSuspension && Object.values(match.marketSuspension).some(ts => ts > now);
    if (!isActive) return null;
    const reason = match._suspensionReason ?? "SUSPENSO";
    return (
      <button
        disabled
        className="w-full py-2.5 px-3 rounded-md bg-red-950 border border-red-800/60 text-red-200 font-bold text-sm tracking-widest cursor-not-allowed select-none"
      >
        {reason}
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
            <span className="absolute -bottom-0.5 -right-1 bg-zinc-950 rounded-full text-[9px] w-3.5 h-3.5 flex items-center justify-center border border-zinc-800">{sportEmoji(match.sport)}</span>
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
    const flag = COUNTRY_FLAGS[match.country?.toLowerCase() ?? ""] ?? sportEmoji(match.sport);
    const bannerImg = getMatchBanner(match);
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
              <div className="relative w-5 h-5 flex items-center justify-center leading-none text-sm">
                {flag}
                <span className="absolute -bottom-0.5 -right-1.5 bg-black/60 rounded-full text-[8px] w-3 h-3 flex items-center justify-center">{sportEmoji(match.sport)}</span>
              </div>
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
                <SuspensionBanner match={match} />
                {!match.marketSuspension || !Object.values(match.marketSuspension).some(ts => ts > Date.now()) ? (<>
                  <OddsButton match={match} selection="home" odd={match.odds.home} market="result" label="Casa" grow />
                  <OddsButton match={match} selection="draw" odd={match.odds.draw} market="result" label="Emp." grow />
                  <OddsButton match={match} selection="away" odd={match.odds.away} market="result" label="Fora" grow />
                </>) : null}
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
              <SuspensionBanner match={match} />
              {!match.marketSuspension || !Object.values(match.marketSuspension).some(ts => ts > Date.now()) ? (<>
                <OddsButton match={match} selection="home" odd={match.odds.home} market="result" label="Casa" grow />
                <OddsButton match={match} selection="draw" odd={match.odds.draw} market="result" label="Emp." grow />
                <OddsButton match={match} selection="away" odd={match.odds.away} market="result" label="Fora" grow />
              </>) : null}
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  const MatchCard = ({ match }: { match: Match }) => {
    const flag = COUNTRY_FLAGS[match.country?.toLowerCase() ?? ""] ?? sportEmoji(match.sport);
    const dateStr = match.date ? formatMatchDate(match.date) : "";
    const bannerImg = getMatchBanner(match);
    const rivalry = RIVALRY_TAGS[`${match.home}|${match.away}`];
    const hasDraw = match.odds.draw > 0;

    const isSuspendedMatch = !!match.marketSuspension && Object.values(match.marketSuspension).some(ts => ts > Date.now());
    const OddsRow = () => match.hasRealOdds ? (
      <div className="flex gap-2 w-full">
        <SuspensionBanner match={match} />
        {!isSuspendedMatch && (<>
          <OddsButton match={match} selection="home" odd={match.odds.home} market="result" label={hasDraw ? "Casa" : match.home.split(" ").slice(-1)[0]} grow />
          {hasDraw && <OddsButton match={match} selection="draw" odd={match.odds.draw} market="result" label="Emp." grow />}
          <OddsButton match={match} selection="away" odd={match.odds.away} market="result" label={hasDraw ? "Fora" : match.away.split(" ").slice(-1)[0]} grow />
        </>)}
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
              <div className="relative w-5 h-5 flex items-center justify-center leading-none text-sm">
                {flag}
                <span className="absolute -bottom-0.5 -right-1.5 bg-black/60 rounded-full text-[8px] w-3 h-3 flex items-center justify-center">{sportEmoji(match.sport)}</span>
              </div>
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

  // ─── Múltiplas Populares Banners ──────────────────────────────────
  const PopularBanners = () => {
    if (upcomingMatches.length === 0) return null;

    const BANNER_CONFIGS = [
      { title: "MÚLTIPLAS", subtitle: "POPULARES", bonus: "+8.5%",  label: "🔥 COMBOS POPULARES",   count: "200+ apostas" },
      { title: "TOP",       subtitle: "APOSTAS",   bonus: "+12.5%", label: "⭐ MAIS APOSTADOS",      count: "150+ apostas" },
      { title: "ALTA",      subtitle: "RETORNO",   bonus: "+15%",   label: "💰 ALTO RETORNO",         count: "100+ apostas" },
      { title: "EM",        subtitle: "DESTAQUE",  bonus: "+10%",   label: "🏆 FAVORITOS DO DIA",     count: "80+ apostas"  },
    ];

    // Interleave matches from different leagues/countries so each banner has variety
    const byLeague = new Map<string, Match[]>();
    for (const m of upcomingMatches) {
      const key = `${m.country ?? ""}|${m.league ?? ""}`;
      if (!byLeague.has(key)) byLeague.set(key, []);
      byLeague.get(key)!.push(m);
    }
    const leagueGroups = Array.from(byLeague.values());
    const interleaved: Match[] = [];
    const maxLen = leagueGroups.reduce((a, b) => Math.max(a, b.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const grp of leagueGroups) {
        if (i < grp.length) interleaved.push(grp[i]);
      }
    }

    const chunks: Match[][] = BANNER_CONFIGS.map((_, i) =>
      interleaved.slice(i * 5, i * 5 + 5)
    ).filter(c => c.length > 0);

    if (chunks.length === 0) return null;

    const addAllToBetSlip = (events: Match[]) => {
      events.forEach(m => {
        if (m.odds.home > 0) {
          const alreadyIn = bets.find(b => b.matchId === m.id && b.market === "result" && b.selection === "home");
          if (!alreadyIn) toggleBet(m, "home", m.odds.home, "result", m.home);
        }
      });
      setBetSlipOpenMobile(true);
    };

    return (
      <div className="mb-6">
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none" style={{ scrollbarWidth: "none" }}>
          {chunks.map((events, bi) => {
            const cfg = BANNER_CONFIGS[bi];
            const totalOddsVal = events
              .reduce((acc, m) => acc * (m.odds.home > 0 ? m.odds.home : 1), 1)
              .toFixed(2);

            return (
              <div
                key={bi}
                className="snap-center shrink-0 w-[268px] rounded-[22px] p-4 flex flex-col"
                style={{
                  background: "linear-gradient(180deg,#1c0a0a,#0a0a0a)",
                  border: "1px solid rgba(220,38,38,0.2)",
                  boxShadow: "0 0 24px rgba(220,38,38,0.1)",
                }}
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-3">
                  <div className="leading-[1.1]">
                    <div className="font-black italic text-[26px] text-white tracking-wide uppercase">{cfg.title}</div>
                    <div className="font-black italic text-[26px] text-red-500 tracking-wide uppercase">{cfg.subtitle}</div>
                  </div>
                  <div
                    className="rounded-[14px] px-3 py-2 text-center"
                    style={{
                      background: "#0b0b0b",
                      border: "2px solid #dc2626",
                      boxShadow: "0 0 14px rgba(220,38,38,0.3)",
                    }}
                  >
                    <span className="block text-white font-bold text-[15px] leading-none">BET+</span>
                    <span className="block text-red-500 font-bold text-[15px] leading-none mt-0.5">{cfg.bonus}</span>
                  </div>
                </div>

                {/* Info row */}
                <div className="flex justify-between mb-3 text-red-500 font-semibold text-[11px]">
                  <span>{cfg.label}</span>
                  <span>{cfg.count}</span>
                </div>

                {/* Event rows */}
                <div className="flex flex-col gap-2 flex-1">
                  {events.map((m, ei) => {
                    const flag = COUNTRY_FLAGS[m.country?.toLowerCase() ?? ""] ?? sportEmoji(m.sport);
                    const timeStr = m.date ? formatMatchDate(m.date) : (m.time ?? "");
                    const isSelected = !!bets.find(b => b.matchId === m.id && b.market === "result" && b.selection === "home");
                    return (
                      <div
                        key={ei}
                        className="rounded-[14px] p-2.5 flex justify-between items-center"
                        style={{
                          background: isSelected ? "rgba(220,38,38,0.12)" : "#0d0d0d",
                          border: isSelected ? "1px solid rgba(220,38,38,0.5)" : "1px solid rgba(220,38,38,0.1)",
                        }}
                      >
                        <div className="flex gap-2 min-w-0">
                          {/* Team logo circles */}
                          <div className="flex flex-col gap-1 shrink-0">
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]"
                              style={{ background: "#1a1a1a", border: "1.5px solid #dc2626" }}
                            >
                              {flag}
                            </div>
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]"
                              style={{ background: "#1a1a1a", border: "1.5px solid #dc2626" }}
                            >
                              {flag}
                            </div>
                          </div>
                          {/* Text */}
                          <div className="min-w-0">
                            <div className="text-white font-bold text-[12px] truncate leading-tight">{m.home}</div>
                            <div className="text-zinc-400 text-[10px] truncate">Vencedor</div>
                            <div className="text-zinc-500 text-[10px] truncate">{m.away}</div>
                            <div className="text-zinc-600 text-[10px]">🕒 {timeStr}</div>
                          </div>
                        </div>
                        {/* Odds */}
                        <div className="text-red-500 font-bold text-[20px] leading-none shrink-0 ml-1.5">
                          {m.odds.home > 0 ? m.odds.home.toFixed(2) : "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="flex gap-2 mt-3">
                  <div
                    className="rounded-[14px] px-3 py-2"
                    style={{ background: "#0b0b0b", border: "1px solid #dc2626" }}
                  >
                    <div className="text-zinc-500 text-[10px] leading-none mb-0.5">ODD TOTAL</div>
                    <div className="text-red-500 font-black text-[22px] leading-none">{totalOddsVal}</div>
                  </div>
                  <button
                    onClick={() => addAllToBetSlip(events)}
                    className="flex-1 rounded-[14px] font-bold text-[12px] text-white transition-opacity hover:opacity-90 active:scale-95"
                    style={{
                      background: "linear-gradient(135deg,#dc2626,#991b1b)",
                      boxShadow: "0 0 16px rgba(220,38,38,0.4)",
                    }}
                  >
                    ADICIONAR<br />AO BOLETIM
                  </button>
                </div>

                {/* Bottom disclaimer */}
                <div className="flex justify-between mt-2.5 text-[9px]">
                  <span className="text-zinc-700">JOGUE COM RESPONSABILIDADE</span>
                  <span className="text-red-800 font-semibold">AS MELHORES ODDS</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const BetSlipContent = () => {
    const canSwitchMode = !hasDuplicateMatches && bets.length > 1;
    const stakeNum = parseFloat(stake || "0");
    const multipotential = (stakeNum * parseFloat(totalOdds)).toFixed(2);

    return (
      <div className="flex flex-col h-full bg-zinc-950/50">
        <div className="p-4 border-b border-zinc-800 bg-zinc-900 flex justify-between items-center">
          <h3 className="font-bold text-lg text-white">Boletim de Apostas</h3>
          <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full">{bets.length}</span>
        </div>

        {bets.length > 0 && (
          <div className="flex mx-4 mt-3 rounded-lg overflow-hidden border border-zinc-800">
            <button
              onClick={() => { if (!hasDuplicateMatches) setBetMode("simples"); }}
              className={`flex-1 py-2 text-xs font-bold transition-colors ${effectiveBetMode === "simples" ? "bg-red-600 text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"} ${hasDuplicateMatches ? "cursor-default" : ""}`}
            >
              Simples
            </button>
            <button
              onClick={() => { if (!hasDuplicateMatches) setBetMode("multipla"); }}
              disabled={hasDuplicateMatches}
              className={`flex-1 py-2 text-xs font-bold transition-colors ${effectiveBetMode === "multipla" ? "bg-red-600 text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"} ${hasDuplicateMatches ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              Múltipla
            </button>
          </div>
        )}
        {bets.length > 0 && hasDuplicateMatches && (
          <div className="mx-4 mt-1 text-[10px] text-zinc-500">Duas seleções do mesmo evento — modo Simples obrigatório.</div>
        )}
        {bets.length > 0 && !canSwitchMode && !hasDuplicateMatches && (
          <div className="mx-4 mt-1 text-[10px] text-zinc-500">Adicione seleções de eventos diferentes para ativar Múltipla.</div>
        )}

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
                  <div className="text-xs text-zinc-400 mb-1 pr-6 truncate">{bet.matchTitle}</div>
                  <div className="font-bold text-white text-sm pr-6">{bet.label}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-red-500 font-bold">{bet.odd.toFixed(2)}</span>
                    {effectiveBetMode !== "simples" && stakeNum > 0 && (
                      <span className="text-[11px] text-green-400">€ {(stakeNum * bet.odd).toFixed(2)}</span>
                    )}
                  </div>
                  {effectiveBetMode === "simples" && (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder="€ Valor"
                        min="0.50"
                        step="0.50"
                        value={betStakes[betKey(bet)] || ""}
                        onChange={e => setBetStakes(prev => ({ ...prev, [betKey(bet)]: e.target.value }))}
                        className="bg-zinc-950 border-zinc-700 text-white font-mono text-xs h-8 flex-1"
                      />
                      {parseFloat(betStakes[betKey(bet)] || "0") > 0 && (
                        <span className="text-xs text-green-400 shrink-0 font-mono">
                          → € {(parseFloat(betStakes[betKey(bet)] || "0") * bet.odd).toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {bets.length > 0 && (
          <div className="p-4 bg-zinc-900 border-t border-zinc-800 space-y-3">
            {effectiveBetMode === "multipla" && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-400">Odds Combinadas</span>
                <span className="font-bold text-lg text-white">{totalOdds}x</span>
              </div>
            )}
            {effectiveBetMode === "simples" && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-400">Total em jogo</span>
                <span className="font-bold text-white">
                  € {bets.reduce((s, b) => s + parseFloat(betStakes[betKey(b)] || "0"), 0).toFixed(2)}
                </span>
              </div>
            )}
            {effectiveBetMode === "multipla" && (
              <div className="space-y-2">
                <Label htmlFor="stake" className="text-zinc-400 text-xs">Valor da Aposta (€)</Label>
                <Input
                  id="stake"
                  type="number"
                  placeholder="0.00"
                  value={stake}
                  onChange={e => setStake(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-white font-mono"
                />
              </div>
            )}
            <div className="flex justify-between items-center text-sm">
              <span className="text-zinc-400">Ganhos Potenciais</span>
              <span className="font-bold text-green-500">
                € {effectiveBetMode === "simples" ? simplesPotential : multipotential}
              </span>
            </div>
            {effectiveBetMode === "simples" && bets.length > 1 && (
              <div className="text-[10px] text-zinc-500 text-right">{bets.length} apostas independentes</div>
            )}
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
  };

  const MarketOddsBtn = ({ match, sel, odd, market, label }: { match: Match; sel: string; odd: number; market: string; label: string }) => {
    if (market === "result" && odd <= 1.01) return null;
    const isSusp = !!match.marketSuspension && Object.values(match.marketSuspension).some(ts => ts > Date.now());
    if (isSusp) return null;
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
    const isHockey = sport === "hockey";
    const isVolleyball = sport === "volleyball";
    const isFootball = !isBasketball && !isTennis && !isHockey && !isVolleyball;

    const tabs = isBasketball
      ? [
          { key: "todos", label: "Todos" },
          { key: "resultado", label: "Vencedor" },
          { key: "totais", label: "Totais" },
          { key: "spread", label: "Spread" },
          { key: "quartos", label: "Quartos" },
          { key: "times", label: "Times" },
        ]
      : isTennis
        ? [
            { key: "todos", label: "Todos" },
            { key: "resultado", label: "Vencedor" },
            { key: "sets", label: "Sets" },
            { key: "handicap", label: "Handicap" },
            { key: "jogos", label: "Jogos" },
            { key: "placar", label: "Placar Exato" },
          ]
        : isHockey
          ? [
              { key: "todos", label: "Todos" },
              { key: "resultado", label: "Vencedor" },
              { key: "totais", label: "Totais" },
              { key: "puckline", label: "Puck Line" },
              { key: "1periodo", label: "1º Per." },
              { key: "2periodo", label: "2º Per." },
              { key: "3periodo", label: "3º Per." },
              { key: "especiais", label: "Especiais" },
            ]
          : isVolleyball
            ? [
                { key: "todos", label: "Todos" },
                { key: "resultado", label: "Vencedor" },
                { key: "sets", label: "Sets" },
                { key: "handicap", label: "Handicap" },
                { key: "perset", label: "Por Set" },
                { key: "pontos", label: "Pontos" },
              ]
            : [
                { key: "todos", label: "Todos" },
                { key: "resultado", label: "Resultado" },
                { key: "dupla", label: "Dupla Chance" },
                { key: "gols", label: "Gols" },
                { key: "handicap", label: "Handicap" },
                { key: "1tempo", label: "1º Tempo" },
                { key: "htft", label: "HT/FT" },
                { key: "placar", label: "Placar Exato" },
                { key: "escanteios", label: "Escanteios" },
                { key: "cartoes", label: "Cartões" },
                { key: "asiatico", label: "Asiático" },
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

        {/* ── SUSPENSION BANNER (modal) ── */}
        {match.marketSuspension && Object.values(match.marketSuspension).some(ts => ts > Date.now()) && (
          <div className="mb-4">
            <SuspensionBanner match={match} />
          </div>
        )}

        {/* ── RESULTADO / VENCEDOR ── */}
        {(modalTab === "resultado" || modalTab === "todos") && (
          <MarketGroup title={isBasketball ? "Vencedor da Partida" : isTennis ? "Vencedor do Jogo" : "Resultado Final"}>
            <MarketOddsBtn match={match} sel="home" odd={match.odds.home} market="result" label={match.home} />
            {match.odds.draw > 0 && <MarketOddsBtn match={match} sel="draw" odd={match.odds.draw} market="result" label="Empate" />}
            <MarketOddsBtn match={match} sel="away" odd={match.odds.away} market="result" label={match.away} />
          </MarketGroup>
        )}

        {/* ── FUTEBOL: DUPLA CHANCE ── */}
        {isFootball && (modalTab === "dupla" || modalTab === "todos") && m && m.doubleChance.homeOrDraw > 0 && (
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
        {isFootball && (modalTab === "gols" || modalTab === "todos") && m && m.totalGoals.over25 > 0 && (
          <div>
            {m.totalGoals.over05 > 0 && (
              <MarketGroup title="Total de Gols — 0.5">
                <MarketOddsBtn match={match} sel="o05" odd={m.totalGoals.over05} market="gols" label="Mais de 0.5" />
                <MarketOddsBtn match={match} sel="u05" odd={m.totalGoals.under05} market="gols" label="Menos de 0.5" />
              </MarketGroup>
            )}
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
            {m.totalGoals.over45 > 0 && (
              <MarketGroup title="Total de Gols — 4.5">
                <MarketOddsBtn match={match} sel="o45" odd={m.totalGoals.over45} market="gols" label="Mais de 4.5" />
                <MarketOddsBtn match={match} sel="u45" odd={m.totalGoals.under45} market="gols" label="Menos de 4.5" />
              </MarketGroup>
            )}
            {m.totalGoals.over55 > 0 && m.totalGoals.over45 > 0 && m.totalGoals.over45 < 3.0 && (
              <MarketGroup title="Total de Gols — 5.5">
                <MarketOddsBtn match={match} sel="o55" odd={m.totalGoals.over55} market="gols" label="Mais de 5.5" />
                <MarketOddsBtn match={match} sel="u55" odd={m.totalGoals.under55} market="gols" label="Menos de 5.5" />
              </MarketGroup>
            )}
          </div>
        )}
        {isFootball && modalTab === "gols" && m && m.totalGoals.over25 === 0 && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── BASQUETE: TOTAIS ── */}
        {isBasketball && (modalTab === "totais" || modalTab === "todos") && m && (
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
        {isBasketball && (modalTab === "1tempo" || modalTab === "todos") && m && m.totalGoals.over15 > 0 && (
          <MarketGroup title={`Total 1º Quarto — ${m._total1H ? Math.round((m._total1H as number) / 2) : "—"}`}>
            <MarketOddsBtn match={match} sel="o15" odd={m.totalGoals.over15} market="1tempo" label="Acima" />
            <MarketOddsBtn match={match} sel="u15" odd={m.totalGoals.under15} market="1tempo" label="Abaixo" />
          </MarketGroup>
        )}

        {/* ── BASQUETE: SPREAD ── */}
        {isBasketball && (modalTab === "spread" || modalTab === "todos") && m && m.handicap.homeMinusOne > 0 && (
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
        {isTennis && (modalTab === "sets" || modalTab === "todos") && m && (
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
        {!isBasketball && (modalTab === "handicap" || modalTab === "todos") && m && m.handicap.homeMinusOne > 0 && (
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
        {isFootball && (modalTab === "1tempo" || modalTab === "todos") && m && m.halfTime.home > 0 && (
          <div>
            <MarketGroup title="Resultado — 1º Tempo">
              <MarketOddsBtn match={match} sel="ht-home" odd={m.halfTime.home} market="1tempo" label={match.home} />
              {m.halfTime.draw > 0 && <MarketOddsBtn match={match} sel="ht-draw" odd={m.halfTime.draw} market="1tempo" label="Empate" />}
              <MarketOddsBtn match={match} sel="ht-away" odd={m.halfTime.away} market="1tempo" label={match.away} />
            </MarketGroup>
            {m.firstGoal && m.firstGoal.home > 0 && (
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

        {/* ── FUTEBOL: HT/FT ── */}
        {isFootball && (modalTab === "htft" || modalTab === "todos") && m && m.htft && (
          <div>
            <MarketGroup title={`Intervalo / Final — ${match.home} vence`}>
              <MarketOddsBtn match={match} sel="htft-hh" odd={m.htft.hh} market="htft" label="1 / 1" />
              <MarketOddsBtn match={match} sel="htft-hd" odd={m.htft.hd} market="htft" label="1 / X" />
              <MarketOddsBtn match={match} sel="htft-ha" odd={m.htft.ha} market="htft" label="1 / 2" />
            </MarketGroup>
            <MarketGroup title="Empate ao Intervalo">
              <MarketOddsBtn match={match} sel="htft-dh" odd={m.htft.dh} market="htft" label="X / 1" />
              <MarketOddsBtn match={match} sel="htft-dd" odd={m.htft.dd} market="htft" label="X / X" />
              <MarketOddsBtn match={match} sel="htft-da" odd={m.htft.da} market="htft" label="X / 2" />
            </MarketGroup>
            <MarketGroup title={`Intervalo / Final — ${match.away} vence`}>
              <MarketOddsBtn match={match} sel="htft-ah" odd={m.htft.ah} market="htft" label="2 / 1" />
              <MarketOddsBtn match={match} sel="htft-ad" odd={m.htft.ad} market="htft" label="2 / X" />
              <MarketOddsBtn match={match} sel="htft-aa" odd={m.htft.aa} market="htft" label="2 / 2" />
            </MarketGroup>
          </div>
        )}
        {isFootball && modalTab === "htft" && m && !m.htft && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── FUTEBOL: PLACAR EXATO ── */}
        {isFootball && (modalTab === "placar" || modalTab === "todos") && m && m.correctScore && (
          <div>
            <p className="text-xs text-zinc-500 mb-3">Selecione o marcador exato ao final da partida.</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {Object.entries(m.correctScore).map(([score, odd]) => (
                <MarketOddsBtn key={score} match={match} sel={`cs-${score}`} odd={odd} market="placar" label={score} />
              ))}
            </div>
          </div>
        )}
        {isFootball && modalTab === "placar" && m && !m.correctScore && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── FUTEBOL: ESCANTEIOS ── */}
        {isFootball && (modalTab === "escanteios" || modalTab === "todos") && m && m.corners && (
          <div>
            <MarketGroup title="Total de Escanteios — 8.5">
              <MarketOddsBtn match={match} sel="oc85" odd={m.corners.o85} market="escanteios" label="Acima de 8.5" />
              <MarketOddsBtn match={match} sel="uc85" odd={m.corners.u85} market="escanteios" label="Abaixo de 8.5" />
            </MarketGroup>
            <MarketGroup title="Total de Escanteios — 9.5">
              <MarketOddsBtn match={match} sel="oc95" odd={m.corners.o95} market="escanteios" label="Acima de 9.5" />
              <MarketOddsBtn match={match} sel="uc95" odd={m.corners.u95} market="escanteios" label="Abaixo de 9.5" />
            </MarketGroup>
            <MarketGroup title="Total de Escanteios — 10.5">
              <MarketOddsBtn match={match} sel="oc105" odd={m.corners.o105} market="escanteios" label="Acima de 10.5" />
              <MarketOddsBtn match={match} sel="uc105" odd={m.corners.u105} market="escanteios" label="Abaixo de 10.5" />
            </MarketGroup>
          </div>
        )}
        {isFootball && modalTab === "escanteios" && m && !m.corners && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── FUTEBOL: CARTÕES ── */}
        {isFootball && (modalTab === "cartoes" || modalTab === "todos") && m && m.cards && (
          <div>
            <MarketGroup title="Total de Cartões — 3.5">
              <MarketOddsBtn match={match} sel="ocard35" odd={m.cards.o35} market="cartoes" label="Acima de 3.5 cartões" />
              <MarketOddsBtn match={match} sel="ucard35" odd={m.cards.u35} market="cartoes" label="Abaixo de 3.5 cartões" />
            </MarketGroup>
            <MarketGroup title="Total de Cartões — 4.5">
              <MarketOddsBtn match={match} sel="ocard45" odd={m.cards.o45} market="cartoes" label="Acima de 4.5 cartões" />
              <MarketOddsBtn match={match} sel="ucard45" odd={m.cards.u45} market="cartoes" label="Abaixo de 4.5 cartões" />
            </MarketGroup>
          </div>
        )}
        {isFootball && modalTab === "cartoes" && m && !m.cards && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── FUTEBOL: ASIÁTICO ── */}
        {isFootball && (modalTab === "asiatico" || modalTab === "todos") && m && (
          <div>
            {m.drawNoBet && m.drawNoBet.home > 0 && (
              <MarketGroup title="Draw No Bet (Empate Anulado)">
                <MarketOddsBtn match={match} sel="dnb-home" odd={m.drawNoBet.home} market="asiatico" label={match.home} />
                <MarketOddsBtn match={match} sel="dnb-away" odd={m.drawNoBet.away} market="asiatico" label={match.away} />
              </MarketGroup>
            )}
            {m.asianHandicap && m.asianHandicap.home > 0 && (
              <MarketGroup title={`Handicap Asiático — Linha ${m.asianHandicap.line > 0 ? "+" : ""}${m.asianHandicap.line}`}>
                <MarketOddsBtn match={match} sel="ah-home" odd={m.asianHandicap.home} market="asiatico" label={`${match.home} ${m.asianHandicap.line > 0 ? "+" : ""}${m.asianHandicap.line}`} />
                <MarketOddsBtn match={match} sel="ah-away" odd={m.asianHandicap.away} market="asiatico" label={`${match.away} ${m.asianHandicap.line > 0 ? `-${m.asianHandicap.line}` : `+${Math.abs(m.asianHandicap.line)}`}`} />
              </MarketGroup>
            )}
            {m.asianTotals && m.asianTotals.o225 > 0 && (
              <>
                <MarketGroup title="Total Asiático — 0.5">
                  <MarketOddsBtn match={match} sel="at-o05" odd={m.asianTotals.o05} market="asiatico" label="Mais de 0.5" />
                  <MarketOddsBtn match={match} sel="at-u05" odd={m.asianTotals.u05} market="asiatico" label="Menos de 0.5" />
                </MarketGroup>
                <MarketGroup title="Total Asiático — 2.25">
                  <MarketOddsBtn match={match} sel="at-o225" odd={m.asianTotals.o225} market="asiatico" label="Mais de 2.25" />
                  <MarketOddsBtn match={match} sel="at-u225" odd={m.asianTotals.u225} market="asiatico" label="Menos de 2.25" />
                </MarketGroup>
                <MarketGroup title="Total Asiático — 2.75">
                  <MarketOddsBtn match={match} sel="at-o275" odd={m.asianTotals.o275} market="asiatico" label="Mais de 2.75" />
                  <MarketOddsBtn match={match} sel="at-u275" odd={m.asianTotals.u275} market="asiatico" label="Menos de 2.75" />
                </MarketGroup>
                <MarketGroup title="Total Asiático — 4.5">
                  <MarketOddsBtn match={match} sel="at-o45" odd={m.asianTotals.o45} market="asiatico" label="Mais de 4.5" />
                  <MarketOddsBtn match={match} sel="at-u45" odd={m.asianTotals.u45} market="asiatico" label="Menos de 4.5" />
                </MarketGroup>
                <MarketGroup title="Total Asiático — 5.5">
                  <MarketOddsBtn match={match} sel="at-o55" odd={m.asianTotals.o55} market="asiatico" label="Mais de 5.5" />
                  <MarketOddsBtn match={match} sel="at-u55" odd={m.asianTotals.u55} market="asiatico" label="Menos de 5.5" />
                </MarketGroup>
              </>
            )}
            {(!m.drawNoBet && !m.asianHandicap && !m.asianTotals) && (
              <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
            )}
          </div>
        )}

        {/* ── HÓQUEI: TOTAIS ── */}
        {isHockey && (modalTab === "totais" || modalTab === "todos") && m && (
          <div>
            <MarketGroup title={`Total de Golos — ${m._total ?? "—"}`}>
              <MarketOddsBtn match={match} sel="o25" odd={m.totalGoals.over25} market="totais" label={`Mais de ${m._total ?? "—"}`} />
              <MarketOddsBtn match={match} sel="u25" odd={m.totalGoals.under25} market="totais" label={`Menos de ${m._total ?? "—"}`} />
            </MarketGroup>
            {m.totalGoals.over15 > 0 && (
              <MarketGroup title={`Total de Golos — ${m._total ? m._total - 0.5 : "—"}`}>
                <MarketOddsBtn match={match} sel="o15" odd={m.totalGoals.over15} market="totais" label={`Mais de ${m._total ? m._total - 0.5 : "—"}`} />
                <MarketOddsBtn match={match} sel="u15" odd={m.totalGoals.under15} market="totais" label={`Menos de ${m._total ? m._total - 0.5 : "—"}`} />
              </MarketGroup>
            )}
            {m.totalGoals.over35 > 0 && (
              <MarketGroup title={`Total de Golos — ${m._total ? m._total + 0.5 : "—"}`}>
                <MarketOddsBtn match={match} sel="o35" odd={m.totalGoals.over35} market="totais" label={`Mais de ${m._total ? m._total + 0.5 : "—"}`} />
                <MarketOddsBtn match={match} sel="u35" odd={m.totalGoals.under35} market="totais" label={`Menos de ${m._total ? m._total + 0.5 : "—"}`} />
              </MarketGroup>
            )}
          </div>
        )}

        {/* ── HÓQUEI: PUCK LINE ── */}
        {isHockey && (modalTab === "puckline" || modalTab === "todos") && m && m.handicap.homeMinusOne > 0 && (
          <div>
            <MarketGroup title="Puck Line (±1.5)">
              <MarketOddsBtn match={match} sel="pl-home" odd={m.handicap.homeMinusOne} market="puckline" label={`${match.home} −1.5`} />
              <MarketOddsBtn match={match} sel="pl-away" odd={m.handicap.awayPlusOne} market="puckline" label={`${match.away} +1.5`} />
            </MarketGroup>
          </div>
        )}

        {/* ── HÓQUEI: 1º PERÍODO ── */}
        {isHockey && (modalTab === "1periodo" || modalTab === "todos") && m && m.halfTime.home > 0 && (
          <div>
            <MarketGroup title="Resultado — 1º Período">
              <MarketOddsBtn match={match} sel="per1-home" odd={m.halfTime.home} market="1periodo" label={match.home} />
              {m.halfTime.draw > 0 && <MarketOddsBtn match={match} sel="per1-draw" odd={m.halfTime.draw} market="1periodo" label="Empate" />}
              <MarketOddsBtn match={match} sel="per1-away" odd={m.halfTime.away} market="1periodo" label={match.away} />
            </MarketGroup>
          </div>
        )}

        {/* ── VOLEIBOL: SETS ── */}
        {isVolleyball && (modalTab === "sets" || modalTab === "todos") && m && (
          <div>
            {m.totalGoals.over15 > 0 && (
              <MarketGroup title="Total de Sets — O/U 2.5">
                <MarketOddsBtn match={match} sel="osets25" odd={m.totalGoals.over15} market="sets" label="Mais de 2.5 sets" />
                <MarketOddsBtn match={match} sel="usets25" odd={m.totalGoals.under15} market="sets" label="Menos de 2.5 sets" />
              </MarketGroup>
            )}
            {m.totalGoals.over25 > 0 && (
              <MarketGroup title="Total de Sets — O/U 3.5">
                <MarketOddsBtn match={match} sel="osets35" odd={m.totalGoals.over25} market="sets" label="Mais de 3.5 sets" />
                <MarketOddsBtn match={match} sel="usets35" odd={m.totalGoals.under25} market="sets" label="Menos de 3.5 sets" />
              </MarketGroup>
            )}
            {m.bothTeamsScore && m.bothTeamsScore.yes > 0 && (
              <MarketGroup title={`Total de Pontos — O/U ${m._total ?? "—"}`}>
                <MarketOddsBtn match={match} sel="opts" odd={m.bothTeamsScore.yes} market="sets" label={`Mais de ${m._total ?? "—"} pts`} />
                <MarketOddsBtn match={match} sel="upts" odd={m.bothTeamsScore.no} market="sets" label={`Menos de ${m._total ?? "—"} pts`} />
              </MarketGroup>
            )}
          </div>
        )}

        {/* ── VOLEIBOL: HANDICAP (SETS) ── */}
        {isVolleyball && (modalTab === "handicap" || modalTab === "todos") && m && m.totalGoals.over35 > 0 && (
          <div>
            <MarketGroup title="Handicap de Sets — Casa −1.5">
              <MarketOddsBtn match={match} sel="hcap-vb-home" odd={m.totalGoals.over35} market="handicap" label={`${match.home} −1.5 sets`} />
              <MarketOddsBtn match={match} sel="hcap-vb-away" odd={m.totalGoals.under35} market="handicap" label={`${match.away} +1.5 sets`} />
            </MarketGroup>
          </div>
        )}

        {/* ── VOLEIBOL: POR SET ── */}
        {isVolleyball && (modalTab === "perset" || modalTab === "todos") && m && (m as any).volleyballExtra && (
          <div>
            {((m as any).volleyballExtra as { set1: { home: number; away: number }; set2: { home: number; away: number }; set3: { home: number; away: number } }).set1.home > 0 && (
              <MarketGroup title="Vencedor do 1º Set">
                <MarketOddsBtn match={match} sel="vs1h" odd={((m as any).volleyballExtra as any).set1.home} market="perset" label={match.home} />
                <MarketOddsBtn match={match} sel="vs1a" odd={((m as any).volleyballExtra as any).set1.away} market="perset" label={match.away} />
              </MarketGroup>
            )}
            {((m as any).volleyballExtra as any).set2.home > 0 && (
              <MarketGroup title="Vencedor do 2º Set">
                <MarketOddsBtn match={match} sel="vs2h" odd={((m as any).volleyballExtra as any).set2.home} market="perset" label={match.home} />
                <MarketOddsBtn match={match} sel="vs2a" odd={((m as any).volleyballExtra as any).set2.away} market="perset" label={match.away} />
              </MarketGroup>
            )}
            {((m as any).volleyballExtra as any).set3.home > 0 && (
              <MarketGroup title="Vencedor do 3º Set (se disputado)">
                <MarketOddsBtn match={match} sel="vs3h" odd={((m as any).volleyballExtra as any).set3.home} market="perset" label={match.home} />
                <MarketOddsBtn match={match} sel="vs3a" odd={((m as any).volleyballExtra as any).set3.away} market="perset" label={match.away} />
              </MarketGroup>
            )}
          </div>
        )}

        {/* ── VOLEIBOL: PONTOS ── */}
        {isVolleyball && (modalTab === "pontos" || modalTab === "todos") && m && (m as any).volleyballExtra && (
          <div>
            {m.bothTeamsScore.yes > 0 && (
              <MarketGroup title={`Total de Pontos — O/U ${m._total ?? "—"}`}>
                <MarketOddsBtn match={match} sel="opts" odd={m.bothTeamsScore.yes} market="pontos" label={`Mais de ${m._total ?? "—"} pts`} />
                <MarketOddsBtn match={match} sel="upts" odd={m.bothTeamsScore.no} market="pontos" label={`Menos de ${m._total ?? "—"} pts`} />
              </MarketGroup>
            )}
            {((m as any).volleyballExtra as any).handicapPoints.home > 0 && (
              <MarketGroup title={`Handicap de Pontos — ${((m as any).volleyballExtra as any).handicapPoints.line > 0 ? `Casa −${((m as any).volleyballExtra as any).handicapPoints.line}` : `Casa +${Math.abs(((m as any).volleyballExtra as any).handicapPoints.line)}`}`}>
                <MarketOddsBtn match={match} sel="pth" odd={((m as any).volleyballExtra as any).handicapPoints.home} market="pontos" label={match.home} />
                <MarketOddsBtn match={match} sel="pta" odd={((m as any).volleyballExtra as any).handicapPoints.away} market="pontos" label={match.away} />
              </MarketGroup>
            )}
          </div>
        )}

        {/* ── BASQUETE: QUARTOS ── */}
        {isBasketball && (modalTab === "quartos" || modalTab === "todos") && m && (m as any).basketballExtra && (
          <div>
            {(["q1","q2","q3","q4"] as const).map((q, qi) => {
              const ex = (m as any).basketballExtra as any;
              const labels = ["1º Quarto","2º Quarto","3º Quarto","4º Quarto"];
              return ex[q].home > 0 ? (
                <MarketGroup key={q} title={`Vencedor — ${labels[qi]}`}>
                  <MarketOddsBtn match={match} sel={`${q}-home`} odd={ex[q].home} market="quartos" label={match.home} />
                  <MarketOddsBtn match={match} sel={`${q}-away`} odd={ex[q].away} market="quartos" label={match.away} />
                </MarketGroup>
              ) : null;
            })}
          </div>
        )}

        {/* ── BASQUETE: TOTAIS POR TIME ── */}
        {isBasketball && (modalTab === "times" || modalTab === "todos") && m && (m as any).basketballExtra && (
          <div>
            {((m as any).basketballExtra as any).teamTotalHome.over > 0 && (
              <MarketGroup title={`Total ${match.home} — O/U ${((m as any).basketballExtra as any).teamTotalHome.line}`}>
                <MarketOddsBtn match={match} sel="tth-o" odd={((m as any).basketballExtra as any).teamTotalHome.over} market="times" label={`Mais de ${((m as any).basketballExtra as any).teamTotalHome.line}`} />
                <MarketOddsBtn match={match} sel="tth-u" odd={((m as any).basketballExtra as any).teamTotalHome.under} market="times" label={`Menos de ${((m as any).basketballExtra as any).teamTotalHome.line}`} />
              </MarketGroup>
            )}
            {((m as any).basketballExtra as any).teamTotalAway.over > 0 && (
              <MarketGroup title={`Total ${match.away} — O/U ${((m as any).basketballExtra as any).teamTotalAway.line}`}>
                <MarketOddsBtn match={match} sel="tta-o" odd={((m as any).basketballExtra as any).teamTotalAway.over} market="times" label={`Mais de ${((m as any).basketballExtra as any).teamTotalAway.line}`} />
                <MarketOddsBtn match={match} sel="tta-u" odd={((m as any).basketballExtra as any).teamTotalAway.under} market="times" label={`Menos de ${((m as any).basketballExtra as any).teamTotalAway.line}`} />
              </MarketGroup>
            )}
          </div>
        )}

        {/* ── TÉNIS: TOTAL DE JOGOS ── */}
        {isTennis && (modalTab === "jogos" || modalTab === "todos") && m && (m as any).tennisExtra && (
          <div>
            {((m as any).tennisExtra as any).totalGames.over > 0 && (
              <MarketGroup title={`Total de Games — O/U ${((m as any).tennisExtra as any).totalGames.line}`}>
                <MarketOddsBtn match={match} sel="tg-o" odd={((m as any).tennisExtra as any).totalGames.over} market="jogos" label={`Mais de ${((m as any).tennisExtra as any).totalGames.line}`} />
                <MarketOddsBtn match={match} sel="tg-u" odd={((m as any).tennisExtra as any).totalGames.under} market="jogos" label={`Menos de ${((m as any).tennisExtra as any).totalGames.line}`} />
              </MarketGroup>
            )}
            {((m as any).tennisExtra as any).set2.home > 0 && (
              <MarketGroup title="Vencedor do 2º Set">
                <MarketOddsBtn match={match} sel="s2h" odd={((m as any).tennisExtra as any).set2.home} market="jogos" label={match.home} />
                <MarketOddsBtn match={match} sel="s2a" odd={((m as any).tennisExtra as any).set2.away} market="jogos" label={match.away} />
              </MarketGroup>
            )}
            {((m as any).tennisExtra as any).gameHandicap.home > 0 && (
              <MarketGroup title={`Handicap de Games — ${((m as any).tennisExtra as any).gameHandicap.line > 0 ? `Casa −${((m as any).tennisExtra as any).gameHandicap.line}` : `Casa +${Math.abs(((m as any).tennisExtra as any).gameHandicap.line)}`}`}>
                <MarketOddsBtn match={match} sel="gh-home" odd={((m as any).tennisExtra as any).gameHandicap.home} market="jogos" label={match.home} />
                <MarketOddsBtn match={match} sel="gh-away" odd={((m as any).tennisExtra as any).gameHandicap.away} market="jogos" label={match.away} />
              </MarketGroup>
            )}
          </div>
        )}

        {/* ── TÉNIS: PLACAR EXATO (SETS) ── */}
        {isTennis && (modalTab === "placar" || modalTab === "todos") && m && (m as any).tennisExtra && (
          <div>
            <p className="text-xs text-zinc-500 mb-3">Resultado final em sets.</p>
            <div className="grid grid-cols-2 gap-2">
              {((m as any).tennisExtra as any).exactSets.h20 > 0 && <MarketOddsBtn match={match} sel="es-h20" odd={((m as any).tennisExtra as any).exactSets.h20} market="placar" label={`${match.home} 2-0`} />}
              {((m as any).tennisExtra as any).exactSets.h21 > 0 && <MarketOddsBtn match={match} sel="es-h21" odd={((m as any).tennisExtra as any).exactSets.h21} market="placar" label={`${match.home} 2-1`} />}
              {((m as any).tennisExtra as any).exactSets.a02 > 0 && <MarketOddsBtn match={match} sel="es-a02" odd={((m as any).tennisExtra as any).exactSets.a02} market="placar" label={`${match.away} 2-0`} />}
              {((m as any).tennisExtra as any).exactSets.a12 > 0 && <MarketOddsBtn match={match} sel="es-a12" odd={((m as any).tennisExtra as any).exactSets.a12} market="placar" label={`${match.away} 2-1`} />}
            </div>
          </div>
        )}

        {/* ── HÓQUEI: 2º PERÍODO ── */}
        {isHockey && (modalTab === "2periodo" || modalTab === "todos") && m && (m as any).hockeyExtra && (
          <div>
            <MarketGroup title="Resultado — 2º Período">
              <MarketOddsBtn match={match} sel="per2-home" odd={((m as any).hockeyExtra as any).period2.home} market="2periodo" label={match.home} />
              <MarketOddsBtn match={match} sel="per2-draw" odd={((m as any).hockeyExtra as any).period2.draw} market="2periodo" label="Empate" />
              <MarketOddsBtn match={match} sel="per2-away" odd={((m as any).hockeyExtra as any).period2.away} market="2periodo" label={match.away} />
            </MarketGroup>
          </div>
        )}

        {/* ── HÓQUEI: 3º PERÍODO ── */}
        {isHockey && (modalTab === "3periodo" || modalTab === "todos") && m && (m as any).hockeyExtra && (
          <div>
            <MarketGroup title="Resultado — 3º Período">
              <MarketOddsBtn match={match} sel="per3-home" odd={((m as any).hockeyExtra as any).period3.home} market="3periodo" label={match.home} />
              <MarketOddsBtn match={match} sel="per3-draw" odd={((m as any).hockeyExtra as any).period3.draw} market="3periodo" label="Empate" />
              <MarketOddsBtn match={match} sel="per3-away" odd={((m as any).hockeyExtra as any).period3.away} market="3periodo" label={match.away} />
            </MarketGroup>
          </div>
        )}

        {/* ── HÓQUEI: ESPECIAIS ── */}
        {isHockey && (modalTab === "especiais" || modalTab === "todos") && m && (m as any).hockeyExtra && (
          <div>
            {((m as any).hockeyExtra as any).period1Total.over > 0 && (
              <MarketGroup title={`Total 1º Período — O/U ${((m as any).hockeyExtra as any).period1Total.line}`}>
                <MarketOddsBtn match={match} sel="p1t-o" odd={((m as any).hockeyExtra as any).period1Total.over} market="especiais" label={`Mais de ${((m as any).hockeyExtra as any).period1Total.line}`} />
                <MarketOddsBtn match={match} sel="p1t-u" odd={((m as any).hockeyExtra as any).period1Total.under} market="especiais" label={`Menos de ${((m as any).hockeyExtra as any).period1Total.line}`} />
              </MarketGroup>
            )}
            {((m as any).hockeyExtra as any).bothTeamsScoreGame.yes > 0 && (
              <MarketGroup title="Ambas as Equipas Marcam">
                <MarketOddsBtn match={match} sel="bts-yes" odd={((m as any).hockeyExtra as any).bothTeamsScoreGame.yes} market="especiais" label="Sim" />
                <MarketOddsBtn match={match} sel="bts-no" odd={((m as any).hockeyExtra as any).bothTeamsScoreGame.no} market="especiais" label="Não" />
              </MarketGroup>
            )}
            {((m as any).hockeyExtra as any).shotsOnGoal.over > 0 && (
              <MarketGroup title={`Remates à Baliza — O/U ${((m as any).hockeyExtra as any).shotsOnGoal.line.toFixed(1)}`}>
                <MarketOddsBtn match={match} sel="sog-o" odd={((m as any).hockeyExtra as any).shotsOnGoal.over} market="especiais" label={`Mais de ${((m as any).hockeyExtra as any).shotsOnGoal.line.toFixed(1)}`} />
                <MarketOddsBtn match={match} sel="sog-u" odd={((m as any).hockeyExtra as any).shotsOnGoal.under} market="especiais" label={`Menos de ${((m as any).hockeyExtra as any).shotsOnGoal.line.toFixed(1)}`} />
              </MarketGroup>
            )}
          </div>
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
    <div className="min-h-[100dvh] w-full bg-background text-foreground flex flex-col font-sans transition-colors duration-500">

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

          <div className="flex items-center gap-2">
            {auth.user ? (
              <>
                {/* Free Bet balance pill — always visible */}
                <div
                  className="hidden sm:flex items-center gap-1.5 bg-violet-900/60 border border-violet-500/40 rounded-lg px-2.5 py-1.5"
                  title="Saldo de Free Bets"
                >
                  <span className="text-[10px] font-black text-violet-300 tracking-widest">FB</span>
                  <span className="text-xs font-bold text-violet-200">€ {parseFloat(auth.user.freebetBalance ?? "0").toFixed(2)}</span>
                </div>

                {/* Real balance pill */}
                <div
                  className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5"
                  title="Saldo disponível"
                >
                  <span className="text-xs font-black text-green-400">€</span>
                  <span className="text-xs font-bold text-white">{parseFloat(auth.user.balance).toFixed(2)}</span>
                </div>

                {/* Deposit / Withdraw button */}
                <button
                  onClick={() => setDepositModalOpen(true)}
                  className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center transition-colors shadow-lg shadow-emerald-900/40 shrink-0"
                  title="Depositar / Levantar"
                >
                  <Plus size={16} className="text-white" strokeWidth={3} />
                </button>

                {/* Avatar emoji dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 hover:border-zinc-500 flex items-center justify-center text-lg transition-colors shrink-0"
                      title="Minha conta"
                    >
                      {userEmoji(auth.user.name)}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-zinc-900 border-zinc-700 text-white w-52" align="end">
                    <div className="px-3 py-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">{userEmoji(auth.user.name)}</span>
                        <div className="min-w-0">
                          <div className="font-semibold text-white text-sm truncate">{auth.user.name}</div>
                          <div className="text-zinc-500 text-xs truncate">{auth.user.email}</div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <div className="flex-1 bg-zinc-800 rounded-lg px-2 py-1.5 text-center">
                          <div className="text-[10px] text-zinc-500">Saldo</div>
                          <div className="text-green-400 font-bold text-xs">€ {parseFloat(auth.user.balance).toFixed(2)}</div>
                        </div>
                        <div className="flex-1 bg-violet-900/40 rounded-lg px-2 py-1.5 text-center">
                          <div className="text-[10px] text-zinc-500">Free Bets</div>
                          <div className="text-violet-300 font-bold text-xs">€ {parseFloat(auth.user.freebetBalance ?? "0").toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                    <DropdownMenuSeparator className="bg-zinc-700" />
                    <DropdownMenuItem className="hover:bg-zinc-800 cursor-pointer" onClick={() => setActiveTab("profile")}>
                      <User size={14} className="mr-2" /> Perfil
                    </DropdownMenuItem>
                    <DropdownMenuItem className="hover:bg-zinc-800 cursor-pointer" onClick={() => { setActiveTab("wallet"); fetchMyBets(); }}>
                      <Wallet size={14} className="mr-2" /> Carteira
                    </DropdownMenuItem>
                    <DropdownMenuItem className="hover:bg-zinc-800 cursor-pointer" onClick={() => { setActiveTab("mybets"); fetchMyBets(); }}>
                      <History size={14} className="mr-2" /> Apostas
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-zinc-700" />
                    <DropdownMenuItem className="hover:bg-zinc-800 cursor-pointer text-red-400" onClick={auth.logout}>
                      <LogOut size={14} className="mr-2" /> Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
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
            { id: "promos", icon: <Gift size={16} />, label: "PROMOÇÕES", onSelect: fetchCashback },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as typeof activeTab); (tab as { onSelect?: () => void }).onSelect?.(); }}
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
              onClick={() => { setActiveTab("wallet"); fetchMyBets(); }}
              className={`py-3 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap flex items-center gap-2 ${activeTab === "wallet" ? "border-red-600 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
            >
              <Wallet size={16} />
              CARTEIRA
            </button>
          )}
          {auth.user && (
            <button
              onClick={() => { setActiveTab("mybets"); fetchMyBets(); }}
              className={`py-3 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap flex items-center gap-2 ${activeTab === "mybets" ? "border-red-600 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
            >
              <History size={16} />
              MINHAS APOSTAS
            </button>
          )}
          {auth.user && (
            <button
              onClick={() => setActiveTab("profile")}
              className={`py-3 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap flex items-center gap-2 ${activeTab === "profile" ? "border-red-600 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
            >
              <User size={16} />
              PERFIL
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
              <div className="p-3 flex-1 overflow-y-auto">
                <SidebarTreeContent
                  selectedSport={selectedSport}
                  setSelectedSport={setSelectedSport}
                  setActiveTab={setActiveTab}
                  onClose={() => setSidebarOpen(false)}
                  expandedSport={sidebarExpandedSport}
                  setExpandedSport={setSidebarExpandedSport}
                  expandedCountry={sidebarExpandedCountry}
                  setExpandedCountry={setSidebarExpandedCountry}
                  topLeagues={sidebarTopLeagues}
                  selectedLeague={selectedLeague}
                  setSelectedLeague={setSelectedLeague}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* MAIN — 3-column desktop layout */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">

        {/* DESKTOP LEFT SIDEBAR — always visible on lg+ */}
        <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-zinc-900 bg-zinc-950 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="p-3">
            <SidebarTreeContent
              selectedSport={selectedSport}
              setSelectedSport={setSelectedSport}
              setActiveTab={setActiveTab}
              expandedSport={sidebarExpandedSport}
              setExpandedSport={setSidebarExpandedSport}
              expandedCountry={sidebarExpandedCountry}
              setExpandedCountry={setSidebarExpandedCountry}
              compact
              topLeagues={sidebarTopLeagues}
              selectedLeague={selectedLeague}
              setSelectedLeague={setSelectedLeague}
            />
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
                          <span>€ {platformStats.totalPaidOut.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} em prémios pagos</span>
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

            {!expandedMatch && activeTab === "sports" && (() => {
              const filteredUpcoming = selectedLeague
                ? upcomingMatches.filter(m => m.league === selectedLeague)
                : upcomingMatches;

              return (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {!selectedLeague && <PopularBanners />}
                  <h2 className="text-2xl font-black italic uppercase tracking-tight mb-4 flex items-center gap-2">
                    <Trophy className="text-red-600" /> {selectedLeague ? selectedLeague : "Próximos Eventos"}
                  </h2>
                  {upcomingLoading ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 className="animate-spin text-red-600" size={32} />
                    </div>
                  ) : filteredUpcoming.length === 0 ? (
                    <div className="py-20 text-center text-zinc-500 bg-zinc-900/50 rounded-xl border border-zinc-800">
                      <Trophy className="mx-auto mb-4 opacity-20" size={48} />
                      <p className="font-medium">{selectedLeague ? "Nenhum evento para esta liga." : "Nenhum evento programado no momento."}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredUpcoming.map(match => <MatchCard key={match.id} match={match} />)}
                    </div>
                  )}
                </div>
              );
            })()}

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
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 -mx-4 sm:-mx-6 lg:-mx-8 px-0">
                <PromosPage
                  isLoggedIn={!!auth.user}
                  cashbackData={cashbackData}
                  onDeposit={() => { setDepositModalOpen(true); setActiveTab("wallet"); }}
                  onFetchCashback={fetchCashback}
                  onClaimCashback={() => {
                    if (cashbackData && cashbackData.cashback > 0) {
                      setPromoNotif({ type: "cashback", amount: cashbackData.cashback });
                      setCashbackData(null);
                    } else {
                      toast.info("Ainda não há cashback disponível esta semana.");
                    }
                  }}
                />
              </div>
            )}

            {activeTab === "profile" && auth.user && (
              <ProfileTab myBets={myBets} myBetsLoading={myBetsLoading} fetchMyBets={fetchMyBets} />
            )}

            {activeTab === "wallet" && auth.user && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-2xl font-black italic uppercase tracking-tight mb-6 flex items-center gap-2">
                  <Wallet className="text-red-600" /> Carteira
                </h2>

                {/* Balance card */}
                <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 border border-zinc-700 rounded-2xl p-6 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">Saldo disponível</div>
                    <div className="text-4xl font-black text-green-400">€ {parseFloat(auth.user.balance).toFixed(2)}</div>
                    <div className="text-xs text-zinc-500 mt-1">Conta verificada · {auth.user.email}</div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setDepositModalOpen(true)}
                      className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm"
                    >
                      <Plus size={16} /> Depositar
                    </button>
                    <button
                      onClick={() => setDepositModalOpen(true)}
                      className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
                    >
                      <ArrowUpCircle size={16} /> Levantar
                    </button>
                  </div>
                </div>

                {/* Transactions from bets */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                    <BarChart2 size={16} className="text-zinc-400" />
                    <span className="font-semibold text-sm">Histórico de Movimentos</span>
                  </div>
                  {myBetsLoading ? (
                    <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-red-600" size={28} /></div>
                  ) : myBets.length === 0 ? (
                    <div className="py-12 text-center text-zinc-500">
                      <ArrowDownCircle className="mx-auto mb-3 opacity-20" size={40} />
                      <p className="text-sm">Ainda sem movimentos registados.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-800">
                      {/* Initial deposit row */}
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-green-900/50 flex items-center justify-center shrink-0">
                            <ArrowDownCircle size={16} className="text-green-400" />
                          </div>
                          <div>
                            <div className="text-sm font-medium">Depósito inicial</div>
                            <div className="text-xs text-zinc-500">Bónus de boas-vindas</div>
                          </div>
                        </div>
                        <div className="text-green-400 font-bold text-sm">+ € 1.000,00</div>
                      </div>
                      {[...myBets].reverse().map(bet => {
                        const isWon = bet.status === "won";
                        const isCO = bet.status === "cashed_out";
                        const isPending = bet.status === "pending";
                        const credit = isWon ? parseFloat(bet.potentialWin) : isCO ? parseFloat(bet.potentialWin) * 0.92 : null;
                        return (
                          <div key={bet.id} className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isWon || isCO ? "bg-green-900/50" : "bg-red-900/30"}`}>
                                {isWon || isCO
                                  ? <ArrowDownCircle size={16} className="text-green-400" />
                                  : <ArrowUpCircle size={16} className="text-red-400" />}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{bet.matchTitle}</div>
                                <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                                  <span className={`font-semibold ${isWon ? "text-green-500" : isCO ? "text-yellow-500" : isPending ? "text-zinc-400" : "text-red-500"}`}>
                                    {isWon ? "Ganhou" : isCO ? "Cash Out" : isPending ? "Pendente" : "Perdeu"}
                                  </span>
                                  · {new Date(bet.createdAt).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0 ml-4">
                              <div className="text-red-400 font-semibold text-sm">− € {parseFloat(bet.stake).toFixed(2)}</div>
                              {credit !== null && (
                                <div className="text-green-400 font-bold text-sm">+ € {credit.toFixed(2)}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
                              <div className="font-bold text-white">€ {parseFloat(bet.stake).toFixed(2)}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-zinc-500">Odds</div>
                              <div className="font-bold text-red-400">{parseFloat(bet.totalOdds).toFixed(2)}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-zinc-500">Potencial</div>
                              <div className="font-bold text-green-400">€ {parseFloat(bet.potentialWin).toFixed(2)}</div>
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
                              <span className="font-bold text-green-400 ml-1">€ {cashoutEstimate(bet)}</span>
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
                  <span className="font-bold text-white">€ {parseFloat(cashoutConfirm.stake).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-zinc-500">Potencial de ganho</span>
                  <span className="font-bold text-zinc-300">€ {parseFloat(cashoutConfirm.potentialWin).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-zinc-800">
                  <span className="text-sm font-bold text-zinc-300">Cash Out estimado</span>
                  <span className="font-black text-green-400 text-lg">€ {cashoutEstimate(cashoutConfirm)}</span>
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
                      <Label htmlFor="reg-nif" className="text-sm">NIF</Label>
                      <Input id="reg-nif" type="text" placeholder="999 999 999" className="bg-zinc-900 border-zinc-800 text-white" required maxLength={11} value={regNif} onChange={e => setRegNif(nifMask(e.target.value))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-phone" className="text-sm">Telemóvel</Label>
                      <div className="flex">
                        <span className="inline-flex items-center px-2.5 rounded-l-md border border-r-0 border-zinc-800 bg-zinc-800 text-zinc-400 text-xs font-bold select-none">🇵🇹 +351</span>
                        <Input id="reg-phone" type="tel" placeholder="9XX XXX XXX" className="bg-zinc-900 border-zinc-800 text-white rounded-l-none" required maxLength={11} value={regPhone} onChange={e => setRegPhone(phoneMask(e.target.value))} />
                      </div>
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

      {/* ── DEPOSIT / WITHDRAW MODAL ──────────────────────────── */}
      <DepositWithdrawModal
        open={depositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        onSuccess={() => { auth.refreshUser(); }}
        balance={auth.user ? parseFloat(auth.user.balance) : 0}
        token={auth.token}
      />

      {/* ── PROMOTION NOTIFICATION ─────────────────────────────── */}
      <AnimatePresence>
        {promoNotif && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4"
            onClick={() => setPromoNotif(null)}
          >
            <motion.div
              initial={{ scale: 0.85, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 40 }}
              className="relative overflow-hidden rounded-3xl max-w-md w-full border border-white/15 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {promoNotif.type === "freebets20" && (
                <>
                  <img src="https://images.unsplash.com/photo-1521412644187-c49fa049e84d?q=80&w=800&auto=format&fit=crop" className="absolute inset-0 w-full h-full object-cover scale-105" alt="" />
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/85 to-black/95" />
                  <div className="relative z-10 p-8 text-center">
                    <div className="text-5xl mb-3">🎉</div>
                    <div className="inline-block px-3 py-1 rounded-full bg-white/15 text-xs font-black tracking-widest text-white mb-4">FREE BET ATIVADA</div>
                    <h2 className="text-3xl font-black text-white leading-tight mb-2">Parabéns!</h2>
                    <p className="text-white/90 text-base mb-1">Está a participar na promoção</p>
                    <p className="text-emerald-300 font-black text-xl mb-4">DEPOSITE €20 → GANHE €10</p>
                    <p className="text-white/70 text-sm leading-relaxed mb-6">Complete 4 apostas qualificadas com odds ≥ 1.80 para receber os seus €10 em free bets.</p>
                    <div className="grid grid-cols-4 gap-2 mb-6">
                      {[1,2,3,4].map(n => (
                        <div key={n} className="rounded-xl bg-white/10 border border-white/20 py-3 flex flex-col items-center gap-1">
                          <span className="text-lg">⚽</span>
                          <span className="text-[10px] text-white/60 font-bold">Aposta {n}</span>
                          <span className="text-[10px] text-yellow-400">Pendente</span>
                        </div>
                      ))}
                    </div>
                    <Button onClick={() => setPromoNotif(null)} className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-black h-12">COMEÇAR A APOSTAR</Button>
                  </div>
                </>
              )}
              {promoNotif.type === "bonus100" && (
                <>
                  <img src="https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=800&auto=format&fit=crop" className="absolute inset-0 w-full h-full object-cover scale-105" alt="" />
                  <div className="absolute inset-0 bg-gradient-to-br from-yellow-700/85 to-black/95" />
                  <div className="relative z-10 p-8 text-center">
                    <div className="text-5xl mb-3">🏆</div>
                    <div className="inline-block px-3 py-1 rounded-full bg-white/15 text-xs font-black tracking-widest text-white mb-4">BÓNUS BOAS-VINDAS</div>
                    <h2 className="text-3xl font-black text-white leading-tight mb-2">100% Ativo!</h2>
                    <p className="text-yellow-300 font-black text-xl mb-4">O SEU DEPÓSITO FOI DUPLICADO</p>
                    <p className="text-white/70 text-sm leading-relaxed mb-6">Faça apostas com rollover 5× sobre depósito + bónus em odds ≥ 1.5 para desbloquear o saldo.</p>
                    <Button onClick={() => setPromoNotif(null)} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-black h-12">COMEÇAR A APOSTAR</Button>
                  </div>
                </>
              )}
              {promoNotif.type === "cashback" && (
                <>
                  <img src="https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=800&auto=format&fit=crop" className="absolute inset-0 w-full h-full object-cover scale-105" alt="" />
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-700/85 to-black/95" />
                  <div className="relative z-10 p-8 text-center">
                    <div className="text-5xl mb-3">💰</div>
                    <div className="inline-block px-3 py-1 rounded-full bg-white/15 text-xs font-black tracking-widest text-white mb-4">CASHBACK SEMANAL</div>
                    <h2 className="text-3xl font-black text-white leading-tight mb-2">Recuperou € {(promoNotif.amount ?? 0).toFixed(2)}!</h2>
                    <p className="text-cyan-300 font-black text-xl mb-4">10% DAS SUAS PERDAS DEVOLVIDO</p>
                    <p className="text-white/70 text-sm leading-relaxed mb-6">O cashback foi creditado em saldo bónus. Necessita de 1× rollover para levantar.</p>
                    <Button onClick={() => setPromoNotif(null)} className="w-full bg-cyan-500 hover:bg-cyan-600 text-black font-black h-12">USAR O MEU CASHBACK</Button>
                  </div>
                </>
              )}
              <button onClick={() => setPromoNotif(null)} className="absolute top-4 right-4 text-white/60 hover:text-white bg-black/40 rounded-full p-1.5 z-20">
                <X size={18} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

// ─── PROMOS PAGE ─────────────────────────────────────────────────────────────
function PromosPage({
  isLoggedIn,
  cashbackData,
  onDeposit,
  onFetchCashback,
  onClaimCashback,
}: {
  isLoggedIn: boolean;
  cashbackData: { totalLost: number; cashback: number; bets: number } | null;
  onDeposit: () => void;
  onFetchCashback: () => void;
  onClaimCashback: () => void;
}) {
  useEffect(() => { onFetchCashback(); }, []);

  const promos = [
    {
      id: "bonus100",
      title: "100% BÓNUS DE BOAS‑VINDAS",
      subtitle: "ATÉ €500 · ROLLOVER 5×",
      description: "Receba 100% no primeiro depósito e desbloqueie o saldo com rollover progressivo de 5× em apostas qualificadas.",
      badge: "SPORTSBOOK",
      image: "https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=1400&auto=format&fit=crop",
      gradient: "from-yellow-400/60 to-orange-600/60",
      highlight: "+100%",
      highlightLabel: "no 1.º depósito",
      terms: ["Bónus válido apenas no 1.º depósito.", "Rollover total de 5× sobre depósito + bónus.", "Odds mínimas qualificadas: 1.5.", "Prazo de utilização: 30 dias."],
      cta: "ATIVAR BÓNUS",
      action: onDeposit,
    },
    {
      id: "freebets20",
      title: "DEPOSITE €20 E GANHE €10",
      subtitle: "FREE BETS EXCLUSIVAS",
      description: "Faça o seu primeiro depósito de €20 e conclua 4 apostas qualificadas para receber €10 em free bets.",
      badge: "FREE BET",
      image: "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?q=80&w=1400&auto=format&fit=crop",
      gradient: "from-emerald-400/60 to-green-700/60",
      highlight: "€10",
      highlightLabel: "em free bets",
      terms: ["Depósito mínimo de €20.", "4 apostas qualificadas obrigatórias.", "Odds mínimas de 1.80.", "Free bets válidas por 7 dias."],
      cta: "DEPOSITAR €20",
      action: onDeposit,
    },
    {
      id: "cashback",
      title: "CASHBACK SEMANAL",
      subtitle: "10% EM FREE BETS",
      description: "Recupere parte das perdas líquidas em apostas esportivas toda semana. Máximo de €100 por utilizador.",
      badge: "HOT",
      image: "https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=1400&auto=format&fit=crop",
      gradient: "from-cyan-400/60 to-blue-700/60",
      highlight: "10%",
      highlightLabel: cashbackData ? `≈ €${cashbackData.cashback.toFixed(2)} disp.` : "das perdas",
      terms: ["Cashback calculado semanalmente.", "Máximo de €100 por utilizador.", "Pago em saldo bónus.", "Necessário 1× rollover para saque."],
      cta: cashbackData && cashbackData.cashback > 0 ? `RESGATAR €${cashbackData.cashback.toFixed(2)}` : "VER DETALHES",
      action: onClaimCashback,
    },
    {
      id: "superodds",
      title: "SUPER ODDS",
      subtitle: "BOOSTS ESPORTIVOS DIÁRIOS",
      description: "Odds turbinadas diariamente nos principais jogos e campeonatos. Maximize os seus ganhos nos eventos em destaque.",
      badge: "BOOST",
      image: "https://images.unsplash.com/photo-1505250469679-203ad9ced0cb?q=80&w=1400&auto=format&fit=crop",
      gradient: "from-red-500/60 to-rose-700/60",
      highlight: "+25%",
      highlightLabel: "nas odds",
      terms: ["Disponível apenas em eventos selecionados.", "Stake máxima promocional: €50.", "Mercados limitados por evento.", "Boosts atualizam às 10h diariamente."],
      cta: "VER JOGOS COM BOOST",
      action: () => {},
    },
  ];

  return (
    <div className="bg-[#050816] px-4 sm:px-6 py-8 min-h-[60vh]">
      <div className="max-w-5xl mx-auto space-y-6">
        {promos.map((promo) => (
          <div
            key={promo.id}
            className="relative overflow-hidden rounded-[28px] min-h-[300px] group border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
          >
            <img
              src={promo.image}
              alt={promo.title}
              className="absolute inset-0 w-full h-full object-cover scale-105 group-hover:scale-110 transition-all duration-700"
            />
            <div className={`absolute inset-0 bg-gradient-to-r ${promo.gradient}`} />
            <div className="absolute inset-0 bg-black/55" />

            <div className="relative z-10 h-full flex items-center justify-between p-6 sm:p-8 gap-6">
              <div className="max-w-2xl flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-xl text-xs font-black tracking-[0.18em] border border-white/20 text-white">
                    {promo.badge}
                  </span>
                  {promo.id === "cashback" && cashbackData && cashbackData.cashback > 0 && (
                    <span className="px-3 py-1.5 rounded-full bg-cyan-500/20 text-xs font-black tracking-wider border border-cyan-400/30 text-cyan-300">
                      💰 DISPONÍVEL
                    </span>
                  )}
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight tracking-tight drop-shadow-2xl">
                  {promo.title}
                </h2>
                <h3 className="text-base sm:text-lg font-bold text-white/85 mt-2 tracking-wide">
                  {promo.subtitle}
                </h3>
                <p className="mt-3 text-sm sm:text-base text-white/75 max-w-xl leading-relaxed">
                  {promo.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {promo.terms.map((term, i) => (
                    <div key={i} className="px-3 py-1.5 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/10 text-xs text-white/75">
                      {term}
                    </div>
                  ))}
                </div>
                <button
                  onClick={isLoggedIn || promo.id === "superodds" ? promo.action : () => {}}
                  className="mt-5 px-6 py-3 rounded-2xl bg-white text-black font-black text-sm tracking-wide hover:bg-white/90 transition-all active:scale-95 shadow-lg"
                >
                  {!isLoggedIn && promo.id !== "superodds" ? "ENTRAR PARA ATIVAR" : promo.cta}
                </button>
              </div>

              <div className="hidden lg:flex flex-col items-center shrink-0">
                <div className="bg-white/10 backdrop-blur-2xl border border-white/15 rounded-[24px] px-7 py-5 group-hover:scale-105 transition-all duration-500 text-center min-w-[140px]">
                  <div className="text-white/50 text-[10px] font-bold mb-1 uppercase tracking-widest">Promoção Ativa</div>
                  <div className="text-5xl font-black text-white leading-none">{promo.highlight}</div>
                  <div className="mt-2 text-emerald-300 font-semibold text-xs">{promo.highlightLabel}</div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
          </div>
        ))}
      </div>

      <div className="max-w-5xl mx-auto mt-10">
        <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-white/5 backdrop-blur-2xl px-6 py-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.10),transparent_40%)]" />
          <div className="relative z-10">
            <h4 className="text-lg font-black text-white tracking-wide mb-4">TERMOS & CONDIÇÕES DAS PROMOÇÕES</h4>
            <div className="grid md:grid-cols-2 gap-4 text-white/65 text-sm leading-relaxed">
              <div className="space-y-2">
                <p>• Promoções válidas apenas para utilizadores registados na plataforma.</p>
                <p>• Apenas apostas esportivas qualificadas contam para rollover e missões.</p>
                <p>• Odds mínimas exigidas podem variar conforme a promoção ativa.</p>
                <p>• Free bets não possuem valor de stake retornável.</p>
              </div>
              <div className="space-y-2">
                <p>• A plataforma reserva-se o direito de alterar ou cancelar promoções em caso de abuso.</p>
                <p>• Contas duplicadas ou atividades suspeitas invalidam automaticamente os bónus.</p>
                <p>• Todas as promoções estão sujeitas à política de jogo responsável.</p>
                <p>• Última atualização: 07 Maio 2026.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DEPOSIT MODAL ────────────────────────────────────────────────────────────
type PayMethod = "multibanco" | "mbway" | "card";

type MbRef = { entity: string; reference: string; amount: string; expiresAt: string; orderId: string };

function DepositWithdrawModal({
  open, onClose, onSuccess, balance, token,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  balance: number;
  token: string | null;
}) {
  const [payMethod, setPayMethod] = useState<PayMethod>("multibanco");
  const [depositAmount, setDepositAmount] = useState("");
  const [mbwayPhone, setMbwayPhone] = useState("");
  const [loading, setLoading] = useState(false);

  // Per-method result states
  const [mbRef, setMbRef] = useState<MbRef | null>(null);
  const [mbwayDone, setMbwayDone] = useState(false);

  // Main tab: deposit vs withdraw
  const [mainTab, setMainTab] = useState<"deposit" | "withdraw">("deposit");

  // Withdrawal form
  const [wAmount, setWAmount] = useState("");
  const [wIban, setWIban] = useState("");
  const [wName, setWName] = useState("");
  const [wNif, setWNif] = useState("");
  const [wDone, setWDone] = useState(false);

  const amount = parseFloat(depositAmount.replace(",", "."));
  const amountValid = !isNaN(amount) && amount >= 10 && amount <= 5000;
  const promoHint = amountValid && amount >= 20;

  const METHODS: { id: PayMethod; label: string; icon: string }[] = [
    { id: "multibanco", label: "Multibanco", icon: "🏧" },
    { id: "mbway", label: "MB WAY", icon: "📱" },
    { id: "card", label: "Cartão", icon: "💳" },
  ];

  function resetMethod(m: PayMethod) {
    setPayMethod(m);
    setMbRef(null);
    setMbwayDone(false);
  }

  async function handleWithdraw() {
    const wAmountNum = parseFloat(wAmount.replace(",", "."));
    if (isNaN(wAmountNum) || wAmountNum < 20) { toast.error("Valor mínimo de levantamento: €20."); return; }
    if (wAmountNum > balance) { toast.error("Saldo insuficiente."); return; }
    const cleanIban = wIban.replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(cleanIban)) { toast.error("IBAN inválido."); return; }
    if (!wName.trim() || wName.trim().length < 3) { toast.error("Nome do titular inválido."); return; }
    if (!/^\d{9}$/.test(wNif)) { toast.error("NIF inválido. Deve ter 9 dígitos."); return; }
    setLoading(true);
    try {
      const r = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: wAmountNum, iban: cleanIban, holderName: wName.trim(), nif: wNif }),
      });
      const data = await r.json() as { withdrawal?: { id: number }; error?: string };
      if (!r.ok) { toast.error(data.error ?? "Erro ao submeter pedido."); return; }
      setWDone(true);
      onSuccess();
      toast.success("Pedido de levantamento submetido! Processado em 2-5 dias úteis.");
    } catch { toast.error("Erro de ligação. Tente novamente."); }
    finally { setLoading(false); }
  }

  async function handleMultibanco() {
    if (!amountValid) { toast.error("Valor inválido. Mínimo €10."); return; }
    setLoading(true);
    try {
      const r = await fetch("/api/payments/multibanco", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount }),
      });
      const data = await r.json() as { entity?: string; reference?: string; amount?: string; expiresAt?: string; orderId?: string; error?: string };
      if (!r.ok) { toast.error(data.error ?? "Erro ao gerar referência."); return; }
      setMbRef({ entity: data.entity!, reference: data.reference!, amount: data.amount!, expiresAt: data.expiresAt!, orderId: data.orderId! });
      toast.success("Referência Multibanco gerada! Pague em qualquer ATM.");
      onSuccess();
    } catch { toast.error("Erro de ligação. Tente novamente."); }
    finally { setLoading(false); }
  }

  async function handleMbway() {
    if (!amountValid) { toast.error("Valor inválido. Mínimo €10."); return; }
    const phoneClean = mbwayPhone.replace(/\s/g, "");
    if (phoneClean.length !== 9) { toast.error("Número de telemóvel inválido."); return; }
    setLoading(true);
    try {
      const r = await fetch("/api/payments/mbway", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount, phone: phoneClean }),
      });
      const data = await r.json() as { orderId?: string; requestId?: string; error?: string };
      if (!r.ok) { toast.error(data.error ?? "Erro ao enviar pedido MB WAY."); return; }
      setMbwayDone(true);
      toast.success("Pedido MB WAY enviado! Aceite na App MB WAY.");
      onSuccess();
    } catch { toast.error("Erro de ligação. Tente novamente."); }
    finally { setLoading(false); }
  }

  async function handleCard() {
    if (!amountValid) { toast.error("Valor inválido. Mínimo €10."); return; }
    setLoading(true);
    try {
      const r = await fetch("/api/payments/card", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount }),
      });
      const data = await r.json() as { paymentUrl?: string; error?: string };
      if (!r.ok || !data.paymentUrl) { toast.error(data.error ?? "Erro ao iniciar pagamento por cartão."); return; }
      toast.info("A redirecionar para pagamento seguro...");
      window.open(data.paymentUrl, "_blank");
      onSuccess();
      onClose();
    } catch { toast.error("Erro de ligação. Tente novamente."); }
    finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 px-5 py-4 border-b border-zinc-700 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${mainTab === "deposit" ? "bg-emerald-600" : "bg-orange-600"}`}>
            {mainTab === "deposit" ? <Plus size={18} strokeWidth={3} /> : <ArrowUpCircle size={18} />}
          </div>
          <div>
            <div className="font-black text-base">{mainTab === "deposit" ? "Depósito" : "Levantamento"}</div>
            <div className="text-xs text-zinc-400">{mainTab === "deposit" ? <>Processado por <span className="text-white font-semibold">ifthenpay</span></> : "Transferência bancária · IBAN"}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[10px] text-zinc-500">Saldo actual</div>
            <div className="text-green-400 font-black text-sm">€ {balance.toFixed(2)}</div>
          </div>
        </div>

        {/* Main tab: Deposit vs Withdraw */}
        <div className="grid grid-cols-2 border-b border-zinc-800">
          <button
            onClick={() => { setMainTab("deposit"); setWDone(false); }}
            className={`flex items-center justify-center gap-2 py-3 text-xs font-bold transition-colors border-b-2 ${mainTab === "deposit" ? "border-emerald-500 text-white bg-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
          >
            <Plus size={14} /> DEPOSITAR
          </button>
          <button
            onClick={() => { setMainTab("withdraw"); setWDone(false); }}
            className={`flex items-center justify-center gap-2 py-3 text-xs font-bold transition-colors border-b-2 ${mainTab === "withdraw" ? "border-orange-500 text-white bg-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
          >
            <ArrowUpCircle size={14} /> LEVANTAR
          </button>
        </div>

        {/* Withdrawal form */}
        {mainTab === "withdraw" && (
          <div className="p-5 space-y-4">
            {wDone ? (
              <div className="text-center py-8 space-y-3">
                <div className="text-5xl">✅</div>
                <div className="font-black text-white text-lg">Pedido submetido!</div>
                <div className="text-sm text-zinc-400 leading-relaxed">O seu pedido de levantamento está em processamento.<br />Prazo estimado: <strong className="text-white">2 a 5 dias úteis</strong>.</div>
                <Button onClick={() => { setWDone(false); setWAmount(""); }} variant="outline" className="border-zinc-700 text-zinc-400 mt-2">Novo pedido</Button>
              </div>
            ) : (
              <>
                <div className="bg-orange-900/20 border border-orange-800/40 rounded-xl px-4 py-3 text-xs text-orange-300 leading-relaxed">
                  Mínimo de levantamento: <strong className="text-white">€20</strong>. Processado por transferência bancária em 2–5 dias úteis.
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Valor (€)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-sm">€</span>
                    <Input type="number" min={20} max={50000} placeholder="0,00"
                      className="pl-8 bg-zinc-900 border-zinc-700 text-white font-bold text-lg h-11"
                      value={wAmount} onChange={e => setWAmount(e.target.value)} />
                  </div>
                  <div className="flex gap-1.5">
                    {[20, 50, 100, 250].map(v => (
                      <button key={v} onClick={() => setWAmount(String(v))}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-colors ${wAmount === String(v) ? "border-orange-500 bg-orange-500/10 text-orange-400" : "border-zinc-700 hover:border-zinc-500 text-zinc-400"}`}>
                        €{v}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">IBAN</label>
                  <Input placeholder="PT50 0000 0000 0000 0000 0000 0" className="bg-zinc-900 border-zinc-700 text-white font-mono"
                    value={wIban} onChange={e => setWIban(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Nome Titular</label>
                    <Input placeholder="Nome completo" className="bg-zinc-900 border-zinc-700 text-white"
                      value={wName} onChange={e => setWName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">NIF</label>
                    <Input placeholder="123456789" maxLength={9} className="bg-zinc-900 border-zinc-700 text-white font-mono"
                      value={wNif} onChange={e => setWNif(e.target.value.replace(/\D/g, ""))} />
                  </div>
                </div>
                <Button onClick={handleWithdraw} disabled={loading}
                  className="w-full bg-orange-600 hover:bg-orange-500 text-white font-black h-11">
                  {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : <ArrowUpCircle size={16} className="mr-2" />}
                  Solicitar Levantamento
                </Button>
              </>
            )}
          </div>
        )}

        {/* Deposit content */}
        {mainTab === "deposit" && (<>
        <div className="grid grid-cols-3 border-b border-zinc-800">
          {METHODS.map(m => (
            <button
              key={m.id}
              onClick={() => resetMethod(m.id)}
              className={`flex flex-col items-center gap-1 py-3 text-xs font-bold transition-colors border-b-2 ${payMethod === m.id ? "border-emerald-500 text-white bg-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
            >
              <span className="text-lg">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {/* Amount selector */}
          <div>
            <p className="text-xs text-zinc-400 mb-2 font-semibold uppercase tracking-widest">Valor</p>
            <div className="grid grid-cols-5 gap-1.5 mb-3">
              {[10, 20, 50, 100, 200].map(v => (
                <button
                  key={v}
                  onClick={() => { setDepositAmount(String(v)); setMbRef(null); setMbwayDone(false); }}
                  className={`py-2 rounded-lg border font-bold text-xs transition-colors ${depositAmount === String(v) ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-zinc-700 hover:border-zinc-500 text-zinc-300"}`}
                >
                  €{v}
                </button>
              ))}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-sm">€</span>
              <Input
                type="number" min={10} max={5000} placeholder="0,00"
                className="pl-8 bg-zinc-900 border-zinc-700 text-white font-bold text-lg h-11"
                value={depositAmount}
                onChange={e => { setDepositAmount(e.target.value); setMbRef(null); setMbwayDone(false); }}
              />
            </div>
          </div>
          {promoHint && (
            <div className="bg-emerald-900/30 border border-emerald-600/30 rounded-xl p-2.5 flex items-center gap-2.5 text-xs">
              <span className="text-lg">🎁</span>
              <span className="text-emerald-300 font-semibold">
                {amount >= 100 ? "Qualifica para 100% Bónus de Boas-Vindas!" : "Qualifica para €10 em Free Bets!"}
              </span>
            </div>
          )}

          {/* ── MULTIBANCO ── */}
          {payMethod === "multibanco" && (
            <div className="space-y-3">
              {!mbRef ? (
                <>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-400 leading-relaxed">
                    Gera uma referência Multibanco e paga em qualquer <strong className="text-zinc-200">ATM, HomeBanking ou App de banco</strong>. O saldo é creditado automaticamente após confirmação de pagamento.
                  </div>
                  <Button
                    onClick={handleMultibanco}
                    disabled={loading || !amountValid}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-11"
                  >
                    {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : "🏧"} Gerar Referência Multibanco
                  </Button>
                </>
              ) : (
                <div className="bg-zinc-900 border border-emerald-600/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-zinc-400 font-semibold uppercase tracking-widest">Referência Multibanco</div>
                    <span className="text-[10px] bg-emerald-900/40 text-emerald-400 border border-emerald-600/30 px-2 py-0.5 rounded-full font-bold">Aguardando pagamento</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-zinc-800 rounded-xl py-3">
                      <div className="text-[10px] text-zinc-500 mb-1">Entidade</div>
                      <div className="font-black text-white text-lg tracking-widest">{mbRef.entity}</div>
                    </div>
                    <div className="bg-zinc-800 rounded-xl py-3">
                      <div className="text-[10px] text-zinc-500 mb-1">Referência</div>
                      <div className="font-black text-white text-sm tracking-widest">{mbRef.reference}</div>
                    </div>
                    <div className="bg-zinc-800 rounded-xl py-3">
                      <div className="text-[10px] text-zinc-500 mb-1">Valor</div>
                      <div className="font-black text-emerald-400 text-lg">€{mbRef.amount}</div>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500 text-center leading-relaxed">
                    Referência válida por <span className="text-zinc-300 font-semibold">24 horas</span>.<br />
                    O saldo é creditado automaticamente após pagamento.
                  </div>
                  <Button variant="outline" className="w-full border-zinc-700 text-zinc-400 h-9 text-xs" onClick={() => setMbRef(null)}>
                    Gerar nova referência
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── MB WAY ── */}
          {payMethod === "mbway" && (
            <div className="space-y-3">
              {!mbwayDone ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400 font-semibold uppercase tracking-widest">Número MB WAY</Label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-zinc-700 bg-zinc-800 text-zinc-400 text-xs font-bold">🇵🇹 +351</span>
                      <Input
                        type="tel" placeholder="9XX XXX XXX"
                        className="bg-zinc-900 border-zinc-700 text-white font-bold rounded-l-none h-11"
                        value={mbwayPhone}
                        onChange={e => setMbwayPhone(phoneMask(e.target.value))}
                        maxLength={11}
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleMbway}
                    disabled={loading || mbwayPhone.replace(/\s/g,"").length !== 9 || !amountValid}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-11"
                  >
                    {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : "📱"} Enviar Pedido MB WAY — €{amountValid ? amount.toFixed(2) : "0.00"}
                  </Button>
                </>
              ) : (
                <div className="bg-zinc-900 border border-emerald-600/30 rounded-2xl p-4 text-center space-y-3">
                  <div className="text-4xl animate-pulse">📱</div>
                  <div className="font-black text-white text-base">Pedido enviado!</div>
                  <div className="text-sm text-zinc-400">
                    Verifique a App MB WAY no número<br />
                    <span className="text-white font-bold">+351 {mbwayPhone}</span>
                  </div>
                  <div className="text-xs text-zinc-500">Tem 4 minutos para aceitar. Valor: <span className="text-emerald-400 font-bold">€{amount.toFixed(2)}</span></div>
                  <div className="text-xs text-zinc-600 mt-2">O saldo é creditado automaticamente após confirmação.</div>
                  <Button variant="outline" className="w-full border-zinc-700 text-zinc-400 h-9 text-xs" onClick={() => setMbwayDone(false)}>
                    Enviar novo pedido
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── CARTÃO ── */}
          {payMethod === "card" && (
            <div className="space-y-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-400 leading-relaxed">
                Serás redireccionado para a página de pagamento seguro da <strong className="text-zinc-200">ifthenpay</strong> (3D Secure). O saldo é creditado após confirmação.
              </div>
              <Button
                onClick={handleCard}
                disabled={loading || !amountValid}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-11"
              >
                {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : "💳"} Pagar €{amountValid ? amount.toFixed(2) : "0.00"} com Cartão
              </Button>
              <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-600">
                <span>🔒</span> Pagamento seguro 3D Secure · ifthenpay
              </div>
            </div>
          )}

        </div>
        </>)}
      </DialogContent>
    </Dialog>
  );
}
