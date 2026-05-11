import { useState, useCallback, useEffect, useRef, createContext, useContext, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Menu, X, Trophy, Activity, Gift,
  LogOut, User, History, Loader2, Zap, TrendingUp,
  ChevronRight, ChevronLeft, ChevronDown, AlertCircle, BarChart2, Wallet, ArrowDownCircle, ArrowUpCircle, Plus,
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
  // ── Liga Portugal ──
  "FC Porto": "/banners/porto.jpg",
  "Porto": "/banners/porto.jpg",
  "Benfica": "/banners/benfica.jpg",
  "SL Benfica": "/banners/benfica.jpg",
  "Sporting CP": "/banners/sporting.jpg",
  "Sporting": "/banners/sporting.jpg",
  "Braga": "/banners/braga.jpg",
  "SC Braga": "/banners/braga.jpg",
  "Famalicão": "/banners/famalicao.jpg",
  "Famalicao": "/banners/famalicao.jpg",
  "FC Famalicão": "/banners/famalicao.jpg",
  "Gil Vicente": "/banners/gil-vicente.jpg",
  "Moreirense": "/banners/moreirense.jpg",
  "Vitória SC": "/banners/vitoria-sc.jpg",
  "Vitoria SC": "/banners/vitoria-sc.jpg",
  "Vitória de Guimarães": "/banners/vitoria-sc.jpg",
  "Estoril Praia": "/banners/estoril.jpg",
  "Estoril": "/banners/estoril.jpg",
  "Alverca": "/banners/alverca.jpg",
  "FC Alverca": "/banners/alverca.jpg",
  // ── Serie A ──
  "Inter": "/banners/inter.jpg",
  "Inter Milan": "/banners/inter.jpg",
  "Internazionale": "/banners/inter.jpg",
  "Milan": "/banners/milan.jpg",
  "AC Milan": "/banners/milan.jpg",
  "Juventus": "/banners/juventus.jpg",
  "Napoli": "/banners/napoli.jpg",
  "Roma": "/banners/roma.jpg",
  "AS Roma": "/banners/roma.jpg",
  "Lazio": "/banners/lazio.jpg",
  "SS Lazio": "/banners/lazio.jpg",
  "Atalanta": "/banners/atalanta.jpg",
  "Fiorentina": "/banners/fiorentina.jpg",
  "Bologna": "/banners/bologna.jpg",
  "Torino": "/banners/torino.jpg",
  "Como": "/banners/como.jpg",
  "Como 1907": "/banners/como.jpg",
  "Parma": "/banners/parma.jpg",
  "Parma Calcio": "/banners/parma.jpg",
  // ── La Liga ──
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
  // Liga Portugal
  "FC Porto": "portugal", "Porto": "portugal",
  "Benfica": "portugal", "SL Benfica": "portugal",
  "Sporting CP": "portugal", "Sporting": "portugal",
  "Braga": "portugal", "SC Braga": "portugal",
  "Famalicão": "portugal", "Famalicao": "portugal", "FC Famalicão": "portugal",
  "Gil Vicente": "portugal", "Moreirense": "portugal",
  "Vitória SC": "portugal", "Vitoria SC": "portugal", "Vitória de Guimarães": "portugal",
  "Estoril Praia": "portugal", "Estoril": "portugal",
  "Alverca": "portugal", "FC Alverca": "portugal",
  // Serie A
  "Inter": "italy", "Inter Milan": "italy", "Internazionale": "italy",
  "Milan": "italy", "AC Milan": "italy", "Juventus": "italy",
  "Napoli": "italy", "Roma": "italy", "AS Roma": "italy",
  "Lazio": "italy", "SS Lazio": "italy", "Atalanta": "italy",
  "Fiorentina": "italy", "Bologna": "italy", "Torino": "italy",
  "Como": "italy", "Como 1907": "italy", "Parma": "italy", "Parma Calcio": "italy",
  // La Liga
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
  const today = new Date();
  const todayKey = `${String(today.getDate()).padStart(2,"0")}.${String(today.getMonth()+1).padStart(2,"0")}.${today.getFullYear()}`;
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const tomorrowKey = `${String(tomorrow.getDate()).padStart(2,"0")}.${String(tomorrow.getMonth()+1).padStart(2,"0")}.${tomorrow.getFullYear()}`;
  if (dateStr === todayKey) return "Hoje";
  if (dateStr === tomorrowKey) return "Amanhã";
  const d = new Date(parseInt(parts[2]!), parseInt(parts[1]!) - 1, parseInt(parts[0]!));
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
  totalGoals: { over05: number; under05: number; over15: number; under15: number; over25: number; under25: number; over35: number; under35: number; over45: number; under45: number; over55: number; under55: number; over65: number; under65: number };
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
  status?: string;
  markets?: AdvancedMarkets;
  events?: Array<{ type: string; team: string; minute: number; player: string }>;
  // market key → reopen timestamp (ms); if in future, market is suspended
  marketSuspension?: Record<string, number>;
  // reason for current suspension (GOLO!, PENÁLTI, REVISÃO AO VAR, etc.)
  _suspensionReason?: string;
  // sport-specific live display
  _liveExtra?: {
    clockStr?: string;
    sets?: Array<[number, number]>;
    currentPoints?: [number | string, number | string];
    currentPts?: [number, number];
    vollSets?: Array<[number, number]>;
    tennisStats?: [
      { aces: number; doubleFaults: number; firstServePct: string; winners: number; unforcedErrors: number },
      { aces: number; doubleFaults: number; firstServePct: string; winners: number; unforcedErrors: number },
    ];
    periods?: Array<[number, number]>;
  };
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

const MarketTabCtx = createContext<string>("");

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

  // Recent tennis results (yesterday)
  type TennisResult = {
    id: string; home: string; away: string;
    sets: Array<[number, number]>; homeWon: boolean;
    status: string; tournament: string; date: string; time: string;
  };
  const [recentResults, setRecentResults] = useState<TennisResult[]>([]);
  const [resultsOpen, setResultsOpen] = useState(true);

  type VolleyResult = {
    id: string; home: string; away: string;
    homeSets: number; awaySets: number;
    sets: Array<[number, number]>;
    homeWon: boolean;
    league: string; country: string; date: string; time: string;
  };

  type HockeyResult = {
    id: string; home: string; away: string;
    homeScore: number; awayScore: number;
    periods: Array<[number, number]>;
    homeWon: boolean;
    league: string; country: string; date: string; time: string;
  };
  const [hockeyResults, setHockeyResults] = useState<HockeyResult[]>([]);

  type NHLTeamStats = {
    shotsOnGoal: number; savesPct: number;
    ppGoals: number; ppPct: number;
    penKillPct: number; faceoffPct: number; penaltyMinutes: number;
  };
  type HockeyScheduleMatch = {
    id: string; date: string; time: string; status: string; venue?: string;
    home: string; away: string;
    homeScore: number; awayScore: number;
    periods: Array<[number, number]>;
    homeWon?: boolean;
    teamStats?: { home: NHLTeamStats; away: NHLTeamStats };
  };
  type HockeyScheduleData = {
    league: string; season: string;
    upcomingMatches: HockeyScheduleMatch[];
    recentMatches: HockeyScheduleMatch[];
  };
  const [hockeySchedule, setHockeySchedule] = useState<HockeyScheduleData | null>(null);

  type NHLStandingsTeam = {
    id: string; name: string; abbr: string; position: number;
    gp: number; won: number; lost: number; otLosses: number;
    points: number; gf: number; ga: number; diff: string;
    streak: string; lastTen: string; homeRecord: string; roadRecord: string;
  };
  type NHLStandingsDivision = { name: string; teams: NHLStandingsTeam[] };
  type NHLStandingsConference = { name: string; divisions: NHLStandingsDivision[] };
  type NHLStandingsData = { season: string; conferences: NHLStandingsConference[] };
  const [hockeyStandings, setHockeyStandings] = useState<NHLStandingsData | null>(null);

  type NHLRosterPlayer = {
    id: string; name: string; number: string; age: number;
    birthPlace: string; height: string; weight: string; shot: string; salary: string;
  };
  type NHLRosterPosition = { name: string; players: NHLRosterPlayer[] };
  type NHLRosterData = { teamName: string; abbreviation: string; season: string; positions: NHLRosterPosition[] };
  const [hockeyRosters, setHockeyRosters] = useState<Record<string, NHLRosterData>>({});
  const [selectedRosterAbbr, setSelectedRosterAbbr] = useState<string | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterPanelTab, setRosterPanelTab] = useState<"roster" | "stats" | "injuries">("roster");

  type NHLInjuryReport = { playerName: string; playerId: string; status: string; description: string; date: string };
  type NHLInjuriesData = { teamName: string; report: NHLInjuryReport[] };
  const [hockeyInjuries, setHockeyInjuries] = useState<Record<string, NHLInjuriesData>>({});
  const [injuriesLoading, setInjuriesLoading] = useState(false);

  type NHLSkaterStat = {
    id: string; rank: number; name: string; pos: string;
    gp: number; goals: number; assists: number; points: number;
    plusMinus: number; pim: number; ppg: number; ppa: number;
    shg: number; sha: number; shots: number; gwg: number;
    toiPerGame: string; faceoffPct: string;
  };
  type NHLGoalieStat = {
    id: string; rank: number; name: string;
    gp: number; wins: number; losses: number; otLosses: number;
    saves: number; savesPct: string; gaa: string;
    shotsAgainst: number; goalsAgainst: number; shutouts: number; toi: string;
  };
  type NHLTeamStatsData = { teamName: string; season: string; skaters: NHLSkaterStat[]; goalies: NHLGoalieStat[] };
  const [hockeyTeamStats, setHockeyTeamStats] = useState<Record<string, NHLTeamStatsData>>({});
  const [teamStatsLoading, setTeamStatsLoading] = useState(false);

  // Active tennis tournaments
  type ActiveTournament = {
    id: string; name: string; category: string; surface: string;
    location: string; date_start: string; date_end: string;
    prize_money: string; tour: "atp" | "wta";
  };
  const [activeTournaments, setActiveTournaments] = useState<ActiveTournament[]>([]);
  type TournamentMatchPlayer = {
    id: string; name: string; totalscore: string;
    s1: string; s2: string; s3: string; s4: string; s5: string;
    winner: boolean; serve: boolean;
  };
  type TournamentMatch = {
    id: string; status: string; date: string; time: string; court: string;
    round: string; roundOrder: number; players: TournamentMatchPlayer[];
  };
  const [expandedTournamentId, setExpandedTournamentId] = useState<string | null>(null);
  const [tournamentDetail, setTournamentDetail] = useState<{ id: string; league: string; matches: TournamentMatch[] } | null>(null);
  const [tournamentDetailLoading, setTournamentDetailLoading] = useState(false);

  // Tennis ATP/WTA standings
  type StandingPlayer = { id: string; name: string; country: string; rank: string; points: string; movement: string; };
  const [tennisStandings, setTennisStandings] = useState<{ atp: StandingPlayer[]; wta: StandingPlayer[] } | null>(null);
  const [rankingsTour, setRankingsTour] = useState<"atp" | "wta">("atp");
  const [rankingsOpen, setRankingsOpen] = useState(false);

  // Tennis pre-match odds (real bookmaker odds)
  type TennisOddsEntry = {
    matchId: string; date: string; time: string; tournamentName: string;
    players: [{ id: string; name: string }, { id: string; name: string }];
    matchOdds: [number, number];
    set1Odds: [number, number] | null;
  };
  const [tennisOddsMatches, setTennisOddsMatches] = useState<TennisOddsEntry[]>([]);

  // Volleyball pre-match odds
  type VolleyOddsEntry = {
    matchId: string; date: string; time: string; league: string;
    homeTeam: { id: string; name: string }; awayTeam: { id: string; name: string };
    homeOdds: number; awayOdds: number;
    overUnder: { line: string; over: number; under: number } | null;
  };
  const [volleyOddsMatches, setVolleyOddsMatches] = useState<VolleyOddsEntry[]>([]);
  const [volleyOddsOpen, setVolleyOddsOpen] = useState(true);

  // Hockey pre-match odds
  type HockeyOddsEntry = {
    matchId: string; date: string; time: string;
    homeTeam: { id: string; name: string }; awayTeam: { id: string; name: string };
    homeOdds: number; drawOdds: number; awayOdds: number;
  };
  const [hockeyOddsMatches, setHockeyOddsMatches] = useState<HockeyOddsEntry[]>([]);

  // Volleyball leagues + schedule
  type VolleyLeague = { id: string; gid: string; league: string; country: string };
  type VolleyScheduleEntry = {
    id: string; home: string; away: string;
    homeSets: number; awaySets: number;
    sets: Array<[number, number]>;
    homeWon: boolean; date: string; time: string;
  };
  type VolleySchedule = {
    id: string; league: string; season: string; country: string;
    recentWeeks: Array<{ number: string; matches: VolleyScheduleEntry[] }>;
    nextWeek: { number: string; matches: Array<{ id: string; home: string; away: string; date: string; time: string }> } | null;
  };
  const [volleyLeagues, setVolleyLeagues] = useState<VolleyLeague[]>([]);
  const [expandedVolleyLeagueId, setExpandedVolleyLeagueId] = useState<string | null>(null);
  const [volleyScheduleMap, setVolleyScheduleMap] = useState<Record<string, VolleySchedule>>({});
  const [volleyScheduleLoading, setVolleyScheduleLoading] = useState(false);

  // Volleyball standings
  type VolleyStandingTeam = {
    id: string; name: string; pos: string; gp: string;
    w: string; l: string; pts: string;
    points_for: string; points_against: string;
    recent_form: string;
    description?: { value: string } | string;
  };
  type VolleyStandings = {
    id: string; name: string; season: string; country: string;
    teams: VolleyStandingTeam[];
  };
  const [volleyStandingsMap, setVolleyStandingsMap] = useState<Record<string, VolleyStandings>>({});
  const [volleyLeagueTab, setVolleyLeagueTab] = useState<"schedule" | "standings">("schedule");

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
  const [matchViewTab, setMatchViewTab] = useState<"markets" | "stats" | "standings" | "live" | "yesterday" | "ranking">("markets");
  // Market sub-tab — lifted here so live refreshes don't unmount MatchModalMarkets and reset the selection
  const [modalTab, setModalTab] = useState("todos");
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
    setModalTab("todos");
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

  // Fetch yesterday's tennis results + active tournaments on mount
  useEffect(() => {
    fetch("/api/matches/results")
      .then(r => r.ok ? r.json() : { results: [] })
      .then(d => setRecentResults(d.results ?? []))
      .catch(() => { /* non-critical */ });
    fetch("/api/matches/volleyball-leagues")
      .then(r => r.ok ? r.json() : { leagues: [] })
      .then(d => setVolleyLeagues(d.leagues ?? []))
      .catch(() => { /* non-critical */ });
    fetch("/api/matches/tournaments")
      .then(r => r.ok ? r.json() : { tournaments: [] })
      .then(d => setActiveTournaments(d.tournaments ?? []))
      .catch(() => { /* non-critical */ });
    fetch("/api/matches/standings")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setTennisStandings(d); })
      .catch(() => { /* non-critical */ });
    fetch("/api/matches/tennis-odds")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.odds) setTennisOddsMatches(d.odds); })
      .catch(() => { /* non-critical */ });
    fetch("/api/matches/hockey-results")
      .then(r => r.ok ? r.json() : { results: [] })
      .then(d => setHockeyResults(d.results ?? []))
      .catch(() => { /* non-critical */ });
    fetch("/api/matches/hockey-schedule")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setHockeySchedule(d); })
      .catch(() => { /* non-critical */ });
    fetch("/api/matches/hockey-standings")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setHockeyStandings(d); })
      .catch(() => { /* non-critical */ });
    fetch("/api/matches/volleyball-odds")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.odds) setVolleyOddsMatches(d.odds); })
      .catch(() => { /* non-critical */ });
    fetch("/api/matches/hockey-odds")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.odds) setHockeyOddsMatches(d.odds); })
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
          country?: string; sport?: string; status?: string;
          homeScore: number; awayScore: number; minute: number;
          hasRealOdds?: boolean; odds: Odds; markets?: AdvancedMarkets;
          events?: Array<{ type: string; team: string; minute: number; player: string }>;
          marketSuspension?: Record<string, number>;
          _suspensionReason?: string;
          _liveExtra?: {
            clockStr?: string;
            sets?: Array<[number, number]>;
            currentPoints?: [number | string, number | string];
            currentPts?: [number, number];
            vollSets?: Array<[number, number]>;
            tennisStats?: [
              { aces: number; doubleFaults: number; firstServePct: string; winners: number; unforcedErrors: number },
              { aces: number; doubleFaults: number; firstServePct: string; winners: number; unforcedErrors: number },
            ];
            periods?: Array<[number, number]>;
          };
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

  const handleVolleyLeagueClick = (id: string) => {
    if (expandedVolleyLeagueId === id) { setExpandedVolleyLeagueId(null); return; }
    setExpandedVolleyLeagueId(id);
    setVolleyLeagueTab("schedule");
    if (!volleyScheduleMap[id]) {
      setVolleyScheduleLoading(true);
      fetch(`/api/matches/volleyball-schedule/${id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setVolleyScheduleMap(prev => ({ ...prev, [id]: d })); })
        .catch(() => {})
        .finally(() => setVolleyScheduleLoading(false));
    }
  };

  const handleVolleyStandingsTab = (id: string) => {
    setVolleyLeagueTab("standings");
    if (!(id in volleyStandingsMap)) {
      fetch(`/api/matches/volleyball-standings/${id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { setVolleyStandingsMap(prev => ({ ...prev, [id]: d })); })
        .catch(() => { setVolleyStandingsMap(prev => ({ ...prev, [id]: null as unknown as VolleyStandings })); });
    }
  };

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

    const flashClass = !isSelected && oddsUp ? "odds-flash-up" : !isSelected && oddsDown ? "odds-flash-down" : "";

    return (
      <button
        key={odd.toFixed(2)}
        onClick={() => toggleBet(match, selection, odd, market, label)}
        className={`relative flex flex-col items-center py-2.5 px-2 rounded-md transition-colors text-xs ${grow ? "flex-1" : ""} ${isSelected ? "bg-red-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"} ${flashClass}`}
      >
        <span className="mb-0.5 text-[10px] leading-tight opacity-70">{label}</span>
        <span className="font-bold text-sm flex items-center gap-0.5">
          {odd.toFixed(2)}
          {oddsUp   && <span className="text-green-400 text-[9px] font-black leading-none shrink-0">▲</span>}
          {oddsDown && <span className="text-red-400  text-[9px] font-black leading-none shrink-0">▼</span>}
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
    // For live "Not Started" matches (tennis/volleyball): show scheduled time
    const timeStr = (match.isLive && match.status !== "Not Started") ? "" : [
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
    const minute = getDisplayMinute(match);
    const sport  = match.sport ?? "football";
    const extra  = match._liveExtra;
    const flag   = COUNTRY_FLAGS[match.country?.toLowerCase() ?? ""] ?? sportEmoji(match.sport);
    const bannerImg = getMatchBanner(match);
    const matchKey  = String(match.id);
    const isNew     = !seenMatchIds.current.has(matchKey);
    if (isNew) seenMatchIds.current.add(matchKey);

    // ── Progress bar width per sport ──────────────────────────────────────────
    const progress = (() => {
      if (sport === "basketball") return Math.min(100, (minute / 48) * 100);
      if (sport === "hockey")     return Math.min(100, (minute / 60) * 100);
      if (sport === "tennis")     return Math.min(100, (minute / 5) * 100);
      if (sport === "volleyball") return Math.min(100, (minute / 5) * 100);
      return Math.min(100, (minute / 90) * 100);
    })();

    // ── Live badge label per sport ────────────────────────────────────────────
    const liveBadgeLabel = (() => {
      if (sport === "basketball" && match.status) return `${match.status}${extra?.clockStr ? ` · ${extra.clockStr}` : ""}`;
      if (sport === "hockey"     && match.status) return `${match.status}${extra?.clockStr ? ` · ${extra.clockStr}` : ""}`;
      if (sport === "tennis"     && match.status) return match.status;
      if (sport === "volleyball" && match.status) return match.status;
      return minute === 45 ? "HT" : minute === 105 ? "ET" : `${minute}'`;
    })();

    // Non-live volleyball states get a muted badge (no pulse)
    const isVolleyNonLive = sport === "volleyball" &&
      (match.status === "Encerrado" || (match.status ?? "").startsWith("Hoje"));
    const liveBadge = isVolleyNonLive ? (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold text-zinc-400 tabular-nums">
          {match.status === "Encerrado" ? "FIN" : liveBadgeLabel}
        </span>
      </div>
    ) : (
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
        </span>
        <span className="text-[10px] font-bold text-red-500 tabular-nums">{liveBadgeLabel}</span>
      </div>
    );

    // ── Score area per sport ──────────────────────────────────────────────────
    // Tennis: set table S1 | S2 | PTS (with Deuce/AD support + real match stats)
    const TennisScore = () => {
      const sets = extra?.sets ?? [];
      const pts  = extra?.currentPoints;
      const st   = extra?.tennisStats;
      const colW = sets.length > 1 ? "w-7" : "w-8";
      const isDeuce = pts?.[0] === "D" && pts?.[1] === "D";
      const hPtColor = pts?.[0] === "AD" ? "text-yellow-400" : isDeuce ? "text-orange-400" : "text-white";
      const aPtColor = pts?.[1] === "AD" ? "text-yellow-400" : isDeuce ? "text-orange-400" : "text-white";
      const lastName = (name: string) => name.split(" ").slice(-1)[0] ?? name;
      return (
        <div className="w-full text-xs font-mono tabular-nums">
          {/* Header */}
          <div className="flex items-center mb-0.5">
            <div className="flex-1" />
            {sets.map((_, i) => (
              <div key={i} className={`${colW} text-center text-zinc-500 text-[10px] font-bold`}>S{i + 1}</div>
            ))}
            {pts && <div className="w-8 text-center text-zinc-500 text-[10px] font-bold">{isDeuce ? "DUE" : "PTS"}</div>}
          </div>
          {/* Home row */}
          <div className="flex items-center">
            <div className="flex-1 font-bold text-white text-xs truncate">{match.home}</div>
            {sets.map(([h], i) => (
              <div key={i} className={`${colW} text-center font-black ${h > (sets[i]?.[1] ?? 0) ? "text-white" : "text-zinc-500"}`}>{h}</div>
            ))}
            {pts && <div className={`w-8 text-center font-black ${hPtColor}`}>{isDeuce ? "D" : pts[0]}</div>}
          </div>
          {/* Away row */}
          <div className="flex items-center">
            <div className="flex-1 font-bold text-white text-xs truncate">{match.away}</div>
            {sets.map(([, a], i) => (
              <div key={i} className={`${colW} text-center font-black ${a > (sets[i]?.[0] ?? 0) ? "text-white" : "text-zinc-500"}`}>{a}</div>
            ))}
            {pts && <div className={`w-8 text-center font-black ${aPtColor}`}>{isDeuce ? "D" : pts[1]}</div>}
          </div>
        </div>
      );
    };

    // Volleyball: table like tennis — S1 | S2 | S3 | current pts
    const VolleyScore = () => {
      const vSets = extra?.vollSets ?? [];
      const pts   = extra?.currentPts;
      const totalCols = vSets.length + (pts ? 1 : 0);
      const colW = totalCols > 3 ? "w-6" : "w-8";
      return (
        <div className="w-full text-xs font-mono tabular-nums">
          <div className="flex items-center mb-0.5">
            <div className="flex-1" />
            {vSets.map((_, i) => (
              <div key={i} className={`${colW} text-center text-zinc-500 text-[10px] font-bold`}>S{i + 1}</div>
            ))}
            {pts && <div className={`${colW} text-center text-yellow-500 text-[10px] font-bold`}>S{vSets.length + 1}</div>}
          </div>
          <div className="flex items-center">
            <div className="flex-1 font-bold text-white text-xs truncate">{match.home}</div>
            {vSets.map(([h, a], i) => (
              <div key={i} className={`${colW} text-center font-black ${h > a ? "text-white" : "text-zinc-500"}`}>{h}</div>
            ))}
            {pts && <div className={`${colW} text-center font-black text-yellow-400`}>{pts[0]}</div>}
          </div>
          <div className="flex items-center">
            <div className="flex-1 font-bold text-white text-xs truncate">{match.away}</div>
            {vSets.map(([h, a], i) => (
              <div key={i} className={`${colW} text-center font-black ${a > h ? "text-white" : "text-zinc-500"}`}>{a}</div>
            ))}
            {pts && <div className={`${colW} text-center font-black text-yellow-400`}>{pts[1]}</div>}
          </div>
        </div>
      );
    };

    // Hockey: period-by-period table (P1 / P2 / P3 / OT) when period data exists
    const HockeyScore = ({ big }: { big?: boolean }) => {
      const periods = extra?.periods ?? [];
      const PERIOD_LABELS = ["P1", "P2", "P3", "OT", "SO"];
      if (periods.length === 0) return <SimpleScore big={big} />;
      return (
        <div className="w-full text-xs font-mono tabular-nums">
          <div className="flex items-center mb-0.5">
            <div className="flex-1" />
            {periods.map((_, i) => (
              <div key={i} className="w-7 text-center text-zinc-500 text-[10px] font-bold">{PERIOD_LABELS[i] ?? `P${i + 1}`}</div>
            ))}
            <div className="w-8 text-center text-zinc-500 text-[10px] font-bold">TOT</div>
          </div>
          <div className="flex items-center">
            <div className="flex-1 font-bold text-white text-xs truncate">{match.home}</div>
            {periods.map(([h, a]: [number, number], i: number) => (
              <div key={i} className={`w-7 text-center font-black ${h > a ? "text-white" : "text-zinc-500"}`}>{h}</div>
            ))}
            <div className="w-8 text-center font-black text-white">{match.homeScore ?? 0}</div>
          </div>
          <div className="flex items-center">
            <div className="flex-1 font-bold text-white text-xs truncate">{match.away}</div>
            {periods.map(([h, a]: [number, number], i: number) => (
              <div key={i} className={`w-7 text-center font-black ${a > h ? "text-white" : "text-zinc-500"}`}>{a}</div>
            ))}
            <div className="w-8 text-center font-black text-white">{match.awayScore ?? 0}</div>
          </div>
        </div>
      );
    };

    // Basketball / Hockey / Football: standard home vs away score
    const SimpleScore = ({ big }: { big?: boolean }) => (
      <div className={`flex items-center gap-2 w-full`}>
        <span className={`font-bold text-white ${big ? "text-base" : "text-sm"} truncate flex-1 text-right`}>{match.home}</span>
        <div className={`${big ? "text-3xl" : "text-xl"} font-black text-white tabular-nums shrink-0 ${big ? "px-2" : "px-1"} text-center`}>
          {match.homeScore ?? 0}<span className={`${big ? "text-white/40 text-xl mx-0.5" : "text-zinc-600 mx-0.5"}`}>-</span>{match.awayScore ?? 0}
        </div>
        <span className={`font-bold text-white ${big ? "text-base" : "text-sm"} truncate flex-1`}>{match.away}</span>
      </div>
    );

    const rivalry = RIVALRY_TAGS[`${match.home}|${match.away}`];
    const motionProps = isNew
      ? { layout: true as const, initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }
      : { layout: true as const };

    const oddsRow = match.hasRealOdds ? (
      <div className="flex gap-2 w-full mt-2.5">
        <SuspensionBanner match={match} />
        {!match.marketSuspension || !Object.values(match.marketSuspension).some(ts => ts > Date.now()) ? (<>
          <OddsButton match={match} selection="home" odd={match.odds.home} market="result" label="Casa" grow />
          {match.odds.draw > 0 && <OddsButton match={match} selection="draw" odd={match.odds.draw} market="result" label="Emp." grow />}
          <OddsButton match={match} selection="away" odd={match.odds.away} market="result" label="Fora" grow />
        </>) : null}
      </div>
    ) : null;

    if (bannerImg) {
      return (
        <motion.div
          {...motionProps}
          className="relative aspect-video rounded-xl border border-zinc-800 hover:border-red-500/40 transition-colors cursor-pointer overflow-hidden"
          onClick={() => setExpandedMatch(match)}
        >
          <img src={bannerImg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-95" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-3">
            <div className="flex items-center gap-2">
              <div className="relative w-5 h-5 flex items-center justify-center leading-none text-sm">
                {flag}
                <span className="absolute -bottom-0.5 -right-1.5 bg-black/60 rounded-full text-[8px] w-3 h-3 flex items-center justify-center">{sportEmoji(match.sport)}</span>
              </div>
              <span className="text-xs text-white/90 font-medium drop-shadow">{match.league}</span>
            </div>
            <div className="flex items-center gap-2">{liveBadge}</div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-4" onClick={e => e.stopPropagation()}>
            {rivalry && <div className="text-[11px] font-black text-red-400 uppercase tracking-widest mb-1 drop-shadow">{rivalry}</div>}
            <div className="mb-3">
              {sport === "tennis"     ? <TennisScore /> :
               sport === "volleyball" ? <VolleyScore /> :
               sport === "hockey"     ? <HockeyScore big /> :
               <SimpleScore big />}
            </div>
            {match.hasRealOdds && (
              <div className="flex gap-2 w-full">
                <SuspensionBanner match={match} />
                {!match.marketSuspension || !Object.values(match.marketSuspension).some(ts => ts > Date.now()) ? (<>
                  <OddsButton match={match} selection="home" odd={match.odds.home} market="result" label="Casa" grow />
                  {match.odds.draw > 0 && <OddsButton match={match} selection="draw" odd={match.odds.draw} market="result" label="Emp." grow />}
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
        <div className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
          {sport === "tennis"     ? <TennisScore /> :
           sport === "volleyball" ? <VolleyScore /> :
           sport === "hockey"     ? <HockeyScore /> :
           <SimpleScore />}
          {oddsRow}
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
          <img src={bannerImg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-95" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-3">
            <div className="flex items-center gap-2">
              <div className="relative w-5 h-5 flex items-center justify-center leading-none text-sm">
                {flag}
                <span className="absolute -bottom-0.5 -right-1.5 bg-black/60 rounded-full text-[8px] w-3 h-3 flex items-center justify-center">{sportEmoji(match.sport)}</span>
              </div>
              <span className="text-xs text-white/90 font-medium drop-shadow">{match.league}</span>
            </div>
            <span className="text-xs text-white/70">{dateStr}{match.time ? ` • ${match.time}` : ""}</span>
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

  const MarketGroup = ({ title, children }: { title: string; children: ReactNode }) => {
    const tab = useContext(MarketTabCtx);
    const collapsible = tab === "todos";
    const [open, setOpen] = useState(true);

    if (!collapsible) {
      return (
        <div className="mb-4 last:mb-0">
          <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 px-0.5">{title}</div>
          <div className="flex gap-2">{children}</div>
        </div>
      );
    }

    return (
      <div className="mb-1.5 last:mb-0 border border-zinc-800 rounded-lg overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2.5 text-left bg-zinc-800/60 hover:bg-zinc-800 active:bg-zinc-700 transition-colors"
          onClick={() => setOpen(o => !o)}
        >
          <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">{title}</span>
          <ChevronDown size={14} className={`text-zinc-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="px-3 py-3">
            <div className="flex flex-wrap gap-2">{children}</div>
          </div>
        )}
      </div>
    );
  };

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
      <MarketTabCtx.Provider value={modalTab}>
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
            {m.totalGoals.over55 > 0 && (
              <MarketGroup title="Total de Gols — 5.5">
                <MarketOddsBtn match={match} sel="o55" odd={m.totalGoals.over55} market="gols" label="Mais de 5.5" />
                <MarketOddsBtn match={match} sel="u55" odd={m.totalGoals.under55} market="gols" label="Menos de 5.5" />
              </MarketGroup>
            )}
            {m.totalGoals.over65 > 0 && (
              <MarketGroup title="Total de Gols — 6.5">
                <MarketOddsBtn match={match} sel="o65" odd={m.totalGoals.over65} market="gols" label="Mais de 6.5" />
                <MarketOddsBtn match={match} sel="u65" odd={m.totalGoals.under65} market="gols" label="Menos de 6.5" />
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
            {/* 1st Set winner — prefer tennisExtra.firstSet if available */}
            {(m as any).tennisExtra?.firstSet?.home > 0 ? (
              <MarketGroup title="Vencedor do 1º Set">
                <MarketOddsBtn match={match} sel="set1-home" odd={(m as any).tennisExtra.firstSet.home} market="sets" label={match.home} />
                <MarketOddsBtn match={match} sel="set1-away" odd={(m as any).tennisExtra.firstSet.away} market="sets" label={match.away} />
              </MarketGroup>
            ) : m.totalGoals.over15 > 0 && (
              <MarketGroup title="Vencedor do 1º Set">
                <MarketOddsBtn match={match} sel="set1-home" odd={m.totalGoals.over15} market="sets" label={match.home} />
                <MarketOddsBtn match={match} sel="set1-away" odd={m.totalGoals.under15} market="sets" label={match.away} />
              </MarketGroup>
            )}
            {/* 2nd Set winner */}
            {(m as any).tennisExtra?.set2?.home > 0 && (
              <MarketGroup title="Vencedor do 2º Set">
                <MarketOddsBtn match={match} sel="set2-home" odd={(m as any).tennisExtra.set2.home} market="sets" label={match.home} />
                <MarketOddsBtn match={match} sel="set2-away" odd={(m as any).tennisExtra.set2.away} market="sets" label={match.away} />
              </MarketGroup>
            )}
            {/* 3rd Set winner */}
            {(m as any).tennisExtra?.set3?.home > 0 && (
              <MarketGroup title="Vencedor do 3º Set (se disputado)">
                <MarketOddsBtn match={match} sel="set3-home" odd={(m as any).tennisExtra.set3.home} market="sets" label={match.home} />
                <MarketOddsBtn match={match} sel="set3-away" odd={(m as any).tennisExtra.set3.away} market="sets" label={match.away} />
              </MarketGroup>
            )}
            {m.totalGoals.over25 > 0 && (
              <MarketGroup title="Total de Sets — O/U 2.5">
                <MarketOddsBtn match={match} sel="osets" odd={m.totalGoals.over25} market="sets" label="Mais de 2.5 sets" />
                <MarketOddsBtn match={match} sel="usets" odd={m.totalGoals.under25} market="sets" label="Menos de 2.5 sets" />
              </MarketGroup>
            )}
            {/* Set handicap -1.5 */}
            {(m as any).tennisExtra?.setHandicap?.home > 0 && (
              <MarketGroup title={`Handicap de Sets — ${match.home} −1.5`}>
                <MarketOddsBtn match={match} sel="sh15-home" odd={(m as any).tennisExtra.setHandicap.home} market="sets" label={`${match.home} −1.5`} />
                <MarketOddsBtn match={match} sel="sh15-away" odd={(m as any).tennisExtra.setHandicap.away} market="sets" label={`${match.away} +1.5`} />
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
        {!isBasketball && !isVolleyball && (modalTab === "handicap" || modalTab === "todos") && m && m.handicap.homeMinusOne > 0 && (
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
            ) : isTennis ? (
              <>
                {(m as any).tennisExtra?.setHandicap?.home > 0 && (
                  <MarketGroup title={`Handicap de Sets — ${match.home} −1.5`}>
                    <MarketOddsBtn match={match} sel="sh15-home2" odd={(m as any).tennisExtra.setHandicap.home} market="handicap" label={`${match.home} −1.5 sets`} />
                    <MarketOddsBtn match={match} sel="sh15-away2" odd={(m as any).tennisExtra.setHandicap.away} market="handicap" label={`${match.away} +1.5 sets`} />
                  </MarketGroup>
                )}
                {(m as any).tennisExtra?.gameHandicap?.home > 0 && (
                  <MarketGroup title={`Handicap de Games — Linha ${(m as any).tennisExtra.gameHandicap.line > 0 ? `−${(m as any).tennisExtra.gameHandicap.line}` : `+${Math.abs((m as any).tennisExtra.gameHandicap.line)}`}`}>
                    <MarketOddsBtn match={match} sel="gh-home2" odd={(m as any).tennisExtra.gameHandicap.home} market="handicap" label={match.home} />
                    <MarketOddsBtn match={match} sel="gh-away2" odd={(m as any).tennisExtra.gameHandicap.away} market="handicap" label={match.away} />
                  </MarketGroup>
                )}
                {!(m as any).tennisExtra && (
                  <MarketGroup title="Handicap de Games">
                    <MarketOddsBtn match={match} sel="hcap-home" odd={m.handicap.homeMinusOne} market="handicap" label={`${match.home} cobre`} />
                    <MarketOddsBtn match={match} sel="hcap-away" odd={m.handicap.awayPlusOne} market="handicap" label={`${match.away} cobre`} />
                  </MarketGroup>
                )}
              </>
            ) : (
              <MarketGroup title="Handicap de Games">
                <MarketOddsBtn match={match} sel="hcap-home" odd={m.handicap.homeMinusOne} market="handicap" label={`${match.home} cobre`} />
                <MarketOddsBtn match={match} sel="hcap-away" odd={m.handicap.awayPlusOne} market="handicap" label={`${match.away} cobre`} />
              </MarketGroup>
            )}
          </div>
        )}
        {!isBasketball && !isVolleyball && modalTab === "handicap" && m && m.handicap.homeMinusOne === 0 && (
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
            {/* Exact set score */}
            {(m as any).volleyballExtra?.exactScore?.s30 > 0 && (
              <>
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-4 mb-2">Placar Exato em Sets</div>
                <div className="grid grid-cols-2 gap-2">
                  <MarketOddsBtn match={match} sel="vs-s30" odd={(m as any).volleyballExtra.exactScore.s30} market="sets" label={`${match.home} 3-0`} />
                  <MarketOddsBtn match={match} sel="vs-s03" odd={(m as any).volleyballExtra.exactScore.s03} market="sets" label={`${match.away} 3-0`} />
                  <MarketOddsBtn match={match} sel="vs-s31" odd={(m as any).volleyballExtra.exactScore.s31} market="sets" label={`${match.home} 3-1`} />
                  <MarketOddsBtn match={match} sel="vs-s13" odd={(m as any).volleyballExtra.exactScore.s13} market="sets" label={`${match.away} 3-1`} />
                  <MarketOddsBtn match={match} sel="vs-s32" odd={(m as any).volleyballExtra.exactScore.s32} market="sets" label={`${match.home} 3-2`} />
                  <MarketOddsBtn match={match} sel="vs-s23" odd={(m as any).volleyballExtra.exactScore.s23} market="sets" label={`${match.away} 3-2`} />
                </div>
              </>
            )}
          </div>
        )}

        {/* ── VOLEIBOL: HANDICAP (SETS) ── */}
        {isVolleyball && (modalTab === "handicap" || modalTab === "todos") && m && (
          <div>
            {/* Prefer setHandicap from volleyballExtra; fallback to totalGoals.over35 */}
            {(m as any).volleyballExtra?.setHandicap?.home > 0 ? (
              <MarketGroup title={`Handicap de Sets — ${match.home} −1.5`}>
                <MarketOddsBtn match={match} sel="hcap-vb-home" odd={(m as any).volleyballExtra.setHandicap.home} market="handicap" label={`${match.home} −1.5 sets`} />
                <MarketOddsBtn match={match} sel="hcap-vb-away" odd={(m as any).volleyballExtra.setHandicap.away} market="handicap" label={`${match.away} +1.5 sets`} />
              </MarketGroup>
            ) : m.totalGoals.over35 > 0 && (
              <MarketGroup title="Handicap de Sets — Casa −1.5">
                <MarketOddsBtn match={match} sel="hcap-vb-home" odd={m.totalGoals.over35} market="handicap" label={`${match.home} −1.5 sets`} />
                <MarketOddsBtn match={match} sel="hcap-vb-away" odd={m.totalGoals.under35} market="handicap" label={`${match.away} +1.5 sets`} />
              </MarketGroup>
            )}
            {/* Handicap de Pontos */}
            {(m as any).volleyballExtra?.handicapPoints?.home > 0 && (
              <MarketGroup title={`Handicap de Pontos — ${(m as any).volleyballExtra.handicapPoints.line > 0 ? `Casa −${(m as any).volleyballExtra.handicapPoints.line}` : `Casa +${Math.abs((m as any).volleyballExtra.handicapPoints.line)}`}`}>
                <MarketOddsBtn match={match} sel="pth2" odd={(m as any).volleyballExtra.handicapPoints.home} market="handicap" label={match.home} />
                <MarketOddsBtn match={match} sel="pta2" odd={(m as any).volleyballExtra.handicapPoints.away} market="handicap" label={match.away} />
              </MarketGroup>
            )}
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
        {isVolleyball && (modalTab === "pontos" || modalTab === "todos") && m && (
          <div>
            {/* Multiple points O/U lines from volleyballExtra */}
            {(m as any).volleyballExtra?.pointsLines?.length > 0 ? (
              ((m as any).volleyballExtra as any).pointsLines.map((pl: { line: number; over: number; under: number }) => (
                <MarketGroup key={`ptl-${pl.line}`} title={`Total de Pontos — O/U ${pl.line}`}>
                  <MarketOddsBtn match={match} sel={`pt-o-${pl.line}`} odd={pl.over} market="pontos" label={`Mais de ${pl.line} pts`} />
                  <MarketOddsBtn match={match} sel={`pt-u-${pl.line}`} odd={pl.under} market="pontos" label={`Menos de ${pl.line} pts`} />
                </MarketGroup>
              ))
            ) : m.bothTeamsScore.yes > 0 && (
              <MarketGroup title={`Total de Pontos — O/U ${m._total ?? "—"}`}>
                <MarketOddsBtn match={match} sel="opts" odd={m.bothTeamsScore.yes} market="pontos" label={`Mais de ${m._total ?? "—"} pts`} />
                <MarketOddsBtn match={match} sel="upts" odd={m.bothTeamsScore.no} market="pontos" label={`Menos de ${m._total ?? "—"} pts`} />
              </MarketGroup>
            )}
            {(m as any).volleyballExtra?.handicapPoints?.home > 0 && (
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
            {/* Multiple total games lines */}
            {((m as any).tennisExtra as any).totalGamesLines?.length > 0 ? (
              ((m as any).tennisExtra as any).totalGamesLines.map((gl: { line: number; over: number; under: number }) => (
                <MarketGroup key={`tgl-${gl.line}`} title={`Total de Games — O/U ${gl.line}`}>
                  <MarketOddsBtn match={match} sel={`tg-o-${gl.line}`} odd={gl.over} market="jogos" label={`Mais de ${gl.line}`} />
                  <MarketOddsBtn match={match} sel={`tg-u-${gl.line}`} odd={gl.under} market="jogos" label={`Menos de ${gl.line}`} />
                </MarketGroup>
              ))
            ) : ((m as any).tennisExtra as any).totalGames?.over > 0 && (
              <MarketGroup title={`Total de Games — O/U ${((m as any).tennisExtra as any).totalGames.line}`}>
                <MarketOddsBtn match={match} sel="tg-o" odd={((m as any).tennisExtra as any).totalGames.over} market="jogos" label={`Mais de ${((m as any).tennisExtra as any).totalGames.line}`} />
                <MarketOddsBtn match={match} sel="tg-u" odd={((m as any).tennisExtra as any).totalGames.under} market="jogos" label={`Menos de ${((m as any).tennisExtra as any).totalGames.line}`} />
              </MarketGroup>
            )}
            {/* 1st Set total games O/U */}
            {((m as any).tennisExtra as any).set1Games?.over > 0 && (
              <MarketGroup title={`Games do 1º Set — O/U ${((m as any).tennisExtra as any).set1Games.line}`}>
                <MarketOddsBtn match={match} sel="s1g-o" odd={((m as any).tennisExtra as any).set1Games.over} market="jogos" label={`Mais de ${((m as any).tennisExtra as any).set1Games.line} games`} />
                <MarketOddsBtn match={match} sel="s1g-u" odd={((m as any).tennisExtra as any).set1Games.under} market="jogos" label={`Menos de ${((m as any).tennisExtra as any).set1Games.line} games`} />
              </MarketGroup>
            )}
            {/* Game handicap */}
            {((m as any).tennisExtra as any).gameHandicap?.home > 0 && (
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
      </MarketTabCtx.Provider>
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
                    <div className="flex border-t border-zinc-800 overflow-x-auto no-scrollbar">
                      {expandedMatch.sport === "tennis" ? (
                        <>
                          {(["stats", "yesterday", "ranking"] as const).map(tab => (
                            <button
                              key={tab}
                              onClick={() => setMatchViewTab(tab)}
                              className={`flex-1 py-2 text-xs font-bold transition-colors whitespace-nowrap px-2 ${matchViewTab === tab ? "text-blue-400 border-b-2 border-blue-500" : "text-zinc-500 hover:text-white"}`}
                            >
                              {tab === "stats" ? "Estatísticas" : tab === "yesterday" ? "Resultado Ontem" : "Ranking"}
                            </button>
                          ))}
                          {expandedMatch.isLive && (
                            <button
                              onClick={() => setMatchViewTab("live")}
                              className={`flex-1 py-2 text-xs font-bold transition-colors whitespace-nowrap px-2 ${matchViewTab === "live" ? "text-red-400 border-b-2 border-red-500" : "text-zinc-500 hover:text-white"}`}
                            >
                              ⚡ Ao Vivo
                            </button>
                          )}
                        </>
                      ) : expandedMatch.sport === "hockey" ? (
                        <>
                          {(expandedMatch.isLive
                            ? (["stats", "yesterday", "live"] as const)
                            : (["stats", "yesterday"] as const)
                          ).map(tab => (
                            <button
                              key={tab}
                              onClick={() => setMatchViewTab(tab)}
                              className={`flex-1 py-2 text-xs font-bold transition-colors whitespace-nowrap px-2 ${matchViewTab === tab ? (tab === "live" ? "text-red-400 border-b-2 border-red-500" : "text-blue-400 border-b-2 border-blue-500") : "text-zinc-500 hover:text-white"}`}
                            >
                              {tab === "stats" ? "Estatísticas" : tab === "yesterday" ? "Resultado Ontem" : "⚡ Ao Vivo"}
                            </button>
                          ))}
                        </>
                      ) : (
                        (expandedMatch.isLive
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
                        ))
                      )}
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

                {/* Yesterday results panel (hockey) */}
                {matchViewTab === "yesterday" && expandedMatch.sport === "hockey" && (() => {
                  const allResults = [
                    ...(hockeySchedule?.recentMatches ?? []),
                    ...hockeyResults.map(r => ({ ...r, teamStats: undefined as undefined })),
                  ];
                  // deduplicate by home+away
                  const seen = new Set<string>();
                  const deduped = allResults.filter(r => {
                    const k = `${r.home}|${r.away}`;
                    if (seen.has(k)) return false;
                    seen.add(k); return true;
                  });
                  const PERIOD_LABELS = ["P1", "P2", "P3", "OT", "SO"];
                  const StatBar = ({ label, home, away, pct }: { label: string; home: string | number; away: string | number; pct?: boolean }) => {
                    const h = parseFloat(String(home)) || 0;
                    const a = parseFloat(String(away)) || 0;
                    const total = h + a || 1;
                    const hPct = Math.round((h / total) * 100);
                    return (
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[9px] font-bold text-zinc-400">
                          <span>{pct ? `${h}%` : h}</span>
                          <span className="text-zinc-600 font-normal">{label}</span>
                          <span>{pct ? `${a}%` : a}</span>
                        </div>
                        <div className="flex h-1 rounded-full overflow-hidden bg-zinc-800">
                          <div className="bg-blue-500 rounded-full" style={{ width: `${hPct}%` }} />
                          <div className="flex-1 bg-red-500/60 rounded-full" />
                        </div>
                      </div>
                    );
                  };
                  return (
                    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 mb-2 animate-in fade-in duration-200">
                      <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">🏒 Resultados Recentes — NHL</div>
                      {deduped.length === 0 ? (
                        <div className="text-center text-zinc-500 py-6 text-sm">Sem resultados disponíveis.</div>
                      ) : (
                        <div className="space-y-3">
                          {deduped.map(r => (
                            <div key={r.id} className="bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2.5 space-y-2">
                              {/* Score row */}
                              <div className="flex items-center gap-2 font-mono tabular-nums">
                                <div className="flex-1 min-w-0 space-y-0.5">
                                  {[{ name: r.home, won: r.homeWon, score: r.homeScore }, { name: r.away, won: !r.homeWon, score: r.awayScore }].map((team, ti) => (
                                    <div key={ti} className="flex items-center gap-1.5">
                                      <span className={`w-3 h-3 rounded-full flex items-center justify-center shrink-0 ${team.won ? "bg-green-600/20" : ""}`}>
                                        {team.won && <span className="text-[8px] text-green-400 font-black">✓</span>}
                                      </span>
                                      <span className={`text-xs font-bold truncate ${team.won ? "text-white" : "text-zinc-500"}`}>{team.name}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex items-stretch gap-0.5 shrink-0">
                                  {r.periods.map(([h, a]: [number, number], i: number) => (
                                    <div key={i} className="flex flex-col items-center min-w-[1.25rem]">
                                      <div className="text-[8px] text-zinc-600 font-bold leading-tight mb-0.5">{PERIOD_LABELS[i] ?? `P${i+1}`}</div>
                                      <div className={`text-[11px] font-black leading-tight ${h > a ? "text-white" : "text-zinc-600"}`}>{h}</div>
                                      <div className={`text-[11px] font-black leading-tight ${a > h ? "text-zinc-400" : "text-zinc-600"}`}>{a}</div>
                                    </div>
                                  ))}
                                  <div className="flex flex-col items-center min-w-[1.5rem] border-l border-zinc-700 pl-1">
                                    <div className="text-[8px] text-zinc-500 font-black leading-tight mb-0.5">TOT</div>
                                    <div className={`text-[11px] font-black leading-tight ${r.homeWon ? "text-white" : "text-zinc-500"}`}>{r.homeScore}</div>
                                    <div className={`text-[11px] font-black leading-tight ${!r.homeWon ? "text-zinc-400" : "text-zinc-500"}`}>{r.awayScore}</div>
                                  </div>
                                </div>
                              </div>
                              {/* Team stats if available */}
                              {r.teamStats && (
                                <div className="border-t border-zinc-800 pt-2 space-y-1.5">
                                  <div className="flex justify-between text-[9px] font-black text-zinc-600 uppercase tracking-wide mb-1">
                                    <span>{r.home.split(" ").slice(-1)[0]}</span>
                                    <span>Estatísticas</span>
                                    <span>{r.away.split(" ").slice(-1)[0]}</span>
                                  </div>
                                  <StatBar label="Remates" home={r.teamStats.home.shotsOnGoal} away={r.teamStats.away.shotsOnGoal} />
                                  <StatBar label="Saves %" home={r.teamStats.home.savesPct} away={r.teamStats.away.savesPct} pct />
                                  <StatBar label="PP Goals" home={r.teamStats.home.ppGoals} away={r.teamStats.away.ppGoals} />
                                  <StatBar label="PP %" home={r.teamStats.home.ppPct} away={r.teamStats.away.ppPct} pct />
                                  <StatBar label="Faceoffs %" home={r.teamStats.home.faceoffPct} away={r.teamStats.away.faceoffPct} pct />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Yesterday results panel (tennis) */}
                {matchViewTab === "yesterday" && expandedMatch.sport !== "hockey" && (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 mb-2 animate-in fade-in duration-200">
                    <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">🎾 Resultados de Ontem</div>
                    {recentResults.length === 0 ? (
                      <div className="text-center text-zinc-500 py-6 text-sm">Sem resultados disponíveis.</div>
                    ) : (
                      <div className="space-y-1.5">
                        {recentResults.map(r => {
                          const winner = r.homeWon ? r.home : r.away;
                          const loser  = r.homeWon ? r.away : r.home;
                          const wSets  = r.homeWon ? r.sets.map(([h]: [number,number]) => h)   : r.sets.map(([,a]: [number,number]) => a);
                          const lSets  = r.homeWon ? r.sets.map(([,a]: [number,number]) => a)  : r.sets.map(([h]: [number,number]) => h);
                          return (
                            <div key={r.id} className="bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-3 h-3 rounded-full bg-green-600/20 flex items-center justify-center shrink-0">
                                    <span className="text-[8px] text-green-400 font-black">✓</span>
                                  </span>
                                  <span className="text-xs font-bold text-white truncate">{winner}</span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="w-3 h-3 shrink-0" />
                                  <span className="text-xs text-zinc-500 truncate">{loser}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 font-mono tabular-nums shrink-0">
                                {wSets.map((ws: number, i: number) => (
                                  <div key={i} className="text-center w-4">
                                    <div className={`text-[11px] font-black leading-tight ${ws > lSets[i]! ? "text-white" : "text-zinc-600"}`}>{ws}</div>
                                    <div className={`text-[11px] font-black leading-tight ${lSets[i]! > ws ? "text-zinc-400" : "text-zinc-600"}`}>{lSets[i]}</div>
                                  </div>
                                ))}
                              </div>
                              {r.status === "Retired" && <span className="text-[9px] text-yellow-500/80 font-bold border border-yellow-700/40 rounded px-1 py-0.5 shrink-0">RET</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Ranking panel (tennis) — reuses rankingsTour state */}
                {matchViewTab === "ranking" && (() => {
                  const FLAG: Record<string, string> = {
                    "Spain":"🇪🇸","Italy":"🇮🇹","Serbia":"🇷🇸","Russia":"🇷🇺","Germany":"🇩🇪",
                    "Norway":"🇳🇴","Greece":"🇬🇷","France":"🇫🇷","United States":"🇺🇸","USA":"🇺🇸",
                    "Australia":"🇦🇺","Canada":"🇨🇦","United Kingdom":"🇬🇧","Great Britain":"🇬🇧",
                    "Argentina":"🇦🇷","Denmark":"🇩🇰","Poland":"🇵🇱","Bulgaria":"🇧🇬",
                    "Czech Republic":"🇨🇿","Slovakia":"🇸🇰","Croatia":"🇭🇷","Hungary":"🇭🇺",
                    "Belgium":"🇧🇪","Netherlands":"🇳🇱","Switzerland":"🇨🇭","Austria":"🇦🇹",
                    "Portugal":"🇵🇹","Japan":"🇯🇵","China":"🇨🇳","Kazakhstan":"🇰🇿",
                    "Ukraine":"🇺🇦","Belarus":"🇧🇾","Romania":"🇷🇴","Brazil":"🇧🇷",
                    "Chile":"🇨🇱","Colombia":"🇨🇴","Mexico":"🇲🇽","Taiwan":"🇹🇼",
                    "South Korea":"🇰🇷","Tunisia":"🇹🇳","Latvia":"🇱🇻","Estonia":"🇪🇪",
                    "Finland":"🇫🇮","Sweden":"🇸🇪","Turkey":"🇹🇷","Israel":"🇮🇱",
                    "Philippines":"🇵🇭","Georgia":"🇬🇪","Albania":"🇦🇱",
                  };
                  const movIcon = (m: string) =>
                    m === "up" ? <span className="text-emerald-500 text-[9px]">↑</span>
                    : m === "down" ? <span className="text-red-500 text-[9px]">↓</span>
                    : <span className="text-zinc-700 text-[9px]">−</span>;
                  const list = rankingsTour === "atp" ? tennisStandings?.atp : tennisStandings?.wta;
                  return (
                    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 mb-2 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Ranking</div>
                        <div className="flex rounded overflow-hidden border border-zinc-700">
                          {(["atp","wta"] as const).map(t => (
                            <button key={t} onClick={() => setRankingsTour(t)}
                              className={`text-[9px] font-black px-2 py-0.5 transition-colors ${rankingsTour === t ? (t === "wta" ? "bg-pink-900/60 text-pink-300" : "bg-zinc-700 text-white") : "text-zinc-600 hover:text-zinc-400"}`}
                            >
                              {t.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                      {!list ? (
                        <div className="text-center text-zinc-500 py-6 text-sm">Ranking indisponível.</div>
                      ) : (
                        <div className="rounded-lg border border-zinc-800 overflow-hidden">
                          {list.slice(0, 20).map((p, i) => (
                            <div key={p.id} className={`flex items-center gap-2 px-3 py-1.5 ${i < list.slice(0,20).length-1 ? "border-b border-zinc-800/60" : ""}`}>
                              <span className={`text-[11px] font-black tabular-nums w-5 text-right shrink-0 ${i < 3 ? "text-amber-400" : "text-zinc-600"}`}>{p.rank}</span>
                              <span className="w-3 shrink-0 text-center">{movIcon(p.movement)}</span>
                              <span className="text-sm shrink-0">{FLAG[p.country] ?? "🏴"}</span>
                              <span className={`text-[11px] font-semibold flex-1 truncate ${i < 3 ? "text-white" : "text-zinc-300"}`}>{p.name}</span>
                              <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">{Number(p.points).toLocaleString("pt-PT")}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Live momentum/pressure chart + tennis stats */}
                {matchViewTab === "live" && expandedMatch.isLive && (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 mb-2 animate-in fade-in duration-200">
                    <MomentumChart match={expandedMatch} />
                    {/* Tennis live match stats below chart */}
                    {expandedMatch.sport === "tennis" && expandedMatch._liveExtra?.tennisStats && (() => {
                      const st = expandedMatch._liveExtra.tennisStats;
                      const lastName = (name: string) => name.split(" ").slice(-1)[0] ?? name;
                      return (
                        <div className="mt-4 pt-4 border-t border-zinc-700/60">
                          <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">Estatísticas do Jogo</div>
                          <div className="grid grid-cols-5 text-[9px] font-bold text-zinc-500 mb-1">
                            <div />
                            <div className="text-center">ACES</div>
                            <div className="text-center">DF</div>
                            <div className="text-center">1ªSRV</div>
                            <div className="text-center">WIN</div>
                          </div>
                          {[0, 1].map(idx => {
                            const s = st[idx]!;
                            const name = idx === 0 ? expandedMatch.home : expandedMatch.away;
                            return (
                              <div key={idx} className={`grid grid-cols-5 text-[10px] py-1.5 ${idx === 0 ? "border-b border-zinc-800" : ""}`}>
                                <div className="text-zinc-300 truncate font-bold">{lastName(name)}</div>
                                <div className="text-center text-white font-black">{s.aces}</div>
                                <div className="text-center text-zinc-400">{s.doubleFaults}</div>
                                <div className="text-center text-zinc-300">{s.firstServePct}</div>
                                <div className="text-center text-zinc-300">{s.winners}</div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                    {/* Hockey period scores + goal events below chart */}
                    {expandedMatch.sport === "hockey" && (() => {
                      const periods = expandedMatch._liveExtra?.periods ?? [];
                      const goalEvents = expandedMatch.events?.filter(e => e.type === "goal") ?? [];
                      const penEvents  = expandedMatch.events?.filter(e => e.type === "penalty") ?? [];
                      const PERIOD_LABELS = ["1º Período", "2º Período", "3º Período", "Overtime", "Shootout"];
                      if (periods.length === 0 && goalEvents.length === 0) return null;
                      return (
                        <div className="mt-4 pt-4 border-t border-zinc-700/60 space-y-4">
                          {periods.length > 0 && (
                            <div>
                              <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-2">Placar por Período</div>
                              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                                <div className="grid text-[9px] font-bold text-zinc-500 px-3 py-1.5 border-b border-zinc-800" style={{ gridTemplateColumns: `1fr repeat(${periods.length + 1}, 2rem)` }}>
                                  <div />
                                  {periods.map((_: [number, number], i: number) => <div key={i} className="text-center">{i < 3 ? `P${i+1}` : i === 3 ? "OT" : "SO"}</div>)}
                                  <div className="text-center">TOT</div>
                                </div>
                                {[0, 1].map(idx => {
                                  const name = idx === 0 ? expandedMatch.home : expandedMatch.away;
                                  const total = idx === 0 ? expandedMatch.homeScore : expandedMatch.awayScore;
                                  return (
                                    <div key={idx} className={`grid text-[10px] px-3 py-1.5 ${idx === 0 ? "border-b border-zinc-800/60" : ""}`} style={{ gridTemplateColumns: `1fr repeat(${periods.length + 1}, 2rem)` }}>
                                      <div className="text-zinc-300 font-bold truncate">{name.split(" ").slice(-1)[0]}</div>
                                      {periods.map(([h, a]: [number, number], i: number) => (
                                        <div key={i} className={`text-center font-black tabular-nums ${(idx === 0 ? h > a : a > h) ? "text-white" : "text-zinc-600"}`}>{idx === 0 ? h : a}</div>
                                      ))}
                                      <div className="text-center font-black text-white tabular-nums">{total ?? 0}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {goalEvents.length > 0 && (
                            <div>
                              <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-2">Golos</div>
                              <div className="space-y-1">
                                {goalEvents.map((ev, i) => (
                                  <div key={i} className="flex items-center gap-2 text-[11px]">
                                    <span className="text-zinc-500 tabular-nums w-5 text-right shrink-0">{ev.minute}'</span>
                                    <span className="text-blue-400 text-[9px] font-black shrink-0">🏒</span>
                                    <span className="font-bold text-white truncate flex-1">{ev.player}</span>
                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${ev.team === "home" ? "bg-blue-900/40 text-blue-400" : "bg-red-900/40 text-red-400"}`}>
                                      {ev.team === "home" ? expandedMatch.home.split(" ").slice(-1)[0] : expandedMatch.away.split(" ").slice(-1)[0]}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {penEvents.length > 0 && (
                            <div>
                              <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Penalidades</div>
                              <div className="space-y-1">
                                {penEvents.map((ev, i) => (
                                  <div key={i} className="flex items-center gap-2 text-[11px]">
                                    <span className="text-zinc-500 tabular-nums w-5 text-right shrink-0">{ev.minute}'</span>
                                    <span className="text-yellow-500 text-[9px] shrink-0">⚠️</span>
                                    <span className="font-semibold text-zinc-300 truncate flex-1">{ev.player}</span>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${ev.team === "home" ? "bg-zinc-800 text-zinc-400" : "bg-zinc-800 text-zinc-400"}`}>
                                      {ev.team === "home" ? expandedMatch.home.split(" ").slice(-1)[0] : expandedMatch.away.split(" ").slice(-1)[0]}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Volleyball live stats below chart */}
                    {expandedMatch.sport === "volleyball" && expandedMatch._liveExtra?.vollSets && expandedMatch._liveExtra.vollSets.length > 0 && (() => {
                      const sets = expandedMatch._liveExtra.vollSets;
                      const pts = expandedMatch._liveExtra.currentPts;
                      const homeWins = sets.filter(([h, a]) => h > a).length;
                      const awayWins = sets.filter(([h, a]) => a > h).length;
                      return (
                        <div className="mt-4 pt-4 border-t border-zinc-700/60">
                          <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">Placar por Set</div>
                          <div className="grid grid-cols-[1fr_repeat(5,2rem)] gap-x-1 text-[9px] font-bold text-zinc-500 mb-1">
                            <div />
                            {sets.map((_, i) => <div key={i} className="text-center">S{i+1}</div>)}
                            {pts && <div className="text-center text-yellow-500">S{sets.length+1}</div>}
                          </div>
                          {[0, 1].map(idx => {
                            const name = idx === 0 ? expandedMatch.home : expandedMatch.away;
                            return (
                              <div key={idx} className={`grid grid-cols-[1fr_repeat(5,2rem)] gap-x-1 text-[10px] py-1.5 ${idx === 0 ? "border-b border-zinc-800" : ""}`}>
                                <div className="text-zinc-300 font-bold truncate">{name.split(" ").slice(-1)[0]}</div>
                                {sets.map(([h, a], i) => (
                                  <div key={i} className={`text-center font-black tabular-nums ${(idx === 0 ? h > a : a > h) ? "text-white" : "text-zinc-600"}`}>
                                    {idx === 0 ? h : a}
                                  </div>
                                ))}
                                {pts && <div className="text-center font-black text-yellow-400 tabular-nums">{pts[idx]}</div>}
                              </div>
                            );
                          })}
                          <div className="mt-2 flex gap-4 text-[10px]">
                            <span className="text-zinc-500">Sets: <span className="text-white font-black">{homeWins}–{awayWins}</span></span>
                            {pts && <span className="text-zinc-500">Em jogo: <span className="text-yellow-400 font-black">Set {sets.length+1}</span></span>}
                          </div>
                        </div>
                      );
                    })()}
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
              // Convert real tennis odds to MatchCard-compatible Match objects (with set1Odds in markets)
              const _emptyMkt = (): AdvancedMarkets => ({
                doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
                bothTeamsScore: { yes: 0, no: 0 },
                totalGoals: { over05: 0, under05: 0, over15: 0, under15: 0, over25: 0, under25: 0, over35: 0, under35: 0, over45: 0, under45: 0, over55: 0, under55: 0, over65: 0, under65: 0 },
                handicap: { homeMinusOne: 0, awayPlusOne: 0, homeMinusOneHalf: 0, awayPlusOneHalf: 0 },
                halfTime: { home: 0, draw: 0, away: 0 },
                firstGoal: { home: 0, noGoal: 0, away: 0 },
              });

              const tennisOddsAsMatches: Match[] = (!selectedLeague && (selectedSport === "tennis" || selectedSport === "all"))
                ? tennisOddsMatches.map(o => {
                    const mkt = _emptyMkt();
                    if (o.set1Odds) {
                      mkt.totalGoals.over15 = o.set1Odds[0];
                      mkt.totalGoals.under15 = o.set1Odds[1];
                    }
                    return {
                      id: `tennis-odds-${o.matchId}`,
                      home: o.players[0].name,
                      away: o.players[1].name,
                      league: o.tournamentName,
                      sport: "tennis",
                      time: o.time,
                      date: o.date,
                      hasRealOdds: true,
                      odds: { home: o.matchOdds[0], draw: 0, away: o.matchOdds[1] },
                      markets: mkt,
                    } as Match;
                  })
                : [];

              // Convert real volleyball odds to MatchCard-compatible Match objects (O/U 3.5 sets in markets)
              const volleyOddsAsMatches: Match[] = (!selectedLeague && (selectedSport === "volleyball" || selectedSport === "all"))
                ? volleyOddsMatches.map(o => {
                    const mkt = _emptyMkt();
                    if (o.overUnder) {
                      mkt.totalGoals.over25 = o.overUnder.over;
                      mkt.totalGoals.under25 = o.overUnder.under;
                      (mkt as any)._total = o.overUnder.line;
                    }
                    return {
                      id: `volley-odds-${o.matchId}`,
                      home: o.homeTeam.name,
                      away: o.awayTeam.name,
                      league: o.league,
                      sport: "volleyball",
                      time: o.time,
                      date: o.date,
                      hasRealOdds: true,
                      odds: { home: o.homeOdds, draw: 0, away: o.awayOdds },
                      markets: mkt,
                    } as Match;
                  })
                : [];

              // All upcoming: tennis odds + volleyball odds + generic (deduped)
              const allUpcoming = selectedLeague
                ? upcomingMatches.filter(m => m.league === selectedLeague)
                : [
                    ...tennisOddsAsMatches,
                    ...volleyOddsAsMatches,
                    ...upcomingMatches.filter(m =>
                      !tennisOddsAsMatches.some(t => t.home === m.home && t.away === m.away) &&
                      !volleyOddsAsMatches.some(v => v.home === m.home && v.away === m.away)
                    ),
                  ];

              const filteredUpcoming = (selectedSport === "all")
                ? allUpcoming
                : allUpcoming.filter(m => (m.sport ?? "football") === selectedSport);

              // Sport grouping for display
              const SPORT_GROUPS = [
                { key: "football",   emoji: "⚽", label: "Futebol" },
                { key: "tennis",     emoji: "🎾", label: "Ténis" },
                { key: "basketball", emoji: "🏀", label: "Basquete" },
                { key: "hockey",     emoji: "🏒", label: "Hóquei" },
                { key: "volleyball", emoji: "🏐", label: "Voleibol" },
              ] as const;
              const sportGroups = SPORT_GROUPS
                .map(g => ({ ...g, matches: filteredUpcoming.filter(m => (m.sport ?? "football") === g.key) }))
                .filter(g => g.matches.length > 0);

              // Derive tournament display label from raw API name
              const tournamentLabel = (raw: string) =>
                raw.replace(/^(Atp|Wta)\s*-\s*Singles:\s*/i, "").replace(/\s*\([^)]*\)/g, "").trim();

              return (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {!selectedLeague && <PopularBanners />}

                  {/* ─── Torneios em Curso (oculto) ─────────────────────────── */}
                  {false && (selectedSport === "all" || selectedSport === "tennis") && activeTournaments.length > 0 && !selectedLeague && (() => {
                    const surfaceColor = (s: string) => {
                      const sl = s.toLowerCase();
                      if (sl.includes("clay"))  return { bar: "bg-orange-500",   text: "text-orange-400",  bg: "bg-orange-500/10",  label: "Argila" };
                      if (sl.includes("grass")) return { bar: "bg-green-500",    text: "text-green-400",   bg: "bg-green-500/10",   label: "Relva" };
                      if (sl.includes("indoor"))return { bar: "bg-violet-500",   text: "text-violet-400",  bg: "bg-violet-500/10",  label: "Indoor" };
                      return                           { bar: "bg-sky-500",       text: "text-sky-400",     bg: "bg-sky-500/10",     label: "Duro" };
                    };
                    const categoryStyle = (cat: string) => {
                      const c = cat.toUpperCase();
                      if (c.includes("GRAND SLAM"))          return "bg-purple-600/20 text-purple-300 border-purple-600/30";
                      if (c.includes("1000") || c.includes("1500")) return "bg-amber-600/20 text-amber-300 border-amber-600/30";
                      if (c.includes("500"))                 return "bg-blue-600/20 text-blue-300 border-blue-600/30";
                      return                                        "bg-zinc-700/40 text-zinc-400 border-zinc-600/30";
                    };
                    const formatDate = (d: string) => {
                      const [dd, mm] = d.split(".");
                      const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
                      return `${dd} ${months[parseInt(mm ?? "1") - 1] ?? ""}`;
                    };
                    const formatPrize = (p: string) => {
                      if (!p || p === "$0" || p === "€0") return null;
                      return p.replace(/,\d{3},\d{3}$/, "M").replace(/,\d{3}$/, "k");
                    };
                    return (
                      <div className="mb-5">
                        <div className="flex items-center gap-2 mb-2.5">
                          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Torneios em Curso</span>
                        </div>
                        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                          {activeTournaments.map(t => {
                            const sc = surfaceColor(t.surface);
                            const prize = formatPrize(t.prize_money);
                            const isExpanded = expandedTournamentId === t.id;
                            return (
                              <button
                                key={`${t.tour}-${t.id}`}
                                onClick={() => {
                                  if (isExpanded) {
                                    setExpandedTournamentId(null);
                                    setTournamentDetail(null);
                                  } else {
                                    setExpandedTournamentId(t.id);
                                    setTournamentDetail(null);
                                    setTournamentDetailLoading(true);
                                    fetch(`/api/matches/tournaments/${t.id}`)
                                      .then(r => r.ok ? r.json() : null)
                                      .then(d => { if (d) setTournamentDetail(d); })
                                      .catch(() => {})
                                      .finally(() => setTournamentDetailLoading(false));
                                  }
                                }}
                                className={`shrink-0 rounded-xl border overflow-hidden w-44 text-left transition-all duration-150 ${isExpanded ? `border-${sc.bar.replace("bg-","")}/60 ring-1 ring-${sc.bar.replace("bg-","")}/30` : "border-zinc-800 hover:border-zinc-600"} ${sc.bg}`}
                              >
                                {/* Surface bar */}
                                <div className={`h-0.5 w-full ${sc.bar}`} />
                                <div className="p-2.5">
                                  {/* Tour + Category row */}
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <span className={`text-[9px] font-black uppercase tracking-wide px-1 py-0.5 rounded border ${t.tour === "atp" ? "bg-zinc-800 text-zinc-300 border-zinc-700" : "bg-zinc-800 text-pink-300 border-pink-800/40"}`}>
                                      {t.tour.toUpperCase()}
                                    </span>
                                    <span className={`text-[9px] font-black uppercase tracking-wide px-1 py-0.5 rounded border ${categoryStyle(t.category)}`}>
                                      {t.category.replace(/^(ATP|WTA)\s+/i, "")}
                                    </span>
                                  </div>
                                  {/* Name */}
                                  <div className="text-xs font-bold text-white leading-snug line-clamp-2 mb-1" title={t.name}>
                                    {t.name}
                                  </div>
                                  {/* Location */}
                                  <div className="text-[10px] text-zinc-500 truncate">{t.location.split(",")[0]}</div>
                                  {/* Dates + surface */}
                                  <div className="flex items-center justify-between mt-1.5">
                                    <span className="text-[9px] text-zinc-600">{formatDate(t.date_start)} → {formatDate(t.date_end)}</span>
                                    <span className={`text-[9px] font-bold ${sc.text}`}>{sc.label}</span>
                                  </div>
                                  {/* Prize */}
                                  {prize && (
                                    <div className="text-[9px] text-zinc-600 mt-0.5">{prize}</div>
                                  )}
                                  {/* Expand indicator */}
                                  <div className={`mt-1.5 text-[9px] font-semibold ${isExpanded ? sc.text : "text-zinc-600"}`}>
                                    {isExpanded ? "▲ Fechar" : "▼ Ver quadro"}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* ── Expanded tournament panel ── */}
                        {expandedTournamentId && (() => {
                          const expandedT = activeTournaments.find(t => t.id === expandedTournamentId);
                          const sc = expandedT ? surfaceColor(expandedT!.surface) : { bar: "bg-zinc-500", text: "text-zinc-400", bg: "bg-zinc-800/30", label: "" };
                          const ROUND_PT: Record<string, string> = {
                            "1/64-finals": "1ª Fase", "1/32-finals": "2ª Fase",
                            "1/16-finals": "3ª Fase", "1/8-finals": "Quartos de Final",
                            "quarter-finals": "Quartos de Final", "semi-finals": "Meias-Finais", "final": "Final",
                          };
                          const todayStr = (() => {
                            const n = new Date();
                            const dd = String(n.getDate()).padStart(2,"0");
                            const mm = String(n.getMonth()+1).padStart(2,"0");
                            const yy = n.getFullYear();
                            return `${dd}.${mm}.${yy}`;
                          })();
                          const tomorrowStr = (() => {
                            const n = new Date(); n.setDate(n.getDate()+1);
                            const dd = String(n.getDate()).padStart(2,"0");
                            const mm = String(n.getMonth()+1).padStart(2,"0");
                            const yy = n.getFullYear();
                            return `${dd}.${mm}.${yy}`;
                          })();

                          const upcoming = tournamentDetail?.matches.filter(m =>
                            m.status === "Not Started" && (m.date === todayStr || m.date === tomorrowStr)
                          ) ?? [];
                          const finished = tournamentDetail?.matches.filter(m =>
                            m.status === "Finished" || m.status === "Retired" || m.status === "Walk Over"
                          ).slice().reverse() ?? [];

                          const StatusBadge = ({ status }: { status: string }) => {
                            if (status === "Retired") return <span className="text-[8px] font-black bg-red-900/40 text-red-400 border border-red-800/30 rounded px-1">RET</span>;
                            if (status === "Walk Over") return <span className="text-[8px] font-black bg-zinc-800 text-zinc-500 border border-zinc-700 rounded px-1">W/O</span>;
                            return null;
                          };

                          const ScoreSet = ({ p0, p1, set }: { p0: TournamentMatch["players"][0]; p1: TournamentMatch["players"][0]; set: "s1"|"s2"|"s3"|"s4"|"s5" }) => {
                            if (!p0[set] && !p1[set]) return null;
                            return (
                              <span className="inline-flex flex-col items-center min-w-[12px]">
                                <span className={`text-[10px] leading-none font-bold ${p0.winner ? "text-white" : "text-zinc-500"}`}>{p0[set]}</span>
                                <span className={`text-[10px] leading-none font-bold ${p1.winner ? "text-white" : "text-zinc-500"}`}>{p1[set]}</span>
                              </span>
                            );
                          };

                          // Build surname→rank map from standings (for the expanded tour)
                          const surnameToRank = (() => {
                            const map = new Map<string, string>();
                            const list = expandedT?.tour === "wta" ? tennisStandings?.wta : tennisStandings?.atp;
                            list?.forEach(p => {
                              const parts = p.name.split(" ");
                              if (parts.length > 1) map.set(parts.slice(1).join(" ").toLowerCase(), p.rank);
                            });
                            return map;
                          })();
                          const playerRank = (shortName: string) => {
                            const surname = shortName.replace(/^[A-Z]\.\s*/, "").trim().toLowerCase();
                            return surnameToRank.get(surname) ?? null;
                          };

                          // Build date+surname-pair → TennisOddsEntry map
                          // strips ALL leading initials: "T. A. Tirante" → "tirante", "A. De Minaur" → "de minaur"
                          const extractSurname = (n: string) => n.replace(/^([A-Z]\.\s*)+/, "").trim().toLowerCase();
                          const tennisOddsMap = (() => {
                            const map = new Map<string, TennisOddsEntry>();
                            tennisOddsMatches.forEach(o => {
                              const s0 = extractSurname(o.players[0].name);
                              const s1 = extractSurname(o.players[1].name);
                              const k1 = `${o.date}-${s0}-${s1}`;
                              const k2 = `${o.date}-${s1}-${s0}`;
                              map.set(k1, o); map.set(k2, { ...o, matchOdds: [o.matchOdds[1], o.matchOdds[0]], set1Odds: o.set1Odds ? [o.set1Odds[1], o.set1Odds[0]] : null, players: [o.players[1], o.players[0]] });
                            });
                            return map;
                          })();

                          const MatchRow = ({ m }: { m: TournamentMatch }) => {
                            const p0 = m.players[0];
                            const p1 = m.players[1];
                            if (!p0 || !p1) return null;
                            const isNotStarted = m.status === "Not Started";
                            const r0 = playerRank(p0.name);
                            const r1 = playerRank(p1.name);

                            // Look up real odds for this match
                            const oddsKey = `${m.date}-${extractSurname(p0.name)}-${extractSurname(p1.name)}`;
                            const matchOdds = isNotStarted ? tennisOddsMap.get(oddsKey) : undefined;

                            const makeTennisMatch = (oddsEntry: TennisOddsEntry) => ({
                              id: `tennis-odds-${oddsEntry.matchId}`,
                              home: p0.name, away: p1.name,
                              league: tournamentDetail?.league ?? "Ténis",
                              odds: { home: 0, draw: 0, away: 0 },
                            } as unknown as Match);

                            const OddBtn = ({ idx, market, odd, label }: { idx: 0 | 1; market: string; odd: number; label: string }) => {
                              if (!matchOdds) return null;
                              const fakeMatch = makeTennisMatch(matchOdds);
                              const sel = idx === 0 ? "home" : "away";
                              const selected = !!bets.find(b => b.matchId === fakeMatch.id && b.market === market && b.selection === sel);
                              return (
                                <button
                                  onClick={() => toggleBet(fakeMatch, sel, odd, market, label)}
                                  className={`text-[9px] font-black px-1 py-0.5 rounded tabular-nums transition-colors border ${selected ? "bg-red-600 border-red-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"}`}
                                >
                                  {odd.toFixed(2)}
                                </button>
                              );
                            };

                            return (
                              <div className="flex items-center gap-2 py-1.5 border-b border-zinc-800/50 last:border-0">
                                {/* Time / score column */}
                                {isNotStarted ? (
                                  <span className="text-[10px] font-bold text-emerald-400 w-10 shrink-0 tabular-nums">{m.time}</span>
                                ) : (
                                  <div className="flex gap-0.5 w-10 shrink-0">
                                    {(["s1","s2","s3","s4","s5"] as const).map(s => <ScoreSet key={s} p0={p0} p1={p1} set={s} />)}
                                  </div>
                                )}
                                {/* Players */}
                                <div className="flex-1 min-w-0">
                                  <div className={`text-[11px] leading-none font-semibold truncate ${p0.winner ? "text-white" : "text-zinc-400"}`}>
                                    {p0.serve && <span className="text-yellow-400 mr-0.5">●</span>}
                                    {r0 && <span className="text-[8px] font-black text-zinc-600 mr-1">#{r0}</span>}
                                    {p0.name}
                                    {p0.winner && <span className="ml-1 text-emerald-400 text-[9px]">✓</span>}
                                  </div>
                                  <div className={`text-[11px] leading-none mt-0.5 font-semibold truncate ${p1.winner ? "text-white" : "text-zinc-400"}`}>
                                    {p1.serve && <span className="text-yellow-400 mr-0.5">●</span>}
                                    {r1 && <span className="text-[8px] font-black text-zinc-600 mr-1">#{r1}</span>}
                                    {p1.name}
                                    {p1.winner && <span className="ml-1 text-emerald-400 text-[9px]">✓</span>}
                                  </div>
                                </div>
                                {/* Odds buttons (if available) or status badge */}
                                {matchOdds ? (
                                  <div className="shrink-0 flex flex-col gap-0.5 items-end">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[8px] text-zinc-600">W</span>
                                      <OddBtn idx={0} market="tenis-vencedor" odd={matchOdds.matchOdds[0]} label={p0.name} />
                                      <OddBtn idx={1} market="tenis-vencedor" odd={matchOdds.matchOdds[1]} label={p1.name} />
                                    </div>
                                    {matchOdds.set1Odds && (
                                      <div className="flex items-center gap-1">
                                        <span className="text-[8px] text-zinc-600">S1</span>
                                        <OddBtn idx={0} market="tenis-1set" odd={matchOdds.set1Odds[0]} label={`${p0.name} — 1º Set`} />
                                        <OddBtn idx={1} market="tenis-1set" odd={matchOdds.set1Odds[1]} label={`${p1.name} — 1º Set`} />
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <StatusBadge status={m.status} />
                                )}
                              </div>
                            );
                          };

                          // Group upcoming by round
                          const upcomingByRound = upcoming.reduce<Record<string, TournamentMatch[]>>((acc, m) => {
                            (acc[m.round] = acc[m.round] ?? []).push(m); return acc;
                          }, {});
                          const upcomingRounds = Object.keys(upcomingByRound).sort((a,b) => {
                            const ord: Record<string,number> = {
                              "1/64-finals":1,"1/32-finals":2,"1/16-finals":3,
                              "1/8-finals":4,"quarter-finals":5,"semi-finals":6,"final":7,
                            };
                            return (ord[a]??99) - (ord[b]??99);
                          });

                          return (
                            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden">
                              <div className={`h-0.5 w-full ${sc.bar}`} />
                              <div className="p-3">
                                {tournamentDetailLoading && (
                                  <div className="text-center text-zinc-600 text-xs py-4">A carregar quadro...</div>
                                )}
                                {!tournamentDetailLoading && tournamentDetail && (
                                  <>
                                    {/* Upcoming today/tomorrow */}
                                    {upcoming.length > 0 && (
                                      <div className="mb-4">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Programa — Hoje / Amanhã</div>
                                        {upcomingRounds.map(round => (
                                          <div key={round} className="mb-3">
                                            <div className={`text-[9px] font-black uppercase tracking-wide mb-1.5 ${sc.text}`}>
                                              {ROUND_PT[round] ?? round}
                                            </div>
                                            {upcomingByRound[round]!.map(m => <MatchRow key={m.id} m={m} />)}
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Recent results */}
                                    {finished.length > 0 && (
                                      <div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Resultados Recentes</div>
                                        {finished.slice(0, 12).map(m => <MatchRow key={m.id} m={m} />)}
                                      </div>
                                    )}

                                    {upcoming.length === 0 && finished.length === 0 && (
                                      <div className="text-center text-zinc-600 text-xs py-3">Sem partidas disponíveis</div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}

                  {/* ─── Ranking ATP / WTA ──────────────────────────────────── */}
                  {false && (selectedSport === "all" || selectedSport === "tennis") && tennisStandings && !selectedLeague && (() => {
                    const FLAG: Record<string, string> = {
                      "Spain":"🇪🇸","Italy":"🇮🇹","Serbia":"🇷🇸","Russia":"🇷🇺","Germany":"🇩🇪",
                      "Norway":"🇳🇴","Greece":"🇬🇷","France":"🇫🇷","United States":"🇺🇸","USA":"🇺🇸",
                      "Australia":"🇦🇺","Canada":"🇨🇦","United Kingdom":"🇬🇧","Great Britain":"🇬🇧",
                      "Argentina":"🇦🇷","Denmark":"🇩🇰","Poland":"🇵🇱","Bulgaria":"🇧🇬",
                      "Czech Republic":"🇨🇿","Slovakia":"🇸🇰","Croatia":"🇭🇷","Hungary":"🇭🇺",
                      "Belgium":"🇧🇪","Netherlands":"🇳🇱","Switzerland":"🇨🇭","Austria":"🇦🇹",
                      "Portugal":"🇵🇹","Japan":"🇯🇵","China":"🇨🇳","Kazakhstan":"🇰🇿",
                      "Ukraine":"🇺🇦","Belarus":"🇧🇾","Romania":"🇷🇴","Brazil":"🇧🇷",
                      "Chile":"🇨🇱","Colombia":"🇨🇴","Mexico":"🇲🇽","Taiwan":"🇹🇼",
                      "South Korea":"🇰🇷","Tunisia":"🇹🇳","Latvia":"🇱🇻","Estonia":"🇪🇪",
                      "Finland":"🇫🇮","Sweden":"🇸🇪","Turkey":"🇹🇷","Israel":"🇮🇱",
                      "Philippines":"🇵🇭","Georgia":"🇬🇪","Albania":"🇦🇱",
                    };
                    const movIcon = (m: string) =>
                      m === "up" ? <span className="text-emerald-500 text-[9px]">↑</span>
                      : m === "down" ? <span className="text-red-500 text-[9px]">↓</span>
                      : <span className="text-zinc-700 text-[9px]">−</span>;
                    const fmtPts = (pts: string) => Number(pts).toLocaleString("pt-PT");
                    const list = rankingsTour === "atp" ? tennisStandings!.atp : tennisStandings!.wta;
                    return (
                      <div className="mb-5">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setRankingsOpen(o => !o)}
                          onKeyDown={e => e.key === "Enter" && setRankingsOpen(o => !o)}
                          className="w-full flex items-center justify-between mb-2.5 group cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest group-hover:text-zinc-300 transition-colors">
                              Ranking
                            </span>
                            <div className="flex rounded overflow-hidden border border-zinc-700">
                              {(["atp","wta"] as const).map(tour => (
                                <button
                                  key={tour}
                                  onClick={e => { e.stopPropagation(); setRankingsTour(tour); setRankingsOpen(true); }}
                                  className={`text-[9px] font-black px-1.5 py-0.5 transition-colors ${rankingsTour === tour ? (tour === "wta" ? "bg-pink-900/60 text-pink-300" : "bg-zinc-700 text-white") : "text-zinc-600 hover:text-zinc-400"}`}
                                >
                                  {tour.toUpperCase()}
                                </button>
                              ))}
                            </div>
                          </div>
                          <ChevronDown size={12} className={`text-zinc-600 transition-transform duration-200 ${rankingsOpen ? "" : "-rotate-90"}`} />
                        </div>

                        {rankingsOpen && (
                          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                            {list.slice(0, 20).map((p, i) => (
                              <div key={p.id} className={`flex items-center gap-2 px-3 py-1.5 ${i < list.slice(0,20).length - 1 ? "border-b border-zinc-800/60" : ""}`}>
                                {/* Rank */}
                                <span className={`text-[11px] font-black tabular-nums w-5 text-right shrink-0 ${i < 3 ? "text-amber-400" : "text-zinc-600"}`}>
                                  {p.rank}
                                </span>
                                {/* Movement */}
                                <span className="w-3 shrink-0 text-center">{movIcon(p.movement)}</span>
                                {/* Flag + Name */}
                                <span className="text-sm shrink-0">{FLAG[p.country] ?? "🏴"}</span>
                                <span className={`text-[11px] font-semibold flex-1 truncate ${i < 3 ? "text-white" : "text-zinc-300"}`}>{p.name}</span>
                                {/* Points */}
                                <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">{fmtPts(p.points)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ─── Resultados Recentes de Ténis ──────────────────────── */}
                  {false && (selectedSport === "all" || selectedSport === "tennis") && recentResults.length > 0 && !selectedLeague && (
                    <div className="mb-6">
                      <button
                        onClick={() => setResultsOpen(o => !o)}
                        className="w-full flex items-center justify-between mb-3 group"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black italic uppercase tracking-tight text-zinc-400 group-hover:text-white transition-colors">
                            🎾 Resultados de Ontem
                          </span>
                          {recentResults[0] && (
                            <span className="text-[10px] font-semibold text-zinc-600 normal-case italic hidden sm:block">
                              — {tournamentLabel(recentResults[0].tournament)}
                            </span>
                          )}
                          <span className="text-[10px] font-bold bg-zinc-800 text-zinc-500 rounded px-1.5 py-0.5">
                            {recentResults.length}
                          </span>
                        </div>
                        <ChevronDown
                          size={14}
                          className={`text-zinc-600 transition-transform duration-200 ${resultsOpen ? "" : "-rotate-90"}`}
                        />
                      </button>

                      {resultsOpen && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {recentResults.map(r => {
                            const winner = r.homeWon ? r.home : r.away;
                            const loser  = r.homeWon ? r.away : r.home;
                            const wSets  = r.homeWon ? r.sets.map(([h]) => h)    : r.sets.map(([, a]) => a);
                            const lSets  = r.homeWon ? r.sets.map(([, a]) => a)  : r.sets.map(([h]) => h);
                            return (
                              <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 flex items-center gap-3 hover:border-zinc-700 transition-colors">
                                {/* Names */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-3.5 h-3.5 rounded-full bg-green-600/20 flex items-center justify-center shrink-0">
                                      <span className="text-[9px] text-green-400 font-black leading-none">✓</span>
                                    </span>
                                    <span className="text-xs font-bold text-white truncate">{winner}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="w-3.5 h-3.5 shrink-0" />
                                    <span className="text-xs text-zinc-500 truncate">{loser}</span>
                                  </div>
                                </div>
                                {/* Set scores */}
                                <div className="flex items-center gap-1.5 font-mono tabular-nums shrink-0">
                                  {wSets.map((ws, i) => (
                                    <div key={i} className="text-center w-4">
                                      <div className={`text-xs font-black leading-tight ${ws > lSets[i]! ? "text-white" : "text-zinc-600"}`}>{ws}</div>
                                      <div className={`text-xs font-black leading-tight ${lSets[i]! > ws ? "text-zinc-400" : "text-zinc-600"}`}>{lSets[i]}</div>
                                    </div>
                                  ))}
                                </div>
                                {r.status === "Retired" && (
                                  <span className="text-[9px] text-yellow-500/80 font-bold shrink-0 border border-yellow-700/40 rounded px-1 py-0.5">RET</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── Calendário NHL — Próximos Jogos ───────────────────── */}
                  {(selectedSport === "all" || selectedSport === "hockey") && (hockeySchedule?.upcomingMatches.length ?? 0) > 0 && !selectedLeague && (() => {
                    const upcoming = hockeySchedule!.upcomingMatches;
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
                    const fmtDate = (s: string) => {
                      const [d, m, y] = s.split(".");
                      const dt = new Date(parseInt(y!), parseInt(m!) - 1, parseInt(d!));
                      if (dt.getTime() === today.getTime()) return "Hoje";
                      if (dt.getTime() === tomorrow.getTime()) return "Amanhã";
                      return dt.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
                    };
                    // Build odds map keyed by "date-homeNorm-awayNorm"
                    const normTeam = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "");
                    const hockeyOddsMap = new Map<string, HockeyOddsEntry>();
                    hockeyOddsMatches.forEach(o => {
                      const h = normTeam(o.homeTeam.name);
                      const a = normTeam(o.awayTeam.name);
                      hockeyOddsMap.set(`${o.date}-${h}-${a}`, o);
                      hockeyOddsMap.set(`${o.date}-${a}-${h}`, { ...o, homeTeam: o.awayTeam, awayTeam: o.homeTeam, homeOdds: o.awayOdds, awayOdds: o.homeOdds });
                    });
                    // Group by date
                    const byDate = upcoming.reduce<Record<string, typeof upcoming>>((acc, m) => {
                      (acc[m.date] ??= []).push(m); return acc;
                    }, {});
                    const OddBtn = ({ matchId, sel, odd, label, market }: { matchId: string; sel: "home" | "draw" | "away"; odd: number; label: string; market: string }) => {
                      const fakeMatch = { id: `hockey-odds-${matchId}`, home: label, away: "", league: "NHL", odds: { home: 0, draw: 0, away: 0 } } as unknown as Match;
                      const selected = !!bets.find(b => b.matchId === fakeMatch.id && b.market === market && b.selection === sel);
                      return (
                        <button onClick={() => toggleBet(fakeMatch, sel, odd, market, label)}
                          className={`flex-1 flex flex-col items-center px-1 py-1 rounded text-[9px] font-black tabular-nums border transition-colors ${selected ? "bg-red-600 border-red-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"}`}>
                          <span className="text-[7px] font-bold text-zinc-500 uppercase leading-none mb-0.5">{market === "1X2" ? (sel === "home" ? "1" : sel === "draw" ? "X" : "2") : sel.toUpperCase()}</span>
                          <span>{odd.toFixed(2)}</span>
                        </button>
                      );
                    };
                    return (
                      <div className="mb-6">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-base font-black italic uppercase tracking-tight text-zinc-400">📅 Calendário NHL</span>
                          <span className="text-[10px] font-semibold text-zinc-600 normal-case italic hidden sm:block">— {hockeySchedule!.season}</span>
                          <span className="text-[10px] font-bold bg-zinc-800 text-zinc-500 rounded px-1.5 py-0.5">{upcoming.length}</span>
                          {hockeyOddsMatches.length > 0 && <span className="text-[9px] font-bold text-green-600/80 bg-green-500/10 border border-green-500/20 rounded px-1.5 py-0.5">{hockeyOddsMatches.length} com odds</span>}
                        </div>
                        <div className="space-y-3">
                          {Object.entries(byDate).slice(0, 7).map(([date, games]) => (
                            <div key={date}>
                              <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                <span>{fmtDate(date)}</span>
                                <span className="flex-1 h-px bg-zinc-800" />
                                <span>{date.split(".").slice(0,2).join("/")}</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                {games.map(g => {
                                  const oddsKey = `${g.date}-${normTeam(g.home)}-${normTeam(g.away)}`;
                                  const go = hockeyOddsMap.get(oddsKey);
                                  return (
                                    <div key={g.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 hover:border-zinc-700 transition-colors">
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs font-bold text-zinc-300 truncate">{g.home}</div>
                                          <div className="text-xs text-zinc-600 truncate">{g.away}</div>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <div className="text-[10px] font-black text-zinc-400 tabular-nums">{g.time.slice(0,5)}</div>
                                          {g.venue && <div className="text-[9px] text-zinc-700 truncate max-w-[80px]">{g.venue.split(" ").slice(0,2).join(" ")}</div>}
                                        </div>
                                      </div>
                                      {go && (
                                        <div className="flex gap-1 mt-2">
                                          <OddBtn matchId={go.matchId} sel="home" odd={go.homeOdds} label={g.home} market="1X2" />
                                          {go.drawOdds > 0 && <OddBtn matchId={go.matchId} sel="draw" odd={go.drawOdds} label="Empate" market="1X2" />}
                                          <OddBtn matchId={go.matchId} sel="away" odd={go.awayOdds} label={g.away} market="1X2" />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ─── Classificação NHL ────────────────────────────────────── */}
                  {(selectedSport === "all" || selectedSport === "hockey") && hockeyStandings && hockeyStandings.conferences.length > 0 && !selectedLeague && (() => {
                    const streakColor = (s: string) => s.startsWith("W") ? "text-green-400" : s.startsWith("L") ? "text-red-400" : "text-zinc-400";
                    const openTeamPanel = (abbr: string, tab: "roster" | "stats" | "injuries") => {
                      if (selectedRosterAbbr === abbr && rosterPanelTab === tab) { setSelectedRosterAbbr(null); return; }
                      setSelectedRosterAbbr(abbr);
                      setRosterPanelTab(tab);
                      if (tab === "stats" && !hockeyTeamStats[abbr]) {
                        setTeamStatsLoading(true);
                        fetch(`/api/matches/hockey-team-stats/${abbr}`)
                          .then(r => r.ok ? r.json() : null)
                          .then(d => { if (d) setHockeyTeamStats(prev => ({ ...prev, [abbr]: d })); })
                          .catch(() => {})
                          .finally(() => setTeamStatsLoading(false));
                      }
                      if (tab === "injuries" && !hockeyInjuries[abbr]) {
                        setInjuriesLoading(true);
                        fetch(`/api/matches/hockey-injuries/${abbr}`)
                          .then(r => r.ok ? r.json() : null)
                          .then(d => { if (d) setHockeyInjuries(prev => ({ ...prev, [abbr]: d })); })
                          .catch(() => {})
                          .finally(() => setInjuriesLoading(false));
                      }
                      if (tab === "roster" && !hockeyRosters[abbr]) {
                        setRosterLoading(true);
                        fetch(`/api/matches/hockey-roster/${abbr}`)
                          .then(r => r.ok ? r.json() : null)
                          .then(d => { if (d) setHockeyRosters(prev => ({ ...prev, [abbr]: d })); })
                          .catch(() => {})
                          .finally(() => setRosterLoading(false));
                      }
                    };
                    const handleTeamClick = (abbr: string) => {
                      if (selectedRosterAbbr === abbr) { setSelectedRosterAbbr(null); return; }
                      setSelectedRosterAbbr(abbr);
                      setRosterPanelTab("roster");
                      if (hockeyRosters[abbr]) return;
                      setRosterLoading(true);
                      fetch(`/api/matches/hockey-roster/${abbr}`)
                        .then(r => r.ok ? r.json() : null)
                        .then(d => { if (d) setHockeyRosters(prev => ({ ...prev, [abbr]: d })); })
                        .catch(() => {})
                        .finally(() => setRosterLoading(false));
                    };
                    const activeRoster = selectedRosterAbbr ? hockeyRosters[selectedRosterAbbr] : null;
                    const POS_ICON: Record<string, string> = {
                      "Centers": "C", "Left Wings": "LW", "Right Wings": "RW",
                      "Defensemen": "D", "Goaltenders": "G",
                    };
                    return (
                      <div className="mb-6">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-base font-black italic uppercase tracking-tight text-zinc-400">🏆 Classificação NHL</span>
                          <span className="text-[10px] font-semibold text-zinc-600 normal-case italic hidden sm:block">— {hockeyStandings.season}</span>
                        </div>
                        <div className="space-y-4">
                          {hockeyStandings.conferences.map(conf => (
                            <div key={conf.name}>
                              <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-2">{conf.name}</div>
                              <div className="space-y-3">
                                {conf.divisions.map(div => (
                                  <div key={div.name} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                                    <div className="bg-zinc-800/60 px-3 py-1.5 text-[9px] font-black text-zinc-500 uppercase tracking-widest">{div.name}</div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-[11px] font-mono tabular-nums">
                                        <thead>
                                          <tr className="border-b border-zinc-800 text-[9px] font-black text-zinc-600 uppercase">
                                            <th className="text-left py-1.5 px-2 w-5">#</th>
                                            <th className="text-left py-1.5 px-2 min-w-[120px]">Equipa</th>
                                            <th className="py-1.5 px-1 text-center">PJ</th>
                                            <th className="py-1.5 px-1 text-center">V</th>
                                            <th className="py-1.5 px-1 text-center">D</th>
                                            <th className="py-1.5 px-1 text-center">DO</th>
                                            <th className="py-1.5 px-1 text-center font-black text-white">PTS</th>
                                            <th className="py-1.5 px-1 text-center hidden sm:table-cell">GF</th>
                                            <th className="py-1.5 px-1 text-center hidden sm:table-cell">GC</th>
                                            <th className="py-1.5 px-1 text-center hidden sm:table-cell">DIF</th>
                                            <th className="py-1.5 px-2 text-center hidden md:table-cell">SÉRIE</th>
                                            <th className="py-1.5 px-2 text-center hidden md:table-cell">ÚLT 10</th>
                                            <th className="py-1.5 px-2 w-6" />
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {div.teams.map((team, idx) => (
                                            <tr key={team.id} className={`border-b border-zinc-800/40 transition-colors ${selectedRosterAbbr === team.abbr ? "bg-zinc-800/60" : "hover:bg-zinc-800/20"} ${idx < 3 ? "border-l-2 border-l-green-600/40" : idx === 3 ? "border-l-2 border-l-yellow-500/40" : ""}`}>
                                              <td className="py-1.5 px-2 text-zinc-600 text-center">{team.position}</td>
                                              <td className="py-1.5 px-2 font-semibold truncate max-w-[130px] cursor-pointer" onClick={() => handleTeamClick(team.abbr)}>
                                                <span className={selectedRosterAbbr === team.abbr ? "text-white" : "text-zinc-200"}>{team.name}</span>
                                              </td>
                                              <td className="py-1.5 px-1 text-center text-zinc-400">{team.gp}</td>
                                              <td className="py-1.5 px-1 text-center text-green-400">{team.won}</td>
                                              <td className="py-1.5 px-1 text-center text-red-400">{team.lost}</td>
                                              <td className="py-1.5 px-1 text-center text-zinc-500">{team.otLosses}</td>
                                              <td className="py-1.5 px-1 text-center font-black text-white">{team.points}</td>
                                              <td className="py-1.5 px-1 text-center text-zinc-400 hidden sm:table-cell">{team.gf}</td>
                                              <td className="py-1.5 px-1 text-center text-zinc-400 hidden sm:table-cell">{team.ga}</td>
                                              <td className={`py-1.5 px-1 text-center hidden sm:table-cell font-bold ${team.diff.startsWith("+") ? "text-green-400" : team.diff.startsWith("-") ? "text-red-400" : "text-zinc-500"}`}>{team.diff}</td>
                                              <td className={`py-1.5 px-2 text-center hidden md:table-cell font-black ${streakColor(team.streak)}`}>{team.streak}</td>
                                              <td className="py-1.5 px-2 text-center text-zinc-600 hidden md:table-cell text-[9px]">{team.lastTen.split(",")[0]}</td>
                                              <td className="py-1 px-1">
                                                <div className="flex items-center gap-0.5 justify-end">
                                                  <button title="Plantel" onClick={() => openTeamPanel(team.abbr, "roster")}
                                                    className={`text-[11px] px-1 py-0.5 rounded transition-colors ${selectedRosterAbbr === team.abbr && rosterPanelTab === "roster" ? "bg-red-600/20 text-red-400" : "text-zinc-600 hover:text-zinc-300"}`}>👥</button>
                                                  <button title="Estatísticas" onClick={() => openTeamPanel(team.abbr, "stats")}
                                                    className={`text-[11px] px-1 py-0.5 rounded transition-colors ${selectedRosterAbbr === team.abbr && rosterPanelTab === "stats" ? "bg-red-600/20 text-red-400" : "text-zinc-600 hover:text-zinc-300"}`}>📊</button>
                                                  <button title="Lesões" onClick={() => openTeamPanel(team.abbr, "injuries")}
                                                    className={`text-[11px] px-1 py-0.5 rounded transition-colors ${selectedRosterAbbr === team.abbr && rosterPanelTab === "injuries" ? "bg-red-600/20 text-red-400" : "text-zinc-600 hover:text-zinc-300"}`}>🏥</button>
                                                </div>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    <div className="px-3 py-1.5 flex gap-3 text-[8px] text-zinc-700">
                                      <span className="flex items-center gap-1"><span className="w-2 h-2 border-l-2 border-green-600/60 inline-block" />Playoff</span>
                                      <span className="flex items-center gap-1"><span className="w-2 h-2 border-l-2 border-yellow-500/60 inline-block" />Wild Card</span>
                                      <span className="text-zinc-800 ml-auto">👥 Plantel · 📊 Estatísticas · 🏥 Lesões</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* ── Roster / Stats Panel ── */}
                        {selectedRosterAbbr && (() => {
                          const activeStats = hockeyTeamStats[selectedRosterAbbr];
                          const teamDisplayName = activeRoster?.teamName ?? activeStats?.teamName ?? selectedRosterAbbr.toUpperCase();
                          const handleTabChange = (tab: "roster" | "stats" | "injuries") => {
                            setRosterPanelTab(tab);
                            if (tab === "stats" && !hockeyTeamStats[selectedRosterAbbr]) {
                              setTeamStatsLoading(true);
                              fetch(`/api/matches/hockey-team-stats/${selectedRosterAbbr}`)
                                .then(r => r.ok ? r.json() : null)
                                .then(d => { if (d) setHockeyTeamStats(prev => ({ ...prev, [selectedRosterAbbr]: d })); })
                                .catch(() => {})
                                .finally(() => setTeamStatsLoading(false));
                            }
                            if (tab === "injuries" && !hockeyInjuries[selectedRosterAbbr]) {
                              setInjuriesLoading(true);
                              fetch(`/api/matches/hockey-injuries/${selectedRosterAbbr}`)
                                .then(r => r.ok ? r.json() : null)
                                .then(d => { if (d) setHockeyInjuries(prev => ({ ...prev, [selectedRosterAbbr]: d })); })
                                .catch(() => {})
                                .finally(() => setInjuriesLoading(false));
                            }
                          };
                          return (
                            <div className="mt-4 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                              {/* Header */}
                              <div className="bg-zinc-800 px-4 py-2.5 flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-sm font-black text-white truncate">{teamDisplayName}</span>
                                  {activeRoster && <span className="text-[9px] bg-zinc-700 text-zinc-400 rounded px-1.5 py-0.5 font-bold shrink-0">{activeRoster.abbreviation}</span>}
                                  <span className="text-[9px] text-zinc-600 shrink-0">{(activeRoster ?? activeStats)?.season}</span>
                                </div>
                                <button onClick={() => setSelectedRosterAbbr(null)} className="text-zinc-600 hover:text-zinc-300 transition-colors text-lg leading-none ml-2 shrink-0">×</button>
                              </div>
                              {/* Tabs */}
                              <div className="flex border-b border-zinc-800">
                                {(["roster", "stats", "injuries"] as const).map(tab => (
                                  <button key={tab} onClick={() => handleTabChange(tab)}
                                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${rosterPanelTab === tab ? "text-white border-b-2 border-red-500 bg-zinc-800/40" : "text-zinc-600 hover:text-zinc-400"}`}>
                                    {tab === "roster" ? "👥 Plantel" : tab === "stats" ? "📊 Estatísticas" : "🏥 Lesões"}
                                  </button>
                                ))}
                              </div>
                              {/* Roster Tab */}
                              {rosterPanelTab === "roster" && (
                                activeRoster ? (
                                  <div className="p-3 space-y-4">
                                    {activeRoster.positions.map(pos => (
                                      <div key={pos.name}>
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className="text-[9px] font-black bg-red-600/20 text-red-400 rounded px-1.5 py-0.5 uppercase tracking-wider">{POS_ICON[pos.name] ?? pos.name.slice(0,2).toUpperCase()}</span>
                                          <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">{pos.name}</span>
                                          <span className="text-[8px] text-zinc-700">{pos.players.length} jogadores</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                          {pos.players.map(p => (
                                            <div key={p.id} className="bg-zinc-950/70 border border-zinc-800 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
                                              <span className="text-[10px] font-black text-zinc-600 w-5 text-center shrink-0">#{p.number || "–"}</span>
                                              <div className="flex-1 min-w-0">
                                                <div className="text-[11px] font-bold text-zinc-200 truncate">{p.name}</div>
                                                <div className="text-[9px] text-zinc-600 flex gap-2 flex-wrap">
                                                  {p.age > 0 && <span>{p.age} anos</span>}
                                                  {p.height && <span>{p.height}</span>}
                                                  {p.weight && <span>{p.weight}</span>}
                                                  {p.shot && <span>Remate: {p.shot}</span>}
                                                </div>
                                              </div>
                                              {p.salary && <span className="text-[9px] font-bold text-green-600/80 shrink-0">{p.salary}</span>}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : rosterLoading ? (
                                  <div className="text-center text-zinc-600 py-6 text-sm animate-pulse">A carregar plantel...</div>
                                ) : (
                                  <div className="text-center text-zinc-600 py-6 text-sm">Plantel não disponível.</div>
                                )
                              )}
                              {/* Stats Tab */}
                              {rosterPanelTab === "stats" && (
                                activeStats ? (
                                  <div className="p-3 space-y-4">
                                    {/* Skaters table */}
                                    <div>
                                      <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-2">Patinadores</div>
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-[10px] font-mono tabular-nums">
                                          <thead>
                                            <tr className="border-b border-zinc-800 text-[8px] font-black text-zinc-600 uppercase">
                                              <th className="text-left py-1 px-1 w-4">#</th>
                                              <th className="text-left py-1 px-1 min-w-[110px]">Jogador</th>
                                              <th className="py-1 px-1 text-center w-6">PJ</th>
                                              <th className="py-1 px-1 text-center w-6 text-yellow-500">G</th>
                                              <th className="py-1 px-1 text-center w-6 text-blue-400">A</th>
                                              <th className="py-1 px-1 text-center w-7 font-black text-white">PTS</th>
                                              <th className="py-1 px-1 text-center w-7 hidden sm:table-cell">+/-</th>
                                              <th className="py-1 px-1 text-center w-6 hidden sm:table-cell">PPG</th>
                                              <th className="py-1 px-1 text-center w-7 hidden sm:table-cell">REM</th>
                                              <th className="py-1 px-1 text-center w-10 hidden md:table-cell">TOI/J</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {activeStats.skaters.map(p => (
                                              <tr key={p.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                                                <td className="py-1 px-1 text-zinc-700">{p.rank}</td>
                                                <td className="py-1 px-1">
                                                  <div className="flex items-center gap-1.5">
                                                    <span className="text-[8px] font-black bg-zinc-800 text-zinc-500 rounded px-1">{p.pos}</span>
                                                    <span className="text-zinc-200 font-semibold truncate max-w-[90px]">{p.name}</span>
                                                  </div>
                                                </td>
                                                <td className="py-1 px-1 text-center text-zinc-500">{p.gp}</td>
                                                <td className="py-1 px-1 text-center text-yellow-400 font-bold">{p.goals}</td>
                                                <td className="py-1 px-1 text-center text-blue-400">{p.assists}</td>
                                                <td className="py-1 px-1 text-center font-black text-white">{p.points}</td>
                                                <td className={`py-1 px-1 text-center hidden sm:table-cell font-bold ${p.plusMinus > 0 ? "text-green-400" : p.plusMinus < 0 ? "text-red-400" : "text-zinc-600"}`}>{p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}</td>
                                                <td className="py-1 px-1 text-center text-zinc-400 hidden sm:table-cell">{p.ppg}</td>
                                                <td className="py-1 px-1 text-center text-zinc-400 hidden sm:table-cell">{p.shots}</td>
                                                <td className="py-1 px-1 text-center text-zinc-600 hidden md:table-cell">{p.toiPerGame}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                    {/* Goalies table */}
                                    {activeStats.goalies.length > 0 && (
                                      <div>
                                        <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-2">Guarda-Redes</div>
                                        <div className="overflow-x-auto">
                                          <table className="w-full text-[10px] font-mono tabular-nums">
                                            <thead>
                                              <tr className="border-b border-zinc-800 text-[8px] font-black text-zinc-600 uppercase">
                                                <th className="text-left py-1 px-1 min-w-[110px]">Jogador</th>
                                                <th className="py-1 px-1 text-center">PJ</th>
                                                <th className="py-1 px-1 text-center text-green-400">V</th>
                                                <th className="py-1 px-1 text-center text-red-400">D</th>
                                                <th className="py-1 px-1 text-center">DO</th>
                                                <th className="py-1 px-1 text-center font-black text-white">S%</th>
                                                <th className="py-1 px-1 text-center hidden sm:table-cell">Saves</th>
                                                <th className="py-1 px-1 text-center hidden sm:table-cell">GA</th>
                                                <th className="py-1 px-1 text-center hidden sm:table-cell">SO</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {activeStats.goalies.map(g => (
                                                <tr key={g.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                                                  <td className="py-1 px-1 text-zinc-200 font-semibold truncate max-w-[110px]">{g.name}</td>
                                                  <td className="py-1 px-1 text-center text-zinc-500">{g.gp}</td>
                                                  <td className="py-1 px-1 text-center text-green-400 font-bold">{g.wins}</td>
                                                  <td className="py-1 px-1 text-center text-red-400">{g.losses}</td>
                                                  <td className="py-1 px-1 text-center text-zinc-500">{g.otLosses}</td>
                                                  <td className="py-1 px-1 text-center font-black text-white">{g.savesPct}</td>
                                                  <td className="py-1 px-1 text-center text-zinc-400 hidden sm:table-cell">{g.saves}</td>
                                                  <td className="py-1 px-1 text-center text-zinc-400 hidden sm:table-cell">{g.goalsAgainst}</td>
                                                  <td className="py-1 px-1 text-center text-zinc-400 hidden sm:table-cell">{g.shutouts || "–"}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : teamStatsLoading ? (
                                  <div className="text-center text-zinc-600 py-6 text-sm animate-pulse">A carregar estatísticas...</div>
                                ) : (
                                  <div className="text-center text-zinc-600 py-6 text-sm">Estatísticas não disponíveis.</div>
                                )
                              )}
                              {/* Injuries Tab */}
                              {rosterPanelTab === "injuries" && (() => {
                                const activeInjuries = hockeyInjuries[selectedRosterAbbr];
                                if (injuriesLoading && !activeInjuries) return <div className="text-center text-zinc-600 py-6 text-sm animate-pulse">A carregar lesões...</div>;
                                if (!activeInjuries) return <div className="text-center text-zinc-600 py-6 text-sm">Lesões não disponíveis.</div>;
                                if (activeInjuries.report.length === 0) return (
                                  <div className="flex flex-col items-center gap-2 py-8">
                                    <span className="text-2xl">✅</span>
                                    <span className="text-sm font-bold text-green-500">Sem lesões reportadas</span>
                                    <span className="text-[10px] text-zinc-600">Todos os jogadores disponíveis</span>
                                  </div>
                                );
                                const statusColors: Record<string, string> = {
                                  "Sidelined": "text-red-400 bg-red-500/10 border-red-500/30",
                                  "I.L.": "text-amber-400 bg-amber-500/10 border-amber-500/30",
                                  "Day-to-Day": "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
                                };
                                const statusDefault = "text-zinc-400 bg-zinc-700/30 border-zinc-600/30";
                                return (
                                  <div className="p-3 space-y-2">
                                    <div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-3">{activeInjuries.report.length} jogador{activeInjuries.report.length !== 1 ? "es" : ""} no relatório</div>
                                    {activeInjuries.report.map((r, i) => (
                                      <div key={i} className="bg-zinc-950/70 border border-zinc-800 rounded-lg px-3 py-2 flex items-start gap-3">
                                        <span className={`mt-0.5 text-[9px] font-black px-1.5 py-0.5 rounded border shrink-0 ${statusColors[r.status] ?? statusDefault}`}>{r.status}</span>
                                        <div className="flex-1 min-w-0">
                                          <div className="text-[11px] font-bold text-zinc-200">{r.playerName}</div>
                                          <div className="text-[10px] text-zinc-500 mt-0.5">{r.description}</div>
                                        </div>
                                        {r.date && <span className="text-[9px] text-zinc-700 shrink-0 mt-0.5">{r.date}</span>}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}

                  {/* ─── Odds Pré-Jogo de Voleibol ───────────────────────────── */}
                  {false && (selectedSport === "all" || selectedSport === "volleyball") && volleyOddsMatches.length > 0 && !selectedLeague && (() => {
                    const today = new Date();
                    const todayStr = `${String(today.getDate()).padStart(2,"0")}.${String(today.getMonth()+1).padStart(2,"0")}.${today.getFullYear()}`;
                    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
                    const tomorrowStr = `${String(tomorrow.getDate()).padStart(2,"0")}.${String(tomorrow.getMonth()+1).padStart(2,"0")}.${tomorrow.getFullYear()}`;
                    const formatDate = (d: string) => d === todayStr ? "Hoje" : d === tomorrowStr ? "Amanhã" : d.split(".").slice(0,2).join("/");

                    // Group by league
                    const byLeague = volleyOddsMatches.reduce<Record<string, VolleyOddsEntry[]>>((acc, m) => {
                      (acc[m.league] ??= []).push(m); return acc;
                    }, {});

                    return (
                      <div className="mb-6">
                        <button
                          onClick={() => setVolleyOddsOpen(o => !o)}
                          className="w-full flex items-center justify-between mb-3 group"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black italic uppercase tracking-tight text-zinc-400 group-hover:text-white transition-colors">
                              🏐 Odds Pré-Jogo
                            </span>
                            <span className="text-[10px] font-bold bg-zinc-800 text-zinc-500 rounded px-1.5 py-0.5">
                              {volleyOddsMatches.length}
                            </span>
                          </div>
                          <ChevronDown size={14} className={`text-zinc-600 transition-transform duration-200 ${volleyOddsOpen ? "" : "-rotate-90"}`} />
                        </button>

                        {volleyOddsOpen && (
                          <div className="space-y-3">
                            {Object.entries(byLeague).map(([league, matches]) => (
                              <div key={league} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
                                {/* league header */}
                                <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">{league}</span>
                                </div>
                                {/* match rows */}
                                <div className="divide-y divide-zinc-800/60">
                                  {matches.map(m => {
                                    const fakeId = `volley-odds-${m.matchId}`;
                                    const makeMatch = (home: string, away: string) => ({
                                      id: fakeId, home, away, league: m.league,
                                      odds: { home: 0, draw: 0, away: 0 },
                                    } as unknown as Match);
                                    const OddBtn = ({ sel, odd, label, market }: { sel: "home" | "away"; odd: number; label: string; market: string }) => {
                                      const selected = !!bets.find(b => b.matchId === fakeId && b.market === market && b.selection === sel);
                                      return (
                                        <button
                                          onClick={() => toggleBet(makeMatch(m.homeTeam.name, m.awayTeam.name), sel, odd, market, label)}
                                          className={`text-[10px] font-black px-2 py-1 rounded tabular-nums transition-colors border ${selected ? "bg-red-600 border-red-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"}`}
                                        >
                                          {odd.toFixed(2)}
                                        </button>
                                      );
                                    };
                                    return (
                                      <div key={m.matchId} className="px-3 py-2.5">
                                        {/* date + time header for this match */}
                                        <div className="flex items-center gap-1.5 mb-2">
                                          <span className="text-[9px] font-bold text-emerald-500">{formatDate(m.date)}</span>
                                          <span className="text-[9px] text-zinc-600 tabular-nums">{m.time}</span>
                                        </div>
                                        {/* teams + H/A odds */}
                                        <div className="flex items-center gap-2 mb-1.5">
                                          <div className="flex-1 min-w-0">
                                            <div className="text-xs font-bold text-white truncate">{m.homeTeam.name}</div>
                                            <div className="text-xs text-zinc-500 truncate">{m.awayTeam.name}</div>
                                          </div>
                                          <div className="flex flex-col gap-1 items-end shrink-0">
                                            <div className="flex items-center gap-1">
                                              <span className="text-[9px] text-zinc-600">1</span>
                                              <OddBtn sel="home" odd={m.homeOdds} label={m.homeTeam.name} market="Resultado" />
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <span className="text-[9px] text-zinc-600">2</span>
                                              <OddBtn sel="away" odd={m.awayOdds} label={m.awayTeam.name} market="Resultado" />
                                            </div>
                                          </div>
                                        </div>
                                        {/* Over/Under line */}
                                        {m.overUnder && (() => {
                                          const ouId = `volley-odds-ou-${m.matchId}`;
                                          const ouMatch = { ...makeMatch(m.homeTeam.name, m.awayTeam.name), id: ouId };
                                          const selO = !!bets.find(b => b.matchId === ouId && b.selection === "home");
                                          const selU = !!bets.find(b => b.matchId === ouId && b.selection === "away");
                                          return (
                                            <div className="flex items-center gap-1.5 pt-1 border-t border-zinc-800/60 mt-1">
                                              <span className="text-[9px] text-zinc-600 shrink-0">O/U {m.overUnder.line} sets</span>
                                              <button
                                                onClick={() => toggleBet(ouMatch, "home", m.overUnder!.over, "Over/Under", `Over ${m.overUnder!.line}`)}
                                                className={`text-[10px] font-black px-2 py-0.5 rounded tabular-nums transition-colors border ${selO ? "bg-red-600 border-red-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}
                                              >
                                                O {m.overUnder.over.toFixed(2)}
                                              </button>
                                              <button
                                                onClick={() => toggleBet(ouMatch, "away", m.overUnder!.under, "Over/Under", `Under ${m.overUnder!.line}`)}
                                                className={`text-[10px] font-black px-2 py-0.5 rounded tabular-nums transition-colors border ${selU ? "bg-red-600 border-red-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}
                                              >
                                                U {m.overUnder.under.toFixed(2)}
                                              </button>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ─── Ligas de Voleibol ───────────────────────────────────── */}
                  {false && (selectedSport === "all" || selectedSport === "volleyball") && volleyLeagues.length > 0 && !selectedLeague && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-base font-black italic uppercase tracking-tight text-zinc-400">🏐 Ligas de Voleibol</span>
                        <span className="text-[10px] font-bold bg-zinc-800 text-zinc-500 rounded px-1.5 py-0.5">{volleyLeagues.length}</span>
                      </div>

                      {/* league card strip */}
                      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none mb-3">
                        {volleyLeagues.map(lg => {
                          const isExp = expandedVolleyLeagueId === lg.id;
                          const flag = COUNTRY_FLAGS[lg.country.toLowerCase()] ?? "🏐";
                          return (
                            <button
                              key={lg.id}
                              onClick={() => handleVolleyLeagueClick(lg.id)}
                              className={`flex-shrink-0 rounded-xl border px-3 py-2 text-left transition-all ${isExp ? "border-zinc-500 bg-zinc-800" : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"}`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm">{flag}</span>
                                <span className="text-xs font-bold text-white whitespace-nowrap">
                                  {lg.league.includes(":") ? lg.league.split(":").slice(1).join(":").trim() : lg.league}
                                </span>
                              </div>
                              <div className="text-[10px] text-zinc-500 mt-0.5 capitalize">{lg.country}</div>
                            </button>
                          );
                        })}
                      </div>

                      {/* expanded panel with tabs */}
                      {expandedVolleyLeagueId && (() => {
                        const schedule = volleyScheduleMap[expandedVolleyLeagueId!];
                        const standings = volleyStandingsMap[expandedVolleyLeagueId!];
                        const loading = !schedule && volleyScheduleLoading;
                        if (loading) {
                          return <div className="text-xs text-zinc-600 text-center py-4">A carregar...</div>;
                        }
                        if (!schedule) return null;

                        return (
                          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                            {/* header */}
                            <div className="mb-3">
                              <div className="text-sm font-black text-white">{schedule.league}</div>
                              <div className="text-[10px] text-zinc-500 capitalize">{schedule.country} · {schedule.season}</div>
                            </div>

                            {/* tab bar */}
                            <div className="flex gap-1 mb-4 bg-zinc-800/50 rounded-lg p-1">
                              <button
                                onClick={() => setVolleyLeagueTab("schedule")}
                                className={`flex-1 text-xs font-bold rounded-md px-3 py-1.5 transition-all ${volleyLeagueTab === "schedule" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                              >
                                Calendário
                              </button>
                              <button
                                onClick={() => handleVolleyStandingsTab(expandedVolleyLeagueId!)}
                                className={`flex-1 text-xs font-bold rounded-md px-3 py-1.5 transition-all ${volleyLeagueTab === "standings" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                              >
                                Classificação
                              </button>
                            </div>

                            {/* ── Calendário tab ── */}
                            {volleyLeagueTab === "schedule" && (
                              <>
                                {schedule.nextWeek && (
                                  <div className="mb-4">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-2">
                                      {schedule.nextWeek!.number}
                                    </div>
                                    <div className="space-y-1.5">
                                      {schedule.nextWeek!.matches.map((m: any) => (
                                        <div key={m.id} className="flex items-center bg-zinc-800/60 rounded-lg px-3 py-2 gap-2">
                                          <span className="text-[10px] text-zinc-500 tabular-nums shrink-0">{m.time}</span>
                                          <span className="text-xs font-bold text-white flex-1 truncate">{m.home}</span>
                                          <span className="text-[10px] text-zinc-600 shrink-0">vs</span>
                                          <span className="text-xs font-bold text-white flex-1 text-right truncate">{m.away}</span>
                                          <span className="text-[10px] text-zinc-500 tabular-nums shrink-0">
                                            {m.date.split(".").slice(0, 2).join("/")}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                              </>
                            )}

                            {/* ── Classificação tab ── */}
                            {volleyLeagueTab === "standings" && (
                              <>
                                {!(expandedVolleyLeagueId! in volleyStandingsMap) && (
                                  <div className="text-xs text-zinc-600 text-center py-4">A carregar classificação...</div>
                                )}
                                {expandedVolleyLeagueId! in volleyStandingsMap && (!standings || standings.teams.length === 0) && (
                                  <div className="text-center py-6">
                                    <div className="text-2xl mb-2">📊</div>
                                    <div className="text-xs font-bold text-zinc-500">Classificação disponível apenas na fase regular</div>
                                    <div className="text-[10px] text-zinc-600 mt-1">Esta liga encontra-se em fase de play-offs</div>
                                  </div>
                                )}
                                {standings && standings.teams.length > 0 && (
                                  <>
                                    {standings.name && <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">{standings.name}</div>}
                                    {/* table header */}
                                    <div className="grid grid-cols-[1.5rem_1fr_2rem_2rem_2rem_3.5rem_3rem] gap-x-1 px-2 mb-1">
                                      <span className="text-[9px] text-zinc-600">#</span>
                                      <span className="text-[9px] text-zinc-600">Equipa</span>
                                      <span className="text-[9px] text-zinc-600 text-center">V</span>
                                      <span className="text-[9px] text-zinc-600 text-center">D</span>
                                      <span className="text-[9px] text-zinc-600 text-center">Pts</span>
                                      <span className="text-[9px] text-zinc-600 text-center">Sets</span>
                                      <span className="text-[9px] text-zinc-600 text-center">Forma</span>
                                    </div>
                                    <div className="space-y-0.5">
                                      {standings.teams.map((t: any, idx: number) => {
                                        const desc = typeof t.description === "object" ? t.description?.value : t.description;
                                        const isPromo = desc?.toLowerCase().includes("play off") || desc?.toLowerCase().includes("quarter") || desc?.toLowerCase().includes("final") || desc?.toLowerCase().includes("semi");
                                        const form = (t.recent_form ?? "").split("");
                                        return (
                                          <div
                                            key={t.id}
                                            className={`grid grid-cols-[1.5rem_1fr_2rem_2rem_2rem_3.5rem_3rem] gap-x-1 items-center rounded-lg px-2 py-1.5 ${idx % 2 === 0 ? "bg-zinc-800/30" : ""}`}
                                          >
                                            <span className={`text-[10px] font-black tabular-nums ${isPromo ? "text-red-400" : "text-zinc-500"}`}>{t.pos}</span>
                                            <span className="text-xs font-bold text-white truncate">{t.name}</span>
                                            <span className="text-[10px] text-zinc-300 text-center tabular-nums">{t.w}</span>
                                            <span className="text-[10px] text-zinc-500 text-center tabular-nums">{t.l}</span>
                                            <span className="text-[10px] font-black text-white text-center tabular-nums">{t.pts}</span>
                                            <span className="text-[10px] text-zinc-500 text-center tabular-nums">{t.points_for}/{t.points_against}</span>
                                            <div className="flex gap-0.5 justify-center">
                                              {form.slice(-5).map((ch: string, i: number) => (
                                                <span key={i} className={`text-[8px] font-black w-3 h-3 rounded-sm flex items-center justify-center ${ch === "W" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{ch}</span>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}


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
                  ) : selectedLeague ? (
                    <div className="space-y-2">
                      {filteredUpcoming.map(match => <MatchCard key={match.id} match={match} />)}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {sportGroups.map(group => (
                        <div key={group.key}>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[13px] font-black italic uppercase tracking-tight text-zinc-400">
                              {group.emoji} {group.label}
                            </span>
                            <span className="text-[10px] font-bold bg-zinc-800 text-zinc-500 rounded px-1.5 py-0.5 tabular-nums">
                              {group.matches.length}
                            </span>
                            <div className="flex-1 h-px bg-zinc-800 ml-1" />
                          </div>
                          <div className="space-y-2">
                            {group.matches.map(match => <MatchCard key={match.id} match={match} />)}
                          </div>
                        </div>
                      ))}
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
