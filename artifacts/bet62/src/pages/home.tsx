import { useState, useCallback, useEffect, useRef, useMemo, createContext, useContext, Children, lazy, Suspense, type ReactNode, type FormEvent } from "react";
import trophyImg from "/trophy-wc-nobg.png";
import { useLocation } from "wouter";
import { useIdle } from "@/hooks/use-idle";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Menu, X, Trophy, Activity, Gift, Flag,
  LogOut, User, History, Loader2, Zap, TrendingUp,
  ChevronRight, ChevronLeft, ChevronDown, ChevronUp, AlertCircle, BarChart2, Wallet, ArrowDownCircle, ArrowUpCircle, Plus, Clock, Smartphone,
  Copy, Share2, CircleDollarSign, Lock, Trash2, Check, Fingerprint, ScanFace, ShieldCheck,
  RefreshCw, Ticket, CalendarDays, ListOrdered, Search,
} from "lucide-react";
import ProfileTab from "@/components/ProfileTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { getResolvedTheme, subscribeThemeChange, type ResolvedTheme } from "@/lib/theme";

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
import riverPlateBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836112512_1778361261646.webp";
import bocaJuniorsBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836113093_1778361261646.webp";
import racingClubBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836113846_1778361261645.webp";
import independienteBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836114382_1778361261639.webp";
import sanLorenzoBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836115074_1778361261636.webp";
import velezBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836115686_1778361261636.webp";
import estudiantesBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836116232_1778361261635.webp";
import rosarioCentralBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836116875_1778361261635.webp";
import talleresBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836117521_1778361261634.webp";
import lanusBanner from "@assets/Create_a_photorealistic_169_football_banner_with_-177836119764_1778361261633.webp";
import palmirasBanner from "@assets/file_1778852798916_1778852957311.jpeg";
import flamengoBanner from "@assets/file_1778852802911_1778852957311.jpeg";
import saoPauloBanner from "@assets/file_1778852808010_1778852957311.jpeg";
import fluminenseBanner from "@assets/file_1778852812218_1778852957312.jpeg";
import bahiaBanner from "@assets/file_1778852816214_1778852957312.jpeg";
import athleticoPRBanner from "@assets/file_1778852819823_1778852957312.jpeg";
import coritibaBanner from "@assets/file_1778852828214_1778852957312.jpeg";
import atleticoMGBanner from "@assets/file_1778852831734_1778852957312.jpeg";
import bragantinoBanner from "@assets/file_1778852835656_1778852957312.jpeg";
import vitoriaBanner from "@assets/file_1778852839664_1778852957312.jpeg";
import botafogoBanner from "@assets/file_1779017405337_1779018435511.jpeg";
import gremioBanner from "@assets/file_1779017412912_1779018435511.jpeg";
import vascoGamaBanner from "@assets/file_1779017418125_1779018435511.jpeg";
import santosBanner from "@assets/file_1779017475629_1779018435511.jpeg";
import corinthiansBanner from "@assets/file_1779017485117_1779018435511.jpeg";
import cruzeiroBanner from "@assets/file_1779017497416_1779018435511.jpeg";
import clubeRemoBanner from "@assets/file_1779017508663_1779018435511.jpeg";
import chapecoenseBanner from "@assets/file_1779017521787_1779018435511.jpeg";
import mirassolBanner from "@assets/file_1779017533260_1779018435511.jpeg";
import ajaxBanner from "@assets/file_1779018601650_1779018681798.jpeg";
import psvBanner from "@assets/file_1779018614650_1779018681798.jpeg";
import feyenoordBanner from "@assets/file_1779018620791_1779018681798.jpeg";
import utrechtBanner from "@assets/file_1779018636577_1779018681798.jpeg";
import twenteBanner from "@assets/file_1779018632973_1779018681798.jpeg";
import azBanner from "@assets/file_1779018625614_1779018681798.jpeg";
import necBanner from "@assets/file_1779018658064_1779018681798.jpeg";
import heerenveenBanner from "@assets/file_1779018648329_1779018681798.jpeg";
import goAheadEaglesBanner from "@assets/file_1779018641867_1779018681798.jpeg";
import psgBanner from "@assets/file_1779019403545_1779019658504.jpeg";
import lyonBanner from "@assets/file_1779019418740_1779019658504.jpeg";
import lensBanner from "@assets/file_1779019411265_1779019658504.jpeg";
import strasbourgBanner from "@assets/file_1779019441070_1779019658504.jpeg";
import monacoBanner from "@assets/file_1779019435638_1779019658504.jpeg";
import marseilleBanner from "@assets/file_1779019427574_1779019658504.jpeg";
import toulouseBanner from "@assets/file_1779019463945_1779019658504.jpeg";
import parisFCBanner from "@assets/file_1779019459045_1779019658504.jpeg";
import lorientBanner from "@assets/file_1779019450188_1779019658504.jpeg";
import brestBanner from "@assets/file_1779019468348_1779019658504.jpeg";

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
  "Vitoria Guimaraes": "/banners/vitoria-sc.jpg",
  "Vitória Guimarães": "/banners/vitoria-sc.jpg",
  "V. Guimaraes": "/banners/vitoria-sc.jpg",
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
  "Atletico de Madrid": atleticoMadridBanner,
  "Atl. Madrid": atleticoMadridBanner,
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
  "Osasuna": "/banners/file_1778704789962_1778715064131.jpeg",
  "CA Osasuna": "/banners/file_1778704789962_1778715064131.jpeg",
  "Mallorca": "/banners/file_1778704794042_1778715064131.jpeg",
  "RCD Mallorca": "/banners/file_1778704794042_1778715064131.jpeg",
  "Getafe": "/banners/file_1778704805773_1778715064131.jpeg",
  "Getafe CF": "/banners/file_1778704805773_1778715064131.jpeg",
  "Rayo Vallecano": "/banners/file_1778704817279_1778715064131.jpeg",
  "Celta Vigo": "/banners/file_1778704825793_1778715064131.jpeg",
  "RC Celta": "/banners/file_1778704825793_1778715064131.jpeg",
  "Celta": "/banners/file_1778704825793_1778715064131.jpeg",
  "Deportivo Alaves": "/banners/file_1778704789962_1778715064131.jpeg",
  "Alavés": "/banners/file_1778704789962_1778715064131.jpeg",
  "Alaves": "/banners/file_1778704789962_1778715064131.jpeg",
  "Espanyol": "/banners/file_1778704805773_1778715064131.jpeg",
  "RCD Espanyol": "/banners/file_1778704805773_1778715064131.jpeg",
  "Valladolid": "/banners/file_1778704817279_1778715064131.jpeg",
  "Real Valladolid": "/banners/file_1778704817279_1778715064131.jpeg",
  "Leganes": "/banners/file_1778704825793_1778715064131.jpeg",
  "CD Leganes": "/banners/file_1778704825793_1778715064131.jpeg",
  "Leganés": "/banners/file_1778704825793_1778715064131.jpeg",
  "Arsenal": arsenalBanner,
  "Man City": manCityBanner,
  "Manchester City": manCityBanner,
  "Man Utd": manUnitedBanner,
  "Manchester United": manUnitedBanner,
  "Manchester Utd": manUnitedBanner,
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
  // ── Süper Lig (Turkey) ──
  "Galatasaray": "/banners/galatasaray.jpg",
  "Galatasaray SK": "/banners/galatasaray.jpg",
  "Fenerbahce": "/banners/fenerbahce.jpg",
  "Fenerbahçe": "/banners/fenerbahce.jpg",
  "Fenerbahce SK": "/banners/fenerbahce.jpg",
  "Trabzonspor": "/banners/trabzonspor.jpg",
  "Trabzon": "/banners/trabzonspor.jpg",
  "Besiktas": "/banners/besiktas.jpg",
  "Beşiktaş": "/banners/besiktas.jpg",
  "Besiktas JK": "/banners/besiktas.jpg",
  "Göztepe": "/banners/goztepe.jpg",
  "Goztepe": "/banners/goztepe.jpg",
  "Goztepe SK": "/banners/goztepe.jpg",
  "Istanbul Basaksehir": "/banners/basaksehir.jpg",
  "Başakşehir": "/banners/basaksehir.jpg",
  "Basaksehir": "/banners/basaksehir.jpg",
  "Istanbul BB": "/banners/basaksehir.jpg",
  "Medipol Basaksehir": "/banners/basaksehir.jpg",
  "Samsunspor": "/banners/samsunspor.jpg",
  "Caykur Rizespor": "/banners/rizespor.jpg",
  "Çaykur Rizespor": "/banners/rizespor.jpg",
  "Rizespor": "/banners/rizespor.jpg",
  "Konyaspor": "/banners/konyaspor.jpg",
  "Atiker Konyaspor": "/banners/konyaspor.jpg",
  "Kocaelispor": "/banners/kocaelispor.jpg",
  // ── EFL Championship ──
  "Birmingham City": "/banners/birmingham.jpg",
  "Birmingham": "/banners/birmingham.jpg",
  "Southampton": "/banners/southampton.jpg",
  "Ipswich Town": "/banners/ipswich.jpg",
  "Ipswich": "/banners/ipswich.jpg",
  "Wrexham": "/banners/wrexham.jpg",
  "Wrexham AFC": "/banners/wrexham.jpg",
  "Coventry City": "/banners/coventry.jpg",
  "Coventry": "/banners/coventry.jpg",
  "Sheffield United": "/banners/sheffield-utd.jpg",
  "Sheffield Utd": "/banners/sheffield-utd.jpg",
  "Sheff Utd": "/banners/sheffield-utd.jpg",
  "Middlesbrough": "/banners/middlesbrough.jpg",
  "Boro": "/banners/middlesbrough.jpg",
  "Leicester City": "/banners/leicester.jpg",
  "Leicester": "/banners/leicester.jpg",
  "Derby County": "/banners/derby.jpg",
  "Derby": "/banners/derby.jpg",
  "Hull City": "/banners/hull.jpg",
  "Hull": "/banners/hull.jpg",
  // ── MLS ──
  "Inter Miami": "/banners/inter-miami.jpg",
  "Inter Miami CF": "/banners/inter-miami.jpg",
  "LA Galaxy": "/banners/la-galaxy.jpg",
  "Los Angeles Galaxy": "/banners/la-galaxy.jpg",
  "LAFC": "/banners/lafc.jpg",
  "Los Angeles FC": "/banners/lafc.jpg",
  "LA FC": "/banners/lafc.jpg",
  "Atlanta United": "/banners/atlanta-united.jpg",
  "Atlanta United FC": "/banners/atlanta-united.jpg",
  "Seattle Sounders": "/banners/seattle-sounders.jpg",
  "Seattle Sounders FC": "/banners/seattle-sounders.jpg",
  "New York City FC": "/banners/nycfc.jpg",
  "NYCFC": "/banners/nycfc.jpg",
  "NYC FC": "/banners/nycfc.jpg",
  "Portland Timbers": "/banners/portland-timbers.jpg",
  "Austin FC": "/banners/austin-fc.jpg",
  "FC Cincinnati": "/banners/fc-cincinnati.jpg",
  "Columbus Crew": "/banners/columbus-crew.jpg",
  // ── Liga MX ──
  "Cruz Azul": "/banners/file_1778704794042_1778715064131.jpeg",
  "Club Cruz Azul": "/banners/file_1778704794042_1778715064131.jpeg",
  "Guadalajara": "/banners/file_1778704789962_1778715064131.jpeg",
  "Chivas": "/banners/file_1778704789962_1778715064131.jpeg",
  "Club Guadalajara": "/banners/file_1778704789962_1778715064131.jpeg",
  "Chivas Guadalajara": "/banners/file_1778704789962_1778715064131.jpeg",
  "León": "/banners/file_1778704817279_1778715064131.jpeg",
  "Leon": "/banners/file_1778704817279_1778715064131.jpeg",
  "Club León": "/banners/file_1778704817279_1778715064131.jpeg",
  "Club Leon": "/banners/file_1778704817279_1778715064131.jpeg",
  "Tigres UANL": "/banners/file_1778704805773_1778715064131.jpeg",
  "Tigres U.A.N.L.": "/banners/file_1778704805773_1778715064131.jpeg",
  "Tigres": "/banners/file_1778704805773_1778715064131.jpeg",
  "Pachuca": "/banners/file_1778704825793_1778715064131.jpeg",
  "C.F. Pachuca": "/banners/file_1778704825793_1778715064131.jpeg",
  "CF Pachuca": "/banners/file_1778704825793_1778715064131.jpeg",
  "Tuzos": "/banners/file_1778704825793_1778715064131.jpeg",
  // ── Brasileirão ──
  "Palmeiras": palmirasBanner,
  "SE Palmeiras": palmirasBanner,
  "Sociedade Esportiva Palmeiras": palmirasBanner,
  "Flamengo": flamengoBanner,
  "CR Flamengo": flamengoBanner,
  "Clube de Regatas do Flamengo": flamengoBanner,
  "São Paulo": saoPauloBanner,
  "Sao Paulo": saoPauloBanner,
  "São Paulo FC": saoPauloBanner,
  "Sao Paulo FC": saoPauloBanner,
  "SPFC": saoPauloBanner,
  "Fluminense": fluminenseBanner,
  "Fluminense FC": fluminenseBanner,
  "Bahia": bahiaBanner,
  "EC Bahia": bahiaBanner,
  "Esporte Clube Bahia": bahiaBanner,
  "Athletico Paranaense": athleticoPRBanner,
  "Athletico-PR": athleticoPRBanner,
  "Club Athletico Paranaense": athleticoPRBanner,
  "Athletico PR": athleticoPRBanner,
  "CAP": athleticoPRBanner,
  "Coritiba": coritibaBanner,
  "Coritiba FC": coritibaBanner,
  "Coritiba FBC": coritibaBanner,
  "Atlético Mineiro": atleticoMGBanner,
  "Atletico Mineiro": atleticoMGBanner,
  "Atlético-MG": atleticoMGBanner,
  "Atletico MG": atleticoMGBanner,
  "Clube Atlético Mineiro": atleticoMGBanner,
  "CAM": atleticoMGBanner,
  "Red Bull Bragantino": bragantinoBanner,
  "Bragantino": bragantinoBanner,
  "RB Bragantino": bragantinoBanner,
  "Red Bull Bragantino BR": bragantinoBanner,
  "Vitória": vitoriaBanner,
  "Vitoria": vitoriaBanner,
  "EC Vitória": vitoriaBanner,
  "EC Vitoria": vitoriaBanner,
  "Esporte Clube Vitória": vitoriaBanner,
  "Botafogo": botafogoBanner,
  "Botafogo RJ": botafogoBanner,
  "Botafogo FR": botafogoBanner,
  "Botafogo de Futebol e Regatas": botafogoBanner,
  "Grêmio": gremioBanner,
  "Gremio": gremioBanner,
  "Grêmio FBPA": gremioBanner,
  "Vasco da Gama": vascoGamaBanner,
  "Vasco": vascoGamaBanner,
  "CR Vasco da Gama": vascoGamaBanner,
  "Club de Regatas Vasco da Gama": vascoGamaBanner,
  "Santos": santosBanner,
  "Santos FC": santosBanner,
  "Corinthians": corinthiansBanner,
  "SC Corinthians": corinthiansBanner,
  "Sport Club Corinthians Paulista": corinthiansBanner,
  "Cruzeiro": cruzeiroBanner,
  "Cruzeiro EC": cruzeiroBanner,
  "Cruzeiro Esporte Clube": cruzeiroBanner,
  "Clube do Remo": clubeRemoBanner,
  "Club do Remo": clubeRemoBanner,
  "Remo": clubeRemoBanner,
  "Chapecoense": chapecoenseBanner,
  "Chapecoense-SC": chapecoenseBanner,
  "Associação Chapecoense de Futebol": chapecoenseBanner,
  "ACF Chapecoense": chapecoenseBanner,
  "Mirassol": mirassolBanner,
  "Mirassol FC": mirassolBanner,
  // ── Ligue 1 (France) ──
  "PSG": psgBanner,
  "Paris Saint-Germain": psgBanner,
  "Paris SG": psgBanner,
  "Paris FC": parisFCBanner,
  "Lyon": lyonBanner,
  "Olympique Lyon": lyonBanner,
  "Olympique Lyonnais": lyonBanner,
  "Lens": lensBanner,
  "RC Lens": lensBanner,
  "Strasbourg": strasbourgBanner,
  "RC Strasbourg": strasbourgBanner,
  "RC Strasbourg Alsace": strasbourgBanner,
  "Monaco": monacoBanner,
  "AS Monaco": monacoBanner,
  "Marseille": marseilleBanner,
  "Olympique Marseille": marseilleBanner,
  "Olympique de Marseille": marseilleBanner,
  "Toulouse": toulouseBanner,
  "Toulouse FC": toulouseBanner,
  "Lorient": lorientBanner,
  "FC Lorient": lorientBanner,
  "Brest": brestBanner,
  "Stade Brest": brestBanner,
  "Stade Brestois 29": brestBanner,
  // ── Eredivisie (Netherlands) ──
  "Ajax": ajaxBanner,
  "AFC Ajax": ajaxBanner,
  "Ajax Amsterdam": ajaxBanner,
  "PSV": psvBanner,
  "PSV Eindhoven": psvBanner,
  "Feyenoord": feyenoordBanner,
  "Feyenoord Rotterdam": feyenoordBanner,
  "FC Utrecht": utrechtBanner,
  "Utrecht": utrechtBanner,
  "FC Twente": twenteBanner,
  "Twente": twenteBanner,
  "AZ": azBanner,
  "AZ Alkmaar": azBanner,
  "NEC Nijmegen": necBanner,
  "NEC": necBanner,
  "SC Heerenveen": heerenveenBanner,
  "Heerenveen": heerenveenBanner,
  "Go Ahead Eagles": goAheadEaglesBanner,
};

type MainTab = "sports" | "live" | "promos" | "mybets" | "wallet" | "profile";
type LiveTransport = "idle" | "cache" | "sse" | "polling";

const TEAM_NAME_PT: Record<string, string> = {
  Norway: "Noruega",
  Uruguay: "Uruguai",
  Senegal: "Senegal",
  France: "França",
  Iraq: "Iraque",
  Noruega: "Noruega",
  Uruguai: "Uruguai",
  França: "França",
  Iraque: "Iraque",
};

function teamNamePt(name: string): string {
  const n = (name ?? "").trim();
  if (!n) return n;
  return TEAM_NAME_PT[n] ?? n;
}

const LEAGUE_FLAGS: Record<string, string> = {
  "La Liga": "🇪🇸", "Laliga": "🇪🇸", "Laliga2": "🇪🇸", "Segunda": "🇪🇸", "LaLiga Hypermotion": "🇪🇸", "Copa del Rey": "🇪🇸",
  "Premier League": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "EFL Championship": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Championship": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "League One": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "FA Cup": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Champions League": "⭐", "UEFA Champions League": "⭐", "Europa League": "🌟", "Conference League": "🟢",
  "UEFA Nations League": "⭐", "UEFA European Championship": "⭐",
  "FIFA World Cup": "🌍", "Copa América": "🌎", "Copa America": "🌎",
  "CONCACAF Gold Cup": "🏆", "Africa Cup of Nations": "🏆", "AFC Asian Cup": "🏆",
  "International Friendlies": "🤝", "International Friendly": "🤝", "Amistosos internacionais": "🤝",
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
  "MLS": "🇺🇸", "NBA": "🇺🇸", "NHL": "🇺🇸", "USA: MLB": "⚾", "MLB": "⚾",
  "EuroLeague": "⭐", "NBB — Brasil": "🇧🇷",
  "ATP 500": "🎾", "ATP 250": "🎾", "WTA 1000": "🎾", "WTA 250": "🎾", "Roland Garros": "🇫🇷",
  "NHL — Playoffs": "🏒", "KHL — Playoff": "🏒",
  "Volleyball Nations League": "🏐", "Superlega — Itália": "🏐", "Superliga — Rússia": "🏐", "Superliga — Brasil": "🏐",
};

const LEAGUE_LOGOS: Record<string, string> = {
  "Champions League": "https://media.api-sports.io/football/leagues/2.png",
  "UEFA Champions League": "https://media.api-sports.io/football/leagues/2.png",
  "Europa League": "https://media.api-sports.io/football/leagues/3.png",
  "UEFA Europa League": "https://media.api-sports.io/football/leagues/3.png",
  "Conference League": "https://media.api-sports.io/football/leagues/848.png",
  "UEFA Super Cup": "https://media.api-sports.io/football/leagues/531.png",
  "UEFA Nations League": "https://media.api-sports.io/football/leagues/5.png",
  "UEFA European Championship": "https://media.api-sports.io/football/leagues/4.png",
  "FIFA World Cup": "https://media.api-sports.io/football/leagues/1.png",
  "Copa América": "https://media.api-sports.io/football/leagues/9.png",
  "Copa America": "https://media.api-sports.io/football/leagues/9.png",
  "CONCACAF Gold Cup": "https://media.api-sports.io/football/leagues/22.png",
  "Africa Cup of Nations": "https://media.api-sports.io/football/leagues/6.png",
  "AFC Asian Cup": "https://media.api-sports.io/football/leagues/7.png",
  "International Friendlies": "https://media.api-sports.io/football/leagues/10.png",
  "International Friendly": "https://media.api-sports.io/football/leagues/10.png",
  "Amistosos internacionais": "https://media.api-sports.io/football/leagues/10.png",
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
  "Vitoria Guimaraes": "portugal", "Vitória Guimarães": "portugal", "V. Guimaraes": "portugal",
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
  "Atletico Madrid": "spain", "Atletico de Madrid": "spain", "Atl. Madrid": "spain", "Athletic Club": "spain", "Athletic Bilbao": "spain",
  "Ath Bilbao": "spain", "Real Sociedad": "spain", "Sevilla": "spain",
  "Valencia": "spain", "Villarreal": "spain", "Real Betis": "spain",
  "Betis": "spain", "Girona": "spain", "Mallorca": "spain", "Getafe": "spain",
  "Oviedo": "spain", "Leganes": "spain", "Andorra": "spain", "Osasuna": "spain",
  "Celta Vigo": "spain", "Deportivo Alaves": "spain", "Las Palmas": "spain",
  "Rayo Vallecano": "spain", "Espanyol": "spain", "Valladolid": "spain",
  "Arsenal": "england", "Man City": "england", "Manchester City": "england",
  "Man Utd": "england", "Manchester United": "england", "Manchester Utd": "england", "Liverpool": "england",
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
  // Brasileirão
  "Palmeiras": "brazil", "SE Palmeiras": "brazil",
  "Flamengo": "brazil", "CR Flamengo": "brazil",
  "São Paulo": "brazil", "Sao Paulo": "brazil", "São Paulo FC": "brazil", "Sao Paulo FC": "brazil", "SPFC": "brazil",
  "Fluminense": "brazil", "Fluminense FC": "brazil",
  "Bahia": "brazil", "EC Bahia": "brazil",
  "Athletico Paranaense": "brazil", "Athletico-PR": "brazil", "Athletico PR": "brazil", "Club Athletico Paranaense": "brazil",
  "Coritiba": "brazil", "Coritiba FC": "brazil", "Coritiba FBC": "brazil",
  "Atlético Mineiro": "brazil", "Atletico Mineiro": "brazil", "Atlético-MG": "brazil", "Atletico MG": "brazil",
  "Red Bull Bragantino": "brazil", "Bragantino": "brazil", "RB Bragantino": "brazil",
  "Vitória": "brazil", "Vitoria": "brazil", "EC Vitória": "brazil", "EC Vitoria": "brazil",
  "Corinthians": "brazil", "SC Corinthians": "brazil", "Sport Club Corinthians Paulista": "brazil",
  "Santos": "brazil", "Santos FC": "brazil",
  "Grêmio": "brazil", "Gremio": "brazil", "Grêmio FBPA": "brazil",
  "Internacional": "brazil", "Sport Club Internacional": "brazil",
  "Vasco da Gama": "brazil", "Vasco": "brazil", "CR Vasco da Gama": "brazil", "Club de Regatas Vasco da Gama": "brazil",
  "Botafogo": "brazil", "Botafogo RJ": "brazil", "Botafogo FR": "brazil", "Botafogo de Futebol e Regatas": "brazil",
  "Cruzeiro": "brazil", "Cruzeiro EC": "brazil", "Cruzeiro Esporte Clube": "brazil",
  "Clube do Remo": "brazil", "Club do Remo": "brazil", "Remo": "brazil",
  "Chapecoense": "brazil", "Chapecoense-SC": "brazil", "Associação Chapecoense de Futebol": "brazil", "ACF Chapecoense": "brazil",
  "Mirassol": "brazil", "Mirassol FC": "brazil",
  "Fortaleza": "brazil", "Fortaleza EC": "brazil",
  "Ceará": "brazil", "Ceara": "brazil", "Ceará SC": "brazil",
  "Sport Recife": "brazil", "Sport Club Recife": "brazil",
  "América Mineiro": "brazil", "America Mineiro": "brazil", "América-MG": "brazil",
  "Goiás": "brazil", "Goias": "brazil", "Goiás EC": "brazil",
  "Cuiabá": "brazil", "Cuiaba": "brazil", "Cuiabá EC": "brazil",
  // Süper Lig
  "Galatasaray": "turkey", "Galatasaray SK": "turkey",
  "Fenerbahce": "turkey", "Fenerbahçe": "turkey", "Fenerbahce SK": "turkey",
  "Trabzonspor": "turkey", "Trabzon": "turkey",
  "Besiktas": "turkey", "Beşiktaş": "turkey", "Besiktas JK": "turkey",
  "Göztepe": "turkey", "Goztepe": "turkey", "Goztepe SK": "turkey",
  "Istanbul Basaksehir": "turkey", "Başakşehir": "turkey", "Basaksehir": "turkey",
  "Istanbul BB": "turkey", "Medipol Basaksehir": "turkey",
  "Samsunspor": "turkey",
  "Caykur Rizespor": "turkey", "Çaykur Rizespor": "turkey", "Rizespor": "turkey",
  "Konyaspor": "turkey", "Atiker Konyaspor": "turkey",
  "Kocaelispor": "turkey",
  "Kasimpasa": "turkey", "Kasımpaşa": "turkey",
  "Hatayspor": "turkey", "Kayserispor": "turkey", "Sivasspor": "turkey",
  "Antalyaspor": "turkey", "Alanyaspor": "turkey", "Gaziantep": "turkey",
  "Gaziantep FK": "turkey", "Ankaragücü": "turkey", "Ankaragucu": "turkey",
  "Bodrumspor": "turkey", "MKE Ankaragücü": "turkey",
  // Ligue 1 (France)
  "PSG": "france", "Paris Saint-Germain": "france", "Paris SG": "france",
  "Paris FC": "france",
  "Lyon": "france", "Olympique Lyon": "france", "Olympique Lyonnais": "france",
  "Lens": "france", "RC Lens": "france",
  "Strasbourg": "france", "RC Strasbourg": "france", "RC Strasbourg Alsace": "france",
  "Monaco": "france", "AS Monaco": "france",
  "Marseille": "france", "Olympique Marseille": "france", "Olympique de Marseille": "france",
  "Toulouse": "france", "Toulouse FC": "france",
  "Lorient": "france", "FC Lorient": "france",
  "Brest": "france", "Stade Brest": "france", "Stade Brestois 29": "france",
  "Nice": "france", "OGC Nice": "france",
  "Lille": "france", "LOSC Lille": "france",
  "Rennes": "france", "Stade Rennais": "france",
  "Nantes": "france", "FC Nantes": "france",
  "Le Havre": "france", "HAC": "france",
  "Angers": "france", "SCO Angers": "france",
  "Auxerre": "france", "AJ Auxerre": "france",
  "Metz": "france", "FC Metz": "france",
  "Reims": "france", "Stade de Reims": "france",
  "Clermont": "france", "Clermont Foot": "france",
  "Montpellier": "france", "Montpellier HSC": "france",
  "Saint-Etienne": "france", "Saint Etienne": "france",
  "Caen": "france", "SM Caen": "france",
  // Eredivisie (Netherlands)
  "Ajax": "netherlands", "AFC Ajax": "netherlands", "Ajax Amsterdam": "netherlands",
  "PSV": "netherlands", "PSV Eindhoven": "netherlands",
  "Feyenoord": "netherlands", "Feyenoord Rotterdam": "netherlands",
  "FC Utrecht": "netherlands", "Utrecht": "netherlands",
  "FC Twente": "netherlands", "Twente": "netherlands",
  "AZ": "netherlands", "AZ Alkmaar": "netherlands",
  "NEC Nijmegen": "netherlands", "NEC": "netherlands",
  "SC Heerenveen": "netherlands", "Heerenveen": "netherlands",
  "Go Ahead Eagles": "netherlands",
  // Liga MX
  "Cruz Azul": "mexico", "Club Cruz Azul": "mexico",
  "Guadalajara": "mexico", "Chivas": "mexico", "Club Guadalajara": "mexico", "Chivas Guadalajara": "mexico",
  "León": "mexico", "Leon": "mexico", "Club León": "mexico", "Club Leon": "mexico",
  "Tigres UANL": "mexico", "Tigres U.A.N.L.": "mexico", "Tigres": "mexico",
  "Pachuca": "mexico", "C.F. Pachuca": "mexico", "CF Pachuca": "mexico", "Tuzos": "mexico",
  "América": "mexico", "America": "mexico", "Club America": "mexico", "Club América": "mexico",
  "Monterrey": "mexico", "C.F. Monterrey": "mexico", "CF Monterrey": "mexico", "Rayados": "mexico",
  "Pumas UNAM": "mexico", "Pumas": "mexico", "Club Universidad Nacional": "mexico",
  "Necaxa": "mexico", "Club Necaxa": "mexico",
  "Atlas": "mexico", "Atlas FC": "mexico",
  "Santos Laguna": "mexico", "Club Santos Laguna": "mexico",
  "Toluca": "mexico", "Deportivo Toluca": "mexico",
  "Tijuana": "mexico", "Club Tijuana": "mexico", "Xolos": "mexico",
  "Puebla": "mexico", "Club Puebla": "mexico",
  "Querétaro": "mexico", "Queretaro": "mexico", "FC Querétaro": "mexico",
  "Juárez": "mexico", "Juarez": "mexico", "FC Juárez": "mexico",
  "Mazatlán": "mexico", "Mazatlan": "mexico", "Mazatlán FC": "mexico",
};

function normalizeBannerTeamName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(fc|afc|sc|cf|sv|ac|rsc|fk|sk|cd|ud|sd|ca|ad|as|ss|us|ssc|club|clube)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bannerCountryMatches(teamName: string, country?: string): boolean {
  const expectedCountry = TEAM_COUNTRY[teamName];
  if (!expectedCountry || !country) return true;
  return normalizeBannerTeamName(expectedCountry) === normalizeBannerTeamName(country);
}

function getTeamBanner(teamName: string, country?: string): string | undefined {
  const directBanner = TEAM_BANNERS[teamName];
  if (directBanner && bannerCountryMatches(teamName, country)) return directBanner;

  const normalizedTarget = normalizeBannerTeamName(teamName);
  if (!normalizedTarget) return directBanner;

  const exactNormalized = Object.entries(TEAM_BANNERS).find(([key]) =>
    normalizeBannerTeamName(key) === normalizedTarget && bannerCountryMatches(key, country),
  );
  if (exactNormalized) return exactNormalized[1];

  return directBanner;
}

const ARENA_BANNER = "/arena-banner.png";

function buildSportsApiTeamLogoUrl(sport: string | undefined, teamId?: string, imageVersion?: string): string | undefined {
  const cleanId = String(teamId ?? "").trim();
  const cleanSport = String(sport ?? "football").trim().toLowerCase();
  if (!cleanId) return undefined;
  if (!["football", "basketball", "hockey", "tennis", "baseball", "volleyball"].includes(cleanSport)) {
    return undefined;
  }
  const params = new URLSearchParams();
  if (imageVersion) params.set("imageVersion", imageVersion);
  const query = params.toString();
  return `/api/matches/team-logo/${encodeURIComponent(cleanSport)}/${encodeURIComponent(cleanId)}${query ? `?${query}` : ""}`;
}

function getTeamBadgeAsset(
  match: Pick<Match, "sport" | "country" | "home" | "away" | "homeTeamId" | "awayTeamId" | "homeImageVersion" | "awayImageVersion">,
  side: "home" | "away",
): { src?: string; fit: "cover" | "contain"; padded: boolean } {
  const teamName = side === "home" ? match.home : match.away;
  const teamId = side === "home" ? match.homeTeamId : match.awayTeamId;
  const imageVersion = side === "home" ? match.homeImageVersion : match.awayImageVersion;
  const officialLogo = buildSportsApiTeamLogoUrl(match.sport, teamId, imageVersion);
  if (officialLogo) return { src: officialLogo, fit: "contain", padded: true };
  const localBanner = getTeamBanner(teamName, match.country);
  if (localBanner) return { src: localBanner, fit: "cover", padded: false };
  return { fit: "cover", padded: false };
}

function isNationalSideName(name: string): boolean {
  const normalized = normalizeBannerTeamName(name);
  if (!normalized) return false;
  return Object.keys(COUNTRY_FLAGS).some((country) => normalizeBannerTeamName(country) === normalized);
}

function isSelectionMatch(match: Pick<Match, "sport" | "league" | "home" | "away">): boolean {
  if ((match.sport ?? "football") !== "football") return false;
  const league = String(match.league ?? "").toLowerCase();
  if (
    /world cup|copa do mundo|uefa nations|euro|european championship|copa america|gold cup|africa cup|asian cup|international|qualif|qualifica/i.test(league)
  ) {
    return true;
  }
  return isNationalSideName(match.home) && isNationalSideName(match.away);
}

function teamMonogram(name: string): string {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "FC";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] ?? ""}${words[words.length - 1]![0] ?? ""}`.toUpperCase();
}

function isWomensMatch(match: { league?: string; isWomens?: boolean }): boolean {
  if (match.isWomens) return true;
  return /women|feminine|féminin|feminino|frauen|femenin|damall|nwsl|wsl/i.test(match.league ?? "");
}

function getMatchBanner(match: { home: string; country?: string; sport?: string; league?: string; isWomens?: boolean }): string | undefined {
  // Only use football team banners for football — no image for basketball/tennis/hockey/volleyball
  // Never show male team banners on women's matches
  if ((!match.sport || match.sport === "football") && !isWomensMatch(match)) {
    return getTeamBanner(match.home, match.country);
  }
  return undefined;
}

const MATCH_BANNER_CACHE = new Map<string, string>();

function getMatchBannerStable(match: { id?: string | number; home: string; country?: string; sport?: string; league?: string; isWomens?: boolean }): string | undefined {
  const id = String(match.id ?? "");
  const computed = getMatchBanner(match);
  if (computed) {
    if (id) MATCH_BANNER_CACHE.set(id, computed);
    return computed;
  }
  if (id) return MATCH_BANNER_CACHE.get(id);
  return undefined;
}

const COUNTRY_FLAGS: Record<string, string> = {
  // British Isles
  england: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", wales: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", "northern ireland": "🇬🇧",
  // Western Europe
  spain: "🇪🇸", germany: "🇩🇪", italy: "🇮🇹", france: "🇫🇷",
  portugal: "🇵🇹", netherlands: "🇳🇱", holland: "🇳🇱", belgium: "🇧🇪",
  austria: "🇦🇹", switzerland: "🇨🇭", luxembourg: "🇱🇺", andorra: "🇦🇩",
  liechtenstein: "🇱🇮", monaco: "🇲🇨", ireland: "🇮🇪",
  // Scandinavia
  denmark: "🇩🇰", sweden: "🇸🇪", norway: "🇳🇴", finland: "🇫🇮",
  iceland: "🇮🇸", "faroe islands": "🇫🇴",
  // Eastern Europe
  russia: "🇷🇺", ukraine: "🇺🇦", poland: "🇵🇱", czechia: "🇨🇿",
  "czech republic": "🇨🇿", slovakia: "🇸🇰", hungary: "🇭🇺", romania: "🇷🇴",
  bulgaria: "🇧🇬", "north macedonia": "🇲🇰", macedonia: "🇲🇰",
  albania: "🇦🇱", croatia: "🇭🇷", serbia: "🇷🇸", slovenia: "🇸🇮",
  "bosnia and herzegovina": "🇧🇦", bosnia: "🇧🇦", montenegro: "🇲🇪",
  kosovo: "🇽🇰", moldova: "🇲🇩", belarus: "🇧🇾", belarussia: "🇧🇾",
  latvia: "🇱🇻", estonia: "🇪🇪", lithuania: "🇱🇹",
  greece: "🇬🇷", turkey: "🇹🇷", cyprus: "🇨🇾", malta: "🇲🇹", israel: "🇮🇱",
  // Caucasus
  georgia: "🇬🇪", armenia: "🇦🇲", azerbaijan: "🇦🇿",
  // Central Asia
  kazakhstan: "🇰🇿", uzbekistan: "🇺🇿", kyrgyzstan: "🇰🇬",
  tajikistan: "🇹🇯", turkmenistan: "🇹🇲",
  // Middle East
  iran: "🇮🇷", iraq: "🇮🇶", "saudi arabia": "🇸🇦",
  uae: "🇦🇪", "united arab emirates": "🇦🇪",
  qatar: "🇶🇦", kuwait: "🇰🇼", bahrain: "🇧🇭", oman: "🇴🇲",
  jordan: "🇯🇴", lebanon: "🇱🇧", syria: "🇸🇾", palestine: "🇵🇸",
  // Americas
  usa: "🇺🇸", canada: "🇨🇦", mexico: "🇲🇽",
  brazil: "🇧🇷", argentina: "🇦🇷", chile: "🇨🇱", colombia: "🇨🇴",
  peru: "🇵🇪", uruguay: "🇺🇾", venezuela: "🇻🇪", ecuador: "🇪🇨",
  paraguay: "🇵🇾", bolivia: "🇧🇴",
  "costa rica": "🇨🇷", panama: "🇵🇦", honduras: "🇭🇳",
  "el salvador": "🇸🇻", guatemala: "🇬🇹", nicaragua: "🇳🇮",
  cuba: "🇨🇺", "dominican republic": "🇩🇴",
  // Asia
  japan: "🇯🇵", china: "🇨🇳", "south korea": "🇰🇷", south_korea: "🇰🇷",
  "north korea": "🇰🇵", "korea republic": "🇰🇷",
  india: "🇮🇳", pakistan: "🇵🇰", "hong kong": "🇭🇰", taiwan: "🇹🇼",
  thailand: "🇹🇭", vietnam: "🇻🇳", indonesia: "🇮🇩",
  malaysia: "🇲🇾", philippines: "🇵🇭", singapore: "🇸🇬",
  myanmar: "🇲🇲", cambodia: "🇰🇭", mongolia: "🇲🇳",
  australia: "🇦🇺", "new zealand": "🇳🇿",
  // Africa
  "south africa": "🇿🇦", morocco: "🇲🇦", egypt: "🇪🇬",
  nigeria: "🇳🇬", ghana: "🇬🇭", senegal: "🇸🇳",
  cameroon: "🇨🇲", "ivory coast": "🇨🇮", "cote d'ivoire": "🇨🇮",
  kenya: "🇰🇪", ethiopia: "🇪🇹", algeria: "🇩🇿", tunisia: "🇹🇳",
  "san marino": "🇸🇲",
  // Continental / special
  europe: "🌍", africa: "🌍", southamerica: "🌎",
  asia: "🌏", "north america": "🌎", international: "🌐", world: "🌐",
  // ISO alpha2 codes (SportsAPI V2 may return these)
  gb: "🇬🇧", en: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", sc: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", wl: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  es: "🇪🇸", de: "🇩🇪", it: "🇮🇹", fr: "🇫🇷",
  pt: "🇵🇹", nl: "🇳🇱", be: "🇧🇪", at: "🇦🇹", ch: "🇨🇭",
  lu: "🇱🇺", ad: "🇦🇩", li: "🇱🇮", mc: "🇲🇨", ie: "🇮🇪",
  dk: "🇩🇰", se: "🇸🇪", no: "🇳🇴", fi: "🇫🇮", is: "🇮🇸",
  ru: "🇷🇺", ua: "🇺🇦", pl: "🇵🇱", cz: "🇨🇿", sk: "🇸🇰",
  hu: "🇭🇺", ro: "🇷🇴", bg: "🇧🇬", mk: "🇲🇰", al: "🇦🇱",
  hr: "🇭🇷", rs: "🇷🇸", si: "🇸🇮", ba: "🇧🇦", me: "🇲🇪",
  xk: "🇽🇰", md: "🇲🇩", by: "🇧🇾", lv: "🇱🇻", ee: "🇪🇪", lt: "🇱🇹",
  gr: "🇬🇷", tr: "🇹🇷", cy: "🇨🇾", mt: "🇲🇹", il: "🇮🇱",
  ge: "🇬🇪", am: "🇦🇲", az: "🇦🇿",
  kz: "🇰🇿", uz: "🇺🇿", kg: "🇰🇬", tj: "🇹🇯", tm: "🇹🇲",
  ir: "🇮🇷", iq: "🇮🇶", sa: "🇸🇦", ae: "🇦🇪", qa: "🇶🇦",
  kw: "🇰🇼", bh: "🇧🇭", om: "🇴🇲", jo: "🇯🇴", lb: "🇱🇧", sy: "🇸🇾",
  us: "🇺🇸", ca: "🇨🇦", mx: "🇲🇽",
  br: "🇧🇷", ar: "🇦🇷", cl: "🇨🇱", co: "🇨🇴",
  pe: "🇵🇪", uy: "🇺🇾", ve: "🇻🇪", ec: "🇪🇨", py: "🇵🇾", bo: "🇧🇴",
  cr: "🇨🇷", pa: "🇵🇦", hn: "🇭🇳", sv: "🇸🇻", gt: "🇬🇹", ni: "🇳🇮",
  cu: "🇨🇺", do: "🇩🇴",
  jp: "🇯🇵", cn: "🇨🇳", kr: "🇰🇷", kp: "🇰🇵",
  in: "🇮🇳", pk: "🇵🇰", hk: "🇭🇰", tw: "🇹🇼",
  th: "🇹🇭", vn: "🇻🇳", id: "🇮🇩", my: "🇲🇾", ph: "🇵🇭", sg: "🇸🇬",
  mm: "🇲🇲", kh: "🇰🇭", mn: "🇲🇳",
  au: "🇦🇺", nz: "🇳🇿",
  za: "🇿🇦", ma: "🇲🇦", eg: "🇪🇬", ng: "🇳🇬", gh: "🇬🇭", sn: "🇸🇳",
  cm: "🇨🇲", ci: "🇨🇮", ke: "🇰🇪", et: "🇪🇹", dz: "🇩🇿", tn: "🇹🇳",
  sm: "🇸🇲",
  // Alternative names SportsAPI may use (keys not already in main map above)
  hellas: "🇬🇷", "türkiye": "🇹🇷", fo: "🇫🇴", "south america": "🌎",
};

// Pure helper — compute if a selection won/lost based on a known final score.
// Returns null when the result is still undeterminable (e.g. over/under line not yet crossed).
function decodeCompactLine(token: string): number {
  const raw = String(token ?? "").trim();
  if (!raw) return Number.NaN;
  if (raw.includes(".")) return parseFloat(raw);
  if (/^\d+$/.test(raw) && raw.length >= 2) return parseInt(raw, 10) / 10;
  return parseFloat(raw);
}

function normalizeTicketSelectionKey(selection: string): string {
  let s = String(selection ?? "");
  if (/^tg-([ou][\d.]+)$/.test(s)) s = s.slice(3);
  else if (/^cards-([ou])(\d+)$/.test(s)) {
    const m = s.match(/^cards-([ou])(\d+)$/);
    s = `${m![1]}card${m![2]}`;
  }
  else if (/^corners-([ou])(\d+)$/.test(s)) {
    const m = s.match(/^corners-([ou])(\d+)$/);
    s = `${m![1]}c${m![2]}`;
  }
  return s;
}

function scoreOutcomeForSel(
  sel: { selection: string },
  score: { home: number; away: number }
): "won" | "lost" | null {
  const s = normalizeTicketSelectionKey(sel.selection);
  const { home, away } = score;
  const total = home + away;
  let winning: boolean | null = null;
  if (s === "home")         winning = home > away;
  else if (s === "away")    winning = away > home;
  else if (s === "draw")    winning = home === away;
  else if (s === "homeOrDraw") winning = home >= away;
  else if (s === "awayOrDraw") winning = away >= home;
  else if (s === "homeOrAway") winning = home !== away;
  else if (s === "bts-yes") winning = home > 0 && away > 0;
  else if (s === "bts-no")  winning = home === 0 || away === 0;
  else {
    const m = s.match(/^([ou])([\d.]+)$/);
    if (m) {
      const line = decodeCompactLine(m[2]!);
      winning = m[1] === "o" ? total > line : total < line;
    }
  }
  return winning === null ? null : winning ? "won" : "lost";
}

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

/** Flexible league name matching — handles "Country: League" API prefixes and substring containment */
function normalizeLeagueFilterName(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^[^:]+:\s*/, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCountryFilterName(value: string): string {
  const normalized = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const aliases: Record<string, string> = {
    "eua": "usa",
    "estados unidos": "usa",
    "usa": "usa",
    "inglaterra": "england",
    "espanha": "spain",
    "alemanha": "germany",
    "italia": "italy",
    "franca": "france",
    "holanda": "netherlands",
    "belgica": "belgium",
    "turquia": "turkey",
    "austria": "austria",
    "suica": "switzerland",
    "suecia": "sweden",
    "croacia": "croatia",
    "servia": "serbia",
    "polonia": "poland",
    "rep checa": "czechia",
    "republica checa": "czechia",
    "russia": "russia",
    "ucrania": "ukraine",
    "hungria": "hungary",
    "romenia": "romania",
    "bulgaria": "bulgaria",
    "mexico": "mexico",
    "colombia": "colombia",
    "arabia saudita": "saudi arabia",
    "japao": "japan",
    "coreia do sul": "south korea",
    "tailandia": "thailand",
    "india": "india",
    "internacional": "international",
    "fifa": "international",
    "uefa": "international",
    "europa": "international",
  };

  return aliases[normalized] ?? normalized;
}

function countryMatchesFilter(matchCountry?: string, filterCountry?: string, matchLeague?: string): boolean {
  if (!filterCountry) return true;
  const filterNorm = normalizeCountryFilterName(filterCountry);
  if (!filterNorm) return true;

  const matchCountryNorm = normalizeCountryFilterName(matchCountry ?? "");
  if (matchCountryNorm && (matchCountryNorm === filterNorm || matchCountryNorm.includes(filterNorm) || filterNorm.includes(matchCountryNorm))) {
    return true;
  }

  const rawLeagueNorm = String(matchLeague ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return rawLeagueNorm.includes(filterNorm);
}

function normalizeTeamMatchName(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(fc|cf|sc|ac|afc|fk|bc|basket|club|clube)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowMatchesTeam(rowName: string, teamName: string): boolean {
  const row = normalizeTeamMatchName(rowName);
  const team = normalizeTeamMatchName(teamName);
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

const LEAGUE_FILTER_ALIASES: Record<string, string[]> = {
  champions: ["champions league", "uefa champions league"],
  "europa league": ["europa league", "uefa europa league"],
  conference: ["conference league", "uefa conference league"],
  "fifa world cup": ["fifa world cup", "world cup", "copa do mundo", "wc 2026", "mundial 2026"],
  "international friendlies": ["international friendlies", "international friendly", "amistosos internacionais", "friendly", "friendlies"],
  "premier league": ["premier league"],
  "la liga": ["la liga", "laliga"],
  bundesliga: ["bundesliga"],
  "serie a": ["serie a", "serie a tim", "serie a enilive"],
  "ligue 1": ["ligue 1", "ligue1"],
  "primeira liga": ["primeira liga", "liga portugal", "liga portugal betclic", "liga nos", "liga bwin"],
  eredivisie: ["eredivisie"],
  "super lig": ["super lig", "superlig", "super liga", "super league", "super lig turkey", "super lig turkiye", "super lig türkiye", "super lig turquia", "super lig turkey"],
  "liga mx": ["liga mx"],
  mls: ["mls", "major league soccer"],
  brasileirao: ["brasileirao", "brasileirão", "campeonato brasileiro", "serie a brazil", "brasil serie a"],
  libertadores: ["copa libertadores", "libertadores"],
  "fa cup": ["fa cup"],
  "copa del rey": ["copa del rey"],
  "coppa italia": ["coppa italia"],
  "dfb pokal": ["dfb pokal", "dfl pokal"],
};

function leagueMatchesFilter(matchLeague: string, filterLeague: string): boolean {
  if (!filterLeague) return true;
  const matchNorm = normalizeLeagueFilterName(matchLeague);
  const filterNorm = normalizeLeagueFilterName(filterLeague);
  if (!matchNorm || !filterNorm) return false;

  const aliases = LEAGUE_FILTER_ALIASES[filterNorm] ?? [
    filterNorm,
    filterNorm.replace(/^uefa\s+/, "").replace(/^fifa\s+/, "").trim(),
  ].filter(Boolean);

  return aliases.some((alias) => {
    if (matchNorm === alias) return true;
    return matchNorm.startsWith(`${alias} `);
  });
}

const FOOTBALL_COUNTRIES: { name: string; flag: string; leagues: string[] }[] = [
  { name: "Europa", flag: "⭐", leagues: ["Champions League", "Europa League", "Conference League", "UEFA Super Cup"] },
  { name: "FIFA", flag: "🌍", leagues: ["Copa América", "CONCACAF Gold Cup", "Africa Cup of Nations", "AFC Asian Cup", "International Friendlies"] },
  { name: "UEFA", flag: "⭐", leagues: ["UEFA Champions League", "UEFA Europa League", "UEFA European Championship", "UEFA Nations League"] },
  { name: "Inglaterra", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", leagues: ["Premier League", "EFL Championship", "League One", "League Two", "FA Cup", "EFL Cup", "Community Shield"] },
  { name: "Espanha", flag: "🇪🇸", leagues: ["La Liga", "LaLiga Hypermotion", "Copa del Rey", "Supercopa de España"] },
  { name: "Alemanha", flag: "🇩🇪", leagues: ["Bundesliga", "2. Bundesliga", "3. Liga", "DFB-Pokal", "DFL-Supercup"] },
  { name: "Itália", flag: "🇮🇹", leagues: ["Serie A", "Serie B", "Serie C", "Coppa Italia", "Supercoppa Italiana"] },
  { name: "França", flag: "🇫🇷", leagues: ["Ligue 1", "Ligue 2", "National", "Coupe de France", "Trophée des Champions"] },
  { name: "Portugal", flag: "🇵🇹", leagues: ["Liga Portugal", "Liga Portugal 2", "Taça de Portugal", "Supertaça Cândido de Oliveira"] },
  { name: "Holanda", flag: "🇳🇱", leagues: ["Eredivisie", "Eerste Divisie", "KNVB Cup", "Johan Cruijff Schaal"] },
  { name: "Bélgica", flag: "🇧🇪", leagues: ["Jupiler Pro League", "Belgian First Amateur", "Belgian Cup", "Belgian Super Cup"] },
  { name: "Turquia", flag: "🇹🇷", leagues: ["Süper Lig", "TFF First League", "TFF Second League", "Turkish Cup", "Turkish Super Cup"] },
  { name: "Grécia", flag: "🇬🇷", leagues: ["Super League Greece", "Super League 2", "Greek Cup", "Greek Super Cup"] },
  { name: "Áustria", flag: "🇦🇹", leagues: ["Austrian Bundesliga", "Austrian Football Second League", "Austrian Cup"] },
  { name: "Escócia", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", leagues: ["Scottish Premiership", "Scottish Championship", "Scottish League One", "Scottish Cup"] },
  { name: "Suíça", flag: "🇨🇭", leagues: ["Swiss Super League", "Challenge League", "Swiss Cup"] },
  { name: "Dinamarca", flag: "🇩🇰", leagues: ["Danish Superliga", "Danish 1st Division", "DBU Pokalen"] },
  { name: "Noruega", flag: "🇳🇴", leagues: ["Eliteserien", "Norwegian 1st Division", "Norwegian Cup"] },
  { name: "Suécia", flag: "🇸🇪", leagues: ["Allsvenskan", "Superettan", "Svenska Cupen"] },
  { name: "Croácia", flag: "🇭🇷", leagues: ["HNL", "Croatian Football Cup"] },
  { name: "Sérvia", flag: "🇷🇸", leagues: ["Serbian SuperLiga", "Serbian Cup"] },
  { name: "Polónia", flag: "🇵🇱", leagues: ["Ekstraklasa", "I liga", "Polish Cup"] },
  { name: "Rep. Checa", flag: "🇨🇿", leagues: ["Czech First League", "FNL", "Czech Cup"] },
  { name: "Rússia", flag: "🇷🇺", leagues: ["Russian Premier League", "Russian National League", "Russian Cup"] },
  { name: "Ucrânia", flag: "🇺🇦", leagues: ["Ukrainian Premier League", "Ukrainian Cup"] },
  { name: "Hungria", flag: "🇭🇺", leagues: ["OTP Bank Liga", "Merkantil Bank Liga"] },
  { name: "Roménia", flag: "🇷🇴", leagues: ["Romanian Liga I", "Romanian Liga II"] },
  { name: "Bulgária", flag: "🇧🇬", leagues: ["Parva liga", "Vtora liga"] },
  { name: "Israel", flag: "🇮🇱", leagues: ["Israeli Premier League", "Israeli National League", "State Cup"] },
  { name: "Brasil", flag: "🇧🇷", leagues: ["Brasileirão", "Brasileirão Série B", "Copa do Brasil", "Recopa Sudamericana", "Campeonato Paulista", "Campeonato Carioca", "Copa Sul-Americana"] },
  { name: "Argentina", flag: "🇦🇷", leagues: ["Primera División", "Primera Nacional", "Copa Argentina", "Copa de la Liga Profesional"] },
  { name: "México", flag: "🇲🇽", leagues: ["Liga MX", "Ascenso MX", "Copa MX", "Leagues Cup"] },
  { name: "Chile", flag: "🇨🇱", leagues: ["Primera División — Chile", "Primera B — Chile"] },
  { name: "Colômbia", flag: "🇨🇴", leagues: ["Categoría Primera A", "Categoría Primera B"] },
  { name: "EUA", flag: "🇺🇸", leagues: ["MLS", "USL Championship", "US Open Cup"] },
  { name: "Austrália", flag: "🇦🇺", leagues: ["A-League", "Australia Cup"] },
  { name: "Arábia Saudita", flag: "🇸🇦", leagues: ["Saudi Pro League", "First Division League", "King Cup"] },
  { name: "Japão", flag: "🇯🇵", leagues: ["J1 League", "J2 League", "J3 League", "Emperor's Cup"] },
  { name: "Coreia do Sul", flag: "🇰🇷", leagues: ["K League 1", "K League 2", "Korean FA Cup"] },
  { name: "Tailândia", flag: "🇹🇭", leagues: ["Thai League 1", "Thai League 2"] },
  { name: "Índia", flag: "🇮🇳", leagues: ["Indian Super League", "I-League"] },
];

const OTHER_SPORTS: { key: string; label: string; icon: string; leagues: string[] }[] = [
  { key: "basketball", label: "Basquete", icon: "🏀", leagues: [
    "National Basketball Association",
    "EuroLeague",
    "Liga ACB",
    "Basketball Bundesliga",
    "Lega Basket Serie A",
    "LNB Pro A",
    "Chinese Basketball Association",
    "B.League",
    "National Basketball League",
    "Novo Basquete Brasil",
    "VTB United League",
    "Basketball Super League",
    "Liga Nacional de Básquet",
    "Korean Basketball League",
    "Philippine Basketball Association",
  ]},
  { key: "tennis", label: "Ténis", icon: "🎾", leagues: [
    "Australian Open", "Roland Garros", "Wimbledon", "US Open",
    "ATP Finals", "WTA Finals", "Davis Cup", "Billie Jean King Cup",
    "Indian Wells", "Miami Open", "Madrid Open", "Rome Masters", "Paris Masters", "Canadian Open", "Cincinnati", "Shanghai",
    "Halle Open", "Queen's Club", "Barcelona Open", "Estoril Open", "Dubai", "Rotterdam",
    "ATP 500", "ATP 250", "WTA 1000", "WTA 500", "WTA 250",
    "ATP Challenger", "WTA 125", "ITF",
  ]},
  { key: "hockey", label: "Hóquei no Gelo", icon: "🏒", leagues: [
    "NHL", "AHL", "ECHL",
    "KHL", "VHL",
    "SHL", "HockeyAllsvenskan",
    "Liiga", "Mestis",
    "National League", "Swiss League",
    "Extraliga", "Chance Liga",
    "DEL", "DEL2",
    "ICE Hockey League", "Alps Hockey League",
    "Fjordkraft Ligaen",
    "Metal Ligaen",
    "Slovak Extraliga",
    "Ligue Magnus",
    "Champions Hockey League",
  ]},
  { key: "baseball", label: "Beisebol", icon: "⚾", leagues: [
    "USA: MLB", "MLB",
  ]},
  { key: "volleyball", label: "Voleibol", icon: "🏐", leagues: [
    "SuperLega", "Serie A2 Volley", "Coppa Italia Volley",
    "Superliga Série A", "Superliga Série B", "Copa Brasil Vôlei",
    "PlusLiga", "Tauron 1 Liga", "Polski Puchar Siatkówki",
    "Russian Volleyball Super League",
    "Efeler Ligi", "Turkish Volleyball Cup",
    "SV.League", "V.League 2",
    "Ligue A", "Ligue B Volley",
    "Volleyball Bundesliga",
    "Liga Una Seguros",
    "V-League",
    "Chinese Volleyball League",
    "Liga de Voleibol Argentina",
    "Volleyball Nations League",
  ]},
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
  selectedCountry?: string | null;
  setSelectedCountry?: (c: string | null) => void;
};

function SidebarTreeContent({
  selectedSport, setSelectedSport, setActiveTab, onClose,
  expandedSport, setExpandedSport, expandedCountry, setExpandedCountry, compact,
  topLeagues, selectedLeague, setSelectedLeague, selectedCountry, setSelectedCountry,
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
              const flag = COUNTRY_FLAGS[l.country?.toLowerCase() ?? ""] ?? (l.sport === "basketball" ? "🏀" : l.sport === "tennis" ? "🎾" : l.sport === "hockey" ? "🏒" : l.sport === "volleyball" ? "🏐" : l.sport === "baseball" ? "⚾" : "⚽");
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
        onClick={() => { go("all"); setSelectedLeague?.(null); setSelectedCountry?.(null); }}
        className={`flex items-center gap-2.5 w-full px-2 ${py} rounded-md ${textSize} transition-colors ${selectedSport === "all" && !selectedLeague && !selectedCountry ? "bg-red-600/20 text-red-400 border border-red-500/30" : "hover:bg-zinc-900 text-zinc-400 hover:text-white"}`}
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
                  onClick={() => {
                    const isActive = selectedCountry === name;
                    setExpandedCountry(isActive ? null : name);
                    setSelectedCountry?.(isActive ? null : name);
                    setSelectedLeague?.(null);
                    setSelectedSport("football");
                    setActiveTab("sports");
                    onClose?.();
                  }}
                  className={`flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[12px] transition-colors ${selectedCountry === name ? "bg-red-600/20 text-red-400 border border-red-500/30" : expandedCountry === name ? "bg-zinc-800 text-white" : "hover:bg-zinc-900 text-zinc-400 hover:text-white"}`}
                >
                  <span className="text-xs leading-none shrink-0">{flag}</span>
                  <span className="flex-1 text-left truncate">{name}</span>
                  <ChevronRight size={10} className={`transition-transform shrink-0 ${expandedCountry === name ? "rotate-90 text-red-400" : "text-zinc-600"}`} />
                </button>
                {expandedCountry === name && (
                  <div className="ml-2 mt-0.5 space-y-0.5 border-l border-zinc-800 pl-2">
                    {leagues.map(league => {
                      const active = selectedLeague === league;
                      const logo = LEAGUE_LOGOS[league];
                      return (
                        <button
                          key={league}
                          onClick={() => { setSelectedLeague?.(active ? null : league); setSelectedCountry?.(null); setSelectedSport("football"); setActiveTab("sports"); onClose?.(); }}
                          className={`flex items-center gap-1.5 w-full px-2 py-1 rounded-md text-[11px] transition-colors ${active ? "bg-red-600/20 text-red-400 border border-red-500/30" : "text-zinc-500 hover:text-white hover:bg-zinc-900"}`}
                        >
                          {logo ? (
                            <img src={logo} alt="" className="w-4 h-4 shrink-0 object-contain" loading="lazy" decoding="async" />
                          ) : (
                            <span className="text-xs leading-none shrink-0">{LEAGUE_FLAGS[league] ?? "⚽"}</span>
                          )}
                          <span className="truncate">{league}</span>
                        </button>
                      );
                    })}
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
              {leagues.map(league => {
                const active = selectedLeague === league;
                const logo = LEAGUE_LOGOS[league];
                return (
                  <button
                    key={league}
                    onClick={() => { setSelectedLeague?.(active ? null : league); setSelectedSport(key); setActiveTab("sports"); onClose?.(); }}
                    className={`flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[12px] transition-colors ${active ? "bg-red-600/20 text-red-400 border border-red-500/30" : "text-zinc-400 hover:text-white hover:bg-zinc-900"}`}
                  >
                    {logo ? (
                      <img src={logo} alt="" className="w-4 h-4 shrink-0 object-contain" loading="lazy" decoding="async" />
                    ) : (
                      <span className="text-xs leading-none shrink-0">{LEAGUE_FLAGS[league] ?? "🏆"}</span>
                    )}
                    <span className="truncate">{league}</span>
                  </button>
                );
              })}
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
  period2?: { home: number; draw: number; away: number };
  period3?: { home: number; draw: number; away: number };
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
  // Second half result market (who wins just the 2nd half)
  secondHalf?: { home: number; draw: number; away: number };
  // Football extra-time markets
  etExtra?: {
    tieWinner: { home: number; away: number };              // who advances from the knockout tie (no draw)
    etResult: { home: number; draw: number; away: number }; // ET period result (draw → penalties)
    totalGoals: { o05: number; u05: number; o15: number; u15: number; o25: number; u25: number };
    nextGoal: { home: number; away: number };               // which team scores next in ET
  };
  // Football penalty-shootout markets
  penExtra?: {
    winner: { home: number; away: number };
  };
  // Tennis-specific live markets (injected server-side)
  tennisExtra?: {
    firstSet?: { home: number; away: number };
    setHandicap?: { home: number; away: number };
    gameHandicap?: { line: number; home: number; away: number };
    setExactScore?: Record<string, number>;
    set1ExactScore?: Record<string, number>;
    set2ExactScore?: Record<string, number>;
    currentSetNum?: number;
    [key: string]: unknown;
  };
};

type Match = {
  id: string | number;
  home: string;
  away: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeImageVersion?: string;
  awayImageVersion?: string;
  league: string;
  country?: string;
  time?: string;
  date?: string;
  sport?: string;
  hasRealOdds?: boolean;
  isWomens?: boolean;
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
  // degraded feed signal; must not suspend markets by itself
  _feedWarning?: string;
  // sport-specific live display
  _liveExtra?: {
    clockStr?: string;
    clockSec?: number;
    clockAtMs?: number;
    clockRunning?: boolean;
    kickoffSec?: number;
    sets?: Array<[number, number]>;
    currentPoints?: [number | string, number | string];
    serving?: [boolean, boolean];
    currentPts?: [number, number];
    vollSets?: Array<[number, number]>;
    tennisStats?: [
      { aces: number; doubleFaults: number; firstServePct: string; winners: number; unforcedErrors: number },
      { aces: number; doubleFaults: number; firstServePct: string; winners: number; unforcedErrors: number },
    ];
    periods?: Array<[number, number]>;
    quarters?: Array<[number, number]>;
    innings?: Array<[number, number]>;
    outs?: number;
    homeHits?: number;
    awayHits?: number;
    homeErrors?: number;
    awayErrors?: number;
    etScore?: [number, number];
    penScore?: [number, number];
    htScore?: [number, number];
  };
  // Red cards per team (football only)
  redCardsHome?: number;
  redCardsAway?: number;
  // Minutes until match starts (only present for "Em Breve" pre-match entries)
  startsIn?: number;
  // Scheduled kickoff time (HH:MM, Portugal UTC+1) for "Em Breve" entries
  scheduledTime?: string;
  // Scheduled date (DD.MM.YYYY) for "Em Breve" entries
  scheduledDate?: string;
  // SportsApiPro league ID — used to fetch player markets (football only)
  leagueId?: string;
};

type BetSelection = {
  matchId: string | number;
  matchTitle: string;
  league?: string;
  country?: string;
  sport?: string;
  date?: string;
  time?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  selection: string;
  odd: number;
  market?: string;
  label?: string;
};

type StoredSelection = {
  matchId?: string;
  matchTitle: string;
  league?: string;
  country?: string;
  sport?: string;
  date?: string;
  time?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  selection: string;
  odd: number;
  market?: string;
  label?: string;
  finalScore?: { home: number; away: number };
  htScore?: { htHome: number; htAway: number };
  outcome?: "won" | "lost" | "void" | null;
  settlementNote?: string;
};

type OpenBetSelectionState = {
  matchId?: string;
  outcome: "won" | "lost" | "void" | "pending";
  finalScore?: { home: number; away: number };
  htScore?: { htHome: number; htAway: number };
};

type UserBet = {
  id: number;
  matchTitle: string;
  selections: StoredSelection[] | unknown;
  stake: string;
  potentialWin: string;
  totalOdds: string;
  status: string;
  cashoutValue?: string | null;
  cashoutStatus?: string;
  cashoutReason?: string;
  cashoutEstimate?: string;
  createdAt: string;
  settledAt?: string | null;
  settlementSeconds?: number | null;
  payout?: string | null;
  netProfit?: string | null;
  statusPreview?: "pending" | "won" | "lost" | "void";
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
  formIsReal?: boolean;
};
type StandingRow = { pos: number; name: string; played: number; won: number; drawn: number; lost: number; gf: number; ga: number; pts: number };

const MarketTabCtx = createContext<string>("");
const MarketGroupSeqCtx = createContext<{ next: () => number } | null>(null);
const MarketGroupOpenCtx = createContext<{
  matchId: string;
  getOpen: (key: string, fallback: boolean) => boolean;
  setOpen: (key: string, open: boolean) => void;
} | null>(null);

function nifMask(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 9)
    .replace(/(\d{3})(\d)/, "$1 $2")
    .replace(/(\d{3})(\d)/, "$1 $2");
}

function validatePortugueseNif(nif: string): boolean {
  const digits = nif.replace(/\s/g, "");
  if (!/^\d{9}$/.test(digits)) return false;
  if (!["1","2","3","5","6","7","8","9"].includes(digits[0]!)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += parseInt(digits[i]!) * (9 - i);
  const rem = sum % 11;
  const check = rem < 2 ? 0 : 11 - rem;
  return check === parseInt(digits[8]!);
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
  if (sport === "baseball") return "⚾";

  return "⚽";
}

const LazyWorldCupPage = lazy(() => import("@/pages/world-cup"));

// ─── Animated Copa do Mundo 2026 Banner ──────────────────────────────────────
function AnimatedCopaBanner({ onOpen }: { onOpen: () => void }) {
  // Prefetch WC data when banner mounts so the panel opens instantly
  useEffect(() => {
    fetch("/api/matches/wc2026").catch(() => {});
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl mb-5 cursor-pointer select-none"
      style={{
        background: "linear-gradient(135deg, #0a0015 0%, #1a0030 25%, #2d0050 50%, #1a0015 75%, #0d000a 100%)",
        border: "1px solid rgba(255,100,0,0.25)",
        boxShadow: "0 0 40px rgba(120,0,255,0.15), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
      onClick={onOpen}
      whileTap={{ scale: 0.98 }}
    >
      {/* animated gradient overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        style={{ background: "radial-gradient(ellipse at 80% 50%, rgba(255,90,0,0.18) 0%, transparent 60%), radial-gradient(ellipse at 20% 50%, rgba(120,0,255,0.20) 0%, transparent 60%)" }}
      />

      {/* top scan line */}
      <motion.div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,165,0,0.8), rgba(255,50,50,0.8), rgba(160,0,255,0.8), transparent)" }}
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity }}
      />

      {/* floating orbs */}
      {[
        { cx: "88%", cy: "20%", r: 40, color: "rgba(255,100,0,0.12)", delay: 0 },
        { cx: "10%", cy: "70%", r: 30, color: "rgba(140,0,255,0.14)", delay: 0.8 },
        { cx: "60%", cy: "10%", r: 20, color: "rgba(255,220,0,0.10)", delay: 1.4 },
      ].map((o, i) => (
        <motion.div key={i} className="absolute rounded-full pointer-events-none"
          style={{ width: o.r * 2, height: o.r * 2, background: o.color, left: o.cx, top: o.cy, transform: "translate(-50%,-50%)", filter: "blur(16px)" }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 3 + i, repeat: Infinity, delay: o.delay }}
        />
      ))}

      {/* particle dots */}
      {[...Array(8)].map((_, i) => (
        <motion.div key={`p${i}`} className="absolute rounded-full pointer-events-none"
          style={{ width: 2 + (i % 3), height: 2 + (i % 3), background: i % 3 === 0 ? "#FFD700" : i % 3 === 1 ? "#FF4500" : "#CC00FF", left: `${8 + i * 11}%`, top: `${20 + (i % 4) * 18}%`, filter: "blur(0.5px)" }}
          animate={{ y: [-4, 4, -4], opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.8 + i * 0.3, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}

      <div className="relative z-10 flex items-center gap-3 px-4 py-3.5">
        {/* trophy image */}
        <div className="flex-shrink-0">
          <motion.div
            animate={{ y: [0, -5, 0], rotateY: [0, 12, -12, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            style={{ filter: "drop-shadow(0 0 14px rgba(255,165,0,0.75)) drop-shadow(0 0 28px rgba(255,80,0,0.35))" }}
          >
            <img src={trophyImg} alt="Troféu Copa do Mundo" style={{ width: 82, height: 82, objectFit: "contain" }} />
          </motion.div>
        </div>

        {/* text block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <motion.span
              className="text-[9px] font-black tracking-[0.3em] text-orange-400/90"
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              FIFA · 2026 · AO VIVO
            </motion.span>
            <motion.span
              className="inline-flex items-center gap-1 bg-red-600/20 border border-red-500/40 rounded-full px-1.5 py-0.5"
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse"/>
              <span className="text-[8px] font-black text-red-300 tracking-wider">NOVO</span>
            </motion.span>
          </div>
          <div className="font-black text-white leading-none" style={{ fontSize: "18px", letterSpacing: "-0.02em" }}>
            Copa do{" "}
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(90deg,#FFD700,#FF6B00,#FF00AA)" }}>
              Mundo
            </span>
          </div>
          <div className="text-[10px] text-white/40 mt-0.5 font-medium tracking-wide">Canadá · México · EUA · 48 seleções</div>
        </div>

        {/* CTA */}
        <div className="flex-shrink-0">
          <motion.div
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black text-white"
            style={{ background: "linear-gradient(135deg,#FF4500,#CC0077)", boxShadow: "0 0 12px rgba(255,69,0,0.4)" }}
            animate={{ boxShadow: ["0 0 10px rgba(255,69,0,0.3)", "0 0 20px rgba(255,69,0,0.6)", "0 0 10px rgba(255,69,0,0.3)"] }}
            transition={{ duration: 2, repeat: Infinity }}
            whileHover={{ scale: 1.05 }}
          >
            Apostar
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </motion.div>
        </div>
      </div>

      {/* bottom scan line */}
      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,100,0,0.5), transparent)" }}/>
    </motion.div>
  );
}

export default function Home({ initialTab = "sports" }: { initialTab?: MainTab }) {
  const [, navigate] = useLocation();
  const auth = useAuth();
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => getResolvedTheme(null));
  const isDarkTheme = resolvedTheme === "dark";
  const { isIdle, resetIdle } = useIdle(120_000);
  const isIdleRef = useRef(false);
  useEffect(() => subscribeThemeChange(setResolvedTheme), []);
  useEffect(() => { isIdleRef.current = isIdle; }, [isIdle]);
  const upcomingFetchCtrlRef = useRef<AbortController | null>(null);
  const liveFetchCtrlRef = useRef<AbortController | null>(null);
  const liveFetchInFlightRef = useRef(false);
  const livePollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const livePollBackoffStepRef = useRef(0);
  const sseReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeTab, setActiveTab] = useState<MainTab>(initialTab);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  useEffect(() => {
    const currentPath = window.location.pathname.replace(/\/$/, "") || "/";
    const isLiveRoute = currentPath === "/ao-vivo" || currentPath === "/live";
    if (activeTab === "live") {
      if (!isLiveRoute) navigate("/ao-vivo");
      return;
    }
    if (isLiveRoute) navigate("/");
  }, [activeTab, navigate]);
  const lastTouchAtRef = useRef(0);
  const lastPointerDownAtRef = useRef(0);
  const tapStateRef = useRef<{ x: number; y: number; startedAt: number; moved: boolean } | null>(null);
  const tapStartAt = useCallback((x: number, y: number) => {
    tapStateRef.current = { x, y, startedAt: Date.now(), moved: false };
  }, []);
  const tapMoveAt = useCallback((x: number, y: number) => {
    const s = tapStateRef.current;
    if (!s) return;
    if (Math.abs(x - s.x) > 24 || Math.abs(y - s.y) > 24) s.moved = true;
  }, []);
  const tapTouchStart = useCallback((e: React.TouchEvent) => {
    if (Date.now() - lastPointerDownAtRef.current < 300) return;
    const t = e.touches?.[0];
    if (!t) return;
    tapStartAt(t.clientX, t.clientY);
  }, [tapStartAt]);
  const tapTouchMove = useCallback((e: React.TouchEvent) => {
    if (Date.now() - lastPointerDownAtRef.current < 300) return;
    const s = tapStateRef.current;
    if (!s) return;
    const t = e.touches?.[0];
    if (!t) return;
    tapMoveAt(t.clientX, t.clientY);
  }, [tapMoveAt]);
  const makeTap = useCallback((handler: () => void) => {
    const finish = () => {
      const s = tapStateRef.current;
      tapStateRef.current = null;
      if (!s) return;
      const dt = Date.now() - s.startedAt;
      if (s.moved || dt > 900) {
        lastTouchAtRef.current = Date.now();
        return;
      }
      lastTouchAtRef.current = Date.now();
      handler();
    };
    return {
      onTouchStart: (e: React.TouchEvent) => { tapTouchStart(e); },
      onTouchMove: (e: React.TouchEvent) => { tapTouchMove(e); },
      onTouchEnd: finish,
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType !== "touch") return;
        lastPointerDownAtRef.current = Date.now();
        tapStartAt(e.clientX, e.clientY);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (e.pointerType !== "touch") return;
        tapMoveAt(e.clientX, e.clientY);
      },
      onPointerUp: (e: React.PointerEvent) => {
        if (e.pointerType !== "touch") return;
        finish();
      },
      onPointerCancel: (e: React.PointerEvent) => {
        if (e.pointerType !== "touch") return;
        tapStateRef.current = null;
        lastTouchAtRef.current = Date.now();
      },
      onClick: () => {
        if (Date.now() - lastTouchAtRef.current < 250) return;
        handler();
      },
    };
  }, [tapMoveAt, tapStartAt, tapTouchMove, tapTouchStart]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showWCPanel, setShowWCPanel] = useState(false);
  const [bets, setBets] = useState<BetSelection[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  // Read pending bet from World Cup page (written to localStorage at /copa-do-mundo)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("wc_pending_bet");
      if (!raw) return;
      localStorage.removeItem("wc_pending_bet");
      const pending = JSON.parse(raw) as {
        matchId: string; home: string; away: string;
        selection: string; market: string; label: string; odd: number; sport: string;
      };
      if (!pending?.matchId || !Number.isFinite(pending?.odd)) return;
      setBets(prev => {
        if (prev.some(b => b.matchId === pending.matchId && b.market === pending.market && b.selection === pending.selection)) return prev;
        return [...prev, {
          matchId: pending.matchId,
          matchTitle: `${pending.home} vs ${pending.away}`,
          league: "Copa do Mundo 2026",
          country: "Internacional",
          sport: pending.sport ?? "football",
          date: "", time: "",
          selection: pending.selection,
          odd: pending.odd,
          market: pending.market ?? "resultado",
          label: pending.label ?? pending.selection,
        }];
      });
    } catch { /* silent */ }
  }, []);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [expandedMatch, setExpandedMatch] = useState<Match | null>(null);
  const [betSlipOpenMobile, setBetSlipOpenMobile] = useState(false);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [betMode, setBetMode] = useState<"simples" | "multipla">("multipla");
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [showAppBanner, setShowAppBanner] = useState(() => {
    try { return !localStorage.getItem("bet62_app_banner_dismissed"); } catch { return true; }
  });

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
  const [cashoutExpandedId, setCashoutExpandedId] = useState<number | null>(null);
  const [betFilterTab, setBetFilterTab] = useState<"abertas" | "resolvidas" | "cashout" | "anuladas">("abertas");
  const myBetsInitialized = useRef(false);
  const [collapsedBets, setCollapsedBets] = useState<Set<number>>(new Set());
  const [winAnim, setWinAnim] = useState<{ amount: number; title: string } | null>(null);
  const [cashoutAnim, setCashoutAnim] = useState<{ amount: number } | null>(null);
  const [betPlacedAnim, setBetPlacedAnim] = useState(false);
  const prevWonBetIds = useRef<Set<number> | null>(null);
  const openBetsSseRef = useRef<EventSource | null>(null);
  const openBetsSseReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLiveMatchesRef = useRef<Match[]>([]);
  // Always-current mirror of liveMatches state — lets effects read the current
  // value without adding liveMatches / liveMatches.length to their dep arrays
  // (which would restart intervals on every 5-second poll response).
  const liveMatchesRef = useRef<Match[]>([]);
  // WC live matches kept separate so bet ticket can show "AO VIVO" for WC bets
  const wcLiveForTicketRef = useRef<Match[]>([]);
  // SSE connection for real-time live updates
  const sseRef = useRef<EventSource | null>(null);
  const sseActiveRef = useRef(false); // true when SSE is connected and receiving data
  const liveExpandedFullFetchRef = useRef<string | null>(null);
  const livePrefetchingRef = useRef<Set<string>>(new Set());
  const liveTennisHydratingRef = useRef<Set<string>>(new Set());
  const finishedMatchScores = useRef<Map<string, { home: number; away: number }>>(new Map());

  // Deposit modal
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [promoNotif, setPromoNotif] = useState<null | { type: "freebets10" | "freebets20" | "bonus100" | "cashback"; amount?: number }>(null);

  // Cashback state
  const [cashbackData, setCashbackData] = useState<{ totalLost: number; cashback: number; bets: number } | null>(null);

  // Live matches
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveTransport, setLiveTransport] = useState<LiveTransport>(initialTab === "live" ? "cache" : "idle");
  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [liveSportFilter, setLiveSportFilter] = useState<string>("all");
  const [liveSearchQuery, setLiveSearchQuery] = useState<string>("");
  const prevLiveOdds = useRef<Record<string, Odds>>({});
  // Flat map of "market:sel" → previous odd value, for arrows in MarketOddsBtn
  const prevLiveMarkets = useRef<Record<string, Record<string, number>>>({}); 
  // Grace period: track last time each match was seen in the API response (ms timestamp)
  const matchLastSeenRef = useRef<Record<string, number>>({});
  // Consecutive miss count: how many full-sync responses each match was absent from.
  // A match must be absent from 2+ consecutive responses before it can be removed.
  const matchMissCountRef = useRef<Record<string, number>>({});
  const emptyLiveStreakRef = useRef(0);
  // Live minute ticker — interpolates clock between API refreshes
  const liveDataFetchedAt = useRef(0);
  const apiMinutesRef = useRef<Record<string, number>>({});
  // Per-match: timestamp when the API minute value last CHANGED (not just when SSE arrived).
  // Used so elapsed grows correctly between events (API only updates minute on goals/cards).
  const minuteChangedAtRef = useRef<Record<string, number>>({});
  const seenMatchIds = useRef(new Set<string>());
  const [, setMinuteTick] = useState(0);

  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "live" || browserOnline) return;
    setLiveTransport("cache");
  }, [activeTab, browserOnline]);

  // Upcoming matches
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [selectedSport, setSelectedSport] = useState<string>("all");
  const [upcomingSearchQuery, setUpcomingSearchQuery] = useState<string>("");

  // Recent tennis results (yesterday)
  type TennisResult = {
    id: string; home: string; away: string;
    sets: Array<[number, number]>; homeWon: boolean;
    status: string; tournament: string; date: string; time: string;
  };
  const [recentResults, setRecentResults] = useState<TennisResult[]>([]);

  // NBA results yesterday
  type BasketballResult = {
    id: string; home: string; away: string;
    homeScore: number; awayScore: number;
    quarters: Array<[number, number]>; homeWon: boolean;
    league: string; country: string; date: string; time: string;
  };
  const [basketballResults, setBasketballResults] = useState<BasketballResult[]>([]);
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

  type MLBResult = {
    id: string; home: string; away: string;
    homeScore: number; awayScore: number;
    homeHits: number; awayHits: number;
    homeErrors: number; awayErrors: number;
    innings: Array<[number | null, number | null]>;
    hasExtra: boolean;
    homeWon: boolean;
    league: string; country: string; date: string; time: string;
  };
  const [mlbResults, setMlbResults] = useState<MLBResult[]>([]);

  type NHLTeamStats = {
    shotsOnGoal: number; savesPct: number;
    ppGoals: number; ppPct: number;
    penKillPct: number; faceoffPct: number; penaltyMinutes: number;
  };
  type BasketballScheduleMatch = {
    id: string; date: string; time: string; status: string; venue?: string;
    home: string; away: string;
    homeScore: number; awayScore: number;
    quarters: Array<[number, number]>;
    homeWon?: boolean;
  };
  type BasketballScheduleData = {
    league: string; season: string;
    upcomingMatches: BasketballScheduleMatch[];
    recentMatches: BasketballScheduleMatch[];
  };
  const [basketballSchedule, setBasketballSchedule] = useState<BasketballScheduleData | null>(null);

  type MLBScheduleMatch = {
    id: string; date: string; time: string; status: string; venue?: string;
    home: string; away: string;
    homeScore: number; awayScore: number;
    homeWon?: boolean;
  };
  type MLBScheduleData = {
    league: string; season: string;
    upcomingMatches: MLBScheduleMatch[];
    recentMatches: MLBScheduleMatch[];
  };
  const [mlbSchedule, setMlbSchedule] = useState<MLBScheduleData | null>(null);

  type NBAStandingsTeam = {
    id: string; name: string; abbr: string; position: number;
    won: number; lost: number; pct: string; gb: string;
    streak: string; lastTen: string; homeRecord: string; roadRecord: string;
    ppg: string; papg: string; diff: string;
  };
  type NBAStandingsDivision = { name: string; teams: NBAStandingsTeam[] };
  type NBAStandingsConference = { name: string; divisions: NBAStandingsDivision[] };
  type NBAStandingsData = { season: string; conferences: NBAStandingsConference[] };
  const [basketballStandings, setBasketballStandings] = useState<NBAStandingsData | null>(null);

  type NBAPlayer = { id: string; name: string; number: string; age: number; position: string; college: string; height: string; weight: string; salary: string };
  type NBATeamRoster = { teamName: string; abbreviation: string; season: string; players: NBAPlayer[] };
  const [basketballRosters, setBasketballRosters] = useState<Record<string, NBATeamRoster>>({});
  const [selectedBballRoster, setSelectedBballRoster] = useState<string | null>(null);
  const [bballRosterLoading, setBballRosterLoading] = useState(false);
  const [bballPanelTab, setBballPanelTab] = useState<"roster" | "stats" | "injuries">("roster");

  type NBAInjuryReport = { playerName: string; playerId: string; status: string; description: string; date: string };
  type NBAInjuriesData = { teamName: string; report: NBAInjuryReport[] };
  const [bballInjuries, setBballInjuries] = useState<Record<string, NBAInjuriesData>>({});
  const [bballInjuriesLoading, setBballInjuriesLoading] = useState(false);

  type NBAPlayerStat = {
    id: string; rank: number; name: string;
    gp: number; gs: number; min: string;
    ppg: string; apg: string; rpg: string; orpg: string; drpg: string;
    bpg: string; spg: string; topg: string; fpg: string;
    fgPct: string; fg3Pct: string; ftPct: string;
    fgm: string; fga: string; fg3m: string; fg3a: string; ftm: string; fta: string;
  };
  type NBATeamStatsData = { teamName: string; players: NBAPlayerStat[] };
  const [bballTeamStats, setBballTeamStats] = useState<Record<string, NBATeamStatsData>>({});
  const [bballStatsLoading, setBballStatsLoading] = useState(false);

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

  type MLBStandingsTeam = {
    id: string; name: string; position: number;
    won: number; lost: number; gamesBack: string;
    streak: string; homeRecord: string; awayRecord: string;
    runsScored: number; runsAllowed: number; runsDiff: string;
  };
  type MLBStandingsDivision = { name: string; teams: MLBStandingsTeam[] };
  type MLBStandingsLeague  = { name: string; divisions: MLBStandingsDivision[] };
  type MLBStandingsData    = { season: string; leagues: MLBStandingsLeague[] };
  const [mlbStandings, setMlbStandings] = useState<MLBStandingsData | null>(null);

  type MLBRosterPlayer = {
    id: string; name: string; number: string; age: number;
    position: string; height: string; weight: string; bats: string; throws: string; salary: string;
  };
  type MLBRosterPosition = { name: string; players: MLBRosterPlayer[] };
  type MLBRosterData = { teamName: string; abbreviation: string; season: string; positions: MLBRosterPosition[] };
  const [mlbRosters, setMlbRosters] = useState<Record<string, MLBRosterData>>({});
  const [selectedMLBRoster, setSelectedMLBRoster] = useState<string | null>(null);
  const [mlbRosterLoading, setMlbRosterLoading] = useState(false);
  const [mlbPanelTab, setMlbPanelTab] = useState<"roster" | "stats" | "injuries">("roster");

  type MLBInjuryReport = { playerName: string; playerId: string; status: string; description: string; date: string };
  type MLBInjuriesData = { teamName: string; report: MLBInjuryReport[] };
  const [mlbInjuries, setMlbInjuries] = useState<Record<string, MLBInjuriesData>>({});
  const [mlbInjuriesLoading, setMlbInjuriesLoading] = useState(false);

  type MLBLeaderBatter = {
    rank: string; name: string; team: string; gp: string;
    atBats: string; hits: string; doubles: string; triples: string;
    homeRuns: string; runs: string; rbi: string; stolenBases: string;
    walks: string; strikeouts: string; avg: string; obp: string; slg: string;
  };
  type MLBLeagueStatsData = { batters: MLBLeaderBatter[] };
  const [mlbLeagueStats, setMlbLeagueStats] = useState<MLBLeagueStatsData | null>(null);
  const [mlbLeagueStatsLoading, setMlbLeagueStatsLoading] = useState(false);
  const [mlbLigaSubTab, setMlbLigaSubTab] = useState<"avg" | "hr" | "rbi" | "sb">("avg");

  type MLBBatterStat = {
    id: string; rank: number; name: string; gp: number;
    ab: number; h: number; avg: string; obp: string; slg: string;
    r: number; rbi: number; hr: number; doubles: number; triples: number;
    sb: number; bb: number; so: number;
  };
  type MLBPitcherStat = {
    id: string; rank: number; name: string; gp: number; gs: number;
    era: string; w: number; l: number; ip: string;
    so: number; bb: number; h: number; hr: number; whip: string; baa: string;
  };
  type MLBTeamStatsData = { teamName: string; season: string; batters: MLBBatterStat[]; pitchers: MLBPitcherStat[] };
  const [mlbTeamStats, setMlbTeamStats] = useState<Record<string, MLBTeamStatsData>>({});
  const [mlbStatsLoading, setMlbStatsLoading] = useState(false);

  const MLB_ABBR: Record<string, string> = {
    "Arizona Diamondbacks":"ari","Atlanta Braves":"atl","Baltimore Orioles":"bal",
    "Boston Red Sox":"bos","Chicago Cubs":"chc","Chicago White Sox":"cws",
    "Cincinnati Reds":"cin","Cleveland Guardians":"cle","Colorado Rockies":"col",
    "Detroit Tigers":"det","Houston Astros":"hou","Kansas City Royals":"kc",
    "Los Angeles Angels":"laa","Los Angeles Dodgers":"lad","Miami Marlins":"mia",
    "Milwaukee Brewers":"mil","Minnesota Twins":"min","New York Mets":"nym",
    "New York Yankees":"nyy","Oakland Athletics":"oak","Sacramento Athletics":"oak",
    "Philadelphia Phillies":"phi","Pittsburgh Pirates":"pit","San Diego Padres":"sd",
    "San Francisco Giants":"sf","Seattle Mariners":"sea","St. Louis Cardinals":"stl",
    "Tampa Bay Rays":"tb","Texas Rangers":"tex","Toronto Blue Jays":"tor",
    "Washington Nationals":"wsh",
  };

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
    markets?: any;
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
    btts?: { yes: number; no: number };
    doubleChance?: { homeOrDraw: number; homeOrAway: number; drawOrAway: number };
    p1Odds?: { home: number; draw: number; away: number };
    p2Odds?: { home: number; draw: number; away: number };
    p3Odds?: { home: number; draw: number; away: number };
    markets?: any;
  };
  const [hockeyOddsMatches, setHockeyOddsMatches] = useState<HockeyOddsEntry[]>([]);

  type MLBOddsEntry = {
    matchId: string; date: string; time: string;
    homeTeam: { id: string; name: string }; awayTeam: { id: string; name: string };
    homeOdds: number; drawOdds: number; awayOdds: number;
    markets?: AdvancedMarkets;
  };
  const [mlbOddsMatches, setMlbOddsMatches] = useState<MLBOddsEntry[]>([]);

  type NBAOddsEntry = {
    matchId: string; date: string; time: string;
    homeTeam: { id: string; name: string }; awayTeam: { id: string; name: string };
    homeOdds: number; awayOdds: number;
    halfOdds?: { home: number; away: number };
    q1Odds?: { home: number; away: number };
    q2Odds?: { home: number; away: number };
    q3Odds?: { home: number; away: number };
    q4Odds?: { home: number; away: number };
    markets?: any;
  };
  const [basketballOddsMatches, setBasketballOddsMatches] = useState<NBAOddsEntry[]>([]);

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
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  // Top Competições — computed from live + upcoming matches
  const PRIORITY_LEAGUES = [
    "UEFA Champions League", "Champions League",
    "Premier League", "La Liga", "Bundesliga", "Serie A",
    "Ligue 1", "Liga Portugal", "Eredivisie",
    "Copa do Brasil", "Brasileirão", "Serie B",
    "Copa del Rey", "DFB-Pokal", "FA Cup",
    "Europa League", "UEFA Europa League",
    "Conference League", "Liga MX", "A-League", "National Basketball League",
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

  // ── Lock screen state ────────────────────────────────────────────────────────
  const [isLocked, setIsLocked] = useState(false);
  const isLockedRef = useRef(false);
  const [lockPassword, setLockPassword] = useState("");
  const [lockError, setLockError] = useState("");
  const [lockLoading, setLockLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricCredentialId, setBiometricCredentialId] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [showBiometricSetup, setShowBiometricSetup] = useState(false);

  // Sync isLocked → ref (used in async callbacks)
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") resetIdle();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [resetIdle]);

  // Check WebAuthn platform authenticator availability + stored credential
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("bet62_biometric_credential");
      if (stored) setBiometricCredentialId(stored);
    } catch { /* private browsing */ }
    if (window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(ok => setBiometricAvailable(ok))
        .catch(() => setBiometricAvailable(false));
    }
  }, []);

  useEffect(() => {
    if (!isIdle || isLockedRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      resetIdle();
      return;
    }
    if (!auth.user) return;
    if (!(biometricAvailable && biometricCredentialId)) return;
    setLockError("");
    setIsLocked(true);
  }, [isIdle, auth.user, biometricAvailable, biometricCredentialId, resetIdle]);

  // ── Tab scroll ref ────────────────────────────────────────────────────────────
  const tabContainerRef = useRef<HTMLDivElement | null>(null);

  // Scroll a tab button into the center of the tab container.
  // Uses getBoundingClientRect for viewport-relative accuracy (works inside any
  // nested scroll container or CSS transform). Called only on explicit click or
  // programmatic tab switch — never from a polling-triggered re-render.
  const scrollTabIntoView = useCallback((key: string, behavior: ScrollBehavior = "smooth") => {
    const el = tabContainerRef.current;
    if (!el) return;
    const btn = el.querySelector(`[data-tab="${key}"]`) as HTMLElement | null;
    if (!btn) return;
    const elRect  = el.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const current = el.scrollLeft;
    const target  = current + (btnRect.left - elRect.left) - elRect.width / 2 + btnRect.width / 2;
    el.scrollTo({ left: Math.max(0, target), behavior });
  }, []);

  // Match detail view tab
  const [matchViewTab, setMatchViewTab] = useState<"markets" | "stats" | "standings" | "live" | "yesterday" | "ranking" | "liga" | "odds" | "lineups" | "confrontos">("markets");
  // Market sub-tab — lifted here so live refreshes don't unmount MatchModalMarkets and reset the selection
  const [modalTab, setModalTab] = useState("todos");
  const marketGroupSeqRef = useRef(0);
  const marketGroupSeqApi = useMemo(() => ({
    next: () => {
      marketGroupSeqRef.current += 1;
      return marketGroupSeqRef.current;
    }
  }), []);
  const [marketGroupOpenMap, setMarketGroupOpenMap] = useState<Record<string, boolean>>({});
  const marketGroupOpenApi = useMemo(() => ({
    getOpen: (key: string, fallback: boolean) => marketGroupOpenMap[key] ?? fallback,
    setOpen: (key: string, open: boolean) => setMarketGroupOpenMap(prev => (prev[key] === open ? prev : { ...prev, [key]: open })),
  }), [marketGroupOpenMap]);
  const [matchStats, setMatchStats] = useState<MatchStatsData | null>(null);
  const [matchStatsLoading, setMatchStatsLoading] = useState(false);
  type V2StatsGroup = { title: string; rows: Array<{ name: string; home: string; away: string }> };
  type V2IncidentKind = "goal" | "corner" | "card" | "sub" | "other";
  type V2Incident = {
    key: string;
    time: string;
    minute: number | null;
    team: "home" | "away" | "neutral";
    kind: V2IncidentKind;
    card: "yellow" | "red" | null;
    score?: string;
    title: string;
    detail: string;
  };
  const [v2StatsGroups, setV2StatsGroups] = useState<V2StatsGroup[] | null>(null);
  const [v2StatsLoading, setV2StatsLoading] = useState(false);
  const [showAllV2Stats, setShowAllV2Stats] = useState(false);
  const [v2StatsFetchedAt, setV2StatsFetchedAt] = useState(0);
  const [v2Incidents, setV2Incidents] = useState<V2Incident[] | null>(null);
  const [v2IncidentsLoading, setV2IncidentsLoading] = useState(false);
  const [v2IncidentsFetchedAt, setV2IncidentsFetchedAt] = useState(0);
  const v2StatsCacheRef = useRef<Record<string, V2StatsGroup[]>>({});
  const v2IncidentsCacheRef = useRef<Record<string, V2Incident[]>>({});
  const [liveAdvancedTab, setLiveAdvancedTab] = useState<"all" | "goals" | "corners" | "cards">("all");
  const [livePollTick, setLivePollTick] = useState(0);
  const [standings, setStandings] = useState<StandingRow[] | null>(null);
  const [standingsGroups, setStandingsGroups] = useState<Array<{ name: string; rows: StandingRow[] }> | null>(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsLeague, setStandingsLeague] = useState("");
  type AllOddsMarket = { name: string; group: string; choices: Array<{ name: string; label: string; odds: number }> };
  type LineupsV2Player = { name: string; shortName?: string; position: string; number: string; rating?: number };
  type LineupsV2 = { confirmed: boolean; home: { formation?: string; starters: LineupsV2Player[]; bench: LineupsV2Player[] }; away: { formation?: string; starters: LineupsV2Player[]; bench: LineupsV2Player[] } };
  const getProviderMatchId = useCallback((matchId: string | number | undefined | null): string => {
    return String(matchId ?? "").replace(/^[a-z]+-v\d+-/, "");
  }, []);
  const sanitizeAllOddsMarkets = useCallback((rawMarkets: unknown): AllOddsMarket[] => {
    if (!Array.isArray(rawMarkets)) return [];
    return rawMarkets
      .map((market): AllOddsMarket | null => {
        if (!market || typeof market !== "object") return null;
        const rawMarket = market as Record<string, unknown>;
        const choices = Array.isArray(rawMarket.choices)
          ? rawMarket.choices
              .map((choice) => {
                if (!choice || typeof choice !== "object") return null;
                const rawChoice = choice as Record<string, unknown>;
                const odds = typeof rawChoice.odds === "number" ? rawChoice.odds : Number(rawChoice.odds);
                if (!Number.isFinite(odds) || odds < 1.01) return null;
                return {
                  name: String(rawChoice.name ?? "").trim(),
                  label: String(rawChoice.label ?? rawChoice.name ?? "").trim() || "Opção",
                  odds,
                };
              })
              .filter((choice): choice is { name: string; label: string; odds: number } => !!choice)
          : [];
        if (choices.length === 0) return null;
        return {
          name: String(rawMarket.name ?? "").trim() || "Mercado",
          group: String(rawMarket.group ?? "").trim(),
          choices,
        };
      })
      .filter((market): market is AllOddsMarket => !!market);
  }, []);
  const [allOddsData, setAllOddsData] = useState<AllOddsMarket[] | null>(null);
  const [allOddsLoading, setAllOddsLoading] = useState(false);
  const [allOddsSectionOpen, setAllOddsSectionOpen] = useState<Record<string, boolean>>({});
  const [allOddsQuery, setAllOddsQuery] = useState("");
  const allOddsSections = useMemo(() => {
    if (!allOddsData || allOddsData.length === 0) return [];

    const sectionOrder = ["Principal", "Golos", "Jogadores", "Cantos", "Cartões", "Equipas", "Tempos", "Sets", "Games", "Outros"];
    const marketOrderHints = [
      "Resultado Final",
      "Dupla Hipótese",
      "Empate Anula Aposta",
      "Handicap",
      "Handicap Asiático",
      "Ambas Marcam",
      "Total de Golos",
      "Primeira Equipa a Marcar",
      "Última Equipa a Marcar",
      "Marcador a Qualquer Momento",
      "Primeiro Marcador",
      "Último Marcador",
      "Total de Cantos",
      "Total de Cartões",
      "Resultado Exato",
    ];
    const isFeaturedMarket = (market: AllOddsMarket): boolean => (
      market.name.includes("Resultado Final") ||
      market.name.includes("Dupla Hipótese") ||
      market.name.includes("Empate Anula Aposta") ||
      market.name.includes("Ambas Marcam") ||
      market.name.includes("Total de Golos") ||
      market.name.includes("Marcador a Qualquer Momento") ||
      market.name.includes("Primeiro Marcador") ||
      market.name.includes("Último Marcador")
    );
    const inferSection = (market: AllOddsMarket): string => {
      const group = (market.group || "").toLowerCase();
      const name = (market.name || "").toLowerCase();
      if (group.includes("principal") || name.includes("resultado final") || name.includes("dupla hipótese") || name.includes("empate anula")) return "Principal";
      if (group.includes("golo") || name.includes("golo") || name.includes("marcador")) return "Golos";
      if (group.includes("jogador") || name.includes("jogador") || name.includes("assistências") || name.includes("remates") || name.includes("passes") || name.includes("desarmes") || name.includes("cartões do jogador")) return "Jogadores";
      if (group.includes("cantos") || name.includes("cantos")) return "Cantos";
      if (group.includes("cartões") || name.includes("cartões")) return "Cartões";
      if (group.includes("equipas") || name.includes("equipa")) return "Equipas";
      if (group.includes("tempos") || name.includes("tempo")) return "Tempos";
      if (group.includes("sets") || name.includes("set")) return "Sets";
      if (group.includes("games") || name.includes("game")) return "Games";
      return "Outros";
    };
    const orderMarketName = (name: string): number => {
      const idx = marketOrderHints.findIndex(hint => name.includes(hint));
      return idx === -1 ? 999 : idx;
    };

    const grouped = new Map<string, Array<{ market: AllOddsMarket; originalIndex: number }>>();
    allOddsData.forEach((market, originalIndex) => {
      const section = inferSection(market);
      const rows = grouped.get(section) ?? [];
      rows.push({ market, originalIndex });
      grouped.set(section, rows);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => {
        const aIdx = sectionOrder.indexOf(a[0]);
        const bIdx = sectionOrder.indexOf(b[0]);
        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
      })
      .map(([section, markets]) => ({
        section,
        markets: [...markets].sort((a, b) => {
          const nameOrder = orderMarketName(a.market.name) - orderMarketName(b.market.name);
          if (nameOrder !== 0) return nameOrder;
          const groupOrder = a.market.group.localeCompare(b.market.group, "pt");
          if (groupOrder !== 0) return groupOrder;
          return a.market.name.localeCompare(b.market.name, "pt");
        }).map((entry) => ({
          ...entry,
          featured: isFeaturedMarket(entry.market),
        })),
      }));
  }, [allOddsData]);
  const filteredAllOddsSections = useMemo(() => {
    const query = allOddsQuery.trim().toLowerCase();
    if (!query) return allOddsSections;
    return allOddsSections
      .map(section => ({
        ...section,
        markets: section.markets.filter(({ market }) => {
          const haystack = [
            section.section,
            market.group,
            market.name,
            ...market.choices.map(choice => choice.label),
          ].join(" ").toLowerCase();
          return haystack.includes(query);
        }),
      }))
      .filter(section => section.markets.length > 0);
  }, [allOddsQuery, allOddsSections]);
  const selectedAllOddsSections = useMemo(() => {
    const currentMatchId = expandedMatch?.id;
    return filteredAllOddsSections.map(section => {
      const markets = section.markets.map(entry => {
        const choices = entry.market.choices.map((choice, ci) => {
          const marketKey = `all_${entry.originalIndex}_${ci}`;
          const isSelected = !!bets.find(b => b.matchId === currentMatchId && b.market === marketKey);
          return { ...choice, ci, marketKey, isSelected };
        });
        const selectedCount = choices.filter(choice => choice.isSelected).length;
        return {
          ...entry,
          choices,
          selectedCount,
          hasSelection: selectedCount > 0,
        };
      });
      const selectedCount = markets.reduce((acc, market) => acc + market.selectedCount, 0);
      return {
        ...section,
        markets,
        selectedCount,
        hasSelection: selectedCount > 0,
      };
    });
  }, [bets, expandedMatch?.id, filteredAllOddsSections]);
  useEffect(() => {
    if (allOddsSections.length === 0) return;
    setAllOddsSectionOpen(prev => {
      const next: Record<string, boolean> = {};
      for (const section of allOddsSections) {
        next[section.section] = prev[section.section] ?? ["Principal", "Golos", "Jogadores"].includes(section.section);
      }
      return next;
    });
  }, [allOddsSections]);
  const [lineupsData, setLineupsData] = useState<LineupsV2 | null>(null);
  const [lineupsLoading, setLineupsLoading] = useState(false);
  type H2HMeeting = { date: string; team1: string; team2: string; score1: number; score2: number; league: string; country?: string };
  type ConfrontosData = { homeWins: number; awayWins: number; draws: number; recentMeetings: H2HMeeting[]; team1Name: string; team2Name: string; sport: string };
  const [confrontosData, setConfrontosData] = useState<ConfrontosData | null>(null);
  const [confrontosLoading, setConfrontosLoading] = useState(false);

  // Player markets (football "Jogadores" tab) — per-match, filtered to the two match teams
  type PlayerMarket = { id: string; name: string; team: string; teamId: string; appearances: number; stat: number; odds: number; line?: number; side?: "over" | "under" };
  type TeamPlayerMarkets = {
    teamName: string; teamId: string;
    anytimeScorers: PlayerMarket[];
    firstScorers: PlayerMarket[];
    lastScorers: PlayerMarket[];
    twoPlusGoals: PlayerMarket[];
    hatTricks: PlayerMarket[];
    notToScore: PlayerMarket[];
    firstHalfScorers: PlayerMarket[];
    secondHalfScorers: PlayerMarket[];
    assists: PlayerMarket[];
    assistLines: PlayerMarket[];
    shots: PlayerMarket[];
    shotsOnTarget: PlayerMarket[];
    passes: PlayerMarket[];
    tackles: PlayerMarket[];
    scoreAndAssist: PlayerMarket[];
    bookings: PlayerMarket[];
    bookingLines: PlayerMarket[];
    redCards: PlayerMarket[];
  };
  type PlayerMarketsData = { leagueName: string; country: string; home: TeamPlayerMarkets | null; away: TeamPlayerMarkets | null };
  const [playerMarkets, setPlayerMarkets] = useState<PlayerMarketsData | null>(null);
  const [playerMarketsLoading, setPlayerMarketsLoading] = useState(false);
  const [playerMarketsMatchId, setPlayerMarketsMatchId] = useState<string | null>(null);

  const extractV2StatsGroups = (payload: any): V2StatsGroup[] => {
    const root = payload?.data ?? payload;
    const groups: any[] =
      root?.statistics ??
      root?.groups ??
      root?.statisticsGroups ??
      root?.data?.statistics ??
      root?.data?.groups ??
      [];
    if (!Array.isArray(groups) || groups.length === 0) return [];

    const toText = (v: unknown): string => {
      if (v === null || typeof v === "undefined") return "";
      if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
      if (typeof v === "boolean") return v ? "Sim" : "Não";
      if (typeof v === "string") return v;
      return String(v);
    };

    const pickHomeAway = (item: any): { home: string; away: string } => {
      const home = item?.home ?? item?.homeValue ?? item?.homeStat ?? item?.homeTeam ?? item?.valueHome ?? item?.value?.home ?? item?.values?.home;
      const away = item?.away ?? item?.awayValue ?? item?.awayStat ?? item?.awayTeam ?? item?.valueAway ?? item?.value?.away ?? item?.values?.away;
      return { home: toText(home), away: toText(away) };
    };

    return groups
      .map((g: any) => {
        const title = String(g?.groupName ?? g?.name ?? g?.title ?? "").trim();
        const items: any[] =
          g?.statisticsItems ??
          g?.items ??
          g?.statistics ??
          g?.rows ??
          g?.data ??
          [];
        if (!Array.isArray(items) || items.length === 0) return null;
        const rows = items
          .map((it: any) => {
            const name = String(it?.name ?? it?.title ?? it?.key ?? it?.statName ?? "").trim();
            const { home, away } = pickHomeAway(it);
            if (!name || (!home && !away)) return null;
            return { name, home, away };
          })
          .filter(Boolean) as Array<{ name: string; home: string; away: string }>;
        if (rows.length === 0) return null;
        return { title: title || "Estatísticas", rows } satisfies V2StatsGroup;
      })
      .filter(Boolean) as V2StatsGroup[];
  };

  const extractV2Incidents = (payload: any): V2Incident[] => {
    const root = payload?.data ?? payload;
    const arr: any[] =
      root?.incidents ??
      root?.events ??
      root?.timeline ??
      root?.data?.incidents ??
      [];
    if (!Array.isArray(arr) || arr.length === 0) return [];

    const toText = (v: unknown): string => {
      if (v === null || typeof v === "undefined") return "";
      if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
      if (typeof v === "boolean") return v ? "Sim" : "Não";
      if (typeof v === "string") return v;
      return String(v);
    };

    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

    const parseMinute = (raw: string): number | null => {
      const s = raw.trim();
      if (!s) return null;
      const parts = s.split("+").map(p => p.trim()).filter(Boolean);
      const base = Number.parseInt(parts[0] ?? "", 10);
      if (!Number.isFinite(base)) return null;
      const extra = parts.length > 1 ? Number.parseInt(parts[1] ?? "", 10) : 0;
      return base + (Number.isFinite(extra) ? extra : 0);
    };

    return arr
      .map((e: any, idx: number) => {
        const minute = e?.time ?? e?.minute ?? e?.matchTime ?? e?.timeMinute ?? e?.addedTime ?? "";
        const minuteRaw = toText(minute);
        const time = minuteRaw !== "" ? `${minuteRaw}'` : "";
        const isHome = Boolean(e?.isHome || e?.home || e?.team === "home" || e?.side === "home");
        const isAway = Boolean(e?.isAway || e?.away || e?.team === "away" || e?.side === "away");
        const team: "home" | "away" | "neutral" = isHome ? "home" : isAway ? "away" : "neutral";
        const title = String(e?.type ?? e?.incidentType ?? e?.name ?? e?.title ?? "Evento").trim();
        const detail = String(
          e?.text ??
          e?.description ??
          e?.player?.name ??
          e?.playerName ??
          e?.reason ??
          ""
        ).trim();
        const sig = normalize(`${title} ${detail}`);
        let kind: V2IncidentKind = "other";
        if (sig.includes("goal") || sig.includes("golo") || sig.includes("gol")) kind = "goal";
        else if (sig.includes("corner") || sig.includes("canto") || sig.includes("escanteio")) kind = "corner";
        else if (sig.includes("card") || sig.includes("cartao") || sig.includes("cartao") || sig.includes("yellow") || sig.includes("red") || sig.includes("amarel") || sig.includes("vermelh")) kind = "card";
        else if (sig.includes("substitution") || sig.includes("substituic")) kind = "sub";

        const card: "yellow" | "red" | null =
          kind === "card"
            ? (sig.includes("red") || sig.includes("vermelh")) ? "red" : "yellow"
            : null;

        const hs =
          e?.homeScore?.current ??
          e?.homeScore ??
          e?.score?.home ??
          e?.home ??
          e?.homeTeamScore ??
          e?.homeGoals ??
          null;
        const as =
          e?.awayScore?.current ??
          e?.awayScore ??
          e?.score?.away ??
          e?.away ??
          e?.awayTeamScore ??
          e?.awayGoals ??
          null;
        const score = (typeof hs === "number" && typeof as === "number") ? `${hs}-${as}` : undefined;

        return {
          key: `${idx}-${title}-${detail}-${time}`,
          time,
          minute: parseMinute(minuteRaw),
          team,
          kind,
          card,
          score,
          title,
          detail
        } satisfies V2Incident;
      })
      .filter(e => e.title || e.detail);
  };

  const extractLiveKeyStats = (groups: V2StatsGroup[]): Array<{ key: string; label: string; home: string; away: string }> => {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

    const flat = groups.flatMap(g => g.rows.map(r => ({ name: r.name, home: r.home, away: r.away })));

    const pick = (label: string, patterns: string[]): { label: string; home: string; away: string } | null => {
      const hit = flat.find(r => {
        const n = normalize(r.name);
        return patterns.some(p => n.includes(p));
      });
      if (!hit) return null;
      if (!hit.home && !hit.away) return null;
      return { label, home: hit.home || "-", away: hit.away || "-" };
    };

    const wanted: Array<{ key: string; label: string; patterns: string[] }> = [
      { key: "possession", label: "Posse de bola", patterns: ["possession", "posse de bola", "ball possession"] },
      { key: "shots", label: "Remates", patterns: ["shots", "remates", "chutes"] },
      { key: "shotsOn", label: "Remates à baliza", patterns: ["shots on target", "remates a baliza", "chutes no alvo", "on target"] },
      { key: "shotsOff", label: "Remates fora", patterns: ["shots off target", "remates fora", "chutes para fora", "off target"] },
      { key: "corners", label: "Cantos", patterns: ["corners", "cantos", "escanteios"] },
      { key: "fouls", label: "Faltas", patterns: ["fouls", "faltas"] },
      { key: "yellow", label: "Cartões amarelos", patterns: ["yellow cards", "cartoes amarelos", "yellow"] },
      { key: "red", label: "Cartões vermelhos", patterns: ["red cards", "cartoes vermelhos", "red"] },
      { key: "offsides", label: "Fora de jogo", patterns: ["offsides", "fora de jogo", "offside"] },
      { key: "passes", label: "Passes", patterns: ["passes"] },
      { key: "passAcc", label: "Precisão de passe", patterns: ["pass accuracy", "precisao de passe"] },
      { key: "xg", label: "xG", patterns: ["expected goals", "xg"] },
    ];

    return wanted
      .map(w => {
        const row = pick(w.label, w.patterns.map(normalize));
        return row ? { key: w.key, ...row } : null;
      })
      .filter(Boolean) as Array<{ key: string; label: string; home: string; away: string }>;
  };

  // Minute ticker — ticks every 1s for real-time clock updates (football minutes, basketball/hockey clocks)
  useEffect(() => {
    const interval = setInterval(() => setMinuteTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Compute displayed minute for a live match (local interpolation between API refreshes).
  // Interpolation is paused only when match status is "HT" (half-time break),
  // NOT simply because minute equals 45/90 (those can occur during active play).
  const getDisplayMinute = (match: Match): number => {
    const id = String(match.id);
    const status = String(match.status ?? "").trim().toLowerCase();
    const isFootball = !match.sport || match.sport === "football";

    const apiMinRaw = apiMinutesRef.current[id] ?? match.minute ?? 0;
    let apiMin = Number.isFinite(Number(apiMinRaw)) ? Number(apiMinRaw) : 0;

    const maxEventMin = (match.events ?? []).reduce((acc, e) => Math.max(acc, e.minute ?? 0), 0);
    const maxIncidentMin =
      expandedMatch && String(expandedMatch.id) === id
        ? (v2Incidents ?? []).reduce((acc, e) => Math.max(acc, e.minute ?? 0), 0)
        : 0;
    const maxKnownMin = Math.max(maxEventMin, maxIncidentMin);

    if (maxKnownMin > 0) {
      if (apiMin === 0) apiMin = maxKnownMin;
      if (apiMin > maxKnownMin + 8) apiMin = maxKnownMin;
    }

    const extra = (match as any)?._liveExtra;
    const isHalfTimeBreak =
      status === "ht" ||
      status === "halftime" ||
      status.includes("half time") ||
      status.includes("break time") ||
      status === "pause";
    if (isFootball) {
      const baseClockSec = Number(extra?.clockSec);
      const clockAtMs = Number(extra?.clockAtMs ?? 0);
      const isClockRunning = !!extra?.clockRunning;
      if (Number.isFinite(baseClockSec) && baseClockSec >= 0) {
        const elapsedSec =
          isClockRunning && clockAtMs > 0
            ? Math.max(0, Math.floor((Date.now() - clockAtMs) / 1000))
            : 0;
        const displaySec = baseClockSec + elapsedSec;
        if (isHalfTimeBreak) return 45;
        return Math.max(0, Math.min(130, Math.floor(displaySec / 60)));
      }
    }
    if (isHalfTimeBreak) return Math.max(0, apiMin);

    if (isFootball && extra?.kickoffSec) return Math.max(0, apiMin);

    const looksNotStarted =
      apiMin <= 0 &&
      maxKnownMin === 0 &&
      (
        status === "ns" ||
        status.includes("not started") ||
        status.includes("scheduled") ||
        status.includes("delay") ||
        status.includes("postpon") ||
        status.includes("tbd") ||
        status.includes("await")
      );

    const canTick = !!match.isLive && !looksNotStarted && apiMin > 0;
    if (!canTick) return Math.max(0, apiMin);

    const changedAt = minuteChangedAtRef.current[id] ?? liveDataFetchedAt.current;
    if (!changedAt) return Math.max(0, apiMin);

    const elapsed = Math.min(3, Math.floor((Date.now() - changedAt) / 60000));
    let computed = apiMin + elapsed;
    return Math.max(0, Math.min(isFootball ? 130 : 999, computed));
  };

  const getFootballPhaseTag = (match: Match, minute: number): "1P" | "HT" | "2P" | "ET" | "PEN" | null => {
    const status = String(match.status ?? "").trim().toLowerCase();
    const showET = !!match.markets?.etExtra || status.includes("extra") || status === "et";
    const showPen = !!match.markets?.penExtra || status.includes("pen") || status.includes("shootout");
    if (showPen) return "PEN";
    if (status === "ht" || status === "halftime" || status.includes("half time") || status.includes("break time") || status === "pause") return "HT";
    if (showET) return "ET";
    if (status.includes("2nd half") || status.includes("second half") || status.includes("2ª parte")) return "2P";
    if (status.includes("1st half") || status.includes("first half") || status.includes("1ª parte")) return "1P";
    if (minute <= 0) return null;
    if (minute <= 45) return "1P";
    return "2P";
  };

  const fmtFootballMin = (min: number, tag: "1P" | "HT" | "2P" | "ET" | "PEN" | null): string => {
    if (min <= 0) return "";
    if (tag === "1P" && min > 45) return `45+${min - 45}'`;
    if (tag === "2P" && min > 90) return `90+${min - 90}'`;
    if (tag === "ET" && min > 120) return `120+${min - 120}'`;
    return `${min}'`;
  };

  const getFootballClockLabel = (match: Match, minute: number): string => {
    const tag = getFootballPhaseTag(match, minute);
    const extra = match._liveExtra;
    if (tag === "HT") return "HT";

    const baseClockSec = Number(extra?.clockSec);
    const clockAtMs = Number(extra?.clockAtMs ?? 0);
    const isClockRunning = !!extra?.clockRunning;
    if (Number.isFinite(baseClockSec) && baseClockSec >= 0) {
      const elapsedSec =
        isClockRunning && clockAtMs > 0
          ? Math.max(0, Math.floor((Date.now() - clockAtMs) / 1000))
          : 0;
      const displaySec = baseClockSec + elapsedSec;
      const displayMin = Math.floor(displaySec / 60);
      const seconds = String(Math.max(0, displaySec % 60)).padStart(2, "0");

      if (tag === "1P") {
        if (displayMin > 45) return `45+${displayMin - 45}'`;
        return `${String(Math.max(0, displayMin)).padStart(2, "0")}:${seconds}`;
      }
      if (tag === "2P") {
        if (displayMin > 90) return `90+${displayMin - 90}'`;
        return `${String(Math.max(45, displayMin)).padStart(2, "0")}:${seconds}`;
      }
    }

    return extra?.clockStr ?? fmtFootballMin(minute, tag);
  };

  const normalizeLiveIdentityPart = (value: string | undefined) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const getLiveMatchIdentityKey = (match: Pick<Match, "sport" | "home" | "away" | "league">) =>
    [
      normalizeLiveIdentityPart(match.sport),
      normalizeLiveIdentityPart(match.home),
      normalizeLiveIdentityPart(match.away),
      normalizeLiveIdentityPart(match.league),
    ].join("|");

  const dedupeLiveMatches = (matches: Match[]) => {
    const byIdentity = new Map<string, Match>();
    const order: string[] = [];

    const pickPreferred = (current: Match, candidate: Match) => {
      const currentIsV2 = String(current.id).includes("-v2-") ? 1 : 0;
      const candidateIsV2 = String(candidate.id).includes("-v2-") ? 1 : 0;
      if (candidateIsV2 !== currentIsV2) return candidateIsV2 > currentIsV2 ? candidate : current;

      const currentLive = current.startsIn === undefined ? 1 : 0;
      const candidateLive = candidate.startsIn === undefined ? 1 : 0;
      if (candidateLive !== currentLive) return candidateLive > currentLive ? candidate : current;

      const currentLeagueId = current.leagueId ? 1 : 0;
      const candidateLeagueId = candidate.leagueId ? 1 : 0;
      if (candidateLeagueId !== currentLeagueId) return candidateLeagueId > currentLeagueId ? candidate : current;

      const currentScoreSignal = (current.homeScore ?? 0) + (current.awayScore ?? 0);
      const candidateScoreSignal = (candidate.homeScore ?? 0) + (candidate.awayScore ?? 0);
      if (candidateScoreSignal !== currentScoreSignal) return candidateScoreSignal > currentScoreSignal ? candidate : current;

      const currentMinute = Number(current.minute ?? 0);
      const candidateMinute = Number(candidate.minute ?? 0);
      if (candidateMinute !== currentMinute) return candidateMinute > currentMinute ? candidate : current;

      const currentOdds = current.hasRealOdds ? 1 : 0;
      const candidateOdds = candidate.hasRealOdds ? 1 : 0;
      if (candidateOdds !== currentOdds) return candidateOdds > currentOdds ? candidate : current;

      return String(candidate.id) > String(current.id) ? candidate : current;
    };

    for (const match of matches) {
      const key = getLiveMatchIdentityKey(match);
      const existing = byIdentity.get(key);
      if (!existing) {
        byIdentity.set(key, match);
        order.push(key);
        continue;
      }
      byIdentity.set(key, pickPreferred(existing, match));
    }

    return order.map((key) => byIdentity.get(key)!).filter(Boolean);
  };

  type Snapshot<T> = { savedAt: number; value: T };
  // Stable key generators — wrapped in useCallback so they never get a new reference
  // on re-render, which would cascade into useCallback/useEffect loops.
  const upcomingSnapshotKey = useCallback((sport: string) => `bet62_snapshot_upcoming_v1:${sport}`, []);
  const liveSnapshotKey     = useCallback(() => "bet62_snapshot_live_v1", []);
  const matchSnapshotKey    = useCallback((id: string) => `bet62_snapshot_match_v1:${id}`, []);
  const LIVE_SNAPSHOT_MAX_AGE_MS = 20_000;
  const readSnapshot = useCallback(<T,>(key: string): Snapshot<T> | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Snapshot<T>;
      if (!parsed || typeof parsed !== "object") return null;
      if (typeof (parsed as any).savedAt !== "number") return null;
      return parsed;
    } catch {
      return null;
    }
  }, []);
  const writeSnapshot = useCallback((key: string, value: any) => {
    try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value })); } catch {}
  }, []);

  // Sync expandedMatch with live data silently (score/odds update without closing panel)
  useEffect(() => {
    if (!expandedMatch?.isLive) return;
    const updated = liveMatches.find(m => String(m.id) === String(expandedMatch.id));
    if (updated) {
      setExpandedMatch(prev => {
        if (!prev || String(prev.id) !== String(updated.id)) return { ...updated };
        const anyUpdated = updated as any;
        const anyPrev = prev as any;
        return {
          ...anyUpdated,
          markets: anyUpdated.markets ?? anyPrev.markets,
          events: anyUpdated.events ?? anyPrev.events,
        };
      });
    }
  }, [liveMatches]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!expandedMatch?.isLive) return;
    const id = String(expandedMatch.id);
    const hasMarkets = !!(expandedMatch as any).markets;
    if (hasMarkets) return;
    const snap = readSnapshot<Match>(matchSnapshotKey(id));
    const canUseSnap = !!(snap && (Date.now() - snap.savedAt) < 10 * 60_000 && snap.value);
    if (canUseSnap) {
      setExpandedMatch(prev => (prev && String(prev.id) === id ? (snap.value as any) : prev));
    }
    if (liveExpandedFullFetchRef.current === id) return;
    liveExpandedFullFetchRef.current = id;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 12_000);
    const qs = expandedMatch.sport === "tennis" ? "?fresh=1" : "";
    fetch(`/api/matches/live-match/${encodeURIComponent(id)}${qs}`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const m = d?.match as Match | null | undefined;
        if (!m) return;
        writeSnapshot(matchSnapshotKey(id), m as any);
        setExpandedMatch(prev => (prev && String(prev.id) === id ? (m as any) : prev));
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(tid);
        if (liveExpandedFullFetchRef.current === id) liveExpandedFullFetchRef.current = null;
      });
    return () => { clearTimeout(tid); ctrl.abort(); };
  }, [expandedMatch?.id, matchSnapshotKey, readSnapshot, writeSnapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear seenMatchIds when leaving live tab so new entries animate on return
  useEffect(() => {
    if (activeTab !== "live") seenMatchIds.current.clear();
  }, [activeTab]);

  const normalizeTeamName = (value: string | undefined) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const rowMatchesTeam = (rowName: string, teamName: string) => {
    const row = normalizeTeamName(rowName);
    const team = normalizeTeamName(teamName);
    if (!row || !team) return false;
    return row.includes(team) || team.includes(row) || row.includes(team.slice(0, Math.min(team.length, 8)));
  };

  const standingsBelongToMatch = (
    rows: StandingRow[],
    groups: Array<{ name: string; rows: StandingRow[] }> | null,
    match: Pick<Match, "home" | "away">,
  ) => {
    const allRows = groups && groups.length > 0 ? groups.flatMap((group) => group.rows) : rows;
    if (!allRows.length) return false;
    const hasHome = allRows.some((row) => rowMatchesTeam(row.name, match.home));
    const hasAway = allRows.some((row) => rowMatchesTeam(row.name, match.away));
    return hasHome && hasAway;
  };

  // Reset match view state when expanded match changes
  useEffect(() => {
    setMatchViewTab("markets");
    setMatchStats(null);
    setMatchStatsLoading(false);
    setV2StatsGroups(null);
    setV2StatsLoading(false);
    setShowAllV2Stats(false);
    setV2StatsFetchedAt(0);
    setV2Incidents(null);
    setV2IncidentsLoading(false);
    setV2IncidentsFetchedAt(0);
    setLiveAdvancedTab("all");
    setLivePollTick(0);
    setStandings(null);
    setStandingsGroups(null);
    setStandingsLoading(false);
    setStandingsLeague("");
    setPlayerMarkets(null);
    setPlayerMarketsMatchId(null);
    setConfrontosData(null);
    setConfrontosLoading(false);
    setAllOddsData(null);
    setAllOddsLoading(false);
    // Auto-switch to ET/Pen tab if match is already in that phase
    if (expandedMatch?.markets?.etExtra) { setModalTab("prolongamento"); setTimeout(() => scrollTabIntoView("prolongamento", "instant"), 0); }
    else if (expandedMatch?.markets?.penExtra) { setModalTab("penaltis"); setTimeout(() => scrollTabIntoView("penaltis", "instant"), 0); }
    else { setModalTab("todos"); setTimeout(() => scrollTabIntoView("todos", "instant"), 0); }
  }, [expandedMatch?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-switch to ET/Pen tab when a live match enters extra time / penalties
  useEffect(() => {
    if (!expandedMatch?.isLive) return;
    if (expandedMatch.markets?.penExtra && modalTab !== "penaltis")  { setModalTab("penaltis"); setTimeout(() => scrollTabIntoView("penaltis", "instant"), 0); return; }
    if (expandedMatch.markets?.etExtra  && modalTab === "todos")     { setModalTab("prolongamento"); setTimeout(() => scrollTabIntoView("prolongamento", "instant"), 0); }
  }, [!!(expandedMatch as any)?.markets?.etExtra, !!(expandedMatch as any)?.markets?.penExtra]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if ((expandedMatch?.sport ?? "football") !== "tennis") return;
    if (modalTab !== "placar") return;
    setModalTab("sets");
    setTimeout(() => scrollTabIntoView("sets", "instant"), 0);
  }, [expandedMatch?.id, expandedMatch?.sport, modalTab, scrollTabIntoView]);

  useEffect(() => {
    if (!expandedMatch?.isLive || (expandedMatch.sport ?? "football") !== "football") return;
    if (expandedMatch.markets?.etExtra || expandedMatch.markets?.penExtra) return;
    const minute = getDisplayMinute(expandedMatch);
    if (minute < 85) return;
    const allowedLateTabs = new Set(["todos", "resultado", "gols", "handicap"]);
    if (!allowedLateTabs.has(modalTab)) {
      setModalTab("todos");
      setTimeout(() => scrollTabIntoView("todos", "instant"), 0);
    }
  }, [
    expandedMatch?.id,
    expandedMatch?.isLive,
    expandedMatch?.sport,
    expandedMatch?.minute,
    expandedMatch?.status,
    !!(expandedMatch as any)?.markets?.etExtra,
    !!(expandedMatch as any)?.markets?.penExtra,
    modalTab,
    scrollTabIntoView,
  ]);

  // Fetch match stats when stats tab is active
  useEffect(() => {
    if (matchViewTab !== "stats" || !expandedMatch || matchStats) return;
    if ((expandedMatch.sport ?? "football") !== "football") return;
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

  useEffect(() => {
    const wantsStatsData = matchViewTab === "stats" || (matchViewTab === "live" && !!expandedMatch?.isLive);
    if (!wantsStatsData || !expandedMatch) return;
    if (v2StatsLoading) return;
    if (v2StatsGroups !== null && Date.now() - v2StatsFetchedAt < 3000) return;
    const rawId = getProviderMatchId(expandedMatch.id);
    const sport = expandedMatch.sport ?? "football";
    const cacheKey = `${sport}:${rawId}`;
    if (!rawId) return;
    setV2StatsLoading(true);
    fetch(`/api/matches/v2-statistics?sport=${sport}&matchId=${rawId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const nextGroups = d ? extractV2StatsGroups(d as any) : [];
        if (nextGroups.length > 0) v2StatsCacheRef.current[cacheKey] = nextGroups;
        setV2StatsGroups(nextGroups.length > 0 ? nextGroups : (v2StatsCacheRef.current[cacheKey] ?? []));
        setV2StatsFetchedAt(Date.now());
      })
      .catch(() => {
        setV2StatsGroups(v2StatsCacheRef.current[cacheKey] ?? []);
        setV2StatsFetchedAt(Date.now());
      })
      .finally(() => setV2StatsLoading(false));
  }, [matchViewTab, expandedMatch?.id, v2StatsGroups, v2StatsLoading, v2StatsFetchedAt, livePollTick, getProviderMatchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const wantsIncidents = matchViewTab === "live" && !!expandedMatch?.isLive;
    if (!wantsIncidents || !expandedMatch) return;
    if (v2IncidentsLoading) return;
    if (v2Incidents !== null && Date.now() - v2IncidentsFetchedAt < 3000) return;
    const rawId = getProviderMatchId(expandedMatch.id);
    const sport = expandedMatch.sport ?? "football";
    const cacheKey = `${sport}:${rawId}`;
    if (!rawId) return;
    setV2IncidentsLoading(true);
    fetch(`/api/matches/v2-incidents?sport=${sport}&matchId=${rawId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const nextIncidents = d ? extractV2Incidents(d as any) : [];
        if (nextIncidents.length > 0) v2IncidentsCacheRef.current[cacheKey] = nextIncidents;
        setV2Incidents(nextIncidents.length > 0 ? nextIncidents : (v2IncidentsCacheRef.current[cacheKey] ?? []));
        setV2IncidentsFetchedAt(Date.now());
      })
      .catch(() => {
        setV2Incidents(v2IncidentsCacheRef.current[cacheKey] ?? []);
        setV2IncidentsFetchedAt(Date.now());
      })
      .finally(() => setV2IncidentsLoading(false));
  }, [matchViewTab, expandedMatch?.id, v2Incidents, v2IncidentsLoading, v2IncidentsFetchedAt, livePollTick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (matchViewTab !== "live" || !expandedMatch?.isLive) return;
    const tid = setInterval(() => setLivePollTick(t => t + 1), 3000);
    return () => clearInterval(tid);
  }, [matchViewTab, expandedMatch?.id, !!expandedMatch?.isLive]);

  // Fetch standings when standings tab is active
  useEffect(() => {
    if (matchViewTab !== "standings" || !expandedMatch || standings) return;
    setStandingsLoading(true);
    const league = expandedMatch.league ?? "";
    setStandingsLeague(league);
    const acceptStandings = (
      nextRows: StandingRow[] | null | undefined,
      nextGroups: Array<{ name: string; rows: StandingRow[] }> | null = null,
      nextLeague = league,
    ) => {
      const safeRows = Array.isArray(nextRows) ? nextRows : [];
      const safeGroups = Array.isArray(nextGroups) && nextGroups.length > 0 ? nextGroups : null;
      if (!standingsBelongToMatch(safeRows, safeGroups, expandedMatch)) return false;
      setStandingsLeague(nextLeague);
      setStandings(safeRows);
      setStandingsGroups(safeGroups);
      return true;
    };
    const loadV1 = () =>
      fetch(`/api/matches/league-standings?league=${encodeURIComponent(league)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d || !Array.isArray(d.teams)) return;
          if (!acceptStandings(d.teams as StandingRow[], null, d.league ?? league)) {
            setStandings([]);
            setStandingsGroups(null);
            setStandingsLeague(d.league ?? league);
          }
        });
    const sport = expandedMatch.sport ?? "football";
    const idStr = String(expandedMatch.id);
    const rawId = getProviderMatchId(idStr);
    const isV2 = rawId !== idStr && rawId.length > 0;
    if (isV2 && sport !== "tennis") {
      fetch(`/api/matches/v2-standings?sport=${sport}&matchId=${rawId}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d && Array.isArray(d.standings) && d.standings.length > 0) {
            if (acceptStandings(
              d.standings as StandingRow[],
              Array.isArray(d.groups) && d.groups.length > 0 ? d.groups as Array<{ name: string; rows: StandingRow[] }> : null,
              d.league ?? league,
            )) {
              return Promise.resolve();
            }
          }
          if (sport === "football") {
            return loadV1();
          }
          setStandings([]);
          setStandingsGroups(null);
          setStandingsLeague(d?.league ?? league);
          return Promise.resolve();
        })
        .catch(() => {
          if (sport === "football") return loadV1();
          setStandings([]);
          setStandingsGroups(null);
          setStandingsLeague(league);
          return Promise.resolve();
        })
        .finally(() => setStandingsLoading(false));
    } else {
      if (sport === "football") {
        loadV1().catch(() => {}).finally(() => setStandingsLoading(false));
      } else {
        setStandings([]);
        setStandingsGroups(null);
        setStandingsLoading(false);
      }
    }
  }, [matchViewTab, expandedMatch?.id, getProviderMatchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch player markets when "Jogadores" tab is active (football only)
  useEffect(() => {
    const mid = String(expandedMatch?.id ?? "");
    if (modalTab !== "jogadores" || !expandedMatch?.leagueId) return;
    if (playerMarketsMatchId === mid) return; // already loaded for this match
    setPlayerMarketsLoading(true);
    setPlayerMarkets(null);
    setPlayerMarketsMatchId(mid);
    const rawId = getProviderMatchId(expandedMatch.id);
    const p = new URLSearchParams({ homeTeam: expandedMatch.home, awayTeam: expandedMatch.away, matchId: rawId });
    fetch(`/api/matches/football-player-markets/${encodeURIComponent(expandedMatch.leagueId)}?${p}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPlayerMarkets(d as PlayerMarketsData); })
      .catch(() => {})
      .finally(() => setPlayerMarketsLoading(false));
  }, [modalTab, expandedMatch?.id, expandedMatch?.leagueId, getProviderMatchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-load MLB league stats when "liga" tab is active
  useEffect(() => {
    if (matchViewTab !== "liga" || expandedMatch?.sport !== "baseball") return;
    if (mlbLeagueStats || mlbLeagueStatsLoading) return;
    setMlbLeagueStatsLoading(true);
    fetch("/api/matches/mlb-league-stats")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMlbLeagueStats(d as MLBLeagueStatsData); })
      .catch(() => {})
      .finally(() => setMlbLeagueStatsLoading(false));
  }, [matchViewTab, expandedMatch?.sport]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch all V2 odds markets (kept for future use / "odds" tab)
  useEffect(() => {
    if (matchViewTab !== "odds" || !expandedMatch) return;
    setAllOddsData(null);
    setAllOddsLoading(true);
    setAllOddsQuery("");
    setAllOddsSectionOpen({});
    const ctrl = new AbortController();
    const rawId = getProviderMatchId(expandedMatch.id);
    const sport = expandedMatch.sport ?? "football";
    fetch(`/api/matches/v2-match-odds?sport=${sport}&matchId=${rawId}`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : { markets: [] })
      .then(d => {
        if (ctrl.signal.aborted) return;
        setAllOddsData(sanitizeAllOddsMarkets((d as { markets?: unknown }).markets));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setAllOddsData([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setAllOddsLoading(false);
      });
    return () => ctrl.abort();
  }, [matchViewTab, expandedMatch?.id, getProviderMatchId, sanitizeAllOddsMarkets]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch lineups when "lineups" tab is selected
  useEffect(() => {
    if (matchViewTab !== "lineups" || !expandedMatch) return;
    setLineupsData(null);
    setLineupsLoading(true);
    const rawId = getProviderMatchId(expandedMatch.id);
    const sport = expandedMatch.sport ?? "football";
    fetch(`/api/matches/v2-lineups?sport=${sport}&matchId=${rawId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setLineupsData(d as LineupsV2))
      .catch(() => setLineupsData(null))
      .finally(() => setLineupsLoading(false));
  }, [matchViewTab, expandedMatch?.id, getProviderMatchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch H2H confrontos when "confrontos" tab is selected
  useEffect(() => {
    if (matchViewTab !== "confrontos" || !expandedMatch) return;
    setConfrontosData(null);
    setConfrontosLoading(true);
    const rawId = getProviderMatchId(expandedMatch.id);
    const sport = expandedMatch.sport ?? "football";
    const p = new URLSearchParams({ sport, matchId: rawId, home: expandedMatch.home, away: expandedMatch.away });
    fetch(`/api/matches/confrontos?${p}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setConfrontosData(d as ConfrontosData))
      .catch(() => setConfrontosData(null))
      .finally(() => setConfrontosLoading(false));
  }, [matchViewTab, expandedMatch?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle ?payment= query param on return from card payment
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment");
    if (!paymentStatus) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (paymentStatus === "success") {
      auth.refreshUser();
      toast.success("Depósito por cartão confirmado! O seu saldo foi actualizado.");
    } else if (paymentStatus === "error") {
      toast.error("Pagamento por cartão não foi concluído. Tente novamente.");
    } else if (paymentStatus === "cancel") {
      toast.info("Pagamento por cartão cancelado.");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic balance refresh every 20s for logged-in users (catches server-side credits)
  useEffect(() => {
    if (!auth.token) return;
    const id = setInterval(() => { auth.refreshUser(); }, 20000);
    return () => clearInterval(id);
  }, [auth.token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch platform stats on mount
  useEffect(() => {
    fetch("/api/stats")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPlatformStats(d); })
      .catch(() => { /* non-critical */ });
  }, []);

  // Fetch secondary data — deferred 800ms so live/upcoming load first
  useEffect(() => {
    const tid = setTimeout(() => {
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
      fetch("/api/matches/basketball-schedule")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setBasketballSchedule(d); })
        .catch(() => { /* non-critical */ });
      fetch("/api/matches/basketball-odds")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.odds) setBasketballOddsMatches(d.odds); })
        .catch(() => { /* non-critical */ });
      fetch("/api/matches/basketball-results")
        .then(r => r.ok ? r.json() : { results: [] })
        .then(d => setBasketballResults(d.results ?? []))
        .catch(() => { /* non-critical */ });
      fetch("/api/matches/hockey-results")
        .then(r => r.ok ? r.json() : { results: [] })
        .then(d => setHockeyResults(d.results ?? []))
        .catch(() => { /* non-critical */ });
      fetch("/api/matches/mlb-results")
        .then(r => r.ok ? r.json() : { results: [] })
        .then(d => setMlbResults(d.results ?? []))
        .catch(() => { /* non-critical */ });
      fetch("/api/matches/mlb-schedule")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setMlbSchedule(d); })
        .catch(() => { /* non-critical */ });
      fetch("/api/matches/mlb-standings")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setMlbStandings(d); })
        .catch(() => { /* non-critical */ });
      fetch("/api/matches/hockey-schedule")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setHockeySchedule(d); })
        .catch(() => { /* non-critical */ });
      fetch("/api/matches/basketball-standings")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setBasketballStandings(d); })
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
      fetch("/api/matches/mlb-odds")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.odds) setMlbOddsMatches(d.odds); })
        .catch(() => { /* non-critical */ });
    }, 800);
    return () => clearTimeout(tid);
  }, []);

  // Fetch upcoming matches — polls every 30s so new games appear automatically
  const fetchUpcoming = useCallback(async (showSpinner = false) => {
    if (document.visibilityState === "hidden") return;
    if (isIdleRef.current || isLockedRef.current) return;
    if (showSpinner) setUpcomingLoading(true);
    const param = selectedSport === "all" ? "" : `?sport=${selectedSport}`;
    try { upcomingFetchCtrlRef.current?.abort(); } catch {}
    const ctrl = new AbortController();
    upcomingFetchCtrlRef.current = ctrl;
    const tid = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const r = await fetch(`/api/matches/upcoming${param}`, { signal: ctrl.signal });
      const data = r.ok ? await r.json() : { matches: [] };
      const matches = (data.matches || []) as Array<{
        id: string; home: string; away: string; league: string; country?: string;
        time?: string; date?: string; sport?: string; hasRealOdds?: boolean; odds: Odds; markets?: AdvancedMarkets;
        homeTeamId?: string; awayTeamId?: string; homeImageVersion?: string; awayImageVersion?: string;
      }>;
      setUpcomingMatches(matches.map(m => ({ ...m, isLive: false })));
      writeSnapshot(upcomingSnapshotKey(selectedSport), matches);
    } catch {
    } finally {
      clearTimeout(tid);
      if (upcomingFetchCtrlRef.current === ctrl) upcomingFetchCtrlRef.current = null;
      if (showSpinner) setUpcomingLoading(false);
    }
  }, [selectedSport, upcomingSnapshotKey, writeSnapshot]);

  useEffect(() => {
    const snap = readSnapshot<any[]>(upcomingSnapshotKey(selectedSport));
    const canUseSnap = !!(snap && (Date.now() - snap.savedAt) < 10 * 60_000 && Array.isArray(snap.value));
    if (canUseSnap) {
      setUpcomingMatches(snap.value.map(m => ({ ...(m as any), isLive: false })));
      setUpcomingLoading(false);
    }
    if (activeTab !== "sports") return;
    fetchUpcoming(!canUseSnap);
    const id = setInterval(() => fetchUpcoming(false), 30_000);
    return () => clearInterval(id);
  }, [fetchUpcoming, readSnapshot, selectedSport, upcomingSnapshotKey, activeTab]);

  // Fetch live matches — polls every 5s
  type LiveMatchRaw = {
    id: string; home: string; away: string; league: string;
    country?: string; sport?: string; status?: string;
    homeTeamId?: string; awayTeamId?: string; homeImageVersion?: string; awayImageVersion?: string;
    homeScore: number; awayScore: number; minute: number;
    startsIn?: number;
    hasRealOdds?: boolean; odds: Odds; markets?: AdvancedMarkets;
    events?: Array<{ type: string; team: string; minute: number; player: string }>;
    marketSuspension?: Record<string, number>;
    _suspensionReason?: string;
    _feedWarning?: string;
    _liveExtra?: {
      clockStr?: string;
      sets?: Array<[number, number]>;
      currentPoints?: [number | string, number | string];
      serving?: [boolean, boolean];
      currentPts?: [number, number];
      vollSets?: Array<[number, number]>;
      tennisStats?: [
        { aces: number; doubleFaults: number; firstServePct: string; winners: number; unforcedErrors: number },
        { aces: number; doubleFaults: number; firstServePct: string; winners: number; unforcedErrors: number },
      ];
      periods?: Array<[number, number]>;
      quarters?: Array<[number, number]>;
      innings?: Array<[number, number]>;
      outs?: number;
      homeHits?: number;
      awayHits?: number;
      homeErrors?: number;
      awayErrors?: number;
    };
  };

  // Shared processing — used by the Ao Vivo polling
  const processLiveData = useCallback((data: any) => {
    const now = Date.now();

    const _WC_LIVE_KW = ["world cup","fifa world","mundial 2026","wc 2026","copa do mundo","copa mundial","coupe du monde"];
    const rawMatches = (data.matches || []) as LiveMatchRaw[];
    const matches = rawMatches.filter(m => {
      const lg = (m.league ?? "").toLowerCase();
      return !_WC_LIVE_KW.some(k => lg.includes(k));
    });
    // Capture WC live matches into ref so bet ticket can show "AO VIVO" for WC bets
    const wcRawForTicket = rawMatches.filter(m => _WC_LIVE_KW.some(k => (m.league ?? "").toLowerCase().includes(k)));
    if (wcRawForTicket.length > 0) {
      wcLiveForTicketRef.current = wcRawForTicket.map(m => ({
        id: String(m.id), home: String(m.home ?? ""), away: String(m.away ?? ""),
        league: String(m.league ?? ""), country: "", sport: "football" as const,
        minute: Number(m.minute ?? 0), status: String(m.status ?? ""),
        homeScore: Number(m.homeScore ?? 0), awayScore: Number(m.awayScore ?? 0), isLive: true,
        odds: (m.odds ?? { home: 0, draw: 0, away: 0 }) as { home: number; draw: number; away: number },
        markets: (m.markets ?? {}) as Match["markets"], events: [],
        hasRealOdds: !!m.hasRealOdds, _liveExtra: m._liveExtra as Match["_liveExtra"],
      })) as unknown as Match[];
    }
    if (matches.length === 0) {
      // Only clear live state when the raw API had NO matches at all.
      // If rawMatches > 0 but all were WC (filtered), keep existing non-WC live state intact.
      if (rawMatches.length > 0) return;
      emptyLiveStreakRef.current += 1;
      if (emptyLiveStreakRef.current < 3) return;
      emptyLiveStreakRef.current = 0;
      apiMinutesRef.current = {};
      minuteChangedAtRef.current = {};
      matchLastSeenRef.current = {};
      matchMissCountRef.current = {};
      setLiveMatches([]);
      return;
    }
    emptyLiveStreakRef.current = 0;
    const newMins: Record<string, number> = {};
    const normalizedMatches = matches.map((m) => {
      const id = String(m.id);
      const prevMinute = apiMinutesRef.current[id];
      const nextMinuteRaw = Number.isFinite(Number(m.minute ?? 0)) ? Number(m.minute ?? 0) : 0;
      const status = String(m.status ?? "").trim().toLowerCase();
      const isFootball = !m.sport || m.sport === "football";
      const canLegitimatelyRephase =
        status === "ht" ||
        status.includes("half time") ||
        status === "halftime" ||
        status.includes("2nd half") ||
        status.includes("second half") ||
        status.includes("2ª parte") ||
        status === "et" ||
        status.includes("extra") ||
        status.includes("pen");
      const normalizedMinute =
        typeof prevMinute === "number" &&
        isFootball &&
        nextMinuteRaw > 0 &&
        prevMinute > 0 &&
        nextMinuteRaw + 1 < prevMinute &&
        !canLegitimatelyRephase
          ? prevMinute
          : nextMinuteRaw;
      newMins[id] = normalizedMinute;
      if (
        typeof prevMinute !== "number" ||
        normalizedMinute > prevMinute ||
        (normalizedMinute < prevMinute && canLegitimatelyRephase)
      ) {
        minuteChangedAtRef.current[id] = now;
      }
      return normalizedMinute === nextMinuteRaw ? m : { ...m, minute: normalizedMinute };
    });
    apiMinutesRef.current = newMins;
    liveDataFetchedAt.current = now;
    // Update last-seen timestamps for every match in this response
    for (const m of normalizedMatches) matchLastSeenRef.current[String(m.id)] = now;

    setLiveMatches(prev => {
      const newPrev: Record<string, Odds> = {};
      const newPrevMkts: Record<string, Record<string, number>> = {};
      for (const m of prev) {
        const id = String(m.id);
        newPrev[id] = m.odds;
        newPrevMkts[id] = flattenMatchMarketsForArrows(m);
      }
      prevLiveOdds.current = newPrev;
      prevLiveMarkets.current = newPrevMkts;

      const freshIds = new Set(normalizedMatches.map(m => String(m.id)));
      // Update consecutive miss counts for every match in the previous state
      for (const m of prev) {
        const id = String(m.id);
        if (freshIds.has(id)) {
          matchMissCountRef.current[id] = 0; // present this response — reset
        } else {
          matchMissCountRef.current[id] = (matchMissCountRef.current[id] ?? 0) + 1;
        }
      }
      const isFinishedStatus = (st: string | undefined) => {
        const s = (st ?? "").trim().toLowerCase();
        if (!s) return false;
        if (s === "ft") return true;
        if (s.includes("fin")) return true;
        if (s.includes("end")) return true;
        if (s.includes("final")) return true;
        if (s.includes("complete")) return true;
        if (s.includes("full time")) return true;
        if (s.includes("finished")) return true;
        if (s.includes("retired")) return true;
        if (s.includes("abandon")) return true;
        if (s.includes("cancel")) return true;
        if (s.includes("postpon")) return true;
        if (s.includes("awarded")) return true;
        if (s.includes("default")) return true;
        if (s.includes("walk over") || s.includes("walkover") || s.includes("w/o")) return true;
        if (s.includes("removed") || s.includes("remove")) return true;
        if (s.includes("interrupted")) return true;
        if (s.includes("suspended") && s.includes("match")) return true;
        return false;
      };
      const staleMatches = prev
        .filter(m => {
          const id = String(m.id);
          if (freshIds.has(id)) return false;
          if (isFinishedStatus(m.status)) return false;
          const lastSeen = matchLastSeenRef.current[id] ?? 0;
          const missCount = matchMissCountRef.current[id] ?? 0;
          // Keep if: absent from fewer than 2 consecutive responses (transient miss)
          // OR still within 30s window (belt-and-suspenders for very slow polls)
          return missCount < 2 || (now - lastSeen) < 30_000;
        })
        .map(m => ({ ...m, marketSuspension: undefined, _suspensionReason: undefined, _feedWarning: undefined, suspensionReason: undefined }));

      const freshMatches = normalizedMatches
        // Live matches (startsIn === undefined) always show.
        // "Em Breve" entries show when there are real odds OR computed odds (home > 0 and away > 0).
        .filter(m => m.startsIn === undefined || m.hasRealOdds !== false || (m.odds.home > 0 && m.odds.away > 0))
        .map(m => ({ ...m, isLive: true }));

      return dedupeLiveMatches([...staleMatches, ...freshMatches]);
    });
  }, []);

  const fetchLive = useCallback(async (showSpinner = false): Promise<"success" | "skipped" | "failed"> => {
    if (document.visibilityState === "hidden") return "skipped";
    if (isIdleRef.current || isLockedRef.current) return "skipped";
    if (liveFetchInFlightRef.current) return "skipped";
    if (showSpinner) setLiveLoading(true);
    let ctrl: AbortController | null = null;
    liveFetchInFlightRef.current = true;
    try {
      ctrl = new AbortController();
      const currentCtrl = ctrl;
      liveFetchCtrlRef.current = currentCtrl;
      const tid = setTimeout(() => currentCtrl.abort(), 20_000);
      try {
        const res = await fetch("/api/matches/live?lean=1&limit=200", { signal: currentCtrl.signal });
        if (!res.ok) throw new Error(`live_fetch_failed_${res.status}`);
        const data = await res.json();
        if (!Array.isArray((data as any)?.matches)) throw new Error("live_fetch_invalid_payload");
        writeSnapshot(liveSnapshotKey(), (data as any).matches);
        processLiveData(data);
        setLiveTransport(sseActiveRef.current ? "sse" : "polling");
        return "success";
      } finally {
        try { clearTimeout(tid); } catch {}
      }
    } catch {
      if (!browserOnline) setLiveTransport("cache");
      return "failed";
    } finally {
      if (ctrl && liveFetchCtrlRef.current === ctrl) liveFetchCtrlRef.current = null;
      liveFetchInFlightRef.current = false;
      if (showSpinner) setLiveLoading(false);
    }
  }, [browserOnline, processLiveData, liveSnapshotKey, writeSnapshot]);

  const refreshLiveMatchById = useCallback(async (
    id: string,
    options?: { forceFresh?: boolean; syncExpanded?: boolean },
  ): Promise<void> => {
    if (!id) return;
    if (liveTennisHydratingRef.current.has(id)) return;
    liveTennisHydratingRef.current.add(id);
    try {
      const qs = options?.forceFresh ? "?fresh=1" : "";
      const r = await fetch(`/api/matches/live-match/${encodeURIComponent(id)}${qs}`);
      const d = r.ok ? await r.json() : null;
      const match = d?.match as Match | null | undefined;
      if (!match) return;
      writeSnapshot(matchSnapshotKey(id), match as any);
      setLiveMatches(prev => prev.map((item) => {
        if (String(item.id) !== id) return item;
        prevLiveOdds.current[id] = item.odds;
        prevLiveMarkets.current[id] = flattenMatchMarketsForArrows(item);
        return { ...match, isLive: true };
      }));
      if (options?.syncExpanded !== false) {
        setExpandedMatch(prev => (
          prev && String(prev.id) === id
            ? ({ ...match, isLive: true } as Match)
            : prev
        ));
      }
    } catch {
    } finally {
      liveTennisHydratingRef.current.delete(id);
    }
  }, [matchSnapshotKey, writeSnapshot]);

  const selectMainTab = useCallback((id: typeof activeTab, onSelect?: () => void) => {
    const prev = activeTabRef.current;
    const currentPath = window.location.pathname.replace(/\/$/, "") || "/";
    if (prev !== id) setActiveTab(id);
    if (id === "live") navigate("/ao-vivo");
    else if (currentPath === "/ao-vivo" || currentPath === "/live") navigate("/");
    onSelect?.();
    if (id === "live" && prev !== "live") {
      const snap = readSnapshot<LiveMatchRaw[]>(liveSnapshotKey());
      const canUseSnap = !!(snap && (Date.now() - snap.savedAt) < LIVE_SNAPSHOT_MAX_AGE_MS && Array.isArray(snap.value));
      // Use ref so this callback is not recreated on every live-data update
      const hasMatches = liveMatchesRef.current.length > 0;
      if (snap && canUseSnap && !hasMatches) {
        setLiveMatches(snap.value.map(m => ({ ...(m as any), isLive: true })));
        setLiveLoading(false);
        setLiveTransport("cache");
      }
      fetchLive(!(canUseSnap && hasMatches));
    }
  }, [fetchLive, liveSnapshotKey, navigate, readSnapshot, setLiveMatches]); // liveMatchesRef is a ref — no dep needed

  useEffect(() => {
    if (!liveLoading) return;
    const id = setTimeout(() => setLiveLoading(false), 12_000);
    return () => clearTimeout(id);
  }, [liveLoading]);

  useEffect(() => {
    if (activeTab !== "live") {
      // Leave live tab — close SSE
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
      sseActiveRef.current = false;
      livePollBackoffStepRef.current = 0;
      if (livePollTimerRef.current) { clearTimeout(livePollTimerRef.current); livePollTimerRef.current = null; }
      setLiveTransport("idle");
      return;
    }

    // ── 1. Show cached snapshot immediately (zero-latency initial render) ────
    const hasMatches = liveMatchesRef.current.length > 0;
    if (!hasMatches) {
      const snap = readSnapshot<LiveMatchRaw[]>(liveSnapshotKey());
      const canUseSnap = !!(snap && (Date.now() - snap.savedAt) < LIVE_SNAPSHOT_MAX_AGE_MS && Array.isArray(snap.value));
      if (snap && canUseSnap) {
        setLiveMatches(snap.value.map(m => ({ ...(m as any), isLive: true })));
        setLiveLoading(false);
        setLiveTransport("cache");
      }
    }

    let cancelled = false;
    const LIVE_FALLBACK_DELAYS_MS = [2_000, 3_500, 5_000, 8_000] as const;
    const getFallbackDelay = () =>
      LIVE_FALLBACK_DELAYS_MS[Math.min(livePollBackoffStepRef.current, LIVE_FALLBACK_DELAYS_MS.length - 1)]!;
    const resetFallbackBackoff = () => {
      livePollBackoffStepRef.current = 0;
    };
    const advanceFallbackBackoff = () => {
      livePollBackoffStepRef.current = Math.min(
        livePollBackoffStepRef.current + 1,
        LIVE_FALLBACK_DELAYS_MS.length - 1,
      );
    };

    // ── 2. Open SSE for real-time push updates (<100ms latency) ─────────────
    const openSSE = () => {
      if (sseRef.current) return; // already open
      if (typeof window === "undefined" || !("EventSource" in window)) {
        setLiveTransport(browserOnline ? "polling" : "cache");
        return;
      }

      let es: EventSource;
      try {
        es = new EventSource("/api/matches/live-stream");
      } catch {
        setLiveTransport(browserOnline ? "polling" : "cache");
        return;
      }

      sseRef.current = es;
      es.onopen = () => {
        sseActiveRef.current = true;
        resetFallbackBackoff();
        setLiveTransport("sse");
      };
      es.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data) as any;
          resetFallbackBackoff();
          setLiveTransport("sse");
          if (data.type === "update" && data.matchId) {
            // Sub-second delta — patch just the changed match
            const matchId = String(data.matchId);
            const isTennisDelta = matchId.includes("tennis");
            const msgNow = Date.now();
            liveDataFetchedAt.current = msgNow;
            matchLastSeenRef.current[matchId] = msgNow;
            const deltaMinuteRaw = data.delta?.minute;
            if (typeof deltaMinuteRaw === "number" && Number.isFinite(deltaMinuteRaw)) {
              const prevMinute = apiMinutesRef.current[matchId];
              if (typeof prevMinute !== "number" || deltaMinuteRaw >= prevMinute) {
                apiMinutesRef.current[matchId] = deltaMinuteRaw;
                if (typeof prevMinute !== "number" || deltaMinuteRaw > prevMinute) {
                  minuteChangedAtRef.current[matchId] = msgNow;
                }
              }
            }
            setLiveMatches(prev => prev.map(m =>
              String(m.id) === matchId ? { ...m, ...(data.delta ?? {}), isLive: true } : m
            ));
            if (isTennisDelta) {
              void refreshLiveMatchById(matchId, { forceFresh: true, syncExpanded: true });
            }
          } else if (data.type === "batch_update" && Array.isArray(data.updates)) {
            const msgNow = Date.now();
            liveDataFetchedAt.current = msgNow;
            const tennisIds = new Set<string>();
            setLiveMatches(prev => {
              if (prev.length === 0) return prev;
              const next = [...prev];
              let changed = false;
              for (const upd of data.updates as Array<{ matchId?: string; delta?: Partial<Match> }>) {
                const matchId = String(upd?.matchId ?? "");
                if (!matchId || !upd?.delta || typeof upd.delta !== "object") continue;
                if (matchId.includes("tennis")) tennisIds.add(matchId);
                matchLastSeenRef.current[matchId] = msgNow;
                const deltaMinuteRaw = (upd.delta as Match).minute;
                if (typeof deltaMinuteRaw === "number" && Number.isFinite(deltaMinuteRaw)) {
                  const prevMinute = apiMinutesRef.current[matchId];
                  if (typeof prevMinute !== "number" || deltaMinuteRaw >= prevMinute) {
                    apiMinutesRef.current[matchId] = deltaMinuteRaw;
                    if (typeof prevMinute !== "number" || deltaMinuteRaw > prevMinute) {
                      minuteChangedAtRef.current[matchId] = msgNow;
                    }
                  }
                }
                const idx = next.findIndex(m => String(m.id) === matchId);
                if (idx < 0) continue;
                next[idx] = { ...next[idx], ...(upd.delta as Partial<Match>), isLive: true };
                changed = true;
              }
              return changed ? next : prev;
            });
            for (const tennisId of tennisIds) {
              void refreshLiveMatchById(tennisId, { forceFresh: true, syncExpanded: true });
            }
          } else if (Array.isArray(data.matches)) {
            // Full snapshot from server broadcast
            writeSnapshot(liveSnapshotKey(), data.matches);
            processLiveData(data);
            setLiveLoading(false);
          }
        } catch { /* ignore malformed frames */ }
      };
      es.onerror = () => {
        // SSE dropped — close and fall back to polling
        es.close();
        if (sseRef.current === es) { sseRef.current = null; sseActiveRef.current = false; }
        setLiveTransport(browserOnline ? "polling" : "cache");
        if (sseReconnectTimerRef.current) clearTimeout(sseReconnectTimerRef.current);
        // Reconnect quickly when the live stream drops
        sseReconnectTimerRef.current = setTimeout(() => {
          if (sseRef.current === null && activeTabRef.current === "live") openSSE();
        }, 2_000);
      };
    };
    openSSE();

    // ── 3. HTTP fallback poll with progressive backoff while SSE is degraded ──
    // Handles: first load before SSE delivers, SSE failure gaps, idle recovery.
    const scheduleFallbackPoll = (delayMs: number) => {
      if (cancelled) return;
      if (livePollTimerRef.current) clearTimeout(livePollTimerRef.current);
      livePollTimerRef.current = setTimeout(async () => {
        if (cancelled) return;
        const streamAgeMs = Date.now() - (liveDataFetchedAt.current ?? 0);
        const sseHealthy = sseActiveRef.current && streamAgeMs <= 6_000;

        if (!sseHealthy) {
          const result = await fetchLive(false);
          if (result === "success" && sseActiveRef.current) resetFallbackBackoff();
          else if (result !== "skipped") advanceFallbackBackoff();
        } else {
          resetFallbackBackoff();
        }

        if (!cancelled) scheduleFallbackPoll(getFallbackDelay());
      }, delayMs);
    };

    resetFallbackBackoff();
    fetchLive(!hasMatches);
    scheduleFallbackPoll(getFallbackDelay());

    return () => {
      cancelled = true;
      if (livePollTimerRef.current) { clearTimeout(livePollTimerRef.current); livePollTimerRef.current = null; }
      if (sseReconnectTimerRef.current) { clearTimeout(sseReconnectTimerRef.current); sseReconnectTimerRef.current = null; }
      if (liveFetchCtrlRef.current) { try { liveFetchCtrlRef.current.abort(); } catch {} liveFetchCtrlRef.current = null; }
      liveFetchInFlightRef.current = false;
      livePollBackoffStepRef.current = 0;
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
      sseActiveRef.current = false;
    };
  }, [activeTab, browserOnline, fetchLive, liveSnapshotKey, readSnapshot, processLiveData, refreshLiveMatchById, writeSnapshot]); // all stable refs

  useEffect(() => {
    if (activeTab !== "live") return;
    if (liveMatches.length === 0) return;
    if (document.visibilityState === "hidden") return;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 12_000);
    const run = async () => {
      const ids = liveMatches.slice(0, 2).map(m => String(m.id));
      for (const id of ids) {
        if (ctrl.signal.aborted) return;
        if (livePrefetchingRef.current.has(id)) continue;
        const snap = readSnapshot<Match>(matchSnapshotKey(id));
        const canUseSnap = !!(snap && (Date.now() - snap.savedAt) < LIVE_SNAPSHOT_MAX_AGE_MS && snap.value);
        if (canUseSnap) continue;
        livePrefetchingRef.current.add(id);
        try {
          const isTennis = liveMatches.find(m => String(m.id) === id)?.sport === "tennis";
          const qs = isTennis ? "?fresh=1" : "";
          const r = await fetch(`/api/matches/live-match/${encodeURIComponent(id)}${qs}`, { signal: ctrl.signal });
          const d = r.ok ? await r.json() : null;
          const m = d?.match as Match | null | undefined;
          if (m) writeSnapshot(matchSnapshotKey(id), m as any);
        } catch {
        } finally {
          livePrefetchingRef.current.delete(id);
        }
      }
    };
    const t = setTimeout(() => { run(); }, 700);
    return () => {
      clearTimeout(t);
      clearTimeout(tid);
      ctrl.abort();
    };
  }, [activeTab, liveMatches, matchSnapshotKey, readSnapshot, refreshLiveMatchById, writeSnapshot]);

  // Keep liveMatchesRef always in sync so effects can read it without deps
  useEffect(() => { liveMatchesRef.current = liveMatches; }, [liveMatches]);

  // Track disappearing live matches to store final scores
  useEffect(() => {
    const prev = prevLiveMatchesRef.current;
    const currentIds = new Set(liveMatches.map(m => m.id));
    for (const m of prev) {
      if (!currentIds.has(m.id)) {
        const normT = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const key = `${normT(m.home)}-${normT(m.away)}`;
        finishedMatchScores.current.set(key, { home: m.homeScore ?? 0, away: m.awayScore ?? 0 });
      }
    }
    prevLiveMatchesRef.current = [...liveMatches];
  }, [liveMatches]);

  // Poll tennis, basketball, hockey, volleyball odds every 60s
  useEffect(() => {
    const poll = () => {
      fetch("/api/matches/tennis-odds")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.odds) setTennisOddsMatches(d.odds); })
        .catch(() => { /* non-critical */ });
      fetch("/api/matches/basketball-odds")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.odds) setBasketballOddsMatches(d.odds); })
        .catch(() => { /* non-critical */ });
      fetch("/api/matches/hockey-odds")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.odds) setHockeyOddsMatches(d.odds); })
        .catch(() => { /* non-critical */ });
      fetch("/api/matches/mlb-odds")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.odds) setMlbOddsMatches(d.odds); })
        .catch(() => { /* non-critical */ });
      fetch("/api/matches/volleyball-odds")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.odds) setVolleyOddsMatches(d.odds); })
        .catch(() => { /* non-critical */ });
    };
    const id = setInterval(poll, 60000);
    return () => clearInterval(id);
  }, []);

  const fetchMyBets = useCallback(async (silent = false) => {
    if (!auth.token) return;
    if (!silent) setMyBetsLoading(true);
    try {
      const res = await fetch("/api/bets/my", {
        headers: { Authorization: `Bearer ${auth.token}` }
      });
      if (res.ok) {
        const bets: UserBet[] = await res.json();
        setMyBets(bets);
        myBetsInitialized.current = true;
        const currentWonIds = new Set(bets.filter(b => b.status === "won").map(b => b.id));
        let handledByStorage = false;
        if (auth.user?.id) {
          const key = `bet62_seen_won_${auth.user.id}`;
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const arr = JSON.parse(raw) as unknown;
              const seen = new Set<number>(Array.isArray(arr) ? (arr as unknown[]).map(n => Number(n)).filter(n => Number.isFinite(n)) : []);
              const newWon = bets.filter(b => b.status === "won" && !seen.has(b.id));
              if (newWon.length > 0) {
                const biggest = newWon.reduce((a, b) =>
                  parseFloat(a.potentialWin) >= parseFloat(b.potentialWin) ? a : b
                );
                setWinAnim({ amount: parseFloat(biggest.potentialWin), title: biggest.matchTitle ?? "Aposta" });
                void auth.refreshUser();
              }
              const merged = new Set<number>([...seen, ...currentWonIds]);
              localStorage.setItem(key, JSON.stringify(Array.from(merged)));
              handledByStorage = true;
            } else {
              localStorage.setItem(key, JSON.stringify(Array.from(currentWonIds)));
              handledByStorage = true;
            }
          } catch {
            handledByStorage = false;
          }
        }

        if (!handledByStorage) {
          if (prevWonBetIds.current !== null) {
            const newWon = bets.filter(b => b.status === "won" && !prevWonBetIds.current!.has(b.id));
            if (newWon.length > 0) {
              const biggest = newWon.reduce((a, b) =>
                parseFloat(a.potentialWin) >= parseFloat(b.potentialWin) ? a : b
              );
              setWinAnim({ amount: parseFloat(biggest.potentialWin), title: biggest.matchTitle ?? "Aposta" });
              void auth.refreshUser();
            }
          }
          prevWonBetIds.current = currentWonIds;
        } else {
          prevWonBetIds.current = currentWonIds;
        }
      }
    } catch {
      if (!silent) toast.error("Erro ao carregar apostas");
    } finally {
      if (!silent) setMyBetsLoading(false);
    }
  }, [auth.token]);

  const applyOpenBetStatePayload = useCallback((incoming: Array<{
    betId: number;
    statusPreview: "pending" | "won" | "lost" | "void";
    selections: OpenBetSelectionState[];
  }>) => {
      const pendingIds = myBets.filter((bet) => bet.status === "pending").map((bet) => bet.id);
      if (pendingIds.length === 0) return;
      const incomingIds = new Set(incoming.map((bet) => bet.betId));
      if (pendingIds.some((id) => !incomingIds.has(id))) {
        void fetchMyBets(true);
        return;
      }
      const stateMap = new Map(incoming.map((bet) => [bet.betId, bet] as const));
      setMyBets((prev) => prev.map((bet) => {
        if (bet.status !== "pending") return bet;
        const next = stateMap.get(bet.id);
        if (!next) return bet;
        const baseSelections = getBetSelections(bet);
        const mergedSelections = baseSelections.map((sel, index) => {
          const update = next.selections[index];
          if (!update) return sel;
          return {
            ...sel,
            ...(update.finalScore ? { finalScore: update.finalScore } : {}),
            ...(update.htScore ? { htScore: update.htScore } : {}),
            outcome: update.outcome === "pending" ? (sel.outcome ?? null) : update.outcome,
          };
        });
        return {
          ...bet,
          selections: mergedSelections,
          statusPreview: next.statusPreview,
        };
      }));
  }, [myBets, fetchMyBets]);

  const fetchOpenBetStates = useCallback(async () => {
    if (!auth.token) return;
    const pendingIds = myBets.filter((bet) => bet.status === "pending").map((bet) => bet.id);
    if (pendingIds.length === 0) return;
    try {
      const res = await fetch("/api/bets/open-states", {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (!res.ok) return;
      const data = await res.json() as {
        bets?: Array<{
          betId: number;
          statusPreview: "pending" | "won" | "lost" | "void";
          selections: OpenBetSelectionState[];
        }>;
      };
      applyOpenBetStatePayload(Array.isArray(data.bets) ? data.bets : []);
    } catch {
      // non-critical lightweight refresh
    }
  }, [auth.token, myBets, applyOpenBetStatePayload]);

  useEffect(() => {
    if (cashoutExpandedId == null) return;
    const bet = myBets.find(b => b.id === cashoutExpandedId);
    if (!bet || bet.status !== "pending" || bet.cashoutStatus !== "available") {
      setCashoutExpandedId(null);
    }
  }, [cashoutExpandedId, myBets]);

  // Auto-refresh bets every 10s for any logged-in user — detects settlements quickly.
  // 10s is fast enough that a settled bet appears within seconds of the 15s worker cycle.
  useEffect(() => {
    if (!auth.token) return;
    const id = setInterval(() => fetchMyBets(true), 10000);
    return () => clearInterval(id);
  }, [auth.token, fetchMyBets]);

  // Immediately fetch bets whenever "Minhas Apostas" tab becomes active
  // (in addition to the interval above, so there's no wait on tab open)
  useEffect(() => {
    if (activeTab === "mybets" && auth.token) {
      void fetchMyBets(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Real-time stream for pending ticket states, with fetch fallback if SSE drops.
  useEffect(() => {
    if (activeTab !== "mybets" || !auth.token) return;
    void fetchOpenBetStates();
    if (typeof window === "undefined" || !("EventSource" in window)) {
      const fallbackId = window.setInterval(() => { void fetchOpenBetStates(); }, 5000);
      return () => window.clearInterval(fallbackId);
    }

    let closed = false;
    const openStream = () => {
      if (openBetsSseRef.current || closed) return;
      try {
        const es = new EventSource(`/api/bets/open-states-stream?token=${encodeURIComponent(auth.token)}`);
        openBetsSseRef.current = es;
        es.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data) as {
              bets?: Array<{
                betId: number;
                statusPreview: "pending" | "won" | "lost" | "void";
                selections: OpenBetSelectionState[];
              }>;
            };
            applyOpenBetStatePayload(Array.isArray(data.bets) ? data.bets : []);
          } catch {
            // ignore malformed frames
          }
        };
        es.onerror = () => {
          es.close();
          if (openBetsSseRef.current === es) openBetsSseRef.current = null;
          void fetchOpenBetStates();
          if (openBetsSseReconnectRef.current) clearTimeout(openBetsSseReconnectRef.current);
          openBetsSseReconnectRef.current = setTimeout(() => {
            if (!closed && activeTabRef.current === "mybets" && openBetsSseRef.current === null) openStream();
          }, 2000);
        };
      } catch {
        void fetchOpenBetStates();
      }
    };

    openStream();
    return () => {
      closed = true;
      if (openBetsSseReconnectRef.current) {
        clearTimeout(openBetsSseReconnectRef.current);
        openBetsSseReconnectRef.current = null;
      }
      if (openBetsSseRef.current) {
        openBetsSseRef.current.close();
        openBetsSseRef.current = null;
      }
    };
  }, [activeTab, auth.token, fetchOpenBetStates]);

  // Keep a live snapshot in My Bets so ongoing events still show live badge/score.
  useEffect(() => {
    if (activeTab !== "mybets") return;
    void fetchLive(false);
    const id = window.setInterval(() => {
      void fetchLive(false);
    }, 12000);
    return () => window.clearInterval(id);
  }, [activeTab, fetchLive]);

  // Auto-dismiss win animation after 5s
  useEffect(() => {
    if (!winAnim) return;
    const t = setTimeout(() => setWinAnim(null), 5000);
    return () => clearTimeout(t);
  }, [winAnim]);

  // Auto-dismiss cashout animation after 3s
  useEffect(() => {
    if (!cashoutAnim) return;
    const t = setTimeout(() => setCashoutAnim(null), 3000);
    return () => clearTimeout(t);
  }, [cashoutAnim]);

  // Auto-dismiss bet placed animation after 2.5s
  useEffect(() => {
    if (!betPlacedAnim) return;
    const t = setTimeout(() => setBetPlacedAnim(false), 2500);
    return () => clearTimeout(t);
  }, [betPlacedAnim]);

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
      if (!res.ok) {
        if (handleInvalidTokenError(res.status, data.error)) return;
        toast.error(data.error || "Erro ao fazer cash out");
        return;
      }
      setCashoutAnim({ amount: parseFloat(data.cashoutValue) });
      auth.refreshUser();
      fetchMyBets();
    } catch {
      toast.error("Erro ao fazer cash out");
    } finally {
      setCashingOut(null);
      setCashoutExpandedId(null);
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

  const handleInvalidTokenError = (status?: number, error?: string) => {
    const normalizedError = String(error ?? "").trim().toLowerCase();
    const isInvalidToken =
      status === 401 ||
      normalizedError.includes("invalid token") ||
      normalizedError.includes("jwt");
    if (!isInvalidToken) return false;
    auth.invalidateSession("Sessão expirada. Entre novamente para apostar ou pagar.");
    setAuthMode("login");
    setAuthModalOpen(true);
    setDepositModalOpen(false);
    return true;
  };


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
        league: match.league,
        country: match.country,
        sport: match.sport,
        date: match.date,
        time: match.time,
        scheduledDate: (match as any).scheduledDate,
        scheduledTime: (match as any).scheduledTime,
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

  // ── Lock screen handlers ────────────────────────────────────────────────────
  const handlePasswordUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lockPassword || !auth.user) return;
    setLockLoading(true);
    setLockError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: auth.user.email, password: lockPassword }),
      });
      if (res.ok) {
        setIsLocked(false);
        resetIdle();
        auth.refreshUser();
      } else {
        const data = await res.json();
        setLockError(data.error || "Password incorreta");
      }
    } catch {
      setLockError("Erro de ligação. Tente novamente.");
    } finally {
      setLockLoading(false);
    }
  };

  const handleBiometricUnlock = useCallback(async () => {
    if (!biometricCredentialId) return;
    setBiometricLoading(true);
    setLockError("");
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const credIdBytes = Uint8Array.from(atob(biometricCredentialId), c => c.charCodeAt(0));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname,
          allowCredentials: [{ type: "public-key" as const, id: credIdBytes }],
          userVerification: "required",
          timeout: 60000,
        },
      });
      if (assertion) {
        setIsLocked(false);
        resetIdle();
        auth.refreshUser();
      }
    } catch {
      setLockError("Verificação biométrica cancelada ou falhou.");
    } finally {
      setBiometricLoading(false);
    }
  }, [biometricCredentialId, resetIdle, auth]);

  const handleRegisterBiometric = async () => {
    if (!auth.user) return;
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "Bet62", id: window.location.hostname },
          user: {
            id: new TextEncoder().encode(auth.user.id?.toString() ?? auth.user.email),
            name: auth.user.email,
            displayName: auth.user.name ?? auth.user.email,
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" as const },
            { alg: -257, type: "public-key" as const },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "preferred",
          },
          timeout: 60000,
        },
      }) as PublicKeyCredential | null;
      if (credential) {
        const credIdB64 = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
        try { localStorage.setItem("bet62_biometric_credential", credIdB64); } catch { /* private mode */ }
        setBiometricCredentialId(credIdB64);
        setShowBiometricSetup(false);
        toast.success("Desbloqueio biométrico ativado!");
      }
    } catch {
      toast.error("Não foi possível ativar o desbloqueio biométrico.");
      setShowBiometricSetup(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      await auth.login(loginEmail, loginPassword);
      setAuthModalOpen(false);
      toast.success("Bem-vindo de volta!");
      setLoginEmail(""); setLoginPassword("");
      // Offer biometric setup if available and not yet registered
      if (biometricAvailable && !biometricCredentialId) {
        setTimeout(() => setShowBiometricSetup(true), 800);
      }
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
    const nifDigits = regNif.replace(/\s/g, "");
    if (!validatePortugueseNif(nifDigits)) {
      toast.error("NIF inválido. Insira um NIF português válido com 9 dígitos.");
      return;
    }
    setAuthLoading(true);
    try {
      await auth.register(regName, regEmail, regPassword, nifDigits);
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
    if (!auth.user) { setAuthMode("login"); setAuthModalOpen(true); return; }

    // Guard: block placement if any live selection has an active market suspension
    {
      const now = Date.now();
      const suspendedBet = bets.find(bet => {
        const lm = liveMatches.find(m => String(m.id) === String(bet.matchId));
        if (!lm?.marketSuspension) return false;
        const mk = bet.market ?? "result";
        return (lm.marketSuspension[mk] ?? 0) > now || (lm.marketSuspension["result"] ?? 0) > now;
      });
      if (suspendedBet) {
        const lm = liveMatches.find(m => String(m.id) === String(suspendedBet.matchId));
        const reason = lm?._suspensionReason ?? "SUSPENSO";
        toast.error(`${reason} — Odds em atualização. Aguarde e tente novamente.`);
        return;
      }
    }

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
              selections: [{
                matchId: String(bet.matchId),
                matchTitle: bet.matchTitle,
                league: bet.league,
                country: bet.country,
                sport: bet.sport,
                date: bet.date,
                time: bet.time,
                scheduledDate: bet.scheduledDate,
                scheduledTime: bet.scheduledTime,
                selection: bet.selection,
                odd: bet.odd,
                market: bet.market,
                label: bet.label || bet.selection,
              }],
              stake: sNum.toFixed(2),
              potentialWin,
              totalOdds: bet.odd.toFixed(2),
            })
          });
          const data = await res.json();
          if (!res.ok) {
            if (handleInvalidTokenError(res.status, data.error)) { allOk = false; break; }
            toast.error(data.error || "Erro ao realizar aposta");
            allOk = false;
            break;
          }
        }
        if (allOk) {
          toast.success(`${bets.length} aposta${bets.length > 1 ? "s" : ""} realizada${bets.length > 1 ? "s" : ""}! Total: € ${totalCost.toFixed(2)}`);
          setBetPlacedAnim(true);
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
          selections: bets.map(b => ({
            matchId: String(b.matchId),
            matchTitle: b.matchTitle,
            league: b.league,
            country: b.country,
            sport: b.sport,
            date: b.date,
            time: b.time,
            scheduledDate: b.scheduledDate,
            scheduledTime: b.scheduledTime,
            selection: b.selection,
            odd: b.odd,
            market: b.market,
            label: b.label || b.selection,
          })),
          stake: stakeNum.toFixed(2),
          potentialWin,
          totalOdds,
        })
      });
      const data = await res.json();
      if (!res.ok) {
        if (handleInvalidTokenError(res.status, data.error)) return;
        toast.error(data.error || "Erro ao realizar aposta");
        return;
      }
      toast.success(`Aposta múltipla realizada! Potencial de ganho: € ${potentialWin}`);
      setBetPlacedAnim(true);
      setBets([]); setBetStakes({}); setStake(""); setBetSlipOpenMobile(false); auth.refreshUser();
    } catch { toast.error("Erro ao realizar aposta"); } finally { setIsPlacingBet(false); }
  };

  // --- UI Components ---

  // Minimum change (vs previous API poll) required to show ▲/▼ arrow and flash.
  // Filters out micro-oscillations — server controls the real update cadence.
  const ODDS_ANIM_THRESHOLD = 0.02;

  const hasBlockingSuspensionReason = (match: Match) => {
    const rawReason = String(match._suspensionReason ?? "").trim().toUpperCase();
    if (!rawReason) return false;
    if (rawReason === "SINAL INSTÁVEL") return false;
    return true;
  };

  const OddsButton = ({ match, selection, odd, market = "result", label, grow, variant = "default" }: {
    match: Match; selection: string; odd: number; market?: string; label: string; grow?: boolean; variant?: "default" | "worldcup";
  }) => {
    if ((match.sport ?? "football") === "tennis" && selection === "draw") return null;
    const now = Date.now();
    const suspendedUntil = match.marketSuspension?.[market];
    const isSuspended = suspendedUntil !== undefined && suspendedUntil > now;
    const isSelected = !!bets.find(b => b.matchId === match.id && b.market === market && b.selection === selection);
    const prevOdd = match.isLive ? prevLiveOdds.current[String(match.id)]?.[selection as keyof Odds] : undefined;
    // Arrow only when actual API value changed enough — server now controls cadence
    const delta = prevOdd !== undefined ? odd - prevOdd : 0;
    const oddsUp   = !isSuspended && delta >= ODDS_ANIM_THRESHOLD;
    const oddsDown = !isSuspended && delta <= -ODDS_ANIM_THRESHOLD;
    const isWCVariant = variant === "worldcup";
    const baseBoxClass = isWCVariant
      ? `${grow ? "flex-1" : ""} h-[64px] rounded-xl border px-1 flex flex-col items-center justify-center min-w-0`
      : `${grow ? "flex-1" : ""} h-10 px-2 rounded-md text-xs flex flex-col items-center justify-center`;

    if (isSuspended) {
      return (
        <div className={`relative ${baseBoxClass} ${isWCVariant ? (isDarkTheme ? "border-zinc-800 bg-zinc-900/60 opacity-60" : "border-zinc-200 bg-zinc-100 opacity-60") : "bg-zinc-800/40 border-zinc-700/30 opacity-70"} select-none`}>
          <span className={`${isWCVariant ? "text-[10px] text-zinc-500" : "text-[10px] leading-none opacity-60"}`}>{label}</span>
          <span className={`${isWCVariant ? `mt-1 text-sm font-black ${isDarkTheme ? "text-zinc-600" : "text-zinc-400"}` : "font-bold text-sm leading-none text-zinc-300"} tabular-nums line-through`}>{odd.toFixed(2)}</span>
        </div>
      );
    }

    if (odd < 1.15 && market === "result") {
      return (
        <div className={`relative ${baseBoxClass} ${isWCVariant ? (isDarkTheme ? "border-zinc-800 bg-zinc-900" : "border-zinc-200 bg-white") : "bg-zinc-800/40 border-zinc-700/30"}`}>
          <span className={`${isWCVariant ? "text-[10px] text-zinc-500" : "text-[10px] leading-none opacity-40"}`}>{label}</span>
          <span className={`${isWCVariant ? `mt-1 text-sm font-black ${isDarkTheme ? "text-zinc-600" : "text-zinc-400"}` : "font-bold text-base leading-none text-zinc-600"} tabular-nums`}>--</span>
        </div>
      );
    }

    const isObviousResult = match.isLive && market === "result" && (() => {
      if (odd <= 1.05) return true;
      const min = getDisplayMinute(match);
      const diff = Math.abs((match.homeScore ?? 0) - (match.awayScore ?? 0));
      if (min >= 80 && diff >= 2) return true;
      if (min >= 85 && diff >= 1) return true;
      return false;
    })();
    if (isObviousResult) {
      return (
        <div className={`relative ${baseBoxClass} ${isWCVariant ? "bg-amber-50 border-amber-200" : "bg-amber-900/20 border-amber-600/30"}`}>
          <span className={`${isWCVariant ? "text-[11px] font-medium text-amber-700" : "text-[10px] leading-none opacity-50"}`}>{label}</span>
          <span className={`${isWCVariant ? "mt-1 text-[10px] font-black tracking-widest text-amber-600" : "font-bold text-[9px] leading-none text-amber-400 uppercase tracking-wider"} uppercase`}>Aposta Já</span>
        </div>
      );
    }

    const flashClass = isWCVariant ? "" : (!isSelected && oddsUp ? "odds-flash-up" : !isSelected && oddsDown ? "odds-flash-down" : "");

    return (
      <button
        {...makeTap(() => toggleBet(match, selection, odd, market, label))}
        className={`relative ${baseBoxClass} transition-colors ${isWCVariant ? "" : "text-xs"} ${
          isSelected
            ? (isWCVariant ? "border-red-500 bg-red-600/15 ring-1 ring-red-400/30" : "bg-red-600 text-white")
            : (isWCVariant ? (isDarkTheme ? "border-zinc-800 bg-zinc-900 hover:border-zinc-700" : "border-zinc-200 bg-white hover:border-zinc-300") : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300")
        } ${flashClass}`}
      >
        <span className={`${isWCVariant ? `text-[10px] mb-1 truncate w-full text-center px-0.5 ${isDarkTheme ? "text-zinc-500" : "text-zinc-500"}` : "text-[10px] leading-none opacity-70"}`}>{label}</span>
        <span className={`${isWCVariant ? `text-sm font-black tabular-nums flex items-center gap-0.5 ${isSelected ? "text-red-400" : isDarkTheme ? "text-white" : "text-zinc-900"}` : "font-bold text-sm leading-none tabular-nums flex items-center gap-0.5"} ${isSelected && !isWCVariant ? "!text-white" : ""}`}>
          {odd.toFixed(2)}
          {oddsUp   && <span className="text-green-400 text-[9px] font-black leading-none shrink-0">▲</span>}
          {oddsDown && <span className="text-red-400  text-[9px] font-black leading-none shrink-0">▼</span>}
        </span>
      </button>
    );
  };

  // Returns a full-width animated suspension banner; null when no suspension.
  // Only the `result` market key triggers the global banner — permanently-settled
  // set/period markets (firstSet, set2, etc.) have a far-future timestamp and
  // must NOT activate the banner, as they are settled rather than truly suspended.
  const SuspensionBanner = ({ match }: { match: Match }) => {
    const now = Date.now();
    const isActive = (match.marketSuspension?.["result"] != null && match.marketSuspension["result"] > now)
      || hasBlockingSuspensionReason(match);
    if (!isActive) return null;
    const rawReason = (match._suspensionReason ?? "SUSPENSO").toUpperCase();
    let label = "SUSPENSO";
    let prefix = "";
    if (rawReason.includes("GOLO") || rawReason.includes("GOAL")) { label = "GOLO!"; }
    else if (rawReason.includes("VAR")) { prefix = "🎥 "; label = "REVISÃO VAR"; }
    else if (rawReason.includes("PENAL")) { label = "PENÁLTI"; }
    else if (rawReason.includes("CHANCE")) { label = "GRANDE CHANCE"; }
    return (
      <button
        disabled
        className="w-full h-10 px-3 flex items-center justify-center rounded-md bg-red-950 border border-red-800/50 text-red-200 font-black text-sm tracking-widest cursor-not-allowed select-none animate-pulse"
        style={{ letterSpacing: "0.2em" }}
      >
        {prefix}{label}
      </button>
    );
  };

  // Compact league/meta row (no banner)
  const CompactLeagueRow = ({ match, rightSlot }: { match: Match; rightSlot?: ReactNode }) => {
    const countryFlag = COUNTRY_FLAGS[match.country?.toLowerCase() ?? ""];
    const flag = countryFlag ?? sportEmoji(match.sport);
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
            {countryFlag && (
              <span className="absolute -bottom-0.5 -right-1 bg-zinc-950 rounded-full text-[9px] w-3.5 h-3.5 flex items-center justify-center border border-zinc-800">{sportEmoji(match.sport)}</span>
            )}
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
    const matchKey  = String(match.id);
    const bannerImg = getMatchBannerStable(match);
    const homeName = teamNamePt(match.home);
    const awayName = teamNamePt(match.away);
    const dateStr = (match.scheduledDate ?? match.date) ? formatMatchDate(match.scheduledDate ?? match.date ?? "") : "";
    const isNew     = !seenMatchIds.current.has(matchKey);
    if (isNew) seenMatchIds.current.add(matchKey);

    // ── Progress bar width per sport ──────────────────────────────────────────
    const progress = (() => {
      if (sport === "basketball") return Math.min(100, (minute / 48) * 100);
      if (sport === "hockey")     return Math.min(100, (minute / 60) * 100);
      if (sport === "baseball")   return Math.min(100, (minute / 9) * 100);
      if (sport === "tennis")     return Math.min(100, (minute / 5) * 100);
      if (sport === "volleyball") return Math.min(100, (minute / 5) * 100);
      return Math.min(100, (minute / 90) * 100);
    })();

    // ── Live badge label per sport ────────────────────────────────────────────
    const liveBadgeLabel = (() => {
      if (sport === "basketball" && match.status) {
        const s = match.status;
        const lbl = s === "HT" || s === "Halftime" ? "Int." : s;
        return `${lbl}${extra?.clockStr ? ` · ${extra.clockStr}` : ""}`;
      }
      if (sport === "hockey" && match.status) {
        const s = match.status;
        const lbl = s === "1P" || s === "P1" ? "1º Per."
          : s === "2P" || s === "P2" ? "2º Per."
          : s === "3P" || s === "P3" ? "3º Per."
          : s.includes("Break") || s === "INT" ? "Int."
          : s; // OT / SO passam direto
        return `${lbl}${extra?.clockStr ? ` · ${extra.clockStr}` : ""}`;
      }
      if (sport === "baseball" && match.status) {
        const s = match.status;
        const m2 = s.match(/\b(\d+)(st|nd|rd|th)\b/i);
        if (m2) return `${m2[1]}ª Ent.`;
        if (s === "Extra Inning") return "Extra";
        return s.replace(/(\d+)(st|nd|rd|th) Inning/i, "$1ª Ent.");
      }
      if (sport === "tennis"     && match.status) return match.status;
      if (sport === "volleyball" && match.status) return match.status;

      const tag = getFootballPhaseTag(match, minute);
      if (tag === "HT") return "HT";
      if (tag === "PEN") return "PEN";
      const minLbl = getFootballClockLabel(match, minute);
      if (tag === "ET") return `ET${minLbl ? ` · ${minLbl}` : ""}`;
      if (tag && minLbl) return `${tag} · ${minLbl}`;
      if (tag) return tag;
      return minLbl || "AO VIVO";
    })();

    // "Em Breve" — upcoming real match, not yet started
    const isEmBreve = match.startsIn !== undefined;
    const countdownLabel = (() => {
      if (!isEmBreve) return "";
      const si = match.startsIn!;
      if (si <= 2) return "A Iniciar";
      if (si < 60) return `Em ${si}min`;
      const h = Math.floor(si / 60);
      const m = si % 60;
      return m > 0 ? `Em ${h}h${m}m` : `Em ${h}h`;
    })();

    // Non-live volleyball states get a muted badge (no pulse)
    const isVolleyNonLive = !isEmBreve && sport === "volleyball" &&
      (match.status === "Encerrado" || (match.status ?? "").startsWith("Hoje"));
    const scheduledDisplay = (() => {
      if (!isEmBreve || !match.scheduledTime) return null;
      const time = match.scheduledTime;
      if (!match.scheduledDate) return time;
      // Check if it's today or tomorrow
      const today = new Date();
      const todayStr = `${String(today.getDate()).padStart(2,"0")}.${String(today.getMonth()+1).padStart(2,"0")}.${today.getFullYear()}`;
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
      const tomorrowStr = `${String(tomorrow.getDate()).padStart(2,"0")}.${String(tomorrow.getMonth()+1).padStart(2,"0")}.${tomorrow.getFullYear()}`;
      if (match.scheduledDate === todayStr) return `Hoje ${time}`;
      if (match.scheduledDate === tomorrowStr) return `Amanhã ${time}`;
      return `${match.scheduledDate} ${time}`;
    })();

    const isStarting = isEmBreve && (match.startsIn ?? 999) <= 2;
    const liveBadge = isEmBreve ? (
      <div className="flex items-center gap-1.5">
        {isStarting ? (
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400"></span>
          </span>
        ) : (
          <Clock size={10} className="text-amber-400 shrink-0" />
        )}
        <span className={`text-[10px] font-bold tabular-nums ${isStarting ? "text-amber-300" : "text-amber-400"}`}>
          {isStarting ? countdownLabel : (scheduledDisplay ?? countdownLabel)}
        </span>
      </div>
    ) : isVolleyNonLive ? (
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
      const serving = extra?.serving;
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
            <div className="flex-1 min-w-0 flex items-center gap-1">
              <span className="w-4 shrink-0 text-yellow-400">{serving?.[0] ? "🎾" : ""}</span>
              <span className="font-bold text-white text-xs truncate">{homeName}</span>
            </div>
            {sets.map(([h], i) => (
              <div key={i} className={`${colW} text-center font-black ${h > (sets[i]?.[1] ?? 0) ? "text-white" : "text-zinc-500"}`}>{h}</div>
            ))}
            {pts && <div className={`w-8 text-center font-black ${hPtColor}`}>{isDeuce ? "D" : `${pts[0]}`}</div>}
          </div>
          {/* Away row */}
          <div className="flex items-center">
            <div className="flex-1 min-w-0 flex items-center gap-1">
              <span className="w-4 shrink-0 text-yellow-400">{serving?.[1] ? "🎾" : ""}</span>
              <span className="font-bold text-white text-xs truncate">{awayName}</span>
            </div>
            {sets.map(([, a], i) => (
              <div key={i} className={`${colW} text-center font-black ${a > (sets[i]?.[0] ?? 0) ? "text-white" : "text-zinc-500"}`}>{a}</div>
            ))}
            {pts && <div className={`w-8 text-center font-black ${aPtColor}`}>{isDeuce ? "D" : `${pts[1]}`}</div>}
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
            <div className="flex-1 font-bold text-white text-xs truncate">{homeName}</div>
            {vSets.map(([h, a], i) => (
              <div key={i} className={`${colW} text-center font-black ${h > a ? "text-white" : "text-zinc-500"}`}>{h}</div>
            ))}
            {pts && <div className={`${colW} text-center font-black text-yellow-400`}>{pts[0]}</div>}
          </div>
          <div className="flex items-center">
            <div className="flex-1 font-bold text-white text-xs truncate">{awayName}</div>
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

    // ── Baseball: inning-by-inning grid ──────────────────────────────────────
    const BaseballScore = ({ big }: { big?: boolean }) => {
      const innings = extra?.innings ?? [];
      const INN_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "E"];
      const outs      = extra?.outs;
      const homeHits  = extra?.homeHits;
      const awayHits  = extra?.awayHits;
      const homeErr   = extra?.homeErrors ?? 0;
      const awayErr   = extra?.awayErrors ?? 0;
      const hasHE     = homeHits !== undefined || awayHits !== undefined;
      if (innings.length === 0) return <SimpleScore big={big} />;
      return (
        <div className="w-full text-xs font-mono tabular-nums">
          {/* Header */}
          <div className="flex items-center mb-0.5">
            <div className="flex-1" />
            {innings.map((_: [number, number], i: number) => (
              <div key={i} className="w-5 text-center text-zinc-500 text-[9px] font-bold">{INN_LABELS[i] ?? "E"}</div>
            ))}
            <div className="w-6 text-center text-zinc-500 text-[9px] font-bold">R</div>
            {hasHE && <div className="w-5 text-center text-zinc-500 text-[9px] font-bold">H</div>}
            {hasHE && <div className="w-5 text-center text-zinc-500 text-[9px] font-bold">E</div>}
          </div>
          {/* Home row */}
          <div className="flex items-center">
            <div className="flex-1 font-bold text-white text-xs truncate">{match.home}</div>
            {innings.map(([h, a]: [number, number], i: number) => (
              <div key={i} className={`w-5 text-center font-black text-[11px] ${h > a ? "text-white" : "text-zinc-500"}`}>{h}</div>
            ))}
            <div className="w-6 text-center font-black text-white">{match.homeScore ?? 0}</div>
            {hasHE && <div className="w-5 text-center font-bold text-zinc-400 text-[11px]">{homeHits ?? 0}</div>}
            {hasHE && <div className="w-5 text-center font-bold text-zinc-600 text-[11px]">{homeErr}</div>}
          </div>
          {/* Away row */}
          <div className="flex items-center">
            <div className="flex-1 font-bold text-white text-xs truncate">{match.away}</div>
            {innings.map(([h, a]: [number, number], i: number) => (
              <div key={i} className={`w-5 text-center font-black text-[11px] ${a > h ? "text-white" : "text-zinc-500"}`}>{a}</div>
            ))}
            <div className="w-6 text-center font-black text-white">{match.awayScore ?? 0}</div>
            {hasHE && <div className="w-5 text-center font-bold text-zinc-400 text-[11px]">{awayHits ?? 0}</div>}
            {hasHE && <div className="w-5 text-center font-bold text-zinc-600 text-[11px]">{awayErr}</div>}
          </div>
          {/* Outs indicator */}
          {outs !== undefined && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">{match.status}</span>
              <span className="text-zinc-700">·</span>
              <div className="flex items-center gap-0.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className={`w-2 h-2 rounded-full border ${i < outs ? "bg-amber-500 border-amber-400" : "bg-transparent border-zinc-700"}`} />
                ))}
              </div>
              <span className="text-[9px] font-bold text-amber-500">{outs} {outs === 1 ? "out" : "outs"}</span>
            </div>
          )}
        </div>
      );
    };

    // Basketball / Hockey / Football: standard home vs away score
    const rcH = match.redCardsHome ?? 0;
    const rcA = match.redCardsAway ?? 0;
    // Small red card icon above team name; count shown inside
    const RcBadge = ({ count }: { count: number }) => count <= 0 ? null : (
      <span className="inline-flex items-center justify-center w-2.5 h-3.5 bg-red-600 rounded-[2px] text-white font-black text-[7px] leading-none select-none shadow mb-0.5">
        {count}
      </span>
    );

    const SimpleScore = ({ big }: { big?: boolean }) => isEmBreve ? (
      <div className="flex items-center gap-2 w-full">
        <span className={`font-bold ${big ? "text-base" : "text-sm"} truncate flex-1 text-right`} style={bannerImg ? { color: '#ffffff' } : undefined}>{homeName}</span>
        <div className={`${big ? "text-3xl" : "text-xl"} font-black tabular-nums shrink-0 ${big ? "px-2" : "px-1"} text-center`} style={{ color: 'rgb(63 63 70)' }}>
          –<span style={{ color: 'rgb(39 39 42)' }} className={big ? "mx-1" : "mx-0.5"}>:</span>–
        </div>
        <span className={`font-bold ${big ? "text-base" : "text-sm"} truncate flex-1`} style={bannerImg ? { color: '#ffffff' } : undefined}>{awayName}</span>
      </div>
    ) : (
      <div className="flex items-center gap-2 w-full">
        {/* Home: name + badge inline, right-aligned toward score */}
        <div className="flex items-center justify-end gap-1 flex-1 min-w-0">
          <span
            className={`font-bold text-white ${big ? "text-base" : "text-sm"} truncate`}
            style={big ? { textShadow: "0 1px 8px rgba(0,0,0,1), 0 2px 16px rgba(0,0,0,0.8)" } : undefined}
          >{homeName}</span>
          <RcBadge count={rcH} />
        </div>
        <div
          className={`${big ? "text-3xl" : "text-xl"} font-black text-white tabular-nums shrink-0 ${big ? "px-2" : "px-1"} text-center`}
          style={big ? { textShadow: "0 1px 8px rgba(0,0,0,1), 0 2px 16px rgba(0,0,0,0.8)" } : undefined}
        >
          {match.homeScore ?? 0}<span className={`${big ? "text-white/60 text-xl mx-0.5" : "text-zinc-600 mx-0.5"}`}>-</span>{match.awayScore ?? 0}
        </div>
        {/* Away: badge + name inline, left-aligned from score */}
        <div className="flex items-center justify-start gap-1 flex-1 min-w-0">
          <RcBadge count={rcA} />
          <span
            className={`font-bold text-white ${big ? "text-base" : "text-sm"} truncate`}
            style={big ? { textShadow: "0 1px 8px rgba(0,0,0,1), 0 2px 16px rgba(0,0,0,0.8)" } : undefined}
          >{awayName}</span>
        </div>
      </div>
    );

    const rivalry = RIVALRY_TAGS[`${match.home}|${match.away}`];
    const motionProps = isNew
      ? { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }
      : {};

    const isObviousLiveResult = match.isLive && (match.sport === "football" || !match.sport) && (() => {
      const minOdd = Math.min(match.odds.home, match.odds.away);
      if (minOdd <= 1.05) return true;
      const min = getDisplayMinute(match);
      const diff = Math.abs((match.homeScore ?? 0) - (match.awayScore ?? 0));
      if (min >= 80 && diff >= 2) return true;
      if (min >= 85 && diff >= 1) return true;
      return false;
    })();

    // Suspension: only the `result` key gates the card odds-row — settled set/period
    // markets have far-future timestamps and must NOT count as "suspended" here.
    const isLiveSuspended = match.isLive && (
      (match.marketSuspension?.["result"] != null && match.marketSuspension["result"] > Date.now())
      || hasBlockingSuspensionReason(match)
    );

    // Penalty shootout: only show winner market with VENCEDOR DA FINAL header
    const isPenShootout = match.isLive && sport === "football" && !!match.markets?.penExtra;

    const canShowOdds = !!(match.hasRealOdds || (match.odds.home > 0 && match.odds.away > 0));
    const stopLiveCardOpen = (e: { stopPropagation: () => void }) => e.stopPropagation();
    const oddsRow = (canShowOdds || match.isLive) ? (
      <div
        className="flex flex-col gap-1.5 w-full mt-1.5"
        onClick={stopLiveCardOpen}
        onTouchStart={stopLiveCardOpen}
        onTouchMove={stopLiveCardOpen}
        onTouchEnd={stopLiveCardOpen}
        onPointerDown={stopLiveCardOpen}
        onPointerMove={stopLiveCardOpen}
        onPointerUp={stopLiveCardOpen}
      >
        {isPenShootout && !isLiveSuspended && (
          <div className="text-[9px] font-black uppercase tracking-widest text-amber-500 text-center">🎯 Vencedor da Final</div>
        )}
        <SuspensionBanner match={match} />
        <div className="flex gap-1.5 w-full">
          {!isLiveSuspended && isPenShootout ? (<>
            <OddsButton match={match} selection="pen-home" odd={match.markets!.penExtra!.winner.home} market="penaltis" label={homeName.split(" ").slice(-1)[0]!} grow variant="worldcup" />
            <OddsButton match={match} selection="pen-away" odd={match.markets!.penExtra!.winner.away} market="penaltis" label={awayName.split(" ").slice(-1)[0]!} grow variant="worldcup" />
          </>) : !isLiveSuspended ? (
            isObviousLiveResult ? (
              <button
                className="flex-1 flex flex-col items-center py-3 px-2 rounded-2xl text-xs border border-amber-200 bg-amber-50"
                {...makeTap(() => setExpandedMatch(match))}
              >
                <span className="font-black text-[11px] text-amber-600 uppercase tracking-widest">Aposta Já</span>
              </button>
            ) : (<>
              <OddsButton match={match} selection="home" odd={match.odds.home} market="result" label={homeName.split(" ").slice(-1)[0]!} grow variant="worldcup" />
              {sport !== "tennis" && match.odds.draw > 0 && <OddsButton match={match} selection="draw" odd={match.odds.draw} market="result" label="Empate" grow variant="worldcup" />}
              <OddsButton match={match} selection="away" odd={match.odds.away} market="result" label={awayName.split(" ").slice(-1)[0]!} grow variant="worldcup" />
            </>)
          ) : null}
        </div>
      </div>
    ) : null;

    return (
      <motion.div
        {...motionProps}
        {...makeTap(() => setExpandedMatch(match))}
        className={`relative overflow-hidden rounded-[24px] border transition-transform cursor-pointer active:scale-[0.99] ${
          isDarkTheme
            ? "border-slate-700 bg-slate-800 shadow-[0_12px_28px_rgba(0,0,0,0.30)]"
            : "border-zinc-200 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.08)]"
        }`}
      >
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-yellow-400 via-orange-500 to-red-600" />
        <div className="px-3.5 pt-3 pb-2.5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="min-w-0 flex items-center gap-2">
              <span className="text-sm leading-none shrink-0">{sport === "football" ? "🏆" : flag}</span>
              <span className={`text-[11px] font-black tracking-[0.18em] uppercase truncate ${isDarkTheme ? "text-zinc-300" : "text-zinc-500"}`}>{match.league}</span>
            </div>
            <div className="shrink-0">{liveBadge}</div>
          </div>
          {rivalry && (
            <div className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-red-500 text-center">
              {rivalry}
            </div>
          )}
          <div className={`rounded-[20px] px-3 py-2.5 border ${isDarkTheme ? "bg-zinc-950 border-zinc-900/80" : "bg-zinc-950 border-zinc-900/80"}`}>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex-1 min-w-0 text-right">
                <span className="block text-[13px] font-black text-white leading-tight truncate">{homeName}</span>
              </div>
              <div className="min-w-[68px] flex flex-col items-center">
                <span className="text-[16px] font-black text-zinc-500 tracking-wide">VS</span>
                {isEmBreve ? (
                  <>
                    {match.time && <span className="mt-0.5 text-[16px] font-black text-white">{match.time}</span>}
                    {dateStr && <span className="mt-0.5 text-[11px] font-semibold text-zinc-400">{dateStr}</span>}
                  </>
                ) : sport === "football" || sport === "basketball" ? (
                  <span className="mt-1 text-[26px] font-black text-white tabular-nums">
                    {match.homeScore ?? 0}<span className="text-zinc-500 mx-1">-</span>{match.awayScore ?? 0}
                  </span>
                ) : null}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <span className="block text-[13px] font-black text-white leading-tight truncate">{awayName}</span>
              </div>
            </div>
            {sport === "tennis"     ? <TennisScore /> :
             sport === "volleyball" ? <VolleyScore /> :
             sport === "hockey"     ? <HockeyScore /> :
             sport === "baseball"   ? <BaseballScore /> :
             sport === "basketball" || sport === "football" ? null :
             <SimpleScore />}
          </div>
          {oddsRow}
        </div>
      </motion.div>
    );
  };

  const stopCardOpen = (e: { stopPropagation: () => void }) => e.stopPropagation();

  const EventTeamBadge = ({ name, badge, badgeFit = "cover", badgePadded = false, sport, flag, isSelection = false, compact = false }: {
    name: string;
    badge?: string;
    badgeFit?: "cover" | "contain";
    badgePadded?: boolean;
    sport: string;
    flag: string;
    isSelection?: boolean;
    compact?: boolean;
  }) => (
    <div className={`${compact ? "w-[46px] h-[46px]" : "w-[54px] h-[54px]"} rounded-full bg-white border border-zinc-200 shadow-[0_0_14px_rgba(234,179,8,0.28)] flex items-center justify-center overflow-hidden ${badgePadded ? "p-1.5" : ""}`}>
      {badge ? (
        <img src={badge} alt={name} className={`w-full h-full ${badgeFit === "contain" ? "object-contain" : "object-cover"}`} loading="lazy" decoding="async" />
      ) : (
        isSelection ? (
          <span className={`${compact ? "text-[22px]" : "text-[26px]"} leading-none`}>
            {sport === "tennis" ? "🎾" : sport === "basketball" ? "🏀" : sport === "hockey" ? "🏒" : sport === "volleyball" ? "🏐" : sport === "baseball" ? "⚾" : flag}
          </span>
        ) : (
          <span className={`${compact ? "text-[12px]" : "text-[14px]"} font-black tracking-wide text-zinc-900`}>
            {teamMonogram(name)}
          </span>
        )
      )}
    </div>
  );

  const MatchCard = ({ match }: { match: Match }) => {
    const sport = match.sport ?? "football";
    const flag = COUNTRY_FLAGS[match.country?.toLowerCase() ?? ""] ?? sportEmoji(match.sport);
    const dateStr = match.date ? formatMatchDate(match.date) : "";
    const rivalry = RIVALRY_TAGS[`${match.home}|${match.away}`];
    const hasDraw = (match.sport ?? "football") !== "tennis" && match.odds.draw > 0;
    const homeName = teamNamePt(match.home);
    const awayName = teamNamePt(match.away);
    const isSuspendedMatch = match.isLive && (
      (!!match.marketSuspension && Object.values(match.marketSuspension).some(ts => ts > Date.now()))
      || hasBlockingSuspensionReason(match)
    );
    const canShowOdds = !!(match.hasRealOdds || (match.odds.home > 0 && match.odds.away > 0));
    const OddsRow = () => canShowOdds ? (
      <div
        className="flex flex-col gap-1.5 w-full"
        onClick={stopCardOpen}
        onTouchStart={stopCardOpen}
        onTouchMove={stopCardOpen}
        onTouchEnd={stopCardOpen}
        onPointerDown={stopCardOpen}
        onPointerMove={stopCardOpen}
        onPointerUp={stopCardOpen}
      >
        <SuspensionBanner match={match} />
        {!isSuspendedMatch && (<>
          <div className="flex gap-1.5 w-full">
            <OddsButton match={match} selection="home" odd={match.odds.home} market="result" label={hasDraw ? homeName : homeName.split(" ").slice(-1)[0]} grow variant="worldcup" />
            {hasDraw && <OddsButton match={match} selection="draw" odd={match.odds.draw} market="result" label="Empate" grow variant="worldcup" />}
            <OddsButton match={match} selection="away" odd={match.odds.away} market="result" label={hasDraw ? awayName : awayName.split(" ").slice(-1)[0]} grow variant="worldcup" />
          </div>
          {!match.hasRealOdds && (
            <div className="flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="text-[10px] font-semibold tracking-wide text-zinc-500">ODDS ESTIMADAS</span>
            </div>
          )}
        </>)}
      </div>
    ) : null;

    return (
      <div
        className={`relative overflow-hidden rounded-[24px] border transition-transform cursor-pointer active:scale-[0.99] ${
          isDarkTheme
            ? "border-slate-700 bg-slate-800 shadow-[0_12px_28px_rgba(0,0,0,0.30)]"
            : "border-zinc-200 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.08)]"
        }`}
        {...makeTap(() => setExpandedMatch(match))}
      >
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-yellow-400 via-orange-500 to-red-600" />
        <div className="px-3.5 pt-3 pb-2.5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="min-w-0 flex items-center gap-2">
              <span className="text-sm leading-none shrink-0">{sport === "football" ? "🏆" : flag}</span>
              <span className={`text-[11px] font-black tracking-[0.18em] uppercase truncate ${isDarkTheme ? "text-zinc-300" : "text-zinc-500"}`}>
                {match.league}
              </span>
            </div>
            <div className={`text-[13px] font-medium shrink-0 ${isDarkTheme ? "text-zinc-300" : "text-zinc-500"}`}>
              {dateStr}{match.time ? ` • ${match.time}` : ""}
            </div>
          </div>
          {rivalry && (
            <div className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-red-500 text-center">
              {rivalry}
            </div>
          )}
          <div className={`flex items-center justify-between gap-3 mb-2 ${isDarkTheme ? "rounded-[20px] bg-zinc-950 border border-zinc-900/80 px-3 py-2.5" : "px-1 py-1"}`}>
            <div className="flex-1 min-w-0 text-right">
              <span className={`block text-[14px] font-black leading-tight truncate ${isDarkTheme ? "text-white" : "text-zinc-900"}`}>
                {homeName}
              </span>
            </div>
            <div className="min-w-[68px] flex flex-col items-center">
              <span className="text-[16px] font-black text-zinc-500 tracking-wide">VS</span>
              {match.time && <span className={`mt-0.5 text-[16px] font-black ${isDarkTheme ? "text-white" : "text-zinc-900"}`}>{match.time}</span>}
              {dateStr && <span className={`mt-0.5 text-[11px] font-semibold ${isDarkTheme ? "text-zinc-400" : "text-zinc-500"}`}>{dateStr}</span>}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <span className={`block text-[14px] font-black leading-tight truncate ${isDarkTheme ? "text-white" : "text-zinc-900"}`}>
                {awayName}
              </span>
            </div>
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
      { title: "MÚLTIPLAS", subtitle: "POPULARES", label: "🔥 COMBOS POPULARES",   count: "200+ apostas" },
      { title: "TOP",       subtitle: "APOSTAS",   label: "⭐ MAIS APOSTADOS",      count: "150+ apostas" },
      { title: "ALTA",      subtitle: "RETORNO",   label: "💰 ALTO RETORNO",         count: "100+ apostas" },
      { title: "EM",        subtitle: "DESTAQUE",  label: "🏆 FAVORITOS DO DIA",     count: "80+ apostas"  },
    ];

    // Filter by odds ranges for each banner type
    const withOdds = upcomingMatches.filter(m => m.odds.home > 0);

    // 1.20–1.49: short favourites (for the 3 "fav" banners)
    const favPool = withOdds
      .filter(m => m.odds.home >= 1.20 && m.odds.home < 1.50)
      .sort((a, b) => a.odds.home - b.odds.home);

    // 1.50–1.99: medium odds (for the 4th banner)
    const medPool = withOdds
      .filter(m => m.odds.home >= 1.50 && m.odds.home < 2.00)
      .sort((a, b) => a.odds.home - b.odds.home);

    // ~2.5 spike (2.00–2.99, sorted by closeness to 2.5)
    const mid25Pool = withOdds
      .filter(m => m.odds.home >= 2.00 && m.odds.home < 3.00)
      .sort((a, b) => Math.abs(a.odds.home - 2.5) - Math.abs(b.odds.home - 2.5));

    // ~3.10 spike (≥2.80, sorted by closeness to 3.10)
    const high31Pool = withOdds
      .filter(m => m.odds.home >= 2.80)
      .sort((a, b) => Math.abs(a.odds.home - 3.10) - Math.abs(b.odds.home - 3.10));

    const usedIds = new Set<string | number>();
    const pickN = (pool: Match[], n: number, allowUsed = false): Match[] => {
      const out: Match[] = [];
      for (const m of pool) {
        if (allowUsed || !usedIds.has(m.id)) {
          out.push(m);
          if (!allowUsed) usedIds.add(m.id);
          if (out.length === n) break;
        }
      }
      return out;
    };
    const fillTo4 = (seed: Match[]): Match[] => {
      const uniq: Match[] = [];
      const seen = new Set<string | number>();
      for (const m of seed) {
        if (seen.has(m.id)) continue;
        uniq.push(m);
        seen.add(m.id);
      }
      if (uniq.length >= 4) return uniq.slice(0, 4);

      const pools = [favPool, medPool, mid25Pool, high31Pool, withOdds];
      for (const pool of pools) {
        if (uniq.length >= 4) break;
        for (const m of pool) {
          if (uniq.length >= 4) break;
          if (seen.has(m.id) || usedIds.has(m.id)) continue;
          uniq.push(m);
          seen.add(m.id);
          usedIds.add(m.id);
        }
      }
      for (const m of withOdds) {
        if (uniq.length >= 4) break;
        if (seen.has(m.id)) continue;
        uniq.push(m);
        seen.add(m.id);
      }
      return uniq;
    };

    const chunks: Match[][] = [];

    // 3 banners: 3 odds (1.20–1.49) + 1 odd (~2.5)
    for (let i = 0; i < 3; i++) {
      const favs  = pickN(favPool,   3);
      const spike = pickN(mid25Pool, 1);
      const chunk = fillTo4([...favs, ...spike]);
      if (chunk.length === 4) chunks.push(chunk);
    }

    // 1 banner: 3 odds (1.50–1.99) + 1 odd (~3.10)
    {
      const meds  = pickN(medPool,    3);
      const spike = pickN(high31Pool, 1);
      const chunk = fillTo4([...meds, ...spike]);
      if (chunk.length === 4) chunks.push(chunk);
    }

    if (chunks.length === 0) return null;

    const addAllToBetSlip = (events: Match[]) => {
      events.forEach(m => {
        if (m.odds.home > 0) {
          const alreadyIn = bets.find(b => b.matchId === m.id && b.market === "result" && b.selection === "home");
          if (!alreadyIn) toggleBet(m, "home", m.odds.home, "result", m.home);
        }
      });
      // Only open the mobile drawer on small screens — desktop uses the right-panel
      if (window.innerWidth < 1024) setBetSlipOpenMobile(true);
    };

    return (
      <div className="mb-5">
        <div
          className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory"
          style={{ scrollbarWidth: "none" } as React.CSSProperties}
        >
          {chunks.map((events, bi) => {
            const cfg = BANNER_CONFIGS[bi];
            const totalOddsVal = events
              .reduce((acc, m) => m.odds.home > 0 ? acc * m.odds.home : acc, 1)
              .toFixed(2);

            return (
              <div
                key={bi}
                className="snap-center shrink-0 w-[252px] rounded-2xl bg-zinc-900/80 border border-zinc-800 p-3.5 flex flex-col gap-2.5"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-white uppercase tracking-wide">{cfg.title} </span>
                    <span className="text-xs font-black text-red-500 uppercase tracking-wide">{cfg.subtitle}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">{cfg.label}</span>
                </div>

                {/* Event rows */}
                <div className="flex flex-col gap-1.5">
                  {events.map((m, ei) => {
                    const flag = COUNTRY_FLAGS[m.country?.toLowerCase() ?? ""] ?? sportEmoji(m.sport);
                    const timeStr = m.date ? formatMatchDate(m.date) : (m.time ?? "");
                    const isSelected = !!bets.find(b => b.matchId === m.id && b.market === "result" && b.selection === "home");
                    return (
                      <div
                        key={ei}
                        className={`rounded-xl px-2.5 py-2 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-red-600/15 border border-red-500/40"
                            : "bg-zinc-800/60 border border-zinc-700/50 hover:bg-zinc-800"
                        }`}
                        {...makeTap(() => toggleBet(m, "home", m.odds.home, "result", m.home))}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base shrink-0">{flag}</span>
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold text-white truncate leading-tight">{m.home}</div>
                            <div className="text-[10px] text-zinc-500 truncate">{m.away} · {timeStr}</div>
                          </div>
                        </div>
                        <span className={`text-sm font-black shrink-0 ${isSelected ? "text-red-400" : "text-red-500"}`}>
                          {m.odds.home > 0 ? m.odds.home.toFixed(2) : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="text-center px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 shrink-0">
                    <div className="text-[9px] text-zinc-500 uppercase tracking-widest leading-none mb-0.5">Total</div>
                    <div className="text-red-500 font-black text-base leading-none">{totalOddsVal}</div>
                  </div>
                  <button
                    {...makeTap(() => addAllToBetSlip(events))}
                    className="flex-1 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-black text-[11px] rounded-xl py-2.5 transition-all uppercase tracking-wide"
                  >
                    Adicionar ao boletim
                  </button>
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

    // Suspension detection
    const now = Date.now();
    const betSuspended = bets.map(bet => {
      const lm = liveMatches.find(m => String(m.id) === String(bet.matchId));
      if (!lm?.marketSuspension) return false;
      const mk = bet.market ?? "result";
      return (lm.marketSuspension[mk] ?? 0) > now || (lm.marketSuspension["result"] ?? 0) > now;
    });
    const anySuspended = betSuspended.some(Boolean);
    const suspensionReason = (() => {
      const idx = betSuspended.findIndex(Boolean);
      if (idx < 0) return "";
      const lm = liveMatches.find(m => String(m.id) === String(bets[idx]!.matchId));
      return lm?._suspensionReason ?? "SUSPENSO";
    })();

    const quickAmounts = [5, 10, 25, 50];

    return (
      <div className="flex flex-col h-full" style={{ background: "#0a0a0a" }}>

        {/* ── HEADER ── */}
        <div className="relative px-5 pt-3 pb-4" style={{ background: "linear-gradient(160deg,#1a0505 0%,#0f0f0f 100%)", borderBottom: "1px solid rgba(220,38,38,0.15)" }}>
          {/* drag handle */}
          <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "rgba(255,255,255,0.12)" }} />

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white" style={{ background: "#dc2626" }}>
                  {bets.length}
                </div>
                <span className="text-white font-black text-[17px] tracking-tight">Boletim</span>
              </div>
              <span className="text-zinc-500 text-[11px]">
                {bets.length === 0 ? "Nenhuma seleção" : bets.length === 1 ? "1 seleção" : `${bets.length} seleções`}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {bets.length > 0 && effectiveBetMode === "multipla" && (
                <div className="text-right">
                  <div className="text-[10px] text-zinc-500 leading-none mb-0.5">ODDS COMBINADAS</div>
                  <div className="text-white font-black text-[22px] leading-none" style={{ color: "#dc2626" }}>{totalOdds}<span className="text-xs text-zinc-500">×</span></div>
                </div>
              )}
              {bets.length > 0 && (
                <button
                  onClick={() => { setBets([]); setBetStakes({}); setStake(""); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                  style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)" }}
                  title="Limpar boletim"
                >
                  <Trash2 size={14} className="text-red-500" />
                </button>
              )}
            </div>
          </div>

          {/* Simples / Múltipla toggle */}
          {bets.length > 0 && (
            <div className="flex mt-3 rounded-[10px] overflow-hidden p-0.5 gap-0.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <button
                onClick={() => { if (!hasDuplicateMatches) setBetMode("simples"); }}
                className="flex-1 py-1.5 text-[12px] font-bold rounded-[8px] transition-all duration-200"
                style={effectiveBetMode === "simples"
                  ? { background: "linear-gradient(135deg,#dc2626,#991b1b)", color: "#fff", boxShadow: "0 2px 8px rgba(220,38,38,0.35)" }
                  : { background: "transparent", color: "#71717a" }}
              >
                Simples
              </button>
              <button
                onClick={() => { if (!hasDuplicateMatches) setBetMode("multipla"); }}
                disabled={hasDuplicateMatches}
                className="flex-1 py-1.5 text-[12px] font-bold rounded-[8px] transition-all duration-200"
                style={effectiveBetMode === "multipla"
                  ? { background: "linear-gradient(135deg,#dc2626,#991b1b)", color: "#fff", boxShadow: "0 2px 8px rgba(220,38,38,0.35)" }
                  : { background: "transparent", color: hasDuplicateMatches ? "#3f3f46" : "#71717a" }}
              >
                Múltipla
              </button>
            </div>
          )}
          {bets.length > 0 && hasDuplicateMatches && (
            <p className="text-[10px] text-zinc-600 mt-1.5 text-center">Duas seleções do mesmo evento — modo Simples obrigatório</p>
          )}
        </div>

        {/* ── BET CARDS ── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5" data-vaul-no-drag>
          {bets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 gap-3">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.12)" }}>
                <Trophy size={28} className="text-red-700" />
              </div>
              <p className="text-zinc-500 text-sm font-medium">Boletim vazio</p>
              <p className="text-zinc-600 text-[12px] text-center">Seleciona um resultado para<br />começar a apostar</p>
            </div>
          ) : (
            <AnimatePresence>
              {bets.map((bet, betIdx) => {
                const isSusp = betSuspended[betIdx] === true;
                const when = (() => {
                  const d = bet.scheduledDate ?? bet.date;
                  const t = bet.scheduledTime ?? bet.time;
                  if (d && t) return `${d} • ${t}`;
                  return t || d || null;
                })();
                return (
                  <motion.div
                    key={`${bet.matchId}-${bet.market}-${bet.selection}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="relative overflow-hidden rounded-2xl"
                    style={{
                      background: isSusp ? "rgba(120,53,15,0.3)" : "rgba(255,255,255,0.035)",
                      border: isSusp ? "1px solid rgba(245,158,11,0.4)" : "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    {/* Suspension overlay */}
                    {isSusp && (
                      <div className="absolute inset-0 flex items-center justify-center z-10 backdrop-blur-[2px] rounded-2xl" style={{ background: "rgba(0,0,0,0.55)" }}>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black animate-pulse" style={{ background: "#f59e0b", color: "#000" }}>
                          <Lock size={10} /> ODDS SUSPENSAS
                        </div>
                      </div>
                    )}

                    <div className="p-3.5">
                      {/* Top row: sport/league + remove */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider truncate pr-2" style={{ color: "#dc2626" }}>
                          {bet.league || bet.matchTitle.split(" vs ")[0]?.trim() || bet.matchTitle}
                        </span>
                        <button
                          onClick={() => removeBet(bet.matchId, bet.market || "result", bet.selection)}
                          className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors z-20"
                          style={{ background: "rgba(220,38,38,0.15)" }}
                        >
                          <X size={11} className="text-red-400" />
                        </button>
                      </div>

                      {/* Match title */}
                      <div className="text-[11px] text-zinc-400 truncate mb-1.5">{bet.matchTitle}</div>
                      {(bet.league || when) && (
                        <div className="text-[10px] text-zinc-500 truncate mb-2">
                          {[bet.league, when].filter(Boolean).join(" • ")}
                        </div>
                      )}

                      {/* Selection + odd */}
                      <div className="flex items-center justify-between">
                        <span className="text-white font-bold text-[13px] leading-tight flex-1 pr-3 truncate">{bet.label}</span>
                        <span
                          className="font-black text-[18px] leading-none flex-shrink-0"
                          style={{ color: isSusp ? "#f59e0b" : "#dc2626" }}
                        >
                          {bet.odd.toFixed(2)}
                        </span>
                      </div>

                      {/* Simples: individual stake input */}
                      {effectiveBetMode === "simples" && (
                        <div className="mt-3">
                          <div className="flex gap-1.5 mb-1.5">
                            {quickAmounts.map(amt => (
                              <button
                                key={amt}
                                onClick={() => setBetStakes(prev => ({ ...prev, [betKey(bet)]: String(amt) }))}
                                className="flex-1 py-1 rounded-lg text-[11px] font-bold transition-all"
                                style={parseFloat(betStakes[betKey(bet)] || "0") === amt
                                  ? { background: "#dc2626", color: "#fff" }
                                  : { background: "rgba(255,255,255,0.05)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.07)" }
                                }
                              >
                                €{amt}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center rounded-xl overflow-hidden" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                            <span className="pl-3 text-zinc-500 text-sm font-bold">€</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="Outro valor"
                              value={betStakes[betKey(bet)] || ""}
                              onChange={e => {
                                const v = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
                                setBetStakes(prev => ({ ...prev, [betKey(bet)]: v }));
                              }}
                              onFocus={e => {
                                const el = e.currentTarget;
                                setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 350);
                              }}
                              className="flex-1 bg-transparent text-white text-sm font-mono px-2 py-2 outline-none placeholder-zinc-600"
                            />
                            {parseFloat(betStakes[betKey(bet)] || "0") > 0 && (
                              <span className="pr-3 text-[12px] font-bold" style={{ color: "#22c55e" }}>
                                → €{(parseFloat(betStakes[betKey(bet)] || "0") * bet.odd).toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* ── FOOTER ── */}
        {bets.length > 0 && (
          <div className="px-4 pt-3 space-y-3" style={{ background: "#0a0a0a", borderTop: "1px solid rgba(255,255,255,0.06)", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))" }} data-vaul-no-drag>

            {/* Múltipla stake input */}
            {effectiveBetMode === "multipla" && (
              <div>
                <div className="flex gap-1.5 mb-2">
                  {quickAmounts.map(amt => (
                    <button
                      key={amt}
                      onClick={() => setStake(String(amt))}
                      className="flex-1 py-1.5 rounded-xl text-[12px] font-bold transition-all"
                      style={parseFloat(stake || "0") === amt
                        ? { background: "linear-gradient(135deg,#dc2626,#991b1b)", color: "#fff", boxShadow: "0 2px 8px rgba(220,38,38,0.3)" }
                        : { background: "rgba(255,255,255,0.05)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.07)" }
                      }
                    >
                      €{amt}
                    </button>
                  ))}
                </div>
                <div className="flex items-center rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <span className="pl-3 text-zinc-500 font-bold">€</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Outro valor"
                    value={stake}
                    onChange={e => {
                      const v = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
                      setStake(v);
                    }}
                    onFocus={e => {
                      const el = e.currentTarget;
                      setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 350);
                    }}
                    className="flex-1 bg-transparent text-white font-mono px-2 py-2.5 outline-none placeholder-zinc-600 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Summary row */}
            <div className="rounded-2xl px-4 py-3 flex justify-between items-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">
                  {effectiveBetMode === "simples" ? "Total em jogo" : "Valor apostado"}
                </div>
                <div className="text-white font-black text-[15px]">
                  € {effectiveBetMode === "simples"
                    ? bets.reduce((s, b) => s + parseFloat(betStakes[betKey(b)] || "0"), 0).toFixed(2)
                    : (stakeNum || 0).toFixed(2)}
                </div>
              </div>
              <div className="w-px h-8 self-center" style={{ background: "rgba(255,255,255,0.08)" }} />
              <div className="text-right">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Ganho potencial</div>
                <div className="font-black text-[15px]" style={{ color: "#22c55e" }}>
                  € {effectiveBetMode === "simples" ? simplesPotential : multipotential}
                </div>
              </div>
            </div>

            {effectiveBetMode === "simples" && bets.length > 1 && (
              <p className="text-[10px] text-zinc-600 text-center">{bets.length} apostas independentes</p>
            )}

            {/* Suspension warning */}
            {anySuspended && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                <Lock size={13} className="text-amber-400 flex-shrink-0 animate-pulse" />
                <p className="text-amber-400 text-xs font-medium leading-tight">
                  {suspensionReason || "LANCE CRÍTICO"} — Odds a atualizar, aguarde...
                </p>
              </div>
            )}

            {/* CTA */}
            <button
              onClick={handlePlaceBet}
              disabled={isPlacingBet || anySuspended}
              className="w-full h-13 rounded-2xl font-black text-[14px] text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              style={anySuspended
                ? { background: "#27272a", cursor: "not-allowed" }
                : { background: "linear-gradient(135deg,#dc2626 0%,#991b1b 100%)", boxShadow: "0 4px 20px rgba(220,38,38,0.4)" }
              }
            >
              {anySuspended ? (
                <><Lock size={15} className="animate-pulse" /> APOSTAS BLOQUEADAS</>
              ) : isPlacingBet ? (
                <><Loader2 className="animate-spin" size={16} /> A PROCESSAR...</>
              ) : (
                auth.user ? "APOSTAR AGORA" : "ENTRAR PARA APOSTAR"
              )}
            </button>
          </div>
        )}
      </div>
    );
  };

  // Build a flat "market:sel" → odd map from a Match's current markets + odds.
  // Used to capture snapshot of all market values before the next live poll,
  // so MarketOddsBtn can show ▲/▼ arrows based on previous vs current value.
  function flattenMatchMarketsForArrows(match: Match): Record<string, number> {
    const f: Record<string, number> = {};
    const m = match.markets;
    if (!m) return f;
    // 1X2
    f["result:home"] = match.odds.home;
    if ((match.sport ?? "football") !== "tennis" && match.odds.draw > 0) f["result:draw"] = match.odds.draw;
    f["result:away"] = match.odds.away;
    // Dupla Chance + BTTS
    if (m.doubleChance) {
      f["dupla:homeOrDraw"] = m.doubleChance.homeOrDraw; f["dupla:awayOrDraw"] = m.doubleChance.awayOrDraw; f["dupla:homeOrAway"] = m.doubleChance.homeOrAway;
      f["especiais:dc-hd"] = m.doubleChance.homeOrDraw; f["especiais:dc-ha"] = m.doubleChance.homeOrAway; f["especiais:dc-da"] = m.doubleChance.awayOrDraw;
    }
    if (m.bothTeamsScore) {
      f["dupla:bts-yes"] = m.bothTeamsScore.yes; f["dupla:bts-no"] = m.bothTeamsScore.no;
      f["especiais:bts-yes"] = m.bothTeamsScore.yes; f["especiais:bts-no"] = m.bothTeamsScore.no;
    }
    // Total de Golos (gols / totais / 1tempo tabs)
    const tg = m.totalGoals;
    if (tg) {
      const tgMap: Array<[string, number]> = [["o05",tg.over05],["u05",tg.under05],["o15",tg.over15],["u15",tg.under15],["o25",tg.over25],["u25",tg.under25],["o35",tg.over35],["u35",tg.under35],["o45",tg.over45],["u45",tg.under45],["o55",tg.over55],["u55",tg.under55],["o65",tg.over65],["u65",tg.under65]];
      for (const [k, v] of tgMap) { f[`gols:${k}`] = v; f[`totais:${k}`] = v; f[`1tempo:${k}`] = v; }
      // Sets (volleyball / tennis reuse totalGoals)
      f["sets:osets"] = tg.over25; f["sets:usets"] = tg.under25;
      f["sets:osets25"] = tg.over15; f["sets:usets25"] = tg.under15;
      f["sets:osets35"] = tg.over25; f["sets:usets35"] = tg.under25;
    }
    if (m.bothTeamsScore) {
      f["sets:tie-yes"] = m.bothTeamsScore.yes; f["sets:tie-no"] = m.bothTeamsScore.no;
    }
    // Handicap
    const hc = m.handicap;
    if (hc) {
      f["handicap:hm1"] = hc.homeMinusOne; f["handicap:hm1h"] = hc.homeMinusOneHalf;
      f["handicap:ap1"] = hc.awayPlusOne; f["handicap:ap1h"] = hc.awayPlusOneHalf;
      f["handicap:hcap-home"] = hc.homeMinusOne; f["handicap:hcap-away"] = hc.awayPlusOne;
      f["spread:hm1"] = hc.homeMinusOne; f["spread:ap1"] = hc.awayPlusOne;
      f["puckline:pl-home"] = hc.homeMinusOne; f["puckline:pl-away"] = hc.awayPlusOne;
    }
    // Intervalo / HalfTime / Period 1
    if (m.halfTime) {
      f["1tempo:ht-home"] = m.halfTime.home; f["1tempo:ht-draw"] = m.halfTime.draw; f["1tempo:ht-away"] = m.halfTime.away;
      f["1periodo:p1-home"] = m.halfTime.home; f["1periodo:p1-draw"] = m.halfTime.draw; f["1periodo:p1-away"] = m.halfTime.away;
      f["quartos:h1-home"] = m.halfTime.home; f["quartos:h1-away"] = m.halfTime.away;
    }
    if ((m as any).basketballExtra) {
      const bx = (m as any).basketballExtra as any;
      (["q1", "q2", "q3", "q4"] as const).forEach((q) => {
        if (bx[q]) {
          f[`quartos:${q}-home`] = bx[q].home;
          f[`quartos:${q}-away`] = bx[q].away;
        }
        const tq = bx[`${q}Total`];
        if (tq && Number.isFinite(tq.line)) {
          f[`quartos:b-${q}t-o-${tq.line}`] = tq.over;
          f[`quartos:b-${q}t-u-${tq.line}`] = tq.under;
        }
        const sq = bx[`${q}Spread`];
        if (sq && Number.isFinite(sq.line)) {
          f[`quartos:b-${q}s-home-${sq.line}`] = sq.home;
          f[`quartos:b-${q}s-away-${sq.line}`] = sq.away;
        }
      });
      if (bx.anyQuarter) {
        f["quartos:b-anyq-home"] = bx.anyQuarter.home;
        f["quartos:b-anyq-away"] = bx.anyQuarter.away;
      }
      if (bx.allQuarters) {
        f["quartos:b-allq-home"] = bx.allQuarters.home;
        f["quartos:b-allq-away"] = bx.allQuarters.away;
      }
    }
    if ((m as any).hockeyExtra) {
      const hx = (m as any).hockeyExtra as any;
      if (hx.period2) {
        f["2periodo:p2-home"] = hx.period2.home; f["2periodo:p2-draw"] = hx.period2.draw; f["2periodo:p2-away"] = hx.period2.away;
      }
      if (hx.period3) {
        f["3periodo:p3-home"] = hx.period3.home; f["3periodo:p3-draw"] = hx.period3.draw; f["3periodo:p3-away"] = hx.period3.away;
      }
      if (hx.period1Total) {
        const l = hx.period1Total.line;
        f[`especiais:p1t-o-${l}`] = hx.period1Total.over;
        f[`especiais:p1t-u-${l}`] = hx.period1Total.under;
      }
      if (hx.period2Total) {
        const l = hx.period2Total.line;
        f[`especiais:p2t-o-${l}`] = hx.period2Total.over;
        f[`especiais:p2t-u-${l}`] = hx.period2Total.under;
      }
      if (hx.period3Total) {
        const l = hx.period3Total.line;
        f[`especiais:p3t-o-${l}`] = hx.period3Total.over;
        f[`especiais:p3t-u-${l}`] = hx.period3Total.under;
      }
      if (hx.shotsOnGoal) {
        const l = Number.isFinite(hx.shotsOnGoal.line) ? hx.shotsOnGoal.line.toFixed(1) : String(hx.shotsOnGoal.line);
        f[`especiais:sog-o-${l}`] = hx.shotsOnGoal.over;
        f[`especiais:sog-u-${l}`] = hx.shotsOnGoal.under;
      }
    }
    if ((m as any).mlbExtra && typeof (m as any)._total === "number" && tg && hc) {
      const tot = (m as any)._total as number;
      const lo = tot - 0.5;
      const hi = tot + 0.5;
      f[`gols:mlb-tot-o-${lo}`] = tg.over25; f[`gols:mlb-tot-u-${lo}`] = tg.under25;
      f[`gols:mlb-tot-o-${tot}`] = tg.over35; f[`gols:mlb-tot-u-${tot}`] = tg.under35;
      f[`gols:mlb-tot-o-${hi}`] = tg.over45; f[`gols:mlb-tot-u-${hi}`] = tg.under45;
      f["handicap:mlb-rl-home-1.5"] = hc.homeMinusOne; f["handicap:mlb-rl-away-1.5"] = hc.awayPlusOne;
      const mx = (m as any).mlbExtra as any;
      if (mx.f5Result) {
        f["gols:mlb-f5-home"] = mx.f5Result.home; f["gols:mlb-f5-away"] = mx.f5Result.away;
      }
      if (mx.f5Total) {
        const l = mx.f5Total.line;
        f[`gols:mlb-f5t-o-${l}`] = mx.f5Total.over;
        f[`gols:mlb-f5t-u-${l}`] = mx.f5Total.under;
      }
    }
    // Primeiro Golo
    if (m.firstGoal) {
      f["1tempo:fg-home"] = m.firstGoal.home; f["1tempo:fg-none"] = m.firstGoal.noGoal; f["1tempo:fg-away"] = m.firstGoal.away;
    }
    // HT/FT
    if (m.htft) {
      const h = m.htft;
      f["htft:htft-hh"] = h.hh; f["htft:htft-hd"] = h.hd; f["htft:htft-ha"] = h.ha;
      f["htft:htft-dh"] = h.dh; f["htft:htft-dd"] = h.dd; f["htft:htft-da"] = h.da;
      f["htft:htft-ah"] = h.ah; f["htft:htft-ad"] = h.ad; f["htft:htft-aa"] = h.aa;
    }
    // Placar Correto
    if (m.correctScore) {
      for (const [k, v] of Object.entries(m.correctScore)) f[`placar:cs-${k}`] = v;
    }
    // Escanteios
    if (m.corners) {
      f["escanteios:oc85"] = m.corners.o85; f["escanteios:uc85"] = m.corners.u85;
      f["escanteios:oc95"] = m.corners.o95; f["escanteios:uc95"] = m.corners.u95;
      f["escanteios:oc105"] = m.corners.o105; f["escanteios:uc105"] = m.corners.u105;
    }
    // Cartões
    if (m.cards) {
      f["cartoes:ocard35"] = m.cards.o35; f["cartoes:ucard35"] = m.cards.u35;
      f["cartoes:ocard45"] = m.cards.o45; f["cartoes:ucard45"] = m.cards.u45;
    }
    // Asiático (Draw No Bet + Asian Handicap + Asian Totals)
    if (m.drawNoBet) { f["asiatico:dnb-home"] = m.drawNoBet.home; f["asiatico:dnb-away"] = m.drawNoBet.away; }
    if (m.asianHandicap) { f["asiatico:ah-home"] = m.asianHandicap.home; f["asiatico:ah-away"] = m.asianHandicap.away; }
    if (m.asianTotals) {
      f["asiatico:at-o05"] = m.asianTotals.o05; f["asiatico:at-u05"] = m.asianTotals.u05;
      f["asiatico:at-o225"] = m.asianTotals.o225; f["asiatico:at-u225"] = m.asianTotals.u225;
      f["asiatico:at-o275"] = m.asianTotals.o275; f["asiatico:at-u275"] = m.asianTotals.u275;
      f["asiatico:at-o45"] = m.asianTotals.o45; f["asiatico:at-u45"] = m.asianTotals.u45;
      f["asiatico:at-o55"] = m.asianTotals.o55; f["asiatico:at-u55"] = m.asianTotals.u55;
    }
    const te = (m as any).tennisExtra as any;
    if (te) {
      if (te.firstSet) { f["sets:set1-home"] = te.firstSet.home; f["sets:set1-away"] = te.firstSet.away; }
      if (te.set2) { f["sets:set2-home"] = te.set2.home; f["sets:set2-away"] = te.set2.away; }
      if (te.set3) { f["sets:set3-home"] = te.set3.home; f["sets:set3-away"] = te.set3.away; }
      if (te.setHandicap) { f["handicap:sh15-home2"] = te.setHandicap.home; f["handicap:sh15-away2"] = te.setHandicap.away; }
      if (te.gameHandicap) {
        f["handicap:gh-home2"] = te.gameHandicap.home; f["handicap:gh-away2"] = te.gameHandicap.away;
        f["jogos:gh-home"] = te.gameHandicap.home; f["jogos:gh-away"] = te.gameHandicap.away;
      }
      if (te.totalGames) { f["jogos:tg-o"] = te.totalGames.over; f["jogos:tg-u"] = te.totalGames.under; }
      if (te.set1Games) { f["jogos:s1g-o"] = te.set1Games.over; f["jogos:s1g-u"] = te.set1Games.under; }
      if (te.set2Games) { f["jogos:s2g-o"] = te.set2Games.over; f["jogos:s2g-u"] = te.set2Games.under; }
      if (te.homePlayerGames) { f["jogos:hpg-o"] = te.homePlayerGames.over; f["jogos:hpg-u"] = te.homePlayerGames.under; }
      if (te.awayPlayerGames) { f["jogos:apg-o"] = te.awayPlayerGames.over; f["jogos:apg-u"] = te.awayPlayerGames.under; }
      if (te.exactSets) {
        f["placar:es-h20"] = te.exactSets.h20; f["placar:es-h21"] = te.exactSets.h21;
        f["placar:es-a02"] = te.exactSets.a02; f["placar:es-a12"] = te.exactSets.a12;
      }
      if (te.oddEvenGames) { f["especiais:oe-odd"] = te.oddEvenGames.odd; f["especiais:oe-even"] = te.oddEvenGames.even; }
      if (te.oddEven1st) { f["especiais:oe1-odd"] = te.oddEven1st.odd; f["especiais:oe1-even"] = te.oddEven1st.even; }
      if (te.oddEven2nd) { f["especiais:oe2-odd"] = te.oddEven2nd.odd; f["especiais:oe2-even"] = te.oddEven2nd.even; }
      if (te.winAtLeast1P1) { f["especiais:wal1-yes"] = te.winAtLeast1P1.yes; f["especiais:wal1-no"] = te.winAtLeast1P1.no; }
      if (te.winAtLeast1P2) { f["especiais:wal2-yes"] = te.winAtLeast1P2.yes; f["especiais:wal2-no"] = te.winAtLeast1P2.no; }
      if (te.setMatch) {
        f["especiais:sm2-11"] = te.setMatch.h11; f["especiais:sm2-12"] = te.setMatch.h12;
        f["especiais:sm2-21"] = te.setMatch.a21; f["especiais:sm2-22"] = te.setMatch.a22;
      }
      if (te.setExactScore) {
        for (const [k, v] of Object.entries(te.setExactScore as Record<string, number>)) f[`placar:set-${k}`] = v;
      }
      if (Array.isArray(te.score1st)) {
        for (const entry of te.score1st as Array<{ label: string; odds: number }>) f[`placar:s1-${entry.label}`] = entry.odds;
      }
      if (Array.isArray(te.score2nd)) {
        for (const entry of te.score2nd as Array<{ label: string; odds: number }>) f[`placar:s2-${entry.label}`] = entry.odds;
      }
    }
    return f;
  }

  // suspKey: the specific marketSuspension key to check for this button.
  // When provided, the button locks if that key is suspended OR if the global
  // `result` key is suspended (e.g., point being played).
  // When omitted, only the global `result` key and `_suspensionReason` are checked.
  // This prevents a settled set market (e.g. firstSet=SETTLED) from locking buttons
  // for ALL other markets on the same match.
  const MarketOddsBtn = ({ match, sel, odd, market, label, suspKey }: { match: Match; sel: string; odd: number; market: string; label: string; suspKey?: string }) => {
    if ((match.sport ?? "football") === "tennis" && sel === "draw") return null;
    if (odd <= 0) return null; // settled/impossible market line — hide completely
    if (market === "result" && odd <= 1.01) return null;
    const now = Date.now();
    const globalSusp = (match.marketSuspension?.["result"] != null && match.marketSuspension["result"] > now)
      || hasBlockingSuspensionReason(match);
    const perMarketSusp = suspKey != null
      ? (match.marketSuspension?.[suspKey] != null && match.marketSuspension[suspKey]! > now)
      : false;
    const isSusp = globalSusp || perMarketSusp;
    if (isSusp) {
      // Show a locked placeholder so section headers don't look empty
      return (
        <div className="flex-1 flex flex-col items-center justify-center min-w-0 h-[62px] px-1 rounded-xl border border-zinc-200 bg-white opacity-60 cursor-not-allowed select-none">
          <span className="text-[10px] text-zinc-500 mb-1 leading-tight text-center truncate w-full px-0.5">{label}</span>
          <svg className="text-zinc-400" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
        </div>
      );
    }
    const active = !!bets.find(b => b.matchId === match.id && b.market === market && b.selection === sel);
    const prevOdd = match.isLive ? prevLiveMarkets.current[String(match.id)]?.[`${market}:${sel}`] : undefined;
    // Server controls update cadence — only animate when actual data changed >= threshold
    const delta = prevOdd !== undefined ? odd - prevOdd : 0;
    const oddUp   = !active && delta >= ODDS_ANIM_THRESHOLD;
    const oddDown = !active && delta <= -ODDS_ANIM_THRESHOLD;
    const flashClass = "";
    return (
      <button
        {...makeTap(() => toggleBet(match, sel, odd, market, label))}
        className={`flex-1 flex flex-col items-center justify-center min-w-0 h-[62px] px-1 rounded-xl border transition-all ${active ? "border-red-300 bg-red-50 ring-1 ring-red-200" : "border-zinc-200 bg-white hover:border-zinc-300"} ${flashClass}`}
      >
        <span className="text-[10px] text-zinc-500 mb-1 leading-tight text-center truncate w-full px-0.5">{label}</span>
        <span className={`text-sm font-black leading-none tabular-nums flex items-center gap-0.5 ${active ? "text-red-500" : "text-zinc-900"}`}>
          {odd.toFixed(2)}
          {oddUp   && <span className="text-green-400 text-[9px] font-black leading-none shrink-0">▲</span>}
          {oddDown && <span className="text-red-400  text-[9px] font-black leading-none shrink-0">▼</span>}
        </span>
      </button>
    );
  };

  const MarketGrid2Group = ({ title, children }: { title: string; children: ReactNode }) => {
    const collapsible = false;
    if (!collapsible) {
      return (
        <div className="mb-4 last:mb-0">
          {title ? <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 px-0.5">{title}</div> : null}
          <div className="grid grid-cols-2 gap-1.5">{children}</div>
        </div>
      );
    }
    const seq = useContext(MarketGroupSeqCtx);
    const idx = useMemo(() => seq?.next() ?? 9999, []); // eslint-disable-line react-hooks/exhaustive-deps
    const childCount = Children.count(children);
    const openCtx = useContext(MarketGroupOpenCtx);
    const initialOpen = !collapsible || idx <= 5;
    const key = `${openCtx?.matchId ?? "x"}:grid2:${title}`;
    const [localOpen, setLocalOpen] = useState(initialOpen);
    const open = openCtx ? openCtx.getOpen(key, initialOpen) : localOpen;
    const setOpen = (updater: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof updater === "function" ? (updater as (p: boolean) => boolean)(open) : updater;
      if (openCtx) openCtx.setOpen(key, next);
      else setLocalOpen(next);
    };
    return (
      <div className="mb-1.5 last:mb-0 border border-zinc-800 rounded-lg overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2.5 text-left bg-zinc-800/60 hover:bg-zinc-800 active:bg-zinc-700 transition-colors"
          {...makeTap(() => setOpen(o => !o))}
        >
          <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">{title}</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-zinc-500 tabular-nums">{childCount}</span>
            <ChevronDown size={14} className={`text-zinc-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </div>
        </button>
        {open && (
          <div className="px-3 py-3">
            <div className="grid grid-cols-2 gap-2">{children}</div>
          </div>
        )}
      </div>
    );
  };

  const MarketGroup = ({ title, children }: { title: string; children: ReactNode }) => {
    const collapsible = false;
    if (!collapsible) {
      return (
        <div className="mb-4 last:mb-0">
          {title ? <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 px-0.5">{title}</div> : null}
          <div className="flex gap-2">{children}</div>
        </div>
      );
    }
    const seq = useContext(MarketGroupSeqCtx);
    const idx = useMemo(() => seq?.next() ?? 9999, []); // eslint-disable-line react-hooks/exhaustive-deps
    const childCount = Children.count(children);
    const openCtx = useContext(MarketGroupOpenCtx);
    const initialOpen = !collapsible || idx <= 5;
    const key = `${openCtx?.matchId ?? "x"}:grp:${title}`;
    const [localOpen, setLocalOpen] = useState(initialOpen);
    const open = openCtx ? openCtx.getOpen(key, initialOpen) : localOpen;
    const setOpen = (updater: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof updater === "function" ? (updater as (p: boolean) => boolean)(open) : updater;
      if (openCtx) openCtx.setOpen(key, next);
      else setLocalOpen(next);
    };

    return (
      <div className="mb-1.5 last:mb-0 border border-zinc-800 rounded-lg overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2.5 text-left bg-zinc-800/60 hover:bg-zinc-800 active:bg-zinc-700 transition-colors"
          {...makeTap(() => setOpen(o => !o))}
        >
          <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">{title}</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-zinc-500 tabular-nums">{childCount}</span>
            <ChevronDown size={14} className={`text-zinc-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </div>
        </button>
        {open && (
          <div className="px-3 py-3">
            <div className="flex flex-wrap gap-2">{children}</div>
          </div>
        )}
      </div>
    );
  };

  const MarketAccordionSection = ({ title, defaultOpen = false, count, children }: { title: string; defaultOpen?: boolean; count?: number; children: ReactNode }) => {
    return (
      <div className="mb-4 last:mb-0" data-count={count} data-default-open={defaultOpen ? "1" : undefined}>
        <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 px-0.5">{title}</div>
        {children}
      </div>
    );
  };

  const renderMatchMarkets = (match: Match) => {
    const sport = match.sport ?? "football";
    const isBasketball = sport === "basketball";
    const isTennis = sport === "tennis";
    const isHockey = sport === "hockey";
    const isVolleyball = sport === "volleyball";
    const isBaseball = sport === "baseball";
    const isFootball = !isBasketball && !isTennis && !isHockey && !isVolleyball && !isBaseball;

    // Parse current live period/set/quarter from status (0 = upcoming/unknown → show all markets)
    const currentSet = (isTennis || isVolleyball) && (match as any).status?.startsWith("Set")
      ? (parseInt(((match as any).status as string).replace("Set ", "")) || 0) : 0;
    // Basketball: "HT" = NBA halftime (between Q2 and Q3 → quartersDone = 2)
    const currentQ = isBasketball
      ? ((match as any).status?.startsWith("Q")
          ? (parseInt(((match as any).status as string).replace("Q", "")) || 0)
          : (match as any).status === "HT" ? 2 : 0)
      : 0;
    const currentP = isHockey && (match as any).status?.startsWith("P")
      ? (parseInt(((match as any).status as string).replace("P", "")) || 0) : 0;
    // showET: show Prolongamento markets (match in extra time)
    const showET = isFootball && match.isLive && !!match.markets?.etExtra;
    // showPen: show Penáltis markets (match in penalty shootout)
    const showPen = isFootball && match.isLive && !!match.markets?.penExtra;
    // Football half lifecycle: null=pre-match/ET/Pen (show all), 1=1st half, 0=HT break, 2=2nd half
    // ET and Pen phases show all full-match markets too
    const rawStat = (match as any).status as string | undefined;
    const liveHalf = isFootball && match.isLive && !showET && !showPen
      ? (rawStat === "HT" ? 0 : (match.minute ?? 0) > 45 ? 2 : 1)
      : null;
    // show1tempo: show "1º Tempo" markets (pre-match OR during 1st half)
    const show1tempo = liveHalf === null || liveHalf === 1;
    // show2tempo: show "2º Tempo" markets (at HT break OR during 2nd half)
    const show2tempo = liveHalf === 0 || liveHalf === 2;
    // isLateGame: live 2nd-half football ≥85' → keep only popular markets and most relevant lines
    const liveDisplayMin = isFootball && match.isLive ? getDisplayMinute(match) : 0;
    const isLateGame = isFootball && match.isLive && liveHalf === 2 && liveDisplayMin >= 85 && !showET && !showPen;
    // Which total-goals line is most relevant late game = next line above current total goals
    const lateGameGoals = (match.homeScore ?? 0) + (match.awayScore ?? 0);

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
            { key: "especiais", label: "Especiais" },
          ]
        : isHockey
          ? [
              { key: "todos", label: "Todos" },
              { key: "resultado", label: "Vencedor" },
              { key: "totais", label: "Totais" },
              { key: "puckline", label: "Puck Line" },
              ...(currentP <= 1 ? [{ key: "1periodo", label: "1º Per." }] : []),
              ...(currentP <= 2 ? [{ key: "2periodo", label: "2º Per." }] : []),
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
            : isBaseball
            ? [
                { key: "todos",     label: "Todos" },
                { key: "resultado", label: "Resultado" },
                { key: "gols",      label: "Corridas" },
                { key: "handicap",  label: "Run Line" },
              ]
            : showPen
              // Penalty shootout — only penalty markets
              ? [
                  { key: "todos",    label: "Todos" },
                  { key: "penaltis", label: "🎯 Penáltis" },
                ]
              : showET
              // Extra time — only ET markets
              ? [
                  { key: "todos",        label: "Todos" },
                  { key: "prolongamento", label: "⏱ Prorrogação" },
                ]
              // Regular time — all markets, but only popular markets after 85'
              : isLateGame
                ? [
                    { key: "todos", label: "Todos" },
                    { key: "resultado", label: "Resultado" },
                    { key: "gols", label: "Gols" },
                    { key: "handicap", label: "Handicap" },
                  ]
                : [
                    { key: "todos",    label: "Todos" },
                    { key: "resultado", label: "Resultado" },
                    { key: "dupla",     label: "Dupla Chance" },
                    { key: "gols",      label: "Gols" },
                    { key: "especiais", label: "Especiais" },
                    { key: "handicap",  label: "Handicap" },
                    ...(show1tempo ? [{ key: "1tempo", label: "1º Tempo" }] : []),
                    ...(show2tempo ? [{ key: "2tempo", label: "2º Tempo" }] : []),
                    { key: "htft",       label: "HT/FT" },
                    { key: "placar",     label: "Placar Exato" },
                    { key: "escanteios", label: "Escanteios" },
                    { key: "cartoes",    label: "Cartões" },
                    { key: "asiatico",   label: "Asiático" },
                    ...(match.leagueId ? [{ key: "jogadores", label: "⚽ Jogadores" }] : []),
                  ];

    const m = match.markets;
    const tennisExtra = isTennis ? ((m as any)?.tennisExtra as Record<string, any> | undefined) : undefined;
    const hasTennisHandicapMarkets = !!(
      tennisExtra?.setHandicap?.home > 0 ||
      tennisExtra?.setHandicap?.away > 0 ||
      tennisExtra?.gameHandicap?.home > 0 ||
      tennisExtra?.gameHandicap?.away > 0
    );

    // Show markets when hasRealOdds=true, OR when tennis has valid computed tennisExtra markets,
    // OR when the match has computed markets (V1-built football with doubleChance/totalGoals)
    const hasTennisMarkets = match.sport === "tennis" && !!(m?.tennisExtra?.firstSet?.home);
    const hasComputedMarkets = !!(m?.doubleChance?.homeOrDraw) || !!(m?.totalGoals?.over25);
    if (!match.hasRealOdds && !hasTennisMarkets && !hasComputedMarkets) {
      return (
        <div className="mt-4 text-center py-10 text-zinc-500">
          <div className="text-3xl mb-3">📊</div>
          <div className="text-sm font-medium">Odds não disponíveis para esta partida.</div>
          <div className="text-xs mt-1 text-zinc-600">Apenas partidas com odds confirmadas são apresentadas.</div>
        </div>
      );
    }

    if (!m) {
      return (
        <div className="mt-4 text-center py-10 text-zinc-500">
          <div className="text-3xl mb-3">⏳</div>
          <div className="text-sm font-medium">A carregar mercados…</div>
        </div>
      );
    }

    // Penalty shootout: replace entire market area with VENCEDOR DA FINAL only
    if (showPen && m?.penExtra) {
      return (
        <div className="mt-4">
          <div className="flex flex-col items-center gap-4 py-4">
            <span className="text-[11px] font-black uppercase tracking-widest text-white/80">🎯 Vencedor da Final</span>
            <div className="flex gap-3 w-full max-w-xs">
              <MarketOddsBtn match={match} sel="pen-home" odd={m.penExtra.winner.home} market="penaltis" label={match.home} />
              <MarketOddsBtn match={match} sel="pen-away" odd={m.penExtra.winner.away} market="penaltis" label={match.away} />
            </div>
          </div>
        </div>
      );
    }

    marketGroupSeqRef.current = 0;
    return (
      <MarketTabCtx.Provider value={modalTab}>
      <MarketGroupOpenCtx.Provider value={{ matchId: String(match.id), getOpen: marketGroupOpenApi.getOpen, setOpen: marketGroupOpenApi.setOpen }}>
      <MarketGroupSeqCtx.Provider key={`mgrp:${match.id}:${modalTab}`} value={marketGroupSeqApi}>
      <div className="mt-0">
        <div ref={tabContainerRef} className="flex gap-2 overflow-x-auto no-scrollbar mb-3 pb-1" style={{ scrollbarWidth: "none", touchAction: "pan-x pan-y", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
          {tabs.map(t => (
            <button
              key={t.key}
              data-tab={t.key}
              {...makeTap(() => { setModalTab(t.key); scrollTabIntoView(t.key); })}
              className={`px-4 py-2 rounded-[16px] text-[10px] font-black whitespace-nowrap transition-colors flex-shrink-0 border ${modalTab === t.key ? "bg-red-50 text-red-300 border-red-300" : "bg-zinc-100 text-zinc-500 border-zinc-200 hover:text-zinc-700"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── SUSPENSION BANNER (modal) ── */}
        {((match.marketSuspension && Object.values(match.marketSuspension).some(ts => ts > Date.now())) || hasBlockingSuspensionReason(match)) && (
          <div className="mb-4">
            <SuspensionBanner match={match} />
          </div>
        )}

        {/* ── PRORROGAÇÃO ── */}
        {isFootball && showET && !showPen && m?.etExtra && (modalTab === "prolongamento" || modalTab === "todos") && (
          <div className="mb-2">
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-950/40 border border-red-800/40 rounded px-2 py-0.5">⏱ Prorrogação em curso</span>
            </div>
            <MarketGroup title="Vencedor da Eliminatória">
              <MarketOddsBtn match={match} sel="et-tw-home" odd={m.etExtra.tieWinner.home} market="prolongamento" label={match.home} />
              <MarketOddsBtn match={match} sel="et-tw-away" odd={m.etExtra.tieWinner.away} market="prolongamento" label={match.away} />
            </MarketGroup>
            {m.etExtra.totalGoals.o05 > 0 && (
              <MarketGroup title="Golos na Prorrogação — 0.5">
                <MarketOddsBtn match={match} sel="et-o05" odd={m.etExtra.totalGoals.o05} market="prolongamento" label="Mais de 0.5" />
                <MarketOddsBtn match={match} sel="et-u05" odd={m.etExtra.totalGoals.u05} market="prolongamento" label="Menos de 0.5" />
              </MarketGroup>
            )}
            {m.etExtra.totalGoals.o15 > 0 && (
              <MarketGroup title="Golos na Prorrogação — 1.5">
                <MarketOddsBtn match={match} sel="et-o15" odd={m.etExtra.totalGoals.o15} market="prolongamento" label="Mais de 1.5" />
                <MarketOddsBtn match={match} sel="et-u15" odd={m.etExtra.totalGoals.u15} market="prolongamento" label="Menos de 1.5" />
              </MarketGroup>
            )}
            {m.etExtra.totalGoals.o25 > 0 && (
              <MarketGroup title="Golos na Prorrogação — 2.5">
                <MarketOddsBtn match={match} sel="et-o25" odd={m.etExtra.totalGoals.o25} market="prolongamento" label="Mais de 2.5" />
                <MarketOddsBtn match={match} sel="et-u25" odd={m.etExtra.totalGoals.u25} market="prolongamento" label="Menos de 2.5" />
              </MarketGroup>
            )}
            <MarketGroup title="Resultado da Prorrogação">
              <MarketOddsBtn match={match} sel="et-home" odd={m.etExtra.etResult.home} market="prolongamento" label={match.home} />
              <MarketOddsBtn match={match} sel="et-draw" odd={m.etExtra.etResult.draw} market="prolongamento" label="Empate → Penáltis" />
              <MarketOddsBtn match={match} sel="et-away" odd={m.etExtra.etResult.away} market="prolongamento" label={match.away} />
            </MarketGroup>
            <MarketGroup title="Equipa a Marcar na Prorrogação">
              <MarketOddsBtn match={match} sel="et-ng-home" odd={m.etExtra.nextGoal.home} market="prolongamento" label={`Gol 1 — ${match.home}`} />
              <MarketOddsBtn match={match} sel="et-ng-away" odd={m.etExtra.nextGoal.away} market="prolongamento" label={`Gol 2 — ${match.away}`} />
            </MarketGroup>
          </div>
        )}

        {/* ── PENÁLTIS (SHOOTOUT) ── */}
        {/* Penalty section handled by early-return above when showPen */}

        {/* ── RESULTADO / VENCEDOR ── hide for live football when result is obvious ── */}
        {(modalTab === "resultado" || modalTab === "todos") && (() => {
          const hideResult = match.isLive && isFootball && ((showET || showPen) || (() => {
            const minOdd = Math.min(match.odds.home, match.odds.away);
            if (minOdd <= 1.05) return true;
            const min = getDisplayMinute(match);
            const diff = Math.abs((match.homeScore ?? 0) - (match.awayScore ?? 0));
            if (min >= 80 && diff >= 2) return true;
            if (min >= 85 && diff >= 1) return true;
            return false;
          })());
          if (hideResult) return null;
          return (
            <MarketGroup title={isBasketball ? "Vencedor da Partida" : isTennis ? "Vencedor do Jogo" : "Resultado Final"}>
              <MarketOddsBtn match={match} sel="home" odd={match.odds.home} market="result" label={match.home} />
              {!isTennis && match.odds.draw > 0 && <MarketOddsBtn match={match} sel="draw" odd={match.odds.draw} market="result" label="Empate" />}
              <MarketOddsBtn match={match} sel="away" odd={match.odds.away} market="result" label={match.away} />
            </MarketGroup>
          );
        })()}

        {/* ── FUTEBOL: DUPLA CHANCE ── */}
        {isFootball && !showET && !showPen && !isLateGame && (modalTab === "dupla" || modalTab === "todos") && m && m.doubleChance.homeOrDraw > 0 && (
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
        {isFootball && !showET && !showPen && !isLateGame && modalTab === "dupla" && m && m.doubleChance.homeOrDraw === 0 && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── FUTEBOL: GOLS ── */}
        {isFootball && !showET && !showPen && (modalTab === "gols" || modalTab === "todos") && m && m.totalGoals.over25 > 0 && (
          <div>
            <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 px-0.5">Totais de Golos</div>
            {isLateGame ? (() => {
              // Late game: show only the 1 most relevant open line (currentGoals + 0.5)
              const tgMap = [
                { label: "0.5", o: m.totalGoals.over05, u: m.totalGoals.under05, selO: "o05", selU: "u05" },
                { label: "1.5", o: m.totalGoals.over15, u: m.totalGoals.under15, selO: "o15", selU: "u15" },
                { label: "2.5", o: m.totalGoals.over25, u: m.totalGoals.under25, selO: "o25", selU: "u25" },
                { label: "3.5", o: m.totalGoals.over35, u: m.totalGoals.under35, selO: "o35", selU: "u35" },
                { label: "4.5", o: m.totalGoals.over45, u: m.totalGoals.under45, selO: "o45", selU: "u45" },
                { label: "5.5", o: m.totalGoals.over55, u: m.totalGoals.under55, selO: "o55", selU: "u55" },
                { label: "6.5", o: m.totalGoals.over65, u: m.totalGoals.under65, selO: "o65", selU: "u65" },
              ];
              const line = tgMap[Math.min(lateGameGoals, tgMap.length - 1)]!;
              if (!line.o) return null;
              return (
                <MarketGroup title="">
                  <MarketOddsBtn match={match} sel={line.selO} odd={line.o} market="gols" label={`Mais de ${line.label}`} />
                  <MarketOddsBtn match={match} sel={line.selU} odd={line.u} market="gols" label={`Menos de ${line.label}`} />
                </MarketGroup>
              );
            })() : (
              <>
                {m.totalGoals.over05 > 0 && (
                  <MarketGroup title="">
                    <MarketOddsBtn match={match} sel="o05" odd={m.totalGoals.over05} market="gols" label="Mais de 0.5" />
                    <MarketOddsBtn match={match} sel="u05" odd={m.totalGoals.under05} market="gols" label="Menos de 0.5" />
                  </MarketGroup>
                )}
                {m.totalGoals.over15 > 0 && (
                  <MarketGroup title="">
                    <MarketOddsBtn match={match} sel="o15" odd={m.totalGoals.over15} market="gols" label="Mais de 1.5" />
                    <MarketOddsBtn match={match} sel="u15" odd={m.totalGoals.under15} market="gols" label="Menos de 1.5" />
                  </MarketGroup>
                )}
                <MarketGroup title="">
                  <MarketOddsBtn match={match} sel="o25" odd={m.totalGoals.over25} market="gols" label="Mais de 2.5" />
                  <MarketOddsBtn match={match} sel="u25" odd={m.totalGoals.under25} market="gols" label="Menos de 2.5" />
                </MarketGroup>
                {m.totalGoals.over35 > 0 && (
                  <MarketGroup title="">
                    <MarketOddsBtn match={match} sel="o35" odd={m.totalGoals.over35} market="gols" label="Mais de 3.5" />
                    <MarketOddsBtn match={match} sel="u35" odd={m.totalGoals.under35} market="gols" label="Menos de 3.5" />
                  </MarketGroup>
                )}
                {m.totalGoals.over45 > 0 && (
                  <MarketGroup title="">
                    <MarketOddsBtn match={match} sel="o45" odd={m.totalGoals.over45} market="gols" label="Mais de 4.5" />
                    <MarketOddsBtn match={match} sel="u45" odd={m.totalGoals.under45} market="gols" label="Menos de 4.5" />
                  </MarketGroup>
                )}
                {m.totalGoals.over55 > 0 && (
                  <MarketGroup title="">
                    <MarketOddsBtn match={match} sel="o55" odd={m.totalGoals.over55} market="gols" label="Mais de 5.5" />
                    <MarketOddsBtn match={match} sel="u55" odd={m.totalGoals.under55} market="gols" label="Menos de 5.5" />
                  </MarketGroup>
                )}
                {m.totalGoals.over65 > 0 && (
                  <MarketGroup title="">
                    <MarketOddsBtn match={match} sel="o65" odd={m.totalGoals.over65} market="gols" label="Mais de 6.5" />
                    <MarketOddsBtn match={match} sel="u65" odd={m.totalGoals.under65} market="gols" label="Menos de 6.5" />
                  </MarketGroup>
                )}
              </>
            )}
          </div>
        )}
        {isFootball && !showET && !showPen && modalTab === "gols" && m && m.totalGoals.over25 === 0 && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── FUTEBOL: BTTS 1º TEMPO / ÍMPAR-PAR / GOLS EXATOS ── */}
        {isFootball && !showET && !showPen && !isLateGame && (modalTab === "gols" || modalTab === "todos") && m && (
          <div>
            {show1tempo && (m as any).btts1H?.yes > 0 && (
              <MarketGroup title="Ambas Marcam — 1º Tempo">
                <MarketOddsBtn match={match} sel="btts1h-y" odd={(m as any).btts1H.yes} market="gols" label="Sim" />
                <MarketOddsBtn match={match} sel="btts1h-n" odd={(m as any).btts1H.no} market="gols" label="Não" />
              </MarketGroup>
            )}
            {show2tempo && (m as any).btts2H?.yes > 0 && (
              <MarketGroup title="Ambas Marcam — 2º Tempo">
                <MarketOddsBtn match={match} sel="btts2h-y" odd={(m as any).btts2H.yes} market="gols" label="Sim" />
                <MarketOddsBtn match={match} sel="btts2h-n" odd={(m as any).btts2H.no} market="gols" label="Não" />
              </MarketGroup>
            )}
            {(m as any).goalOddEven?.odd > 0 && (
              <MarketGroup title="Total de Gols — Ímpar / Par">
                <MarketOddsBtn match={match} sel="goe-odd"  odd={(m as any).goalOddEven.odd}  market="gols" label="Ímpar" />
                <MarketOddsBtn match={match} sel="goe-even" odd={(m as any).goalOddEven.even} market="gols" label="Par" />
              </MarketGroup>
            )}
            {(m as any).exactGoals?.g2 > 0 && (
              <MarketGrid2Group title="Gols Exatos">
                {(m as any).exactGoals.g0 > 0 && <MarketOddsBtn match={match} sel="eg-0"  odd={(m as any).exactGoals.g0}     market="gols" label="0 gols" />}
                {(m as any).exactGoals.g1 > 0 && <MarketOddsBtn match={match} sel="eg-1"  odd={(m as any).exactGoals.g1}     market="gols" label="1 gol" />}
                {(m as any).exactGoals.g2 > 0 && <MarketOddsBtn match={match} sel="eg-2"  odd={(m as any).exactGoals.g2}     market="gols" label="2 gols" />}
                {(m as any).exactGoals.g3 > 0 && <MarketOddsBtn match={match} sel="eg-3"  odd={(m as any).exactGoals.g3}     market="gols" label="3 gols" />}
                {(m as any).exactGoals.g4 > 0 && <MarketOddsBtn match={match} sel="eg-4"  odd={(m as any).exactGoals.g4}     market="gols" label="4 gols" />}
                {(m as any).exactGoals.g5plus > 0 && <MarketOddsBtn match={match} sel="eg-5p" odd={(m as any).exactGoals.g5plus} market="gols" label="5+ gols" />}
              </MarketGrid2Group>
            )}
          </div>
        )}

        {/* ── FUTEBOL: GOLS POR EQUIPA (FT) ── */}
        {isFootball && !showET && !showPen && (modalTab === "gols" || modalTab === "todos") && m && (m as any).teamGoals?.homeOver05 > 0 && (
          <div>
            <div className="mb-4 last:mb-0">
              <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 px-0.5">{match.home} — Golos</div>
              {(((m as any).teamGoals.homeOver05 > 0) || ((m as any).teamGoals.homeUnder05 > 0)) && (
                <MarketGroup title="">
                  {(m as any).teamGoals.homeOver05 > 0 && <MarketOddsBtn match={match} sel="tgh-o05" odd={(m as any).teamGoals.homeOver05} market="gols" label="Mais 0.5" />}
                  {(m as any).teamGoals.homeUnder05 > 0 && <MarketOddsBtn match={match} sel="tgh-u05" odd={(m as any).teamGoals.homeUnder05} market="gols" label="Menos 0.5" />}
                </MarketGroup>
              )}
              {(((m as any).teamGoals.homeOver15 > 0) || ((m as any).teamGoals.homeUnder15 > 0)) && (
                <MarketGroup title="">
                  {(m as any).teamGoals.homeOver15 > 0 && <MarketOddsBtn match={match} sel="tgh-o15" odd={(m as any).teamGoals.homeOver15} market="gols" label="Mais 1.5" />}
                  {(m as any).teamGoals.homeUnder15 > 0 && <MarketOddsBtn match={match} sel="tgh-u15" odd={(m as any).teamGoals.homeUnder15} market="gols" label="Menos 1.5" />}
                </MarketGroup>
              )}
              {(((m as any).teamGoals.homeOver25 > 0) || ((m as any).teamGoals.homeUnder25 > 0)) && (
                <MarketGroup title="">
                  {(m as any).teamGoals.homeOver25 > 0 && <MarketOddsBtn match={match} sel="tgh-o25" odd={(m as any).teamGoals.homeOver25} market="gols" label="Mais 2.5" />}
                  {(m as any).teamGoals.homeUnder25 > 0 && <MarketOddsBtn match={match} sel="tgh-u25" odd={(m as any).teamGoals.homeUnder25} market="gols" label="Menos 2.5" />}
                </MarketGroup>
              )}
            </div>
            <div className="mb-4 last:mb-0">
              <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 px-0.5">{match.away} — Golos</div>
              {(((m as any).teamGoals.awayOver05 > 0) || ((m as any).teamGoals.awayUnder05 > 0)) && (
                <MarketGroup title="">
                  {(m as any).teamGoals.awayOver05 > 0 && <MarketOddsBtn match={match} sel="tga-o05" odd={(m as any).teamGoals.awayOver05} market="gols" label="Mais 0.5" />}
                  {(m as any).teamGoals.awayUnder05 > 0 && <MarketOddsBtn match={match} sel="tga-u05" odd={(m as any).teamGoals.awayUnder05} market="gols" label="Menos 0.5" />}
                </MarketGroup>
              )}
              {(((m as any).teamGoals.awayOver15 > 0) || ((m as any).teamGoals.awayUnder15 > 0)) && (
                <MarketGroup title="">
                  {(m as any).teamGoals.awayOver15 > 0 && <MarketOddsBtn match={match} sel="tga-o15" odd={(m as any).teamGoals.awayOver15} market="gols" label="Mais 1.5" />}
                  {(m as any).teamGoals.awayUnder15 > 0 && <MarketOddsBtn match={match} sel="tga-u15" odd={(m as any).teamGoals.awayUnder15} market="gols" label="Menos 1.5" />}
                </MarketGroup>
              )}
              {(((m as any).teamGoals.awayOver25 > 0) || ((m as any).teamGoals.awayUnder25 > 0)) && (
                <MarketGroup title="">
                  {(m as any).teamGoals.awayOver25 > 0 && <MarketOddsBtn match={match} sel="tga-o25" odd={(m as any).teamGoals.awayOver25} market="gols" label="Mais 2.5" />}
                  {(m as any).teamGoals.awayUnder25 > 0 && <MarketOddsBtn match={match} sel="tga-u25" odd={(m as any).teamGoals.awayUnder25} market="gols" label="Menos 2.5" />}
                </MarketGroup>
              )}
            </div>
          </div>
        )}

        {/* ── FUTEBOL: ESPECIAIS ── */}
        {isFootball && !showET && !showPen && !isLateGame && (modalTab === "especiais" || modalTab === "todos") && m && (
          <div>
            {((m as any).winToNil?.home > 0 || (m as any).winToNil?.away > 0) && (
              <MarketGroup title="Vitória a Zeros">
                {(m as any).winToNil?.home > 0 && <MarketOddsBtn match={match} sel="wtn-h" odd={(m as any).winToNil.home} market="especiais" label={`${match.home} a Zeros`} />}
                {(m as any).winToNil?.away > 0 && <MarketOddsBtn match={match} sel="wtn-a" odd={(m as any).winToNil.away} market="especiais" label={`${match.away} a Zeros`} />}
              </MarketGroup>
            )}
            {((m as any).cleanSheet?.home > 0 || (m as any).cleanSheet?.away > 0) && (
              <MarketGroup title="Folha Limpa">
                {(m as any).cleanSheet?.home > 0 && <MarketOddsBtn match={match} sel="cs-h" odd={(m as any).cleanSheet.home} market="especiais" label={`${match.home} sem sofrer`} />}
                {(m as any).cleanSheet?.away > 0 && <MarketOddsBtn match={match} sel="cs-a" odd={(m as any).cleanSheet.away} market="especiais" label={`${match.away} sem sofrer`} />}
              </MarketGroup>
            )}
            {(m as any).toWinBothHalves?.home > 0 && (
              <MarketGroup title="Vencer os Dois Tempos">
                <MarketOddsBtn match={match} sel="wbh-h" odd={(m as any).toWinBothHalves.home} market="especiais" label={match.home} />
                <MarketOddsBtn match={match} sel="wbh-a" odd={(m as any).toWinBothHalves.away} market="especiais" label={match.away} />
              </MarketGroup>
            )}
            {(m as any).highestScoringHalf?.first > 0 && (
              <MarketGroup title="Tempo com Mais Gols">
                <MarketOddsBtn match={match} sel="hsf-1" odd={(m as any).highestScoringHalf.first}  market="especiais" label="1º Tempo" />
                <MarketOddsBtn match={match} sel="hsf-2" odd={(m as any).highestScoringHalf.second} market="especiais" label="2º Tempo" />
                <MarketOddsBtn match={match} sel="hsf-e" odd={(m as any).highestScoringHalf.equal}  market="especiais" label="Igual" />
              </MarketGroup>
            )}
            {!((m as any).winToNil?.home > 0) && !((m as any).cleanSheet?.home > 0) && !((m as any).toWinBothHalves?.home > 0) && !((m as any).highestScoringHalf?.first > 0) && modalTab === "especiais" && (
              <div className="text-center text-zinc-600 py-6 text-sm">Mercados especiais não disponíveis para esta partida.</div>
            )}
          </div>
        )}

        {/* ── BEISEBOL: TOTAL DE CORRIDAS ── */}
        {isBaseball && (modalTab === "gols" || modalTab === "todos") && m && m.totalGoals.over35 > 0 && (() => {
          const tot = m._total;
          const lo  = tot ? tot - 0.5 : null;
          const hi  = tot ? tot + 0.5 : null;
          return (
            <div>
              {m.totalGoals.over25 > 0 && lo && (
                <MarketGroup title={`Total de Corridas — ${lo}`}>
                  <MarketOddsBtn match={match} sel={`mlb-tot-o-${lo}`} odd={m.totalGoals.over25} market="gols" label={`Mais de ${lo}`} suspKey="totalGoals" />
                  <MarketOddsBtn match={match} sel={`mlb-tot-u-${lo}`} odd={m.totalGoals.under25} market="gols" label={`Menos de ${lo}`} suspKey="totalGoals" />
                </MarketGroup>
              )}
              {m.totalGoals.over35 > 0 && tot && (
                <MarketGroup title={`Total de Corridas — ${tot}`}>
                  <MarketOddsBtn match={match} sel={`mlb-tot-o-${tot}`} odd={m.totalGoals.over35} market="gols" label={`Mais de ${tot}`} suspKey="totalGoals" />
                  <MarketOddsBtn match={match} sel={`mlb-tot-u-${tot}`} odd={m.totalGoals.under35} market="gols" label={`Menos de ${tot}`} suspKey="totalGoals" />
                </MarketGroup>
              )}
              {m.totalGoals.over45 > 0 && hi && (
                <MarketGroup title={`Total de Corridas — ${hi}`}>
                  <MarketOddsBtn match={match} sel={`mlb-tot-o-${hi}`} odd={m.totalGoals.over45} market="gols" label={`Mais de ${hi}`} suspKey="totalGoals" />
                  <MarketOddsBtn match={match} sel={`mlb-tot-u-${hi}`} odd={m.totalGoals.under45} market="gols" label={`Menos de ${hi}`} suspKey="totalGoals" />
                </MarketGroup>
              )}
            </div>
          );
        })()}
        {isBaseball && modalTab === "gols" && m && m.totalGoals.over35 === 0 && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── BEISEBOL: PRIMEIRAS 5 ENTRADAS (F5) ── */}
        {isBaseball && (modalTab === "gols" || modalTab === "todos") && m && (m as any).mlbExtra && (
          <div>
            {((m as any).mlbExtra as any).f5Result?.home > 0 && (
              <MarketGroup title="Resultado — Primeiras 5 Entradas">
                <MarketOddsBtn match={match} sel="mlb-f5-home" odd={((m as any).mlbExtra as any).f5Result.home} market="gols" label={match.home} suspKey="mlbExtra" />
                <MarketOddsBtn match={match} sel="mlb-f5-away" odd={((m as any).mlbExtra as any).f5Result.away} market="gols" label={match.away} suspKey="mlbExtra" />
              </MarketGroup>
            )}
            {((m as any).mlbExtra as any).f5Total?.over > 0 && (
              <MarketGroup title={`Total F5 — O/U ${((m as any).mlbExtra as any).f5Total.line}`}>
                <MarketOddsBtn match={match} sel={`mlb-f5t-o-${((m as any).mlbExtra as any).f5Total.line}`} odd={((m as any).mlbExtra as any).f5Total.over} market="gols" label={`Mais de ${((m as any).mlbExtra as any).f5Total.line}`} suspKey="mlbExtra" />
                <MarketOddsBtn match={match} sel={`mlb-f5t-u-${((m as any).mlbExtra as any).f5Total.line}`} odd={((m as any).mlbExtra as any).f5Total.under} market="gols" label={`Menos de ${((m as any).mlbExtra as any).f5Total.line}`} suspKey="mlbExtra" />
              </MarketGroup>
            )}
          </div>
        )}

        {/* ── BASQUETE: TOTAIS ── */}
        {isBasketball && (modalTab === "totais" || modalTab === "todos") && m && (
          <div>
            {m._total && m.totalGoals.over25 > 0 && (
              <MarketGroup title={`Total Jogo — ${m._total}`}>
                <MarketOddsBtn match={match} sel={`b-pts-o-${m._total}`} odd={m.totalGoals.over25} market="totais" label={`Mais de ${m._total}`} suspKey="totalGoals" />
                <MarketOddsBtn match={match} sel={`b-pts-u-${m._total}`} odd={m.totalGoals.under25} market="totais" label={`Menos de ${m._total}`} suspKey="totalGoals" />
              </MarketGroup>
            )}
            {m._total1H && m.totalGoals.over15 > 0 && (
              <MarketGroup title={`Total 1º Tempo — ${m._total1H}`}>
                <MarketOddsBtn match={match} sel={`b-h1-pts-o-${m._total1H}`} odd={m.totalGoals.over15} market="totais" label={`Mais de ${m._total1H}`} suspKey="totalGoals" />
                <MarketOddsBtn match={match} sel={`b-h1-pts-u-${m._total1H}`} odd={m.totalGoals.under15} market="totais" label={`Menos de ${m._total1H}`} suspKey="totalGoals" />
              </MarketGroup>
            )}
            {m.totalGoals.over35 > 0 && (
              <MarketGroup title={`Total ${match.home}`}>
                <MarketOddsBtn match={match} sel="o35" odd={m.totalGoals.over35} market="totais" label="Acima" suspKey="teamTotal" />
                <MarketOddsBtn match={match} sel="u35" odd={m.totalGoals.under35} market="totais" label="Abaixo" suspKey="teamTotal" />
              </MarketGroup>
            )}
          </div>
        )}
        {isBasketball && (modalTab === "1tempo" || modalTab === "todos") && m && m.totalGoals.over15 > 0 && (
          <MarketGroup title={`Total 1º Tempo — ${m._total1H ?? "—"}`}>
            <MarketOddsBtn match={match} sel={`b-h1-pts-o-${m._total1H ?? 0}`} odd={m.totalGoals.over15} market="1tempo" label="Acima" suspKey="totalGoals" />
            <MarketOddsBtn match={match} sel={`b-h1-pts-u-${m._total1H ?? 0}`} odd={m.totalGoals.under15} market="1tempo" label="Abaixo" suspKey="totalGoals" />
          </MarketGroup>
        )}

        {/* ── BASQUETE: SPREAD ── */}
        {isBasketball && (modalTab === "spread" || modalTab === "todos") && m && m.handicap.homeMinusOne > 0 && (
          <div>
            {m._spread !== undefined && (
              <MarketGroup title={`Spread — ${match.home} ${m._spread > 0 ? `−${m._spread}` : `+${Math.abs(m._spread)}`}`}>
                <MarketOddsBtn match={match} sel={`b-spread-home-${Math.abs(m._spread)}`} odd={m.handicap.homeMinusOne} market="spread" label={`${match.home} cobre`} suspKey="handicap" />
                <MarketOddsBtn match={match} sel={`b-spread-away-${Math.abs(m._spread)}`} odd={m.handicap.awayPlusOne} market="spread" label={`${match.away} cobre`} suspKey="handicap" />
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
            {(() => {
              const te = (m as any).tennisExtra as any;
              const sortSetScoreEntries = (entries: Array<{ score: string; odd: number }>) => {
                const homeWins = entries
                  .filter((entry) => {
                    const [h, a] = entry.score.split("-").map(Number);
                    return (h ?? 0) > (a ?? 0);
                  })
                  .sort((a, b) => {
                    const [ah, aa] = a.score.split("-").map(Number);
                    const [bh, ba] = b.score.split("-").map(Number);
                    return ((bh ?? 0) - (ah ?? 0)) || ((aa ?? 0) - (ba ?? 0));
                  });
                const awayWins = entries
                  .filter((entry) => {
                    const [h, a] = entry.score.split("-").map(Number);
                    return (a ?? 0) > (h ?? 0);
                  })
                  .sort((a, b) => {
                    const [ah, aa] = a.score.split("-").map(Number);
                    const [bh, ba] = b.score.split("-").map(Number);
                    return ((ba ?? 0) - (aa ?? 0)) || ((ah ?? 0) - (bh ?? 0));
                  });
                return { homeWins, awayWins };
              };
              const renderExactSetColumns = (
                title: string,
                entries: Array<{ score: string; odd: number }>,
                selPrefix: string,
                marketKey: string,
                suspKey?: string,
              ) => {
                const { homeWins, awayWins } = sortSetScoreEntries(entries);
                if (homeWins.length === 0 && awayWins.length === 0) return null;
                return (
                  <MarketGroup title={title}>
                    <div className="grid grid-cols-2 gap-2 w-full col-span-full">
                      <div className="space-y-2">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 truncate">{match.home}</div>
                        {homeWins.map((entry) => (
                          <div key={`${selPrefix}-${entry.score}`} className="flex w-full">
                            <MarketOddsBtn
                              match={match}
                              sel={`${selPrefix}-${entry.score}`}
                              odd={entry.odd}
                              market={marketKey}
                              label={entry.score}
                              suspKey={suspKey}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 truncate text-right">{match.away}</div>
                        {awayWins.map((entry) => (
                          <div key={`${selPrefix}-${entry.score}`} className="flex w-full">
                            <MarketOddsBtn
                              match={match}
                              sel={`${selPrefix}-${entry.score}`}
                              odd={entry.odd}
                              market={marketKey}
                              label={entry.score}
                              suspKey={suspKey}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </MarketGroup>
                );
              };
              const renderSetResultColumns = (
                title: string,
                homeEntries: Array<{ sel: string; label: string; odd: number }>,
                awayEntries: Array<{ sel: string; label: string; odd: number }>,
                marketKey: string,
                suspKey?: string,
              ) => {
                if (homeEntries.length === 0 && awayEntries.length === 0) return null;
                return (
                  <MarketGroup title={title}>
                    <div className="grid grid-cols-2 gap-2 w-full col-span-full">
                      <div className="space-y-2">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 truncate">{match.home}</div>
                        {homeEntries.map((entry) => (
                          <div key={entry.sel} className="flex w-full">
                            <MarketOddsBtn
                              match={match}
                              sel={entry.sel}
                              odd={entry.odd}
                              market={marketKey}
                              label={entry.label}
                              suspKey={suspKey}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 truncate text-right">{match.away}</div>
                        {awayEntries.map((entry) => (
                          <div key={entry.sel} className="flex w-full">
                            <MarketOddsBtn
                              match={match}
                              sel={entry.sel}
                              odd={entry.odd}
                              market={marketKey}
                              label={entry.label}
                              suspKey={suspKey}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </MarketGroup>
                );
              };
              const cur = (() => {
                const rawCurrentSet = Number(te?.currentSetNum);
                if (Number.isFinite(rawCurrentSet) && rawCurrentSet > 0) {
                  return Math.max(1, Math.min(3, Math.trunc(rawCurrentSet)));
                }
                const scoreBased = (Number(match.homeScore ?? 0) + Number(match.awayScore ?? 0) + 1);
                if (Number.isFinite(scoreBased) && scoreBased > 0) {
                  return Math.max(1, Math.min(3, Math.trunc(scoreBased)));
                }
                const minuteBased = Number(match.minute ?? 20);
                if (Number.isFinite(minuteBased) && minuteBased > 0) {
                  return Math.max(1, Math.min(3, Math.round(minuteBased / 20)));
                }
                return 1;
              })();
              const showSet1 = cur === 1;
              const showSet2 = cur === 2;
              const showSet3 = cur === 3;
              const activeCorrectScoreKey = cur === 1 ? "score1st" : cur === 2 ? "score2nd" : "score3rd";
              const activeCorrectScore = Array.isArray(te?.[activeCorrectScoreKey])
                ? (te[activeCorrectScoreKey] as Array<{ label: string; odds: number }>)
                    .filter((entry) => entry && typeof entry.label === "string" && Number(entry.odds) > 1.001)
                    .map((entry) => ({ score: entry.label, odd: Number(entry.odds) }))
                : [];
              const liveSetExactScore = te?.setExactScore && typeof te.setExactScore === "object"
                ? Object.entries(te.setExactScore as Record<string, number>)
                    .filter(([score, odd]) => typeof score === "string" && Number(odd) > 1.001)
                    .map(([score, odd]) => ({ score, odd: Number(odd) }))
                : [];
              return (
                <>
                  {showSet1 && (te?.firstSet?.home > 0 ? (
                    <MarketGroup title="Vencedor do 1º Set">
                      <MarketOddsBtn match={match} sel="set1-home" odd={te.firstSet.home} market="sets" label={match.home} suspKey="firstSet" />
                      <MarketOddsBtn match={match} sel="set1-away" odd={te.firstSet.away} market="sets" label={match.away} suspKey="firstSet" />
                    </MarketGroup>
                  ) : m.totalGoals.over15 > 0 && (
                    <MarketGroup title="Vencedor do 1º Set">
                      <MarketOddsBtn match={match} sel="set1-home" odd={m.totalGoals.over15} market="sets" label={match.home} suspKey="firstSet" />
                      <MarketOddsBtn match={match} sel="set1-away" odd={m.totalGoals.under15} market="sets" label={match.away} suspKey="firstSet" />
                    </MarketGroup>
                  ))}
                  {showSet2 && te?.set2?.home > 0 && (
                    <MarketGroup title="Vencedor do 2º Set">
                      <MarketOddsBtn match={match} sel="set2-home" odd={te.set2.home} market="sets" label={match.home} suspKey="set2" />
                      <MarketOddsBtn match={match} sel="set2-away" odd={te.set2.away} market="sets" label={match.away} suspKey="set2" />
                    </MarketGroup>
                  )}
                  {showSet3 && te?.set3?.home > 0 && (
                    <MarketGroup title="Vencedor do 3º Set">
                      <MarketOddsBtn match={match} sel="set3-home" odd={te.set3.home} market="sets" label={match.home} suspKey="set3" />
                      <MarketOddsBtn match={match} sel="set3-away" odd={te.set3.away} market="sets" label={match.away} suspKey="set3" />
                    </MarketGroup>
                  )}
                  {!showSet3 && m.totalGoals.over25 > 0 && (
                    <MarketGroup title="Total de Sets — O/U 2.5">
                      <MarketOddsBtn match={match} sel="osets" odd={m.totalGoals.over25} market="sets" label="Mais de 2.5 sets" suspKey="sets" />
                      <MarketOddsBtn match={match} sel="usets" odd={m.totalGoals.under25} market="sets" label="Menos de 2.5 sets" suspKey="sets" />
                    </MarketGroup>
                  )}
                  {renderSetResultColumns(
                    "Resultado Exato em Sets",
                    [
                      ...(te?.exactSets?.h20 > 0 ? [{ sel: "es-h20", label: "2-0", odd: te.exactSets.h20 }] : []),
                      ...(te?.exactSets?.h21 > 0 ? [{ sel: "es-h21", label: "2-1", odd: te.exactSets.h21 }] : []),
                    ],
                    [
                      ...(te?.exactSets?.a02 > 0 ? [{ sel: "es-a02", label: "0-2", odd: te.exactSets.a02 }] : []),
                      ...(te?.exactSets?.a12 > 0 ? [{ sel: "es-a12", label: "1-2", odd: te.exactSets.a12 }] : []),
                    ],
                    "sets",
                    "exactSets",
                  )}
                  {liveSetExactScore.length > 0
                    ? renderExactSetColumns(`${cur}º Set — Resultado Correto`, liveSetExactScore, "ses", "sets", "setExactScore")
                    : activeCorrectScore.length > 0
                      ? renderExactSetColumns(`${cur}º Set — Resultado Correto`, activeCorrectScore, `sc${cur}`, "sets", cur === 1 ? "firstSet" : cur === 2 ? "set2" : "set3")
                      : null}
                </>
              );
            })()}
          </div>
        )}

        {/* ── HANDICAP (futebol + ténis) ── */}
        {!isBasketball && !isVolleyball && (!isFootball || (!showET && !showPen)) && (modalTab === "handicap" || modalTab === "todos") && m && (isTennis ? hasTennisHandicapMarkets || m.handicap.homeMinusOne > 0 : m.handicap.homeMinusOne > 0) && (
          <div>
            {isFootball ? (
              <>
                {isLateGame ? (
                  /* Late game: single handicap group with the most relevant ±1 line */
                  <MarketGroup title="Handicap Europeu">
                    <MarketOddsBtn match={match} sel="hm1" odd={m.handicap.homeMinusOne} market="handicap" label={`${match.home} −1`} />
                    <MarketOddsBtn match={match} sel="ap1" odd={m.handicap.awayPlusOne} market="handicap" label={`${match.away} +1`} />
                  </MarketGroup>
                ) : (
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
                )}
              </>
            ) : isTennis ? (
              <>
                {tennisExtra?.setHandicap?.home > 0 && (
                  <MarketGroup title={`Handicap de Sets — ${match.home} −1.5`}>
                    <MarketOddsBtn match={match} sel="sh15-home2" odd={tennisExtra.setHandicap.home} market="handicap" label={`${match.home} −1.5 sets`} suspKey="setHandicap" />
                    <MarketOddsBtn match={match} sel="sh15-away2" odd={tennisExtra.setHandicap.away} market="handicap" label={`${match.away} +1.5 sets`} suspKey="setHandicap" />
                  </MarketGroup>
                )}
                {tennisExtra?.gameHandicap?.home > 0 && (
                  <MarketGroup title={`Handicap de Games — Linha ${tennisExtra.gameHandicap.line > 0 ? `−${tennisExtra.gameHandicap.line}` : `+${Math.abs(tennisExtra.gameHandicap.line)}`}`}>
                    <MarketOddsBtn match={match} sel={`gh-home-${tennisExtra.gameHandicap.line}`} odd={tennisExtra.gameHandicap.home} market="handicap" label={match.home} suspKey="gameHandicap" />
                    <MarketOddsBtn match={match} sel={`gh-away-${tennisExtra.gameHandicap.line}`} odd={tennisExtra.gameHandicap.away} market="handicap" label={match.away} suspKey="gameHandicap" />
                  </MarketGroup>
                )}
                {!tennisExtra && (
                  <MarketGroup title="Handicap de Games">
                    <MarketOddsBtn match={match} sel="hcap-home" odd={m.handicap.homeMinusOne} market="handicap" label={`${match.home} cobre`} />
                    <MarketOddsBtn match={match} sel="hcap-away" odd={m.handicap.awayPlusOne} market="handicap" label={`${match.away} cobre`} />
                  </MarketGroup>
                )}
              </>
            ) : isBaseball ? (
              <MarketGroup title="Run Line">
                <MarketOddsBtn match={match} sel="mlb-rl-home-1.5" odd={m.handicap.homeMinusOne} market="handicap" label={`${match.home} −1.5`} suspKey="handicap" />
                <MarketOddsBtn match={match} sel="mlb-rl-away-1.5" odd={m.handicap.awayPlusOne} market="handicap" label={`${match.away} +1.5`} suspKey="handicap" />
              </MarketGroup>
            ) : (
              <MarketGroup title="Handicap de Games">
                <MarketOddsBtn match={match} sel="hcap-home" odd={m.handicap.homeMinusOne} market="handicap" label={`${match.home} cobre`} />
                <MarketOddsBtn match={match} sel="hcap-away" odd={m.handicap.awayPlusOne} market="handicap" label={`${match.away} cobre`} />
              </MarketGroup>
            )}
          </div>
        )}
        {!isBasketball && !isVolleyball && (!isFootball || (!showET && !showPen)) && modalTab === "handicap" && m && (isTennis ? !hasTennisHandicapMarkets && m.handicap.homeMinusOne === 0 : m.handicap.homeMinusOne === 0) && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── FUTEBOL: 1º TEMPO — hidden in 2nd half ── */}
        {isFootball && !showET && !showPen && show1tempo && (modalTab === "1tempo" || modalTab === "todos") && m && m.halfTime.home > 0 && (
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
        {isFootball && !showET && !showPen && show1tempo && modalTab === "1tempo" && m && m.halfTime.home === 0 && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── FUTEBOL: GOLS POR EQUIPA — 1º TEMPO ── */}
        {isFootball && !showET && !showPen && show1tempo && (modalTab === "1tempo" || modalTab === "todos") && m && (m as any).teamGoals?.homeOver05 > 0 && (
          <div>
            <div className="mb-4 last:mb-0">
              <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 px-0.5">{match.home} — Golos</div>
              {(((m as any).teamGoals.homeOver05 > 0) || ((m as any).teamGoals.homeUnder05 > 0)) && (
                <MarketGroup title="">
                  {(m as any).teamGoals.homeOver05 > 0 && <MarketOddsBtn match={match} sel="tgh-o05" odd={(m as any).teamGoals.homeOver05} market="1tempo" label="Mais 0.5" />}
                  {(m as any).teamGoals.homeUnder05 > 0 && <MarketOddsBtn match={match} sel="tgh-u05" odd={(m as any).teamGoals.homeUnder05} market="1tempo" label="Menos 0.5" />}
                </MarketGroup>
              )}
              {(((m as any).teamGoals.homeOver15 > 0) || ((m as any).teamGoals.homeUnder15 > 0)) && (
                <MarketGroup title="">
                  {(m as any).teamGoals.homeOver15 > 0 && <MarketOddsBtn match={match} sel="tgh-o15" odd={(m as any).teamGoals.homeOver15} market="1tempo" label="Mais 1.5" />}
                  {(m as any).teamGoals.homeUnder15 > 0 && <MarketOddsBtn match={match} sel="tgh-u15" odd={(m as any).teamGoals.homeUnder15} market="1tempo" label="Menos 1.5" />}
                </MarketGroup>
              )}
              {(((m as any).teamGoals.homeOver25 > 0) || ((m as any).teamGoals.homeUnder25 > 0)) && (
                <MarketGroup title="">
                  {(m as any).teamGoals.homeOver25 > 0 && <MarketOddsBtn match={match} sel="tgh-o25" odd={(m as any).teamGoals.homeOver25} market="1tempo" label="Mais 2.5" />}
                  {(m as any).teamGoals.homeUnder25 > 0 && <MarketOddsBtn match={match} sel="tgh-u25" odd={(m as any).teamGoals.homeUnder25} market="1tempo" label="Menos 2.5" />}
                </MarketGroup>
              )}
            </div>
            <div className="mb-4 last:mb-0">
              <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 px-0.5">{match.away} — Golos</div>
              {(((m as any).teamGoals.awayOver05 > 0) || ((m as any).teamGoals.awayUnder05 > 0)) && (
                <MarketGroup title="">
                  {(m as any).teamGoals.awayOver05 > 0 && <MarketOddsBtn match={match} sel="tga-o05" odd={(m as any).teamGoals.awayOver05} market="1tempo" label="Mais 0.5" />}
                  {(m as any).teamGoals.awayUnder05 > 0 && <MarketOddsBtn match={match} sel="tga-u05" odd={(m as any).teamGoals.awayUnder05} market="1tempo" label="Menos 0.5" />}
                </MarketGroup>
              )}
              {(((m as any).teamGoals.awayOver15 > 0) || ((m as any).teamGoals.awayUnder15 > 0)) && (
                <MarketGroup title="">
                  {(m as any).teamGoals.awayOver15 > 0 && <MarketOddsBtn match={match} sel="tga-o15" odd={(m as any).teamGoals.awayOver15} market="1tempo" label="Mais 1.5" />}
                  {(m as any).teamGoals.awayUnder15 > 0 && <MarketOddsBtn match={match} sel="tga-u15" odd={(m as any).teamGoals.awayUnder15} market="1tempo" label="Menos 1.5" />}
                </MarketGroup>
              )}
              {(((m as any).teamGoals.awayOver25 > 0) || ((m as any).teamGoals.awayUnder25 > 0)) && (
                <MarketGroup title="">
                  {(m as any).teamGoals.awayOver25 > 0 && <MarketOddsBtn match={match} sel="tga-o25" odd={(m as any).teamGoals.awayOver25} market="1tempo" label="Mais 2.5" />}
                  {(m as any).teamGoals.awayUnder25 > 0 && <MarketOddsBtn match={match} sel="tga-u25" odd={(m as any).teamGoals.awayUnder25} market="1tempo" label="Menos 2.5" />}
                </MarketGroup>
              )}
            </div>
          </div>
        )}

        {/* ── FUTEBOL: 2º TEMPO — shown at HT and during 2nd half; hidden in late game ── */}
        {isFootball && !showET && !showPen && show2tempo && !isLateGame && (modalTab === "2tempo" || modalTab === "todos") && (
          <div>
            {m && m.totalGoals.over05 > 0 && (
              <MarketGroup title="Golos no 2º Tempo — 0.5">
                <MarketOddsBtn match={match} sel="2h-o05g" odd={m.totalGoals.over05} market="2tempo" label="Mais de 0.5" />
                <MarketOddsBtn match={match} sel="2h-u05g" odd={m.totalGoals.under05} market="2tempo" label="Menos de 0.5" />
              </MarketGroup>
            )}
            {m && m.totalGoals.over15 > 0 && (
              <MarketGroup title="Golos no 2º Tempo — 1.5">
                <MarketOddsBtn match={match} sel="2h-o15g" odd={m.totalGoals.over15} market="2tempo" label="Mais de 1.5" />
                <MarketOddsBtn match={match} sel="2h-u15g" odd={m.totalGoals.under15} market="2tempo" label="Menos de 1.5" />
              </MarketGroup>
            )}
          </div>
        )}
        {isFootball && !showET && !showPen && show2tempo && modalTab === "2tempo" && (!match.odds.home || match.odds.home <= 1) && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── FUTEBOL: PLACAR EXATO DO 2º TEMPO ── */}
        {isFootball && !showET && !showPen && show2tempo && !isLateGame && (modalTab === "2tempo" || modalTab === "todos") && m && (m as any).h2CorrectScore && Object.keys((m as any).h2CorrectScore as Record<string, number>).length > 1 && (
          <div>
            <p className="text-xs text-zinc-500 mb-3">Marcador exato no 2º tempo.</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {Object.entries((m as any).h2CorrectScore as Record<string, number>).map(([score, odd]) => (
                <MarketOddsBtn key={score} match={match} sel={`h2cs-${score}`} odd={odd as number} market="2tempo" label={score} />
              ))}
            </div>
          </div>
        )}

        {/* ── FUTEBOL: HT/FT ── */}
        {isFootball && !showET && !showPen && !isLateGame && (modalTab === "htft" || modalTab === "todos") && m && m.htft && (() => {
          const isSecondHalf = match.isLive === true && (match.minute ?? 0) > 45;
          const isAtHT = match.status === "HT";
          const htKnown = isSecondHalf || isAtHT;
          const htGroupLabel = htKnown ? "Empate ao Intervalo" : "Empate ao Intervalo";
          const htPrefix1 = htKnown ? "Intervalo / Final" : "Intervalo / Final";
          const hf = m.htft;
          // After backend zeroing: only one of these three groups will have non-zero odds
          const showHome = hf.hh > 0 || hf.hd > 0 || hf.ha > 0;
          const showDraw = hf.dh > 0 || hf.dd > 0 || hf.da > 0;
          const showAway = hf.ah > 0 || hf.ad > 0 || hf.aa > 0;
          return (
            <div>
              {showHome && (
                <MarketGroup title={`${htPrefix1} — ${match.home} vence`}>
                  {hf.hh > 0 && <MarketOddsBtn match={match} sel="htft-hh" odd={hf.hh} market="htft" label="1 / 1" />}
                  {hf.hd > 0 && <MarketOddsBtn match={match} sel="htft-hd" odd={hf.hd} market="htft" label="1 / X" />}
                  {hf.ha > 0 && <MarketOddsBtn match={match} sel="htft-ha" odd={hf.ha} market="htft" label="1 / 2" />}
                </MarketGroup>
              )}
              {showDraw && (
                <MarketGroup title={htGroupLabel}>
                  {hf.dh > 0 && <MarketOddsBtn match={match} sel="htft-dh" odd={hf.dh} market="htft" label="X / 1" />}
                  {hf.dd > 0 && <MarketOddsBtn match={match} sel="htft-dd" odd={hf.dd} market="htft" label="X / X" />}
                  {hf.da > 0 && <MarketOddsBtn match={match} sel="htft-da" odd={hf.da} market="htft" label="X / 2" />}
                </MarketGroup>
              )}
              {showAway && (
                <MarketGroup title={`${htPrefix1} — ${match.away} vence`}>
                  {hf.ah > 0 && <MarketOddsBtn match={match} sel="htft-ah" odd={hf.ah} market="htft" label="2 / 1" />}
                  {hf.ad > 0 && <MarketOddsBtn match={match} sel="htft-ad" odd={hf.ad} market="htft" label="2 / X" />}
                  {hf.aa > 0 && <MarketOddsBtn match={match} sel="htft-aa" odd={hf.aa} market="htft" label="2 / 2" />}
                </MarketGroup>
              )}
            </div>
          );
        })()}
        {isFootball && !showET && !showPen && !isLateGame && modalTab === "htft" && m && !m.htft && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── TÉNIS: RESULTADO CORRETO DO SET ATUAL ───────────────────────────── */}
        {isTennis && false && (modalTab === "placar" || modalTab === "todos") && m && (m as any).tennisExtra?.setExactScore && Object.keys((m as any).tennisExtra.setExactScore as Record<string, number>).length > 0 && (() => {
          const ses = (m as any).tennisExtra.setExactScore as Record<string, number>;
          const setNum = (m as any).tennisExtra.currentSetNum ?? match.minute;
          const homeWins = Object.entries(ses)
            .filter(([s]) => { const [h, a] = s.split("-").map(Number); return (h ?? 0) > (a ?? 0); })
            .sort(([ka], [kb]) => {
              const [ah, aa] = ka.split("-").map(Number); const [bh, ba] = kb.split("-").map(Number);
              return ((bh ?? 0) - (ah ?? 0)) || ((aa ?? 0) - (ba ?? 0));
            });
          const awayWins = Object.entries(ses)
            .filter(([s]) => { const [h, a] = s.split("-").map(Number); return (a ?? 0) > (h ?? 0); })
            .sort(([ka], [kb]) => {
              const [ah, aa] = ka.split("-").map(Number); const [bh, ba] = kb.split("-").map(Number);
              return ((ba ?? 0) - (aa ?? 0)) || ((ah ?? 0) - (bh ?? 0));
            });
          const maxRows = Math.max(homeWins.length, awayWins.length);
          return (
            <div className="mb-4">
              <p className="text-xs text-zinc-500 mb-3 font-medium">{setNum}º Set — Resultado Correto</p>
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-zinc-400 font-semibold pb-1 border-b border-zinc-700 truncate">{match.home}</div>
                  <div className="flex flex-col gap-2 mt-2">
                    {homeWins.map(([score, odd]) => (
                      <div key={`ses-h-${score}`} className="flex">
                        <MarketOddsBtn match={match} sel={`ses-${score}`} odd={odd} market="placar" label={score} />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-400 font-semibold pb-1 border-b border-zinc-700 truncate">{match.away}</div>
                  <div className="flex flex-col gap-2 mt-2">
                    {awayWins.map(([score, odd]) => (
                      <div key={`ses-a-${score}`} className="flex">
                        <MarketOddsBtn match={match} sel={`ses-${score}`} odd={odd} market="placar" label={score} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── TÉNIS: PLACAR EXATO — 1º SET (só quando liquidado) ── */}
        {isTennis && false && (modalTab === "placar" || modalTab === "todos") && m && false && (m as any).tennisExtra?.set1ExactScore && (() => {
          const ses1 = (m as any).tennisExtra.set1ExactScore as Record<string, number>;
          const isSettled1 = Object.values(ses1).some(v => v === 1.01);
          if (!isSettled1) return null; // while set is live it's already shown in "setExactScore" above
          const homeWins1 = Object.entries(ses1).filter(([s, v]) => v > 0 && Number(s.split("-")[0]) > Number(s.split("-")[1]));
          const awayWins1 = Object.entries(ses1).filter(([s, v]) => v > 0 && Number(s.split("-")[1]) > Number(s.split("-")[0]));
          const maxRows1 = Math.max(homeWins1.length, awayWins1.length);
          if (maxRows1 === 0) return null;
          const total = homeWins1.length + awayWins1.length;
          return (
            <div className="mb-4">
              <MarketAccordionSection title="✓ 1º Set — Resultado Final" defaultOpen={false} count={total}>
                <div className="space-y-4">
                  <div>
                    <div className="text-xs text-zinc-400 font-semibold pb-1 border-b border-zinc-700 truncate">{match.home}</div>
                    <div className="flex flex-col gap-2 mt-2">
                      {homeWins1.map(([score, odd]) => (
                        <div key={`s1es-h-${score}`} className="flex">
                          <MarketOddsBtn match={match} sel={`s1es-${score}`} odd={odd} market="placar" label={score} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400 font-semibold pb-1 border-b border-zinc-700 truncate">{match.away}</div>
                    <div className="flex flex-col gap-2 mt-2">
                      {awayWins1.map(([score, odd]) => (
                        <div key={`s1es-a-${score}`} className="flex">
                          <MarketOddsBtn match={match} sel={`s1es-${score}`} odd={odd} market="placar" label={score} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </MarketAccordionSection>
            </div>
          );
        })()}

        {/* ── TÉNIS: PLACAR EXATO — 2º SET (só quando liquidado) ── */}
        {isTennis && false && (modalTab === "placar" || modalTab === "todos") && m && false && (m as any).tennisExtra?.set2ExactScore && (() => {
          const ses2 = (m as any).tennisExtra.set2ExactScore as Record<string, number>;
          const isSettled2 = Object.values(ses2).some(v => v === 1.01);
          if (!isSettled2) return null;
          const homeWins2 = Object.entries(ses2).filter(([s, v]) => v > 0 && Number(s.split("-")[0]) > Number(s.split("-")[1]));
          const awayWins2 = Object.entries(ses2).filter(([s, v]) => v > 0 && Number(s.split("-")[1]) > Number(s.split("-")[0]));
          const maxRows2 = Math.max(homeWins2.length, awayWins2.length);
          if (maxRows2 === 0) return null;
          const total = homeWins2.length + awayWins2.length;
          return (
            <div className="mb-4">
              <MarketAccordionSection title="✓ 2º Set — Resultado Final" defaultOpen={false} count={total}>
                <div className="space-y-4">
                  <div>
                    <div className="text-xs text-zinc-400 font-semibold pb-1 border-b border-zinc-700 truncate">{match.home}</div>
                    <div className="flex flex-col gap-2 mt-2">
                      {homeWins2.map(([score, odd]) => (
                        <div key={`s2es-h-${score}`} className="flex">
                          <MarketOddsBtn match={match} sel={`s2es-${score}`} odd={odd} market="placar" label={score} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400 font-semibold pb-1 border-b border-zinc-700 truncate">{match.away}</div>
                    <div className="flex flex-col gap-2 mt-2">
                      {awayWins2.map(([score, odd]) => (
                        <div key={`s2es-a-${score}`} className="flex">
                          <MarketOddsBtn match={match} sel={`s2es-${score}`} odd={odd} market="placar" label={score} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </MarketAccordionSection>
            </div>
          );
        })()}

        {/* ── FUTEBOL: PLACAR EXATO ── */}
        {isFootball && !showET && !showPen && !isLateGame && (modalTab === "placar" || modalTab === "todos") && m && m.correctScore && (
          <div>
            <MarketAccordionSection title="Placar Exato" defaultOpen={false} count={Object.keys(m.correctScore).length}>
              <p className="text-xs text-zinc-500 mb-3">Selecione o marcador exato ao final da partida.</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {Object.entries(m.correctScore).map(([score, odd]) => (
                  <MarketOddsBtn key={score} match={match} sel={`cs-${score}`} odd={odd} market="placar" label={score} />
                ))}
              </div>
            </MarketAccordionSection>
          </div>
        )}
        {isFootball && !showET && !showPen && !isLateGame && modalTab === "placar" && m && !m.correctScore && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── FUTEBOL: ESCANTEIOS ── */}
        {isFootball && !showET && !showPen && !isLateGame && (modalTab === "escanteios" || modalTab === "todos") && m && m.corners && (
          <div>
            {isLateGame ? (
              /* Late game: only the most relevant line (9.5) */
              <MarketGroup title="Total de Escanteios — 9.5">
                <MarketOddsBtn match={match} sel="oc95" odd={m.corners.o95} market="escanteios" label="Acima de 9.5" />
                <MarketOddsBtn match={match} sel="uc95" odd={m.corners.u95} market="escanteios" label="Abaixo de 9.5" />
              </MarketGroup>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}
        {isFootball && !showET && !showPen && !isLateGame && modalTab === "escanteios" && m && !m.corners && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── FUTEBOL: CARTÕES ── */}
        {isFootball && !showET && !showPen && !isLateGame && (modalTab === "cartoes" || modalTab === "todos") && m && m.cards && (
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
        {isFootball && !showET && !showPen && !isLateGame && modalTab === "cartoes" && m && !m.cards && (
          <div className="text-center text-zinc-600 py-6 text-sm">Mercado não disponível para esta partida.</div>
        )}

        {/* ── FUTEBOL: ASIÁTICO ── */}
        {isFootball && !showET && !showPen && !isLateGame && (modalTab === "asiatico" || modalTab === "todos") && m && (
          <div>
            {m.drawNoBet && m.drawNoBet.home > 0 && (
              <MarketGroup title="Draw No Bet (Empate Anulado)">
                <MarketOddsBtn match={match} sel="dnb-home" odd={m.drawNoBet.home} market="asiatico" label={match.home} />
                <MarketOddsBtn match={match} sel="dnb-away" odd={m.drawNoBet.away} market="asiatico" label={match.away} />
              </MarketGroup>
            )}
            {/* Late game: hide complex asian markets; keep only Draw No Bet */}
            {!isLateGame && m.asianHandicap && m.asianHandicap.home > 0 && (
              <MarketGroup title={`Handicap Asiático — Linha ${m.asianHandicap.line > 0 ? "+" : ""}${m.asianHandicap.line}`}>
                <MarketOddsBtn match={match} sel="ah-home" odd={m.asianHandicap.home} market="asiatico" label={`${match.home} ${m.asianHandicap.line > 0 ? "+" : ""}${m.asianHandicap.line}`} />
                <MarketOddsBtn match={match} sel="ah-away" odd={m.asianHandicap.away} market="asiatico" label={`${match.away} ${m.asianHandicap.line > 0 ? `-${m.asianHandicap.line}` : `+${Math.abs(m.asianHandicap.line)}`}`} />
              </MarketGroup>
            )}
            {!isLateGame && m.asianTotals && m.asianTotals.o225 > 0 && (
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

        {/* ── FUTEBOL: JOGADORES ── */}
        {isFootball && modalTab === "jogadores" && (
          <div>
            {playerMarketsLoading && (
              <div className="flex items-center justify-center py-12 gap-3 text-zinc-400">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">A carregar dados dos jogadores…</span>
              </div>
            )}
            {!playerMarketsLoading && !playerMarkets && (
              <div className="text-center text-zinc-600 py-10 text-sm">Dados de jogadores não disponíveis para esta partida.</div>
            )}
            {!playerMarketsLoading && playerMarkets && !playerMarkets.home && !playerMarkets.away && (
              <div className="text-center text-zinc-600 py-10 text-sm">Equipas não encontradas nas estatísticas desta liga.</div>
            )}
            {!playerMarketsLoading && playerMarkets && (playerMarkets.home || playerMarkets.away) && (() => {
              type PMRow = { id: string; name: string; stat: number; appearances: number; odds: number; line?: number; side?: "over" | "under" };
              const pmList = (rows: PMRow[], selPrefix: string, market: string, label: string, sublabel: (p: PMRow) => string) => {
                if (rows.length === 0) return null;
                const titleColor =
                  selPrefix.startsWith("pm-first") ? "text-fuchsia-400" :
                  selPrefix.startsWith("pm-last") ? "text-violet-400" :
                  selPrefix.startsWith("pm-2g") ? "text-pink-400" :
                  selPrefix.startsWith("pm-hat") ? "text-cyan-400" :
                  selPrefix.startsWith("pm-noscore") ? "text-slate-300" :
                  selPrefix.startsWith("pm-gol") ? "text-red-400" :
                  selPrefix.startsWith("pm-fh") ? "text-orange-400" :
                  selPrefix.startsWith("pm-sh") ? "text-amber-400" :
                  selPrefix.startsWith("pm-ast") ? "text-sky-400" :
                  selPrefix.startsWith("pm-shotot") ? "text-lime-400" :
                  selPrefix.startsWith("pm-shoton") ? "text-green-400" :
                  selPrefix.startsWith("pm-pass") ? "text-indigo-400" :
                  selPrefix.startsWith("pm-tkl") ? "text-teal-400" :
                  selPrefix.startsWith("pm-sa") ? "text-emerald-400" :
                  selPrefix.startsWith("pm-red") ? "text-rose-400" :
                  "text-yellow-500";
                const hasLineMarkets = rows.some(r => r.line != null);

                return (
                  <div className="mb-3">
                    <div className={`text-xs font-semibold uppercase tracking-wider px-1 mb-1.5 ${titleColor}`}>{label}</div>
                    <div className="bg-zinc-900/60 rounded-lg overflow-hidden">
                      {hasLineMarkets ? (() => {
                        const grouped = new Map<string, PMRow[]>();
                        for (const row of rows) {
                          const existing = grouped.get(row.name) ?? [];
                          existing.push(row);
                          grouped.set(row.name, existing);
                        }
                        return Array.from(grouped.entries()).map(([playerName, playerRows]) => {
                          const sortedRows = [...playerRows].sort((a, b) => {
                            const lineCmp = (a.line ?? 0) - (b.line ?? 0);
                            if (lineCmp !== 0) return lineCmp;
                            if ((a.side ?? "over") === (b.side ?? "over")) return 0;
                            return (a.side ?? "over") === "over" ? -1 : 1;
                          });
                          const lead = sortedRows[0]!;
                          return (
                            <div key={`${selPrefix}-${playerName}`} className="py-2 px-2 border-b border-zinc-800/60 last:border-0">
                              <div className="min-w-0 mb-2">
                                <div className="text-sm font-medium text-white truncate">{playerName}</div>
                                <div className="text-xs text-zinc-500 mt-0.5">{sublabel(lead)}</div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {sortedRows.map(p => (
                                  <div key={`${p.id}-${p.line ?? "na"}`} className="w-[92px]">
                                    <MarketOddsBtn
                                      match={match}
                                      sel={`${selPrefix}-${p.id}-${p.line ?? "na"}-${p.side ?? "over"}`}
                                      odd={p.odds}
                                      market={market}
                                      label={p.line != null ? `${p.side === "under" ? "Menos de" : "Mais de"} ${p.line}` : label}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        });
                      })() : rows.map(p => (
                        <div key={p.id} className="flex items-center justify-between py-2 px-2 border-b border-zinc-800/60 last:border-0">
                          <div className="min-w-0 flex-1 mr-3">
                            <div className="text-sm font-medium text-white truncate">{p.name}</div>
                            <div className="text-xs text-zinc-500 mt-0.5">{sublabel(p)}</div>
                          </div>
                          <MarketOddsBtn match={match} sel={`${selPrefix}-${p.id}-${p.line ?? "na"}-${p.side ?? "over"}`} odd={p.odds} market={market} label={p.line != null ? `${p.name} — ${label} (${p.side === "under" ? "Menos de" : "Mais de"} ${p.line})` : `${p.name} — ${label}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              };

              const renderTeamSection = (team: TeamPlayerMarkets, isHome: boolean) => {
                const fallbackTeamName = isHome ? match.home : match.away;
                const teamBanner =
                  getTeamBanner(fallbackTeamName, match.country) ??
                  getTeamBanner(team.teamName, match.country) ??
                  getTeamBanner(fallbackTeamName) ??
                  getTeamBanner(team.teamName) ??
                  undefined;

                return (
                <div key={team.teamId} className="mb-6">
                  {teamBanner && (
                    <div className="mb-3 overflow-hidden rounded-xl border border-zinc-800">
                      <img
                        src={teamBanner}
                        alt={fallbackTeamName}
                        className="h-28 w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-1 mb-3 pb-2 border-b border-zinc-700">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${isHome ? "bg-red-900/60 text-red-300" : "bg-zinc-700 text-zinc-300"}`}>
                      {isHome ? "CASA" : "FORA"}
                    </span>
                    <span className="text-sm font-bold text-white">{team.teamName}</span>
                  </div>

                  {pmList(team.firstScorers,       "pm-first","primeiro-marcador","🥇 Primeiro Marcador",            p => `${p.stat} gol(os) em ${p.appearances} jogos`)}
                  {pmList(team.lastScorers,        "pm-last", "ultimo-marcador",  "🏁 Último Marcador",             p => `${p.stat} gol(os) em ${p.appearances} jogos`)}
                  {pmList(team.twoPlusGoals,       "pm-2g",   "2plus-golos-jogador","⚽⚽ Marcar 2+ Golos",         p => `${p.stat} gol(os) em ${p.appearances} jogos`)}
                  {pmList(team.hatTricks,          "pm-hat",  "hat-trick-jogador", "🎩 Hat-trick",                  p => `${p.stat} gol(os) em ${p.appearances} jogos`)}
                  {pmList(team.notToScore,         "pm-noscore","nao-marcar-jogador","🚫 Não Marcar",              p => `${p.stat} jogo(s) sem marcar em ${p.appearances}`)}
                  {pmList(team.anytimeScorers,    "pm-gol", "marcadores",      "⚽ Marcador (Qualquer Momento)",  p => `${p.stat} gol(os) em ${p.appearances} jogos`)}
                  {pmList(team.firstHalfScorers,  "pm-fh",  "marcador-1t",     "⚽ Marcador no 1.º Tempo",        p => `${p.stat} gol(os) em ${p.appearances} jogos`)}
                  {pmList(team.secondHalfScorers, "pm-sh",  "marcador-2t",     "⚽ Marcador no 2.º Tempo",        p => `${p.stat} gol(os) em ${p.appearances} jogos`)}
                  {pmList(team.assists,           "pm-ast", "assist-jogador",  "🎯 Dar Assistência",              p => `${p.stat} assistência(s) em ${p.appearances} jogos`)}
                  {pmList(team.assistLines,       "pm-ast", "assistencias-jogador-ou", "🎯 Assistências O/U",      p => `${(p.stat / Math.max(1, p.appearances)).toFixed(1)} por jogo · linha ${p.line}`)}
                  {pmList(team.shots,             "pm-shotot","remates-jogador","🎯 Remates",                      p => `${(p.stat / Math.max(1, p.appearances)).toFixed(1)} por jogo · linha ${p.line}`)}
                  {pmList(team.shotsOnTarget,     "pm-shoton","remates-baliza-jogador","🥅 Remates à Baliza",     p => `${(p.stat / Math.max(1, p.appearances)).toFixed(1)} por jogo · linha ${p.line}`)}
                  {pmList(team.passes,            "pm-pass","passes-jogador",  "🧠 Passes",                        p => `${(p.stat / Math.max(1, p.appearances)).toFixed(1)} por jogo · linha ${p.line}`)}
                  {pmList(team.tackles,           "pm-tkl", "desarmes-jogador","🛡️ Desarmes",                      p => `${(p.stat / Math.max(1, p.appearances)).toFixed(1)} por jogo · linha ${p.line}`)}
                  {pmList(team.scoreAndAssist,    "pm-sa",  "marcar-assistir", "🎯 Marcar e Dar Assistência",     p => `${p.stat} vez(es) em ${p.appearances} jogos`)}
                  {pmList(team.bookings,          "pm-card","cartao-jogador",  "🟨🟥 Cartão (Amarelo ou Vermelho)", p => `${p.stat} cartão(ões) em ${p.appearances} jogos`)}
                  {pmList(team.bookingLines,      "pm-card","cartoes-jogador-ou","🟨 Cartões O/U",                p => `${(p.stat / Math.max(1, p.appearances)).toFixed(1)} por jogo · linha ${p.line}`)}
                  {pmList(team.redCards,          "pm-red", "cartao-vermelho-jogador","🟥 Cartão Vermelho",        p => `${p.stat} expulsão(ões) em ${p.appearances} jogos`)}
                </div>
                );
              };

              return (
                <>
                  {playerMarkets.home && renderTeamSection(playerMarkets.home, true)}
                  {playerMarkets.away && renderTeamSection(playerMarkets.away, false)}
                  <div className="text-center text-zinc-700 text-xs pt-1 pb-2">Odds e linhas reais do provider quando disponíveis; props sem feed direto continuam com apoio estatístico da época</div>
                </>
              );
            })()}
          </div>
        )}

        {/* ── HÓQUEI: TOTAIS ── */}
        {isHockey && (modalTab === "totais" || modalTab === "todos") && m && (
          <div>
            <MarketGroup title={`Total de Golos — ${m._total ?? "—"}`}>
              <MarketOddsBtn match={match} sel="o25" odd={m.totalGoals.over25} market="totais" label={`Mais de ${m._total ?? "—"}`} suspKey="total" />
              <MarketOddsBtn match={match} sel="u25" odd={m.totalGoals.under25} market="totais" label={`Menos de ${m._total ?? "—"}`} suspKey="total" />
            </MarketGroup>
            {m.totalGoals.over15 > 0 && (
              <MarketGroup title={`Total de Golos — ${m._total ? m._total - 0.5 : "—"}`}>
                <MarketOddsBtn match={match} sel="o15" odd={m.totalGoals.over15} market="totais" label={`Mais de ${m._total ? m._total - 0.5 : "—"}`} suspKey="total" />
                <MarketOddsBtn match={match} sel="u15" odd={m.totalGoals.under15} market="totais" label={`Menos de ${m._total ? m._total - 0.5 : "—"}`} suspKey="total" />
              </MarketGroup>
            )}
            {m.totalGoals.over35 > 0 && (
              <MarketGroup title={`Total de Golos — ${m._total ? m._total + 0.5 : "—"}`}>
                <MarketOddsBtn match={match} sel="o35" odd={m.totalGoals.over35} market="totais" label={`Mais de ${m._total ? m._total + 0.5 : "—"}`} suspKey="total" />
                <MarketOddsBtn match={match} sel="u35" odd={m.totalGoals.under35} market="totais" label={`Menos de ${m._total ? m._total + 0.5 : "—"}`} suspKey="total" />
              </MarketGroup>
            )}
          </div>
        )}

        {/* ── HÓQUEI: PUCK LINE ── */}
        {isHockey && (modalTab === "puckline" || modalTab === "todos") && m?.handicap?.homeMinusOne > 0 && (
          <div>
            <MarketGroup title="Puck Line (±1.5)">
              <MarketOddsBtn match={match} sel="pl-home" odd={m.handicap.homeMinusOne} market="puckline" label={`${match.home} −1.5`} suspKey="puckLine" />
              <MarketOddsBtn match={match} sel="pl-away" odd={m.handicap.awayPlusOne} market="puckline" label={`${match.away} +1.5`} suspKey="puckLine" />
            </MarketGroup>
          </div>
        )}

        {/* ── HÓQUEI: 1º PERÍODO — visible throughout match ── */}
        {isHockey && (modalTab === "1periodo" || modalTab === "todos") && m?.halfTime?.home > 0 && (
          <div>
            <MarketGroup title="Resultado — 1º Período">
              <MarketOddsBtn match={match} sel="p1-home" odd={m.halfTime.home} market="1periodo" label={match.home} suspKey="halfTime" />
              {m.halfTime.draw > 0 && <MarketOddsBtn match={match} sel="p1-draw" odd={m.halfTime.draw} market="1periodo" label="Empate" suspKey="halfTime" />}
              <MarketOddsBtn match={match} sel="p1-away" odd={m.halfTime.away} market="1periodo" label={match.away} suspKey="halfTime" />
            </MarketGroup>
          </div>
        )}

        {/* ── HÓQUEI: 2º PERÍODO ── */}
        {isHockey && (modalTab === "2periodo" || modalTab === "todos") && m && m.period2 && m.period2.home > 0 && (
          <div>
            <MarketGroup title="Resultado — 2º Período">
              <MarketOddsBtn match={match} sel="p2-home" odd={m.period2.home} market="2periodo" label={match.home} suspKey="hockeyExtra" />
              {m.period2.draw > 0 && <MarketOddsBtn match={match} sel="p2-draw" odd={m.period2.draw} market="2periodo" label="Empate" suspKey="hockeyExtra" />}
              <MarketOddsBtn match={match} sel="p2-away" odd={m.period2.away} market="2periodo" label={match.away} suspKey="hockeyExtra" />
            </MarketGroup>
          </div>
        )}

        {/* ── HÓQUEI: 3º PERÍODO ── */}
        {isHockey && (modalTab === "3periodo" || modalTab === "todos") && m && m.period3 && m.period3.home > 0 && (
          <div>
            <MarketGroup title="Resultado — 3º Período">
              <MarketOddsBtn match={match} sel="p3-home" odd={m.period3.home} market="3periodo" label={match.home} suspKey="hockeyExtra" />
              {m.period3.draw > 0 && <MarketOddsBtn match={match} sel="p3-draw" odd={m.period3.draw} market="3periodo" label="Empate" suspKey="hockeyExtra" />}
              <MarketOddsBtn match={match} sel="p3-away" odd={m.period3.away} market="3periodo" label={match.away} suspKey="hockeyExtra" />
            </MarketGroup>
          </div>
        )}

        {/* ── VOLEIBOL: SETS ── */}
        {isVolleyball && (modalTab === "sets" || modalTab === "todos") && m && (
          <div>
            {m.totalGoals?.over15 > 0 && (
              <MarketGroup title="Total de Sets — O/U 2.5">
                <MarketOddsBtn match={match} sel="osets25" odd={m.totalGoals.over15} market="sets" label="Mais de 2.5 sets" />
                <MarketOddsBtn match={match} sel="usets25" odd={m.totalGoals.under15} market="sets" label="Menos de 2.5 sets" />
              </MarketGroup>
            )}
            {m.totalGoals?.over25 > 0 && (
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
            ) : m.totalGoals?.over35 > 0 && (
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
        {isVolleyball && (modalTab === "perset" || modalTab === "todos") && (m as any).volleyballExtra && (
          <div>
            {(() => {
              const volleyballExtra = (m as any).volleyballExtra as any;
              return (
                <>
            {/* Set 1: visible throughout match (settled by server once set ends) */}
            {volleyballExtra?.set1?.home > 0 && (
              <MarketGroup title="Vencedor do 1º Set">
                <MarketOddsBtn match={match} sel="vs1h" odd={volleyballExtra.set1.home} market="perset" label={match.home} />
                <MarketOddsBtn match={match} sel="vs1a" odd={volleyballExtra.set1.away} market="perset" label={match.away} />
              </MarketGroup>
            )}
            {/* Set 2: visible throughout match */}
            {volleyballExtra?.set2?.home > 0 && (
              <MarketGroup title="Vencedor do 2º Set">
                <MarketOddsBtn match={match} sel="vs2h" odd={volleyballExtra.set2.home} market="perset" label={match.home} />
                <MarketOddsBtn match={match} sel="vs2a" odd={volleyballExtra.set2.away} market="perset" label={match.away} />
              </MarketGroup>
            )}
            {/* Set 3: always show (upcoming or current) */}
            {volleyballExtra?.set3?.home > 0 && (
              <MarketGroup title="Vencedor do 3º Set (se disputado)">
                <MarketOddsBtn match={match} sel="vs3h" odd={volleyballExtra.set3.home} market="perset" label={match.home} />
                <MarketOddsBtn match={match} sel="vs3a" odd={volleyballExtra.set3.away} market="perset" label={match.away} />
              </MarketGroup>
            )}
                </>
              );
            })()}
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
            ) : m.bothTeamsScore?.yes > 0 && (
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
        {isBasketball && (modalTab === "quartos" || modalTab === "todos") && m && (
          <div>
            {/* 1ª Metade = Q1+Q2; hide when already in Q3 or Q4 */}
            {m.halfTime?.home > 0 && (currentQ === 0 || currentQ <= 2) && (
              <MarketGroup title="Vencedor — 1ª Metade">
                <MarketOddsBtn match={match} sel="h1-home" odd={m.halfTime.home} market="quartos" label={match.home} suspKey="halfTime" />
                <MarketOddsBtn match={match} sel="h1-away" odd={m.halfTime.away} market="quartos" label={match.away} suspKey="halfTime" />
              </MarketGroup>
            )}
            {(m as any).basketballExtra && (["q1","q2","q3","q4"] as const).map((q, qi) => {
              const ex = (m as any).basketballExtra as any;
              const labels = ["1º Quarto","2º Quarto","3º Quarto","4º Quarto"];
              // All quarter markets remain visible throughout the match (settled by server once quarter ends)
              return ex?.[q]?.home > 0 ? (
                <div key={q}>
                  <MarketGroup title={`Vencedor — ${labels[qi]}`}>
                    <MarketOddsBtn match={match} sel={`${q}-home`} odd={ex[q].home} market="quartos" label={match.home} suspKey="basketballExtra" />
                    <MarketOddsBtn match={match} sel={`${q}-away`} odd={ex[q].away} market="quartos" label={match.away} suspKey="basketballExtra" />
                  </MarketGroup>
                  {ex?.[`${q}Total`]?.over > 0 && (
                    <MarketGroup title={`Total — ${labels[qi]} O/U ${ex[`${q}Total`].line}`}>
                      <MarketOddsBtn match={match} sel={`b-${q}t-o-${ex[`${q}Total`].line}`} odd={ex[`${q}Total`].over} market="quartos" label={`Mais de ${ex[`${q}Total`].line}`} suspKey="basketballExtra" />
                      <MarketOddsBtn match={match} sel={`b-${q}t-u-${ex[`${q}Total`].line}`} odd={ex[`${q}Total`].under} market="quartos" label={`Menos de ${ex[`${q}Total`].line}`} suspKey="basketballExtra" />
                    </MarketGroup>
                  )}
                  {ex?.[`${q}Spread`]?.home > 0 && (
                    <MarketGroup title={`Spread — ${labels[qi]} ${ex[`${q}Spread`].line > 0 ? `−${ex[`${q}Spread`].line}` : `+${Math.abs(ex[`${q}Spread`].line)}`}`}>
                      <MarketOddsBtn match={match} sel={`b-${q}s-home-${ex[`${q}Spread`].line}`} odd={ex[`${q}Spread`].home} market="quartos" label={`${match.home} cobre`} suspKey="basketballExtra" />
                      <MarketOddsBtn match={match} sel={`b-${q}s-away-${ex[`${q}Spread`].line}`} odd={ex[`${q}Spread`].away} market="quartos" label={`${match.away} cobre`} suspKey="basketballExtra" />
                    </MarketGroup>
                  )}
                </div>
              ) : null;
            })}
            {(m as any).basketballExtra?.anyQuarter?.home > 0 && (
              <MarketGroup title="Vence Qualquer Quarto">
                <MarketOddsBtn match={match} sel="b-anyq-home" odd={(m as any).basketballExtra.anyQuarter.home} market="quartos" label={match.home} suspKey="basketballExtra" />
                <MarketOddsBtn match={match} sel="b-anyq-away" odd={(m as any).basketballExtra.anyQuarter.away} market="quartos" label={match.away} suspKey="basketballExtra" />
              </MarketGroup>
            )}
            {(m as any).basketballExtra?.allQuarters?.home > 0 && (
              <MarketGroup title="Vence Todos os Quartos">
                <MarketOddsBtn match={match} sel="b-allq-home" odd={(m as any).basketballExtra.allQuarters.home} market="quartos" label={match.home} suspKey="basketballExtra" />
                <MarketOddsBtn match={match} sel="b-allq-away" odd={(m as any).basketballExtra.allQuarters.away} market="quartos" label={match.away} suspKey="basketballExtra" />
              </MarketGroup>
            )}
          </div>
        )}

        {/* ── BASQUETE: TOTAIS POR TIME ── */}
        {isBasketball && (modalTab === "times" || modalTab === "todos") && m && (m as any).basketballExtra && (
          <div>
            {((m as any).basketballExtra as any).teamTotalHome.over > 0 && (
              <MarketGroup title={`Total ${match.home} — O/U ${((m as any).basketballExtra as any).teamTotalHome.line}`}>
                <MarketOddsBtn match={match} sel={`b-tt-home-o-${((m as any).basketballExtra as any).teamTotalHome.line}`} odd={((m as any).basketballExtra as any).teamTotalHome.over} market="times" label={`Mais de ${((m as any).basketballExtra as any).teamTotalHome.line}`} suspKey="basketballExtra" />
                <MarketOddsBtn match={match} sel={`b-tt-home-u-${((m as any).basketballExtra as any).teamTotalHome.line}`} odd={((m as any).basketballExtra as any).teamTotalHome.under} market="times" label={`Menos de ${((m as any).basketballExtra as any).teamTotalHome.line}`} suspKey="basketballExtra" />
              </MarketGroup>
            )}
            {((m as any).basketballExtra as any).teamTotalAway.over > 0 && (
              <MarketGroup title={`Total ${match.away} — O/U ${((m as any).basketballExtra as any).teamTotalAway.line}`}>
                <MarketOddsBtn match={match} sel={`b-tt-away-o-${((m as any).basketballExtra as any).teamTotalAway.line}`} odd={((m as any).basketballExtra as any).teamTotalAway.over} market="times" label={`Mais de ${((m as any).basketballExtra as any).teamTotalAway.line}`} suspKey="basketballExtra" />
                <MarketOddsBtn match={match} sel={`b-tt-away-u-${((m as any).basketballExtra as any).teamTotalAway.line}`} odd={((m as any).basketballExtra as any).teamTotalAway.under} market="times" label={`Menos de ${((m as any).basketballExtra as any).teamTotalAway.line}`} suspKey="basketballExtra" />
              </MarketGroup>
            )}
          </div>
        )}

        {/* ── BASQUETE: TOTAL DE PONTOS — MÚLTIPLAS LINHAS ── */}
        {isBasketball && (modalTab === "totais" || modalTab === "todos") && m && (m as any).basketballExtra && ((m as any).basketballExtra as any).totalsRange?.length > 0 && (
          <div>
            {((m as any).basketballExtra as any).totalsRange
              .filter((tr: { line: number; over: number; under: number }) => tr.line !== (m._total ?? -1))
              .map((tr: { line: number; over: number; under: number }) => (
                <MarketGroup key={`tr-${tr.line}`} title={`Total de Pontos — O/U ${tr.line}`}>
                  <MarketOddsBtn match={match} sel={`b-pts-o-${tr.line}`} odd={tr.over} market="totais" label={`Mais de ${tr.line}`} suspKey="totalGoals" />
                  <MarketOddsBtn match={match} sel={`b-pts-u-${tr.line}`} odd={tr.under} market="totais" label={`Menos de ${tr.line}`} suspKey="totalGoals" />
                </MarketGroup>
              ))}
          </div>
        )}

        {/* ── TÉNIS: TOTAL DE JOGOS ── */}
        {isTennis && (modalTab === "jogos" || modalTab === "todos") && m && (m as any).tennisExtra && (
          <div>
            {/* Multiple total games lines */}
            {((m as any).tennisExtra as any).totalGamesLines?.length > 0 ? (
              ((m as any).tennisExtra as any).totalGamesLines.map((gl: { line: number; over: number; under: number }) => (
                <MarketGroup key={`tgl-${gl.line}`} title={`Total de Games — O/U ${gl.line}`}>
                  <MarketOddsBtn match={match} sel={`tg-o-${gl.line}`} odd={gl.over} market="jogos" label={`Mais de ${gl.line}`} suspKey="totalGames" />
                  <MarketOddsBtn match={match} sel={`tg-u-${gl.line}`} odd={gl.under} market="jogos" label={`Menos de ${gl.line}`} suspKey="totalGames" />
                </MarketGroup>
              ))
            ) : ((m as any).tennisExtra as any).totalGames?.over > 0 && (
              <MarketGroup title={`Total de Games — O/U ${((m as any).tennisExtra as any).totalGames.line}`}>
                <MarketOddsBtn match={match} sel={`tg-o-${((m as any).tennisExtra as any).totalGames.line}`} odd={((m as any).tennisExtra as any).totalGames.over} market="jogos" label={`Mais de ${((m as any).tennisExtra as any).totalGames.line}`} suspKey="totalGames" />
                <MarketOddsBtn match={match} sel={`tg-u-${((m as any).tennisExtra as any).totalGames.line}`} odd={((m as any).tennisExtra as any).totalGames.under} market="jogos" label={`Menos de ${((m as any).tennisExtra as any).totalGames.line}`} suspKey="totalGames" />
              </MarketGroup>
            )}
            {/* 1st Set total games O/U */}
            {((m as any).tennisExtra as any).set1Games?.over > 0 && (
              <MarketGroup title={`Games do 1º Set — O/U ${((m as any).tennisExtra as any).set1Games.line}`}>
                <MarketOddsBtn match={match} sel={`s1g-o-${((m as any).tennisExtra as any).set1Games.line}`} odd={((m as any).tennisExtra as any).set1Games.over} market="jogos" label={`Mais de ${((m as any).tennisExtra as any).set1Games.line} games`} suspKey="set1Games" />
                <MarketOddsBtn match={match} sel={`s1g-u-${((m as any).tennisExtra as any).set1Games.line}`} odd={((m as any).tennisExtra as any).set1Games.under} market="jogos" label={`Menos de ${((m as any).tennisExtra as any).set1Games.line} games`} suspKey="set1Games" />
              </MarketGroup>
            )}
            {/* Game handicap */}
            {((m as any).tennisExtra as any).gameHandicap?.home > 0 && (
              <MarketGroup title={`Handicap de Games — ${((m as any).tennisExtra as any).gameHandicap.line > 0 ? `Casa −${((m as any).tennisExtra as any).gameHandicap.line}` : `Casa +${Math.abs(((m as any).tennisExtra as any).gameHandicap.line)}`}`}>
                <MarketOddsBtn match={match} sel={`gh-home-${((m as any).tennisExtra as any).gameHandicap.line}`} odd={((m as any).tennisExtra as any).gameHandicap.home} market="jogos" label={match.home} suspKey="gameHandicap" />
                <MarketOddsBtn match={match} sel={`gh-away-${((m as any).tennisExtra as any).gameHandicap.line}`} odd={((m as any).tennisExtra as any).gameHandicap.away} market="jogos" label={match.away} suspKey="gameHandicap" />
              </MarketGroup>
            )}
            {/* 2nd set games O/U */}
            {((m as any).tennisExtra as any).set2Games?.over > 0 && (
              <MarketGroup title={`Games do 2º Set — O/U ${((m as any).tennisExtra as any).set2Games.line}`}>
                <MarketOddsBtn match={match} sel={`s2g-o-${((m as any).tennisExtra as any).set2Games.line}`} odd={((m as any).tennisExtra as any).set2Games.over} market="jogos" label={`Mais de ${((m as any).tennisExtra as any).set2Games.line} games`} suspKey="set2Games" />
                <MarketOddsBtn match={match} sel={`s2g-u-${((m as any).tennisExtra as any).set2Games.line}`} odd={((m as any).tennisExtra as any).set2Games.under} market="jogos" label={`Menos de ${((m as any).tennisExtra as any).set2Games.line} games`} suspKey="set2Games" />
              </MarketGroup>
            )}
            {/* Home player total games */}
            {((m as any).tennisExtra as any).homePlayerGames?.over > 0 && (
              <MarketGroup title={`Total Games de ${match.home} — O/U ${((m as any).tennisExtra as any).homePlayerGames.line}`}>
                <MarketOddsBtn match={match} sel="hpg-o" odd={((m as any).tennisExtra as any).homePlayerGames.over} market="jogos" label={`Mais de ${((m as any).tennisExtra as any).homePlayerGames.line}`} />
                <MarketOddsBtn match={match} sel="hpg-u" odd={((m as any).tennisExtra as any).homePlayerGames.under} market="jogos" label={`Menos de ${((m as any).tennisExtra as any).homePlayerGames.line}`} />
              </MarketGroup>
            )}
            {/* Away player total games */}
            {((m as any).tennisExtra as any).awayPlayerGames?.over > 0 && (
              <MarketGroup title={`Total Games de ${match.away} — O/U ${((m as any).tennisExtra as any).awayPlayerGames.line}`}>
                <MarketOddsBtn match={match} sel="apg-o" odd={((m as any).tennisExtra as any).awayPlayerGames.over} market="jogos" label={`Mais de ${((m as any).tennisExtra as any).awayPlayerGames.line}`} />
                <MarketOddsBtn match={match} sel="apg-u" odd={((m as any).tennisExtra as any).awayPlayerGames.under} market="jogos" label={`Menos de ${((m as any).tennisExtra as any).awayPlayerGames.line}`} />
              </MarketGroup>
            )}
          </div>
        )}

        {/* ── TÉNIS: PLACAR EXATO (SETS) ── */}
        {isTennis && false && (modalTab === "placar" || modalTab === "todos") && m && (m as any).tennisExtra && (
          <div>
            {/* Exact sets (Set Betting) */}
            {(((m as any).tennisExtra as any).exactSets?.h20 > 0 || ((m as any).tennisExtra as any).exactSets?.a02 > 0) && (
              <MarketGroup title="Resultado Exacto em Sets">
                {((m as any).tennisExtra as any).exactSets.h20 > 0 && <MarketOddsBtn match={match} sel="es-h20" odd={((m as any).tennisExtra as any).exactSets.h20} market="placar" label={`${match.home} 2-0`} suspKey="exactSets" />}
                {((m as any).tennisExtra as any).exactSets.h21 > 0 && <MarketOddsBtn match={match} sel="es-h21" odd={((m as any).tennisExtra as any).exactSets.h21} market="placar" label={`${match.home} 2-1`} suspKey="exactSets" />}
                {((m as any).tennisExtra as any).exactSets.a02 > 0 && <MarketOddsBtn match={match} sel="es-a02" odd={((m as any).tennisExtra as any).exactSets.a02} market="placar" label={`${match.away} 2-0`} suspKey="exactSets" />}
                {((m as any).tennisExtra as any).exactSets.a12 > 0 && <MarketOddsBtn match={match} sel="es-a12" odd={((m as any).tennisExtra as any).exactSets.a12} market="placar" label={`${match.away} 2-1`} suspKey="exactSets" />}
              </MarketGroup>
            )}
            {/* Correct Score 1st Set (top 8 most likely game scores) */}
            {((m as any).tennisExtra as any).score1st?.length > 0 && (
              <MarketGroup title="Resultado Correto — 1º Set">
                <div className="grid grid-cols-2 gap-1 w-full col-span-full">
                  {((m as any).tennisExtra as any).score1st.map((sc: { label: string; odds: number }) => (
                    <MarketOddsBtn key={`sc1-${sc.label}`} match={match} sel={`sc1-${sc.label}`} odd={sc.odds} market="placar" label={sc.label} suspKey="firstSet" />
                  ))}
                </div>
              </MarketGroup>
            )}
            {/* Correct Score 2nd Set */}
            {((m as any).tennisExtra as any).score2nd?.length > 0 && (
              <MarketGroup title="Resultado Correto — 2º Set">
                <div className="grid grid-cols-2 gap-1 w-full col-span-full">
                  {((m as any).tennisExtra as any).score2nd.map((sc: { label: string; odds: number }) => (
                    <MarketOddsBtn key={`sc2-${sc.label}`} match={match} sel={`sc2-${sc.label}`} odd={sc.odds} market="placar" label={sc.label} suspKey="set2" />
                  ))}
                </div>
              </MarketGroup>
            )}
          </div>
        )}

        {/* ── TÉNIS: ESPECIAIS ── */}
        {isTennis && (modalTab === "especiais" || modalTab === "todos") && m && (m as any).tennisExtra && (
          <div>
            {/* Odd/Even — total games */}
            {((m as any).tennisExtra as any).oddEvenGames?.odd > 0 && (
              <MarketGroup title="Total de Games — Par ou Ímpar">
                <MarketOddsBtn match={match} sel="oe-odd" odd={((m as any).tennisExtra as any).oddEvenGames.odd} market="especiais" label="Ímpar" suspKey="oddEven" />
                <MarketOddsBtn match={match} sel="oe-even" odd={((m as any).tennisExtra as any).oddEvenGames.even} market="especiais" label="Par" suspKey="oddEven" />
              </MarketGroup>
            )}
            {/* Odd/Even — 1st set games */}
            {((m as any).tennisExtra as any).oddEven1st?.odd > 0 && (
              <MarketGroup title="Games do 1º Set — Par ou Ímpar">
                <MarketOddsBtn match={match} sel="oe1-odd" odd={((m as any).tennisExtra as any).oddEven1st.odd} market="especiais" label="Ímpar" suspKey="firstSet" />
                <MarketOddsBtn match={match} sel="oe1-even" odd={((m as any).tennisExtra as any).oddEven1st.even} market="especiais" label="Par" suspKey="firstSet" />
              </MarketGroup>
            )}
            {/* Odd/Even — 2nd set games */}
            {((m as any).tennisExtra as any).oddEven2nd?.odd > 0 && (
              <MarketGroup title="Games do 2º Set — Par ou Ímpar">
                <MarketOddsBtn match={match} sel="oe2-odd" odd={((m as any).tennisExtra as any).oddEven2nd.odd} market="especiais" label="Ímpar" suspKey="set2" />
                <MarketOddsBtn match={match} sel="oe2-even" odd={((m as any).tennisExtra as any).oddEven2nd.even} market="especiais" label="Par" suspKey="set2" />
              </MarketGroup>
            )}
            {/* Win at least one set — Player 1 */}
            {((m as any).tennisExtra as any).winAtLeast1P1?.yes > 0 && (
              <MarketGroup title={`${match.home} ganha pelo menos 1 Set`}>
                <MarketOddsBtn match={match} sel="wal1-yes" odd={((m as any).tennisExtra as any).winAtLeast1P1.yes} market="especiais" label="Sim" suspKey="winAtLeast" />
                <MarketOddsBtn match={match} sel="wal1-no" odd={((m as any).tennisExtra as any).winAtLeast1P1.no} market="especiais" label="Não" suspKey="winAtLeast" />
              </MarketGroup>
            )}
            {/* Win at least one set — Player 2 */}
            {((m as any).tennisExtra as any).winAtLeast1P2?.yes > 0 && (
              <MarketGroup title={`${match.away} ganha pelo menos 1 Set`}>
                <MarketOddsBtn match={match} sel="wal2-yes" odd={((m as any).tennisExtra as any).winAtLeast1P2.yes} market="especiais" label="Sim" suspKey="winAtLeast" />
                <MarketOddsBtn match={match} sel="wal2-no" odd={((m as any).tennisExtra as any).winAtLeast1P2.no} market="especiais" label="Não" suspKey="winAtLeast" />
              </MarketGroup>
            )}
            {/* Set/Match combo (also shown here for quick access) */}
            {((m as any).tennisExtra?.setMatch?.h11 > 0) && (
              <MarketGroup title="Set + Resultado Final">
                {((m as any).tennisExtra.setMatch.h11 > 0) && <MarketOddsBtn match={match} sel="sm2-11" odd={(m as any).tennisExtra.setMatch.h11} market="especiais" label={`${match.home} 1º Set + Jogo`} suspKey="setMatch" />}
                {((m as any).tennisExtra.setMatch.h12 > 0) && <MarketOddsBtn match={match} sel="sm2-12" odd={(m as any).tennisExtra.setMatch.h12} market="especiais" label={`${match.home} 1º Set / ${match.away} Jogo`} suspKey="setMatch" />}
                {((m as any).tennisExtra.setMatch.a21 > 0) && <MarketOddsBtn match={match} sel="sm2-21" odd={(m as any).tennisExtra.setMatch.a21} market="especiais" label={`${match.away} 1º Set / ${match.home} Jogo`} suspKey="setMatch" />}
                {((m as any).tennisExtra.setMatch.a22 > 0) && <MarketOddsBtn match={match} sel="sm2-22" odd={(m as any).tennisExtra.setMatch.a22} market="especiais" label={`${match.away} 1º Set + Jogo`} suspKey="setMatch" />}
              </MarketGroup>
            )}
          </div>
        )}

        {/* ── HÓQUEI: 2º PERÍODO ── */}
        {isHockey && (modalTab === "2periodo" || modalTab === "todos") && m && (m as any).hockeyExtra && (
          <div>
            <MarketGroup title="Resultado — 2º Período">
              <MarketOddsBtn match={match} sel="p2-home" odd={((m as any).hockeyExtra as any).period2.home} market="2periodo" label={match.home} suspKey="hockeyExtra" />
              <MarketOddsBtn match={match} sel="p2-draw" odd={((m as any).hockeyExtra as any).period2.draw} market="2periodo" label="Empate" suspKey="hockeyExtra" />
              <MarketOddsBtn match={match} sel="p2-away" odd={((m as any).hockeyExtra as any).period2.away} market="2periodo" label={match.away} suspKey="hockeyExtra" />
            </MarketGroup>
          </div>
        )}

        {/* ── HÓQUEI: 3º PERÍODO ── */}
        {isHockey && (modalTab === "3periodo" || modalTab === "todos") && m && (m as any).hockeyExtra && (
          <div>
            <MarketGroup title="Resultado — 3º Período">
              <MarketOddsBtn match={match} sel="p3-home" odd={((m as any).hockeyExtra as any).period3.home} market="3periodo" label={match.home} suspKey="hockeyExtra" />
              <MarketOddsBtn match={match} sel="p3-draw" odd={((m as any).hockeyExtra as any).period3.draw} market="3periodo" label="Empate" suspKey="hockeyExtra" />
              <MarketOddsBtn match={match} sel="p3-away" odd={((m as any).hockeyExtra as any).period3.away} market="3periodo" label={match.away} suspKey="hockeyExtra" />
            </MarketGroup>
          </div>
        )}

        {/* ── HÓQUEI: ESPECIAIS ── */}
        {isHockey && (modalTab === "especiais" || modalTab === "todos") && m && (
          <div>
            {m.doubleChance.homeOrDraw > 0 && (
              <MarketGroup title="Dupla Hipótese">
                <MarketOddsBtn match={match} sel="dc-hd" odd={m.doubleChance.homeOrDraw} market="especiais" label={`${match.home} ou Emp.`} suspKey="matchResult" />
                <MarketOddsBtn match={match} sel="dc-ha" odd={m.doubleChance.homeOrAway} market="especiais" label="1 ou 2" suspKey="matchResult" />
                <MarketOddsBtn match={match} sel="dc-da" odd={m.doubleChance.awayOrDraw} market="especiais" label={`${match.away} ou Emp.`} suspKey="matchResult" />
              </MarketGroup>
            )}
            {m.bothTeamsScore.yes > 0 && (
              <MarketGroup title="Ambas as Equipas Marcam">
                <MarketOddsBtn match={match} sel="bts-yes" odd={m.bothTeamsScore.yes} market="especiais" label="Sim" suspKey="bts" />
                <MarketOddsBtn match={match} sel="bts-no" odd={m.bothTeamsScore.no} market="especiais" label="Não" suspKey="bts" />
              </MarketGroup>
            )}
            {(m as any).hockeyExtra && (
              <>
                {((m as any).hockeyExtra as any).period1Total.over > 0 && (
                  <MarketGroup title={`Total 1º Período — O/U ${((m as any).hockeyExtra as any).period1Total.line}`}>
                    <MarketOddsBtn match={match} sel={`p1t-o-${((m as any).hockeyExtra as any).period1Total.line}`} odd={((m as any).hockeyExtra as any).period1Total.over} market="especiais" label={`Mais de ${((m as any).hockeyExtra as any).period1Total.line}`} suspKey="hockeyExtra" />
                    <MarketOddsBtn match={match} sel={`p1t-u-${((m as any).hockeyExtra as any).period1Total.line}`} odd={((m as any).hockeyExtra as any).period1Total.under} market="especiais" label={`Menos de ${((m as any).hockeyExtra as any).period1Total.line}`} suspKey="hockeyExtra" />
                  </MarketGroup>
                )}
                {((m as any).hockeyExtra as any).period2Total?.over > 0 && (
                  <MarketGroup title={`Total 2º Período — O/U ${((m as any).hockeyExtra as any).period2Total.line}`}>
                    <MarketOddsBtn match={match} sel={`p2t-o-${((m as any).hockeyExtra as any).period2Total.line}`} odd={((m as any).hockeyExtra as any).period2Total.over} market="especiais" label={`Mais de ${((m as any).hockeyExtra as any).period2Total.line}`} suspKey="hockeyExtra" />
                    <MarketOddsBtn match={match} sel={`p2t-u-${((m as any).hockeyExtra as any).period2Total.line}`} odd={((m as any).hockeyExtra as any).period2Total.under} market="especiais" label={`Menos de ${((m as any).hockeyExtra as any).period2Total.line}`} suspKey="hockeyExtra" />
                  </MarketGroup>
                )}
                {((m as any).hockeyExtra as any).period3Total?.over > 0 && (
                  <MarketGroup title={`Total 3º Período — O/U ${((m as any).hockeyExtra as any).period3Total.line}`}>
                    <MarketOddsBtn match={match} sel={`p3t-o-${((m as any).hockeyExtra as any).period3Total.line}`} odd={((m as any).hockeyExtra as any).period3Total.over} market="especiais" label={`Mais de ${((m as any).hockeyExtra as any).period3Total.line}`} suspKey="hockeyExtra" />
                    <MarketOddsBtn match={match} sel={`p3t-u-${((m as any).hockeyExtra as any).period3Total.line}`} odd={((m as any).hockeyExtra as any).period3Total.under} market="especiais" label={`Menos de ${((m as any).hockeyExtra as any).period3Total.line}`} suspKey="hockeyExtra" />
                  </MarketGroup>
                )}
                {((m as any).hockeyExtra as any).shotsOnGoal.over > 0 && (
                  <MarketGroup title={`Remates à Baliza — O/U ${((m as any).hockeyExtra as any).shotsOnGoal.line.toFixed(1)}`}>
                    <MarketOddsBtn match={match} sel={`sog-o-${((m as any).hockeyExtra as any).shotsOnGoal.line.toFixed(1)}`} odd={((m as any).hockeyExtra as any).shotsOnGoal.over} market="especiais" label={`Mais de ${((m as any).hockeyExtra as any).shotsOnGoal.line.toFixed(1)}`} suspKey="hockeyExtra" />
                    <MarketOddsBtn match={match} sel={`sog-u-${((m as any).hockeyExtra as any).shotsOnGoal.line.toFixed(1)}`} odd={((m as any).hockeyExtra as any).shotsOnGoal.under} market="especiais" label={`Menos de ${((m as any).hockeyExtra as any).shotsOnGoal.line.toFixed(1)}`} suspKey="hockeyExtra" />
                  </MarketGroup>
                )}
              </>
            )}
          </div>
        )}

        {!m && <div className="text-center text-zinc-500 py-6 text-sm">Mercados adicionais indisponíveis para esta partida.</div>}
      </div>
      </MarketGroupSeqCtx.Provider>
      </MarketGroupOpenCtx.Provider>
      </MarketTabCtx.Provider>
    );
  };

  // Normalize team name for fuzzy matching against live data
  const normTeam = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Find the live/upcoming match corresponding to a stored selection.
  // Priority 1: exact matchId (most reliable — works even after live status change).
  // Priority 2: fuzzy team-name match (fallback for older bets without stored matchId).
  const findLiveMatchForSel = (sel: StoredSelection): Match | null => {
    if (sel.matchId) {
      const byId = liveMatches.find(m => String(m.id) === String(sel.matchId))
               ?? wcLiveForTicketRef.current.find(m => String(m.id) === String(sel.matchId));
      if (byId) return byId;
    }
    const [h = "", a = ""] = (sel.matchTitle ?? "").split(" vs ");
    const nh = normTeam(h); const na = normTeam(a);
    if (!nh) return null;
    const teamMatch = (list: Match[]) => list.find(m => {
      const mh = normTeam(m.home); const ma = normTeam(m.away);
      const homeMatch = mh === nh || (nh.length >= 4 && (mh.includes(nh.slice(0, 6)) || nh.includes(mh.slice(0, 6))));
      const awayMatch = ma === na || (na.length >= 4 && (ma.includes(na.slice(0, 6)) || na.includes(ma.slice(0, 6))));
      return homeMatch && awayMatch;
    }) ?? null;
    return teamMatch(liveMatches) ?? teamMatch(wcLiveForTicketRef.current);
  };

  // Get live odd for a specific selection from a live match
  const getLiveOddForSel = (sel: StoredSelection, lm: Match): number => {
    const s = sel.selection;
    if (s === "away") return lm.odds.away;
    if (s === "draw") return lm.odds.draw > 0 ? lm.odds.draw : sel.odd;
    if (s === "home") return lm.odds.home;
    const baseOdd = sel.odd;
    const baseMain = (lm.odds.home + lm.odds.away) / 2;
    return Math.max(1.01, baseOdd * (baseMain / baseMain));
  };

  // Determine per-selection outcome for resolved bets or live tentative state
  type SelOutcome = "green" | "red" | "cashout" | "live-win" | "live-lose" | "pending" | "void";
  const getSelOutcome = (sel: StoredSelection, betStatus: string): SelOutcome => {
    if (betStatus === "cashed_out") return "cashout";
    if (sel.outcome === "won") return "green";
    if (sel.outcome === "lost") return "red";
    if (sel.outcome === "void") return "void";
    if (betStatus === "voided") return "void";
    if (sel.finalScore) {
      const out = scoreOutcomeForSel(sel, sel.finalScore);
      if (out === "won") return "green";
      if (out === "lost") return "red";
    }
    if (betStatus === "won") return "green";
    if (betStatus === "lost") return "red";
    // Pending bets must stay neutral in the UI until the selection is actually settled.
    return "pending";
  };

  const cashoutEstimate = (bet: UserBet) => {
    if (bet.cashoutEstimate && !Number.isNaN(parseFloat(bet.cashoutEstimate))) return parseFloat(bet.cashoutEstimate).toFixed(2);
    const s = parseFloat(bet.stake);
    const originalOdds = parseFloat(bet.totalOdds);
    const sels = getBetSelections(bet);
    // Use live odds when available for a more accurate estimate
    let currentOddsProduct = 1;
    let hasAnyLive = false;
    for (const sel of sels) {
      const lm = findLiveMatchForSel(sel);
      if (lm) {
        hasAnyLive = true;
        currentOddsProduct *= Math.max(1.01, getLiveOddForSel(sel, lm));
      } else {
        currentOddsProduct *= Math.max(1.01, sel.odd);
      }
    }
    // If no live data, fall back to modest markup
    if (!hasAnyLive) currentOddsProduct = originalOdds * 1.1;
    return Math.max(0, (s * originalOdds) / currentOddsProduct * 0.92).toFixed(2);
  };

  const MARKET_LABEL: Record<string, string> = {
    result: "Resultado Final",
    dupla: "Dupla Chance",
    gols: "Total de Gols",
    handicap: "Handicap",
    halfTime: "Intervalo",
    sets: "Por Set",
    pontos: "Total de Pontos",
    totais: "Total de Pontos",
    periodos: "Por Período",
    quartos: "Por Quarto",
    especiais: "Especiais",
    asianHandicap: "Handicap Asiático",
    correctScore: "Resultado Exacto",
    corners: "Cantos",
    cards: "Cartões",
    htft: "Intervalo/Final",
    firstGoal: "1.º Golo",
  };

  const getSelLabel = (sel: StoredSelection): string => {
    if (sel.label && sel.label !== sel.selection) return sel.label;
    const [home = "", away = ""] = (sel.matchTitle ?? "").split(" vs ");
    const map: Record<string, string> = {
      home, away, draw: "Empate",
      homeOrDraw: `${home} ou X`, awayOrDraw: `${away} ou X`, homeOrAway: "1 ou 2",
      "bts-yes": "Ambas Marcam — Sim", "bts-no": "Ambas Marcam — Não",
      o05: "Mais de 0.5", u05: "Menos de 0.5",
      o15: "Mais de 1.5", u15: "Menos de 1.5",
      o25: "Mais de 2.5", u25: "Menos de 2.5",
      o35: "Mais de 3.5", u35: "Menos de 3.5",
      o45: "Mais de 4.5", u45: "Menos de 4.5",
      o55: "Mais de 5.5", u55: "Menos de 5.5",
      o65: "Mais de 6.5", u65: "Menos de 6.5",
    };
    return map[sel.selection] ?? sel.selection;
  };

  const parseDMY = (raw: string): Date | null => {
    const m1 = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
    if (m1) return new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]), 0, 0, 0, 0);
    const m2 = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]), 0, 0, 0, 0);
    return null;
  };

  const formatMatchWhen = (m: Match): string | null => {
    const dateRaw = (m as any).scheduledDate ?? (m as any).date;
    const timeRaw = (m as any).scheduledTime ?? (m as any).time;
    const date = typeof dateRaw === "string" ? parseDMY(dateRaw) : null;
    if (!date && !timeRaw) return null;
    const t = typeof timeRaw === "string" ? timeRaw : null;
    if (date && t && /^\d{1,2}:\d{2}$/.test(t)) {
      const [hh, mm] = t.split(":").map(Number);
      date.setHours(hh, mm, 0, 0);
    }
    if (!date) return t;
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startThat = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startThat.getTime() - startToday.getTime()) / 86400000);
    const dayLabel = diffDays === 0
      ? "Hoje"
      : diffDays === 1
        ? "Amanhã"
        : date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
    return t ? `${dayLabel} • ${t}` : dayLabel;
  };

  const getBetSelections = (bet: UserBet): StoredSelection[] => {
    if (Array.isArray(bet.selections)) return bet.selections as StoredSelection[];
    return [{ matchTitle: bet.matchTitle, selection: "home", odd: parseFloat(bet.totalOdds), market: "result" }];
  };

  const toggleBetCollapse = (id: number) => {
    setCollapsedBets(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground flex flex-col font-sans transition-colors duration-500">

      {/* ── LOCK SCREEN — requires password or biometric to dismiss ── */}
      <AnimatePresence>
        {isLocked && (
          <motion.div
            key="lock-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none"
            style={{ background: "rgba(4,6,18,0.97)", backdropFilter: "blur(16px)" }}
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ delay: 0.08, type: "spring", stiffness: 280, damping: 24 }}
              className="w-full max-w-sm px-6 flex flex-col items-center"
            >
              <button
                onClick={() => void handleBiometricUnlock()}
                disabled={biometricLoading}
                className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center shadow-2xl disabled:opacity-70"
                aria-label="Desbloquear"
              >
                {biometricLoading ? (
                  <Loader2 size={22} className="animate-spin text-zinc-300" />
                ) : (
                  <Lock size={34} className="text-red-500" />
                )}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BIOMETRIC SETUP DIALOG ── */}
      <Dialog open={showBiometricSetup} onOpenChange={setShowBiometricSetup}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Fingerprint size={20} className="text-blue-400" />
              Desbloqueio Biométrico
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-zinc-400 text-sm">
              Ative o desbloqueio com <strong className="text-white">Face ID</strong> ou <strong className="text-white">Impressão Digital</strong> para desbloquear a sessão após 120 segundos sem atividade.
            </p>
            <div className="flex items-center gap-2 p-3 bg-blue-950/30 border border-blue-500/20 rounded-lg">
              <ScanFace size={18} className="text-blue-400 shrink-0" />
              <p className="text-xs text-blue-300">O dispositivo irá solicitar a verificação biométrica. Nenhum dado biométrico é enviado para os nossos servidores.</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleRegisterBiometric}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold"
              >
                <Fingerprint size={15} className="mr-1.5" />Ativar agora
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowBiometricSetup(false)}
                className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                Agora não
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-zinc-950 border-b border-zinc-900" style={{ paddingTop: "env(safe-area-inset-top)" }}>
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
              <Button onClick={() => { setAuthMode("login"); setAuthModalOpen(true); }} className="bg-red-600 hover:bg-red-700 text-white font-bold px-6">
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
              {...makeTap(() => selectMainTab(tab.id as typeof activeTab, (tab as { onSelect?: () => void }).onSelect))}
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
              {...makeTap(() => { setActiveTab("wallet"); fetchMyBets(); })}
              className={`py-3 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap flex items-center gap-2 ${activeTab === "wallet" ? "border-red-600 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
            >
              <Wallet size={16} />
              CARTEIRA
            </button>
          )}
          {auth.user && (
            <button
              {...makeTap(() => { setActiveTab("mybets"); fetchMyBets(); })}
              className={`py-3 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap flex items-center gap-2 ${activeTab === "mybets" ? "border-red-600 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
            >
              <History size={16} />
              MINHAS APOSTAS
            </button>
          )}
          {auth.user && (
            <button
              {...makeTap(() => setActiveTab("profile"))}
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
                  selectedCountry={selectedCountry}
                  setSelectedCountry={setSelectedCountry}
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
              selectedCountry={selectedCountry}
              setSelectedCountry={setSelectedCountry}
            />
          </div>
        </aside>

        <main className="flex-1 pb-32 lg:pb-8 overflow-hidden min-w-0">

          {/* ── Copa do Mundo inline panel ────────────────────────────────── */}
          {showWCPanel && (
            <Suspense fallback={
              <div className="flex items-center justify-center h-64">
                <div className="w-7 h-7 border-2 border-zinc-800 border-t-red-500 rounded-full animate-spin" />
              </div>
            }>
              <LazyWorldCupPage
                onClose={() => setShowWCPanel(false)}
                onBet={(bet) => {
                  setBets(prev => {
                    const idx = prev.findIndex(b => b.matchId === bet.matchId && b.market === bet.market && b.selection === bet.selection);
                    if (idx !== -1) return prev.filter((_, i) => i !== idx);
                    return [...prev, {
                      matchId: bet.matchId,
                      matchTitle: `${bet.home} vs ${bet.away}`,
                      league: "Copa do Mundo 2026",
                      country: "Internacional",
                      sport: bet.sport,
                      date: "", time: "",
                      selection: bet.selection,
                      odd: bet.odd,
                      market: bet.market,
                      label: bet.label,
                    }];
                  });
                }}
              />
            </Suspense>
          )}

          <div className="p-4 lg:p-8" style={showWCPanel ? { display: "none" } : undefined}>
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
                <div className="relative overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_12px_30px_rgba(0,0,0,0.08)] mb-3">
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-yellow-400 via-orange-500 to-red-600" />
                  <div className="px-4 pt-4 pb-3">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="text-sm leading-none shrink-0">
                          {(expandedMatch.sport ?? "football") === "football" ? "🏆" : (COUNTRY_FLAGS[expandedMatch.country?.toLowerCase() ?? ""] ?? sportEmoji(expandedMatch.sport))}
                        </span>
                        <span className="text-[11px] font-black tracking-[0.18em] uppercase text-zinc-500 truncate">
                          {expandedMatch.league}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {expandedMatch.isLive && (
                          <div className="flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-2.5 py-1">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                            </span>
                            <span className="text-[10px] font-black text-red-500">
                              {(() => {
                                const m = getDisplayMinute(expandedMatch);
                                const isFootball = !expandedMatch.sport || expandedMatch.sport === "football";
                                const tag = isFootball ? getFootballPhaseTag(expandedMatch, m) : null;
                                if (m <= 0) return "AO VIVO";
                                if (tag === "HT") return "AO VIVO HT";
                                if (tag && isFootball) return `${tag} · ${getFootballClockLabel(expandedMatch, m)}`;
                                if (tag) return `${m}' · ${tag}`;
                                return `${m}'`;
                              })()}
                            </span>
                          </div>
                        )}
                        <button
                          onClick={() => setMatchViewTab(matchViewTab === "markets" ? "stats" : "markets")}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[11px] font-black transition-all ${
                            matchViewTab !== "markets"
                              ? "border-blue-200 bg-blue-50 text-blue-600"
                              : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
                          }`}
                          title="Estatísticas"
                        >
                          <BarChart2 size={12} />
                          <span className="hidden sm:inline">Stats</span>
                        </button>
                        {expandedMatch.isLive && (
                          <button
                            onClick={() => setMatchViewTab(matchViewTab === "live" ? "markets" : "live")}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[11px] font-black transition-all ${
                              matchViewTab === "live"
                                ? "border-red-200 bg-red-50 text-red-600"
                                : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
                            }`}
                            title="Visualização Ao Vivo"
                          >
                            <Activity size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 mb-4">
                      {(() => {
                        const isTennisHeader = expandedMatch.sport === "tennis";
                        const tennisSets = expandedMatch._liveExtra?.sets ?? [];
                        const currentGames = tennisSets.length > 0 ? tennisSets[tennisSets.length - 1]! : [0, 0];
                        const currentPts = expandedMatch._liveExtra?.currentPoints;
                        const gamesHome = isTennisHeader ? (currentGames?.[0] ?? 0) : (expandedMatch.homeScore ?? 0);
                        const gamesAway = isTennisHeader ? (currentGames?.[1] ?? 0) : (expandedMatch.awayScore ?? 0);
                        const setsHome = expandedMatch.homeScore ?? 0;
                        const setsAway = expandedMatch.awayScore ?? 0;
                        const ptsHome = currentPts?.[0] != null ? String(currentPts[0]) : "0";
                        const ptsAway = currentPts?.[1] != null ? String(currentPts[1]) : "0";
                        return (
                          <>
                            <div className="flex-1 min-w-0 text-right">
                              <span className="block text-[16px] font-black text-zinc-900 leading-tight px-1">
                                {teamNamePt(expandedMatch.home)}
                              </span>
                            </div>

                            <div className="min-w-[108px] flex flex-col items-center">
                              <span className="text-[28px] font-black text-zinc-900 tabular-nums">
                                {gamesHome}
                                <span className="text-zinc-400 mx-1.5">-</span>
                                {gamesAway}
                              </span>
                              {isTennisHeader ? (
                                <div className="mt-1.5 flex flex-col items-center gap-1">
                                  <div className="flex items-center gap-2 text-[11px] font-black">
                                    <span className="text-zinc-500 uppercase tracking-wide">Sets</span>
                                    <span className="text-zinc-900 tabular-nums">{setsHome}-{setsAway}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] font-black">
                                    <span className="text-zinc-500 uppercase tracking-wide">PTS</span>
                                    <span className="text-zinc-900 tabular-nums">{ptsHome}-{ptsAway}</span>
                                  </div>
                                </div>
                              ) : expandedMatch.isLive ? (
                                <span className="mt-1 text-[12px] font-semibold text-zinc-500">
                                  {(() => {
                                    const m = getDisplayMinute(expandedMatch);
                                    const isFootball = !expandedMatch.sport || expandedMatch.sport === "football";
                                    const tag = isFootball ? getFootballPhaseTag(expandedMatch, m) : null;
                                    if (m <= 0) return "AO VIVO";
                                    if (tag === "HT") return "HT";
                                    if (tag && isFootball) return `${tag} · ${getFootballClockLabel(expandedMatch, m)}`;
                                    if (tag) return `${m}' · ${tag}`;
                                    return `${m}'`;
                                  })()}
                                </span>
                              ) : (
                                <>
                                  {expandedMatch.time && <span className="mt-1 text-[22px] font-black text-zinc-900">{expandedMatch.time}</span>}
                                  {(expandedMatch.date || expandedMatch.time) && (
                                    <span className="mt-1 text-[12px] font-semibold text-zinc-500">
                                      {expandedMatch.date ? formatMatchDate(expandedMatch.date) : ""}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>

                            <div className="flex-1 min-w-0 text-left">
                              <span className="block text-[16px] font-black text-zinc-900 leading-tight px-1">
                                {teamNamePt(expandedMatch.away)}
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {matchViewTab !== "markets" && (
                      <div className="flex gap-2 overflow-x-auto no-scrollbar pt-1">
                        {(() => {
                          const tabLabel = (tab: string) => {
                            if (tab === "stats") return "Estatísticas";
                            if (tab === "confrontos") return "⚔️ H2H";
                            if (tab === "standings") return "Classificação";
                            if (tab === "yesterday") return "📅 Ontem";
                            if (tab === "ranking") return "Ranking";
                            if (tab === "liga") return "⭐ Liga";
                            if (tab === "odds") return "📊 Mercados";
                            if (tab === "lineups") return "👥 Escalação";
                            return "⚡ Ao Vivo";
                          };
                          const tabs: string[] = expandedMatch.sport === "tennis"
                            ? (expandedMatch.isLive ? ["stats", "confrontos", "yesterday", "ranking", "live"] : ["stats", "confrontos", "yesterday", "ranking"])
                            : expandedMatch.sport === "hockey"
                            ? (expandedMatch.isLive ? ["stats", "confrontos", "standings", "yesterday", "live"] : ["stats", "confrontos", "standings", "yesterday"])
                            : expandedMatch.sport === "basketball"
                            ? (expandedMatch.isLive ? ["stats", "confrontos", "standings", "yesterday", "live"] : ["stats", "confrontos", "standings", "yesterday"])
                            : expandedMatch.sport === "baseball"
                            ? (expandedMatch.isLive ? ["stats", "confrontos", "standings", "yesterday", "liga", "live"] : ["stats", "confrontos", "standings", "yesterday", "liga"])
                            : expandedMatch.sport === "volleyball"
                            ? (expandedMatch.isLive ? ["stats", "confrontos", "standings", "live"] : ["stats", "confrontos", "standings"])
                            : (expandedMatch.isLive ? ["stats", "confrontos", "standings", "odds", "lineups", "live"] : ["stats", "confrontos", "standings", "odds", "lineups"]);
                          const orderedTabs = expandedMatch.isLive ? ["live", ...tabs.filter(t => t !== "live")] : tabs;
                          return orderedTabs.map(tab => (
                            <button
                              key={tab}
                              onClick={() => setMatchViewTab(tab as typeof matchViewTab)}
                              className={`shrink-0 px-3 py-2 rounded-xl border text-[11px] font-black whitespace-nowrap transition-all ${
                                matchViewTab === tab
                                  ? (tab === "live" ? "bg-red-50 border-red-200 text-red-600" : "bg-blue-50 border-blue-200 text-blue-600")
                                  : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100"
                              }`}
                            >
                              {tabLabel(tab)}
                            </button>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats panel */}
                {matchViewTab === "stats" && (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 mb-2 animate-in fade-in duration-200">
                    {(
                      ((expandedMatch.sport ?? "football") === "football" && matchStatsLoading && !matchStats && !(v2StatsGroups && v2StatsGroups.length > 0)) ||
                      ((expandedMatch.sport ?? "football") !== "football" && v2StatsLoading && !(v2StatsGroups && v2StatsGroups.length > 0))
                    ) ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="animate-spin text-blue-400" size={28} />
                      </div>
                    ) : ((expandedMatch.sport ?? "football") === "football" && !matchStats && !(v2StatsGroups && v2StatsGroups.length > 0)) ? (
                      <div className="text-center text-zinc-500 py-8 text-sm">Estatísticas indisponíveis para este jogo.</div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Centro de Estatísticas</div>
                            <div className="text-xs text-zinc-500 mt-1">
                              {expandedMatch.sport === "football" ? "V2 (oficial) + análise" : "V2 (oficial) separado por esporte e liga"}
                            </div>
                          </div>
                          <div className="text-right min-w-0">
                            <div className="text-[10px] font-bold text-zinc-300 truncate">{expandedMatch.league}</div>
                            <div className="text-[10px] text-zinc-600 truncate">{expandedMatch.country ?? ""}</div>
                          </div>
                        </div>

                        {expandedMatch.sport === "football" ? (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="bg-zinc-950/60 rounded-lg border border-zinc-800 p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Probabilidade</div>
                                  <div className="text-[10px] text-zinc-600">Odds → %</div>
                                </div>
                                <div className="space-y-2.5 mb-4">
                                  {[
                                    { label: expandedMatch.home, pct: matchStats!.winProb.home, color: "bg-blue-500" },
                                    { label: "Empate", pct: matchStats!.winProb.draw, color: "bg-yellow-400" },
                                    { label: expandedMatch.away, pct: matchStats!.winProb.away, color: "bg-red-500" },
                                  ].map(row => (
                                    <div key={row.label}>
                                      <div className="flex justify-between text-xs mb-1">
                                        <span className="text-zinc-300 truncate max-w-[140px]">{row.label}</span>
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
                                    <div className="text-xl font-black text-blue-400">{(confrontosData?.homeWins ?? matchStats!.h2h.homeWins)}</div>
                                    <div className="text-[10px] text-zinc-500">Vitórias</div>
                                  </div>
                                  <div>
                                    <div className="text-xl font-black text-yellow-400">{(confrontosData?.draws ?? matchStats!.h2h.draws)}</div>
                                    <div className="text-[10px] text-zinc-500">Empates</div>
                                  </div>
                                  <div>
                                    <div className="text-xl font-black text-red-400">{(confrontosData?.awayWins ?? matchStats!.h2h.awayWins)}</div>
                                    <div className="text-[10px] text-zinc-500">Derrotas</div>
                                  </div>
                                </div>
                              </div>

                              <div className="bg-zinc-950/60 rounded-lg border border-zinc-800 p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Médias</div>
                                  <button
                                    onClick={() => setMatchViewTab("confrontos")}
                                    className="text-[10px] font-bold text-blue-400 hover:text-blue-300"
                                  >
                                    Ver H2H
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                                  {[
                                    { label: "Golos Marcados", val: matchStats!.avgStats.goalsScored.toFixed(2), sub: `Liga: ${matchStats!.avgStats.leagueGoals.toFixed(2)}` },
                                    { label: "AEM", val: `${matchStats!.avgStats.btts}%`, sub: `Liga: ${matchStats!.avgStats.leagueBtts}%` },
                                    { label: "Mais de 1.5", val: `${matchStats!.avgStats.over15}%`, sub: `Liga: ${matchStats!.avgStats.leagueOver15}%` },
                                    { label: "Mais de 2.5", val: `${matchStats!.avgStats.over25}%`, sub: `Liga: ${matchStats!.avgStats.leagueOver25}%` },
                                    { label: "Cartões", val: matchStats!.avgStats.cards.toFixed(2), sub: "" },
                                    { label: "Cantos", val: matchStats!.avgStats.corners.toFixed(2), sub: "" },
                                  ].map(s => (
                                    <div key={s.label}>
                                      <div className="text-[11px] text-zinc-400">{s.label}</div>
                                      <div className="font-black text-white text-lg leading-tight">{s.val}</div>
                                      {s.sub && <div className="text-[10px] text-zinc-600">{s.sub}</div>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {matchStats!.formIsReal ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {[
                                  { title: `Últimos Jogos — ${expandedMatch.home}`, form: matchStats!.homeForm },
                                  { title: `Últimos Jogos — ${expandedMatch.away}`, form: matchStats!.awayForm },
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
                            ) : (
                              <div className="bg-zinc-950/60 rounded-lg border border-zinc-800 p-5 text-center">
                                <div className="text-zinc-600 text-2xl mb-2">📋</div>
                                <div className="text-zinc-500 text-sm font-medium">Histórico de jogos não disponível</div>
                                <div className="text-zinc-600 text-xs mt-1">Dados de forma indisponíveis para este jogo</div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="bg-zinc-950/60 rounded-lg border border-zinc-800 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Modo por Esporte</div>
                                <div className="text-xs text-zinc-500 mt-1">
                                  Esta aba mostra apenas dados oficiais do evento e da liga atual para {{
                                    football: "Futebol",
                                    basketball: "Basquete",
                                    tennis: "Ténis",
                                    hockey: "Hóquei no Gelo",
                                    baseball: "Beisebol",
                                    volleyball: "Voleibol",
                                  }[expandedMatch.sport ?? "football"] ?? expandedMatch.sport}.
                                </div>
                              </div>
                              <button
                                onClick={() => setMatchViewTab("confrontos")}
                                className="text-[10px] font-bold text-blue-400 hover:text-blue-300 shrink-0"
                              >
                                Ver H2H
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="bg-zinc-950/60 rounded-lg border border-zinc-800 p-4">
                          <div className="flex items-center justify-between mb-3 gap-2">
                            <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Estatísticas do Jogo</div>
                            <div className="flex items-center gap-2 shrink-0">
                              {v2StatsLoading ? (
                                <Loader2 className="animate-spin text-blue-400" size={14} />
                              ) : (
                                <div className="text-[10px] text-zinc-600">{v2StatsGroups ? `${v2StatsGroups.length} grupos` : "—"}</div>
                              )}
                              {v2StatsGroups && v2StatsGroups.length > 3 && (
                                <button
                                  onClick={() => setShowAllV2Stats(v => !v)}
                                  className="text-[10px] font-bold text-blue-400 hover:text-blue-300"
                                >
                                  {showAllV2Stats ? "Ver menos" : "Ver mais"}
                                </button>
                              )}
                            </div>
                          </div>
                          {v2StatsLoading ? (
                            <div className="flex items-center justify-center py-10">
                              <Loader2 className="animate-spin text-blue-400" size={22} />
                            </div>
                          ) : v2StatsGroups && v2StatsGroups.length > 0 ? (
                            <div className="space-y-3">
                              {(showAllV2Stats ? v2StatsGroups : v2StatsGroups.slice(0, 3)).map(g => (
                                <div key={g.title} className="border border-zinc-800 rounded-lg overflow-hidden">
                                  <div className="bg-zinc-900/50 px-3 py-2 text-[10px] font-black text-zinc-300">{g.title}</div>
                                  <div className="divide-y divide-zinc-800">
                                    {g.rows.map(r => (
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
                          ) : (
                            <div className="text-center text-zinc-500 text-sm py-8">Estatísticas indisponíveis</div>
                          )}
                          {expandedMatch.isLive && (
                            <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between">
                              <div className="text-[10px] text-zinc-600">Para estatísticas ao vivo (posse, remates, etc.)</div>
                              <button
                                onClick={() => setMatchViewTab("live")}
                                className="text-[10px] font-bold text-red-400 hover:text-red-300"
                              >
                                Abrir Ao Vivo
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Standings panel */}
                {matchViewTab === "standings" && (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 mb-2 animate-in fade-in duration-200">
                    {standingsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="animate-spin text-blue-400" size={28} />
                      </div>
                    ) : !standings ? (
                      <div className="text-center text-zinc-500 py-8 text-sm">Classificação indisponível para este jogo.</div>
                    ) : standings.length === 0 ? (
                      <div className="text-center text-zinc-500 py-8 text-sm">Classificação indisponível para esta liga.</div>
                    ) : (() => {
                      const cols = standingsMetaForSport(expandedMatch.sport);
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
                              const isHome = rowMatchesTeam(row.name, expandedMatch.home);
                              const isAway = rowMatchesTeam(row.name, expandedMatch.away);
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
                          <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">{standingsLeague}</div>
                          {standingsGroups && standingsGroups.length > 0 ? (
                            <div className="space-y-4">
                              {standingsGroups.map(group => (
                                <div key={group.name}>
                                  <div className="text-[9px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-800/60 rounded px-2 py-1 mb-2">{group.name}</div>
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
                    })()}
                  </div>
                )}

                {/* Legacy basketball standings block removed; generic sport standings are used above. */}

                {/* Yesterday results panel (basketball) */}
                {matchViewTab === "yesterday" && expandedMatch.sport === "basketball" && (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-3 mb-2 animate-in fade-in duration-200">
                    <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">🏀 Resultados NBA — Ontem</div>
                    {basketballResults.length === 0 ? (
                      <div className="text-center text-zinc-500 py-6 text-sm">Sem resultados disponíveis.</div>
                    ) : (
                      <div className="space-y-2">
                        {basketballResults.map(r => {
                          const QLABELS = ["Q1", "Q2", "Q3", "Q4", "OT"];
                          return (
                            <div key={r.id} className="bg-zinc-950/60 border border-zinc-800 rounded-lg overflow-hidden">
                              <div className="grid text-[9px] font-bold text-zinc-600 px-3 py-1 border-b border-zinc-800/60" style={{ gridTemplateColumns: `1fr repeat(${r.quarters.length + 1}, 2.5rem)` }}>
                                <div />
                                {r.quarters.map((_: [number, number], i: number) => <div key={i} className="text-center">{QLABELS[i] ?? `Q${i+1}`}</div>)}
                                <div className="text-center">TOT</div>
                              </div>
                              {[{ name: r.home, score: r.homeScore, won: r.homeWon, qi: 0 }, { name: r.away, score: r.awayScore, won: !r.homeWon, qi: 1 }].map((side, idx) => (
                                <div key={idx} className={`grid px-3 py-1.5 ${idx === 0 ? "border-b border-zinc-800/40" : ""}`} style={{ gridTemplateColumns: `1fr repeat(${r.quarters.length + 1}, 2.5rem)` }}>
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {side.won && <span className="text-[8px] text-green-400 font-black shrink-0">✓</span>}
                                    <span className={`text-[11px] font-bold truncate ${side.won ? "text-white" : "text-zinc-500"}`}>{side.name.split(" ").slice(-1)[0]}</span>
                                  </div>
                                  {r.quarters.map(([h, a]: [number, number], i: number) => {
                                    const val = side.qi === 0 ? h : a;
                                    const opp = side.qi === 0 ? a : h;
                                    return <div key={i} className={`text-center text-[10px] font-black tabular-nums ${val > opp ? "text-white" : "text-zinc-600"}`}>{val}</div>;
                                  })}
                                  <div className={`text-center text-[11px] font-black tabular-nums ${side.won ? "text-white" : "text-zinc-500"}`}>{side.score}</div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Legacy hockey standings block removed; generic sport standings are used above. */}

                {/* Yesterday results panel (baseball) */}
                {matchViewTab === "yesterday" && expandedMatch.sport === "baseball" && (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-3 mb-2 animate-in fade-in duration-200">
                    <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">⚾ Resultados MLB — Ontem</div>
                    {mlbResults.length === 0 ? (
                      <div className="text-center text-zinc-500 py-6 text-sm">Sem resultados disponíveis.</div>
                    ) : (
                      <div className="space-y-2">
                        {mlbResults.map(r => {
                          const cols = r.innings.length + 1; // innings + R column
                          const INN_LABELS = ["1","2","3","4","5","6","7","8","9","E"];
                          const sides = [
                            { name: r.away, score: r.homeScore, won: !r.homeWon, hits: r.awayHits, errors: r.awayErrors, isHome: false },
                            { name: r.home, score: r.homeScore, won: r.homeWon,  hits: r.homeHits, errors: r.homeErrors, isHome: true  },
                          ] as const;
                          return (
                            <div key={r.id} className="bg-zinc-950/60 border border-zinc-800 rounded-lg overflow-hidden">
                              {/* Header row: inning labels + R H E */}
                              <div
                                className="grid text-[9px] font-bold text-zinc-600 px-2 py-1 border-b border-zinc-800/60"
                                style={{ gridTemplateColumns: `1fr repeat(${r.innings.length}, 1.4rem) 1.8rem 1.8rem 1.8rem` }}
                              >
                                <div />
                                {r.innings.map((_: [number | null, number | null], i: number) => (
                                  <div key={i} className="text-center">{INN_LABELS[i] ?? "E"}</div>
                                ))}
                                <div className="text-center font-black text-zinc-400">R</div>
                                <div className="text-center">H</div>
                                <div className="text-center">E</div>
                              </div>
                              {/* Away row */}
                              {[
                                { name: r.away, score: r.awayScore, won: !r.homeWon, hits: r.awayHits, errors: r.awayErrors, idx: 1 },
                                { name: r.home, score: r.homeScore, won: r.homeWon,  hits: r.homeHits, errors: r.homeErrors, idx: 0 },
                              ].map((side, rowIdx) => (
                                <div
                                  key={side.name}
                                  className={`grid px-2 py-1.5 ${rowIdx === 0 ? "border-b border-zinc-800/40" : ""}`}
                                  style={{ gridTemplateColumns: `1fr repeat(${r.innings.length}, 1.4rem) 1.8rem 1.8rem 1.8rem` }}
                                >
                                  <div className="flex items-center gap-1 min-w-0">
                                    {side.won && <span className="text-[8px] text-green-400 font-black shrink-0">✓</span>}
                                    <span className={`text-[11px] font-bold truncate ${side.won ? "text-white" : "text-zinc-500"}`}>
                                      {side.name.split(" ").slice(-1)[0]}
                                    </span>
                                  </div>
                                  {r.innings.map(([h, a]: [number | null, number | null], i: number) => {
                                    const val = side.idx === 0 ? h : a;
                                    const opp = side.idx === 0 ? a : h;
                                    const better = val !== null && opp !== null && val > opp;
                                    return (
                                      <div key={i} className={`text-center text-[10px] font-black tabular-nums ${val === null ? "text-zinc-800" : better ? "text-white" : "text-zinc-600"}`}>
                                        {val === null ? "—" : val}
                                      </div>
                                    );
                                  })}
                                  <div className={`text-center text-[11px] font-black tabular-nums ${side.won ? "text-white" : "text-zinc-500"}`}>{side.score}</div>
                                  <div className="text-center text-[10px] tabular-nums text-zinc-500">{side.hits}</div>
                                  <div className={`text-center text-[10px] tabular-nums ${side.errors > 0 ? "text-red-400" : "text-zinc-700"}`}>{side.errors}</div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* MLB Standings panel (baseball "yesterday" tab) */}
                {matchViewTab === "yesterday" && expandedMatch.sport === "baseball" && (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-3 mb-2 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">🏆 Classificação MLB</span>
                      {mlbStandings && <span className="text-[9px] text-zinc-600">— {mlbStandings.season}</span>}
                    </div>
                    {!mlbStandings ? (
                      <div className="text-center text-zinc-500 py-4 text-sm animate-pulse">A carregar...</div>
                    ) : (
                      <div className="space-y-5">
                        {mlbStandings.leagues.map(lg => (
                          <div key={lg.name}>
                            <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-2">{lg.name}</div>
                            <div className="space-y-2">
                              {lg.divisions.map(div => (
                                <div key={div.name} className="bg-zinc-950/60 border border-zinc-800 rounded-lg overflow-hidden">
                                  <div className="bg-zinc-800/50 px-2.5 py-1 text-[8px] font-black text-zinc-500 uppercase tracking-wider">{div.name}</div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-[10px] font-mono tabular-nums">
                                      <thead>
                                        <tr className="border-b border-zinc-800 text-[8px] font-black text-zinc-600 uppercase">
                                          <th className="text-left py-1 px-2 w-4">#</th>
                                          <th className="text-left py-1 px-2 min-w-[90px]">Equipa</th>
                                          <th className="py-1 px-1 text-center text-green-500">V</th>
                                          <th className="py-1 px-1 text-center text-red-400">D</th>
                                          <th className="py-1 px-1 text-center">GB</th>
                                          <th className="py-1 px-1 text-center hidden sm:table-cell">PC</th>
                                          <th className="py-1 px-1 text-center hidden sm:table-cell">PA</th>
                                          <th className="py-1 px-1 text-center hidden sm:table-cell">DIF</th>
                                          <th className="py-1 px-1 text-center">SÉRIE</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {div.teams.map((team, idx) => {
                                          const abbr = MLB_ABBR[team.name];
                                          const isSelected = selectedMLBRoster === abbr;
                                          return (
                                          <tr key={team.id}
                                            className={`border-b border-zinc-800/30 transition-colors ${idx === 0 ? "border-l-2 border-l-green-600/40" : ""} ${abbr ? (isSelected ? "bg-red-500/10 cursor-pointer" : "cursor-pointer hover:bg-zinc-800/30") : ""}`}
                                            onClick={() => {
                                              if (!abbr) return;
                                              if (isSelected) { setSelectedMLBRoster(null); return; }
                                              setSelectedMLBRoster(abbr);
                                              if (mlbRosters[abbr]) return;
                                              setMlbRosterLoading(true);
                                              fetch(`/api/matches/mlb-roster/${abbr}`)
                                                .then(r => r.ok ? r.json() : null)
                                                .then(d => { if (d) setMlbRosters(prev => ({ ...prev, [abbr]: d })); })
                                                .catch(() => {})
                                                .finally(() => setMlbRosterLoading(false));
                                            }}
                                          >
                                            <td className="py-1 px-2 text-zinc-600">{team.position}</td>
                                            <td className={`py-1 px-2 font-semibold truncate max-w-[90px] ${isSelected ? "text-red-300" : "text-zinc-200"}`}>{team.name.split(" ").slice(-1)[0]}</td>
                                            <td className="py-1 px-1 text-center text-green-400">{team.won}</td>
                                            <td className="py-1 px-1 text-center text-red-400">{team.lost}</td>
                                            <td className="py-1 px-1 text-center text-zinc-500">{team.gamesBack}</td>
                                            <td className="py-1 px-1 text-center text-zinc-500 hidden sm:table-cell">{team.runsScored}</td>
                                            <td className="py-1 px-1 text-center text-zinc-500 hidden sm:table-cell">{team.runsAllowed}</td>
                                            <td className={`py-1 px-1 text-center hidden sm:table-cell font-bold ${team.runsDiff.startsWith("+") ? "text-green-400" : team.runsDiff.startsWith("-") ? "text-red-400" : "text-zinc-500"}`}>{team.runsDiff}</td>
                                            <td className={`py-1 px-1 text-center font-black ${team.streak.startsWith("W") ? "text-green-400" : team.streak.startsWith("L") ? "text-red-400" : "text-zinc-400"}`}>{team.streak}</td>
                                          </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* MLB Liga — league batting leaderboards */}
                {matchViewTab === "liga" && expandedMatch.sport === "baseball" && (() => {
                  const TABS: { key: "avg" | "hr" | "rbi" | "sb"; label: string; col: keyof MLBLeaderBatter; color: string; title: string } [] = [
                    { key: "avg", label: "AVG",  col: "avg",       color: "text-yellow-400",  title: "Média (AVG)" },
                    { key: "hr",  label: "HR",   col: "homeRuns",  color: "text-red-400",     title: "Home Runs" },
                    { key: "rbi", label: "RBI",  col: "rbi",       color: "text-blue-400",    title: "RBI" },
                    { key: "sb",  label: "SB",   col: "stolenBases", color: "text-emerald-400", title: "Bases Roubadas" },
                  ];
                  const active = TABS.find(t => t.key === mlbLigaSubTab) ?? TABS[0];
                  const sorted = mlbLeagueStats
                    ? [...mlbLeagueStats.batters].sort((a, b) => {
                        const va = parseFloat(a[active.col] as string) || 0;
                        const vb = parseFloat(b[active.col] as string) || 0;
                        return vb - va;
                      }).slice(0, 25)
                    : [];
                  return (
                    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 mb-2 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">⭐ Líderes MLB</div>
                        <div className="flex rounded overflow-hidden border border-zinc-700">
                          {TABS.map(t => (
                            <button key={t.key} onClick={() => setMlbLigaSubTab(t.key)}
                              className={`text-[9px] font-black px-2.5 py-1 transition-colors ${mlbLigaSubTab === t.key ? "bg-zinc-700 text-white" : "text-zinc-600 hover:text-zinc-400"}`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className={`text-[9px] font-bold mb-2 ${active.color}`}>🏆 Top 25 — {active.title}</div>
                      {mlbLeagueStatsLoading || !mlbLeagueStats ? (
                        <div className="flex items-center justify-center py-10">
                          <div className="text-zinc-600 text-xs animate-pulse">A carregar líderes...</div>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-[10px] font-mono tabular-nums">
                            <thead>
                              <tr className="border-b border-zinc-800 text-[8px] font-black text-zinc-600 uppercase">
                                <th className="text-left py-1 px-1 w-5">#</th>
                                <th className="text-left py-1 px-2 min-w-[110px]">Jogador</th>
                                <th className="text-left py-1 px-1 min-w-[65px] hidden sm:table-cell">Equipa</th>
                                <th className="py-1 px-1 text-center">PJ</th>
                                <th className={`py-1 px-1 text-center font-black ${active.color}`}>{active.label}</th>
                                {active.key === "avg" && <>
                                  <th className="py-1 px-1 text-center hidden sm:table-cell">OBP</th>
                                  <th className="py-1 px-1 text-center hidden sm:table-cell">SLG</th>
                                  <th className="py-1 px-1 text-center">HR</th>
                                  <th className="py-1 px-1 text-center">RBI</th>
                                </>}
                                {active.key === "hr" && <>
                                  <th className="py-1 px-1 text-center hidden sm:table-cell">AVG</th>
                                  <th className="py-1 px-1 text-center">RBI</th>
                                  <th className="py-1 px-1 text-center hidden sm:table-cell">R</th>
                                </>}
                                {active.key === "rbi" && <>
                                  <th className="py-1 px-1 text-center hidden sm:table-cell">AVG</th>
                                  <th className="py-1 px-1 text-center">HR</th>
                                  <th className="py-1 px-1 text-center hidden sm:table-cell">H</th>
                                </>}
                                {active.key === "sb" && <>
                                  <th className="py-1 px-1 text-center hidden sm:table-cell">AVG</th>
                                  <th className="py-1 px-1 text-center hidden sm:table-cell">R</th>
                                  <th className="py-1 px-1 text-center">H</th>
                                </>}
                              </tr>
                            </thead>
                            <tbody>
                              {sorted.map((b, i) => (
                                <tr key={i} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                                  <td className="py-1 px-1 text-zinc-600">{i + 1}</td>
                                  <td className="py-1 px-2 font-semibold text-zinc-200 truncate max-w-[110px]">{b.name}</td>
                                  <td className="py-1 px-1 text-zinc-500 truncate max-w-[65px] hidden sm:table-cell">{b.team}</td>
                                  <td className="py-1 px-1 text-center text-zinc-500">{b.gp}</td>
                                  <td className={`py-1 px-1 text-center font-black ${active.color}`}>{b[active.col] as string}</td>
                                  {active.key === "avg" && <>
                                    <td className="py-1 px-1 text-center text-zinc-400 hidden sm:table-cell">{b.obp}</td>
                                    <td className="py-1 px-1 text-center text-zinc-400 hidden sm:table-cell">{b.slg}</td>
                                    <td className="py-1 px-1 text-center text-red-400">{b.homeRuns}</td>
                                    <td className="py-1 px-1 text-center text-zinc-300">{b.rbi}</td>
                                  </>}
                                  {active.key === "hr" && <>
                                    <td className="py-1 px-1 text-center text-zinc-400 hidden sm:table-cell">{b.avg}</td>
                                    <td className="py-1 px-1 text-center text-zinc-300">{b.rbi}</td>
                                    <td className="py-1 px-1 text-center text-zinc-500 hidden sm:table-cell">{b.runs}</td>
                                  </>}
                                  {active.key === "rbi" && <>
                                    <td className="py-1 px-1 text-center text-zinc-400 hidden sm:table-cell">{b.avg}</td>
                                    <td className="py-1 px-1 text-center text-red-400">{b.homeRuns}</td>
                                    <td className="py-1 px-1 text-center text-zinc-500 hidden sm:table-cell">{b.hits}</td>
                                  </>}
                                  {active.key === "sb" && <>
                                    <td className="py-1 px-1 text-center text-zinc-400 hidden sm:table-cell">{b.avg}</td>
                                    <td className="py-1 px-1 text-center text-zinc-500 hidden sm:table-cell">{b.runs}</td>
                                    <td className="py-1 px-1 text-center text-zinc-300">{b.hits}</td>
                                  </>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {sorted.length === 0 && (
                            <div className="text-center text-zinc-600 py-6 text-xs">Sem dados disponíveis.</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* MLB Roster/Stats panel */}
                {matchViewTab === "yesterday" && expandedMatch.sport === "baseball" && selectedMLBRoster && (() => {
                  const abbr = selectedMLBRoster;
                  const roster = mlbRosters[abbr];
                  const stats = mlbTeamStats[abbr];
                  return (
                    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-3 mb-2 animate-in fade-in duration-200">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-black text-red-500 uppercase tracking-widest shrink-0">⚾</span>
                          <span className="text-[9px] text-zinc-400 font-semibold truncate">{roster?.teamName ?? abbr.toUpperCase()}</span>
                          {(mlbRosterLoading || mlbStatsLoading) && <span className="text-[9px] text-zinc-600 animate-pulse shrink-0">A carregar...</span>}
                        </div>
                        <button onClick={() => { setSelectedMLBRoster(null); setMlbPanelTab("roster"); }} className="text-zinc-600 hover:text-zinc-400 text-xs shrink-0">✕</button>
                      </div>
                      {/* Tabs */}
                      <div className="flex border-b border-zinc-800 mb-3">
                        {(["roster", "stats", "injuries"] as const).map(tab => (
                          <button key={tab} onClick={() => {
                            setMlbPanelTab(tab);
                            if (tab === "stats" && !mlbTeamStats[abbr]) {
                              setMlbStatsLoading(true);
                              fetch(`/api/matches/mlb-team-stats/${abbr}`)
                                .then(r => r.ok ? r.json() : null)
                                .then(d => { if (d) setMlbTeamStats(prev => ({ ...prev, [abbr]: d })); })
                                .catch(() => {})
                                .finally(() => setMlbStatsLoading(false));
                            }
                            if (tab === "injuries" && !mlbInjuries[abbr]) {
                              setMlbInjuriesLoading(true);
                              fetch(`/api/matches/mlb-injuries/${abbr}`)
                                .then(r => r.ok ? r.json() : null)
                                .then(d => { if (d) setMlbInjuries(prev => ({ ...prev, [abbr]: d })); })
                                .catch(() => {})
                                .finally(() => setMlbInjuriesLoading(false));
                            }
                          }}
                            className={`flex-1 py-1.5 text-[10px] font-bold transition-colors ${mlbPanelTab === tab ? (tab === "injuries" ? "text-red-400 border-b-2 border-red-500 bg-red-500/5" : "text-red-400 border-b-2 border-red-500 bg-red-500/5") : "text-zinc-600 hover:text-zinc-400"}`}
                          >
                            {tab === "roster" ? "Plantel" : tab === "stats" ? "Estatísticas" : "🩹 Lesões"}
                          </button>
                        ))}
                      </div>

                      {/* Roster tab */}
                      {mlbPanelTab === "roster" && (
                        <>
                          {!roster && !mlbRosterLoading && <div className="text-center text-zinc-600 py-4 text-xs">Plantel não disponível.</div>}
                          {roster && (
                            <div className="space-y-3">
                              {roster.positions.map(pos => (
                                <div key={pos.name}>
                                  <div className="text-[8px] font-black text-zinc-600 uppercase tracking-widest mb-1.5 px-1">{pos.name}</div>
                                  <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg overflow-hidden">
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-[10px]">
                                        <thead>
                                          <tr className="border-b border-zinc-800 text-[8px] font-black text-zinc-600 uppercase">
                                            <th className="text-left py-1 px-2 w-5">#</th>
                                            <th className="text-left py-1 px-2 min-w-[110px]">Nome</th>
                                            <th className="py-1 px-1 text-center w-8">POS</th>
                                            <th className="py-1 px-1 text-center w-8">I</th>
                                            <th className="py-1 px-1 text-center hidden sm:table-cell">Alt</th>
                                            <th className="py-1 px-1 text-center hidden sm:table-cell">Peso</th>
                                            <th className="py-1 px-1 text-center w-8">Bat</th>
                                            <th className="py-1 px-1 text-center w-8">Lan</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {pos.players.map(pl => (
                                            <tr key={pl.id} className="border-b border-zinc-800/30 last:border-0">
                                              <td className="py-1 px-2 text-zinc-600 font-mono tabular-nums">{pl.number || "—"}</td>
                                              <td className="py-1 px-2 font-semibold text-zinc-200 truncate max-w-[110px]">{pl.name}</td>
                                              <td className="py-1 px-1 text-center text-zinc-500 font-mono">{pl.position || "—"}</td>
                                              <td className="py-1 px-1 text-center text-zinc-500 tabular-nums">{pl.age || "—"}</td>
                                              <td className="py-1 px-1 text-center text-zinc-600 hidden sm:table-cell">{pl.height || "—"}</td>
                                              <td className="py-1 px-1 text-center text-zinc-600 hidden sm:table-cell">{pl.weight || "—"}</td>
                                              <td className={`py-1 px-1 text-center font-bold ${pl.bats === "L" ? "text-blue-400" : pl.bats === "R" ? "text-orange-400" : pl.bats === "S" ? "text-purple-400" : "text-zinc-600"}`}>{pl.bats || "—"}</td>
                                              <td className={`py-1 px-1 text-center font-bold ${pl.throws === "L" ? "text-blue-400" : pl.throws === "R" ? "text-orange-400" : "text-zinc-600"}`}>{pl.throws || "—"}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              <div className="flex gap-4 text-[8px] text-zinc-700 px-1 pt-1">
                                <span><span className="text-blue-400 font-bold">L</span> — Esquerdo</span>
                                <span><span className="text-orange-400 font-bold">R</span> — Direito</span>
                                <span><span className="text-purple-400 font-bold">S</span> — Ambos (Switch)</span>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* Stats tab */}
                      {mlbPanelTab === "stats" && (
                        <>
                          {!stats && !mlbStatsLoading && <div className="text-center text-zinc-600 py-4 text-xs">Estatísticas não disponíveis.</div>}
                          {mlbStatsLoading && !stats && <div className="text-center text-zinc-600 py-4 text-xs animate-pulse">A carregar...</div>}
                          {stats && (
                            <div className="space-y-4">
                              {/* Batting */}
                              {stats.batters.length > 0 && (
                                <div>
                                  <div className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 px-1">⚾ Batimento</div>
                                  <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg overflow-hidden">
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-[10px] font-mono tabular-nums">
                                        <thead>
                                          <tr className="border-b border-zinc-800 text-[8px] font-black text-zinc-600 uppercase">
                                            <th className="text-left py-1 px-2 min-w-[100px]">Jogador</th>
                                            <th className="py-1 px-1 text-center">G</th>
                                            <th className="py-1 px-1 text-center font-black text-orange-400">AVG</th>
                                            <th className="py-1 px-1 text-center text-green-400">OBP</th>
                                            <th className="py-1 px-1 text-center text-blue-400">SLG</th>
                                            <th className="py-1 px-1 text-center text-red-400">HR</th>
                                            <th className="py-1 px-1 text-center">RBI</th>
                                            <th className="py-1 px-1 text-center hidden sm:table-cell">R</th>
                                            <th className="py-1 px-1 text-center hidden sm:table-cell">H</th>
                                            <th className="py-1 px-1 text-center hidden sm:table-cell">SB</th>
                                            <th className="py-1 px-1 text-center hidden md:table-cell">BB</th>
                                            <th className="py-1 px-1 text-center hidden md:table-cell">SO</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {stats.batters.map((p, idx) => (
                                            <tr key={p.id} className={`border-b border-zinc-800/30 last:border-0 ${idx === 0 ? "bg-orange-500/5" : ""}`}>
                                              <td className="py-1 px-2 font-semibold text-zinc-200 truncate max-w-[100px]">{p.name}</td>
                                              <td className="py-1 px-1 text-center text-zinc-600">{p.gp}</td>
                                              <td className="py-1 px-1 text-center font-black text-orange-400">{p.avg}</td>
                                              <td className="py-1 px-1 text-center text-green-400 font-bold">{p.obp}</td>
                                              <td className="py-1 px-1 text-center text-blue-400 font-bold">{p.slg}</td>
                                              <td className="py-1 px-1 text-center text-red-400 font-bold">{p.hr}</td>
                                              <td className="py-1 px-1 text-center text-zinc-400">{p.rbi}</td>
                                              <td className="py-1 px-1 text-center text-zinc-500 hidden sm:table-cell">{p.r}</td>
                                              <td className="py-1 px-1 text-center text-zinc-500 hidden sm:table-cell">{p.h}</td>
                                              <td className="py-1 px-1 text-center text-zinc-500 hidden sm:table-cell">{p.sb}</td>
                                              <td className="py-1 px-1 text-center text-zinc-600 hidden md:table-cell">{p.bb}</td>
                                              <td className="py-1 px-1 text-center text-zinc-600 hidden md:table-cell">{p.so}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {/* Pitching */}
                              {stats.pitchers.length > 0 && (
                                <div>
                                  <div className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 px-1">⚾ Lançamento</div>
                                  <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg overflow-hidden">
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-[10px] font-mono tabular-nums">
                                        <thead>
                                          <tr className="border-b border-zinc-800 text-[8px] font-black text-zinc-600 uppercase">
                                            <th className="text-left py-1 px-2 min-w-[100px]">Jogador</th>
                                            <th className="py-1 px-1 text-center font-black text-green-400">ERA</th>
                                            <th className="py-1 px-1 text-center text-green-500">V</th>
                                            <th className="py-1 px-1 text-center text-red-400">D</th>
                                            <th className="py-1 px-1 text-center">G</th>
                                            <th className="py-1 px-1 text-center hidden sm:table-cell">IP</th>
                                            <th className="py-1 px-1 text-center text-orange-400">SO</th>
                                            <th className="py-1 px-1 text-center hidden sm:table-cell">BB</th>
                                            <th className="py-1 px-1 text-center hidden md:table-cell">WHIP</th>
                                            <th className="py-1 px-1 text-center hidden md:table-cell">BAA</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {stats.pitchers.map((p, idx) => (
                                            <tr key={p.id} className={`border-b border-zinc-800/30 last:border-0 ${idx === 0 ? "bg-green-500/5" : ""}`}>
                                              <td className="py-1 px-2 font-semibold text-zinc-200 truncate max-w-[100px]">{p.name}</td>
                                              <td className="py-1 px-1 text-center font-black text-green-400">{p.era}</td>
                                              <td className="py-1 px-1 text-center text-green-400 font-bold">{p.w}</td>
                                              <td className="py-1 px-1 text-center text-red-400">{p.l}</td>
                                              <td className="py-1 px-1 text-center text-zinc-600">{p.gp}</td>
                                              <td className="py-1 px-1 text-center text-zinc-500 hidden sm:table-cell">{p.ip}</td>
                                              <td className="py-1 px-1 text-center text-orange-400 font-bold">{p.so}</td>
                                              <td className="py-1 px-1 text-center text-zinc-500 hidden sm:table-cell">{p.bb}</td>
                                              <td className="py-1 px-1 text-center text-zinc-600 hidden md:table-cell">{p.whip}</td>
                                              <td className="py-1 px-1 text-center text-zinc-600 hidden md:table-cell">{p.baa}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {/* Injuries tab */}
                      {mlbPanelTab === "injuries" && (() => {
                        const injData = mlbInjuries[abbr];
                        const injColor = (r: MLBInjuryReport) => {
                          const s = r.status.toLowerCase();
                          if (s.includes("60-day") || s === "sidelined") return { badge: "bg-red-500/20 text-red-400 border-red-700/40", dot: "bg-red-500" };
                          if (s.includes("15-day") || s.includes("10-day")) return { badge: "bg-amber-500/20 text-amber-400 border-amber-700/40", dot: "bg-amber-500" };
                          if (s.includes("7-day") || s.includes("day-to-day")) return { badge: "bg-yellow-500/20 text-yellow-400 border-yellow-700/40", dot: "bg-yellow-500" };
                          return { badge: "bg-amber-500/20 text-amber-400 border-amber-700/40", dot: "bg-amber-500" };
                        };
                        return (
                          <>
                            {!injData && !mlbInjuriesLoading && <div className="text-center text-zinc-600 py-4 text-xs">Sem lesões disponíveis.</div>}
                            {mlbInjuriesLoading && !injData && <div className="text-center text-zinc-600 py-4 text-xs animate-pulse">A carregar...</div>}
                            {injData && injData.report.length === 0 && (
                              <div className="flex items-center gap-2 px-3 py-4 text-xs text-green-400">
                                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                                Equipa sem lesões reportadas.
                              </div>
                            )}
                            {injData && injData.report.length > 0 && (
                              <div className="divide-y divide-zinc-800/50">
                                {injData.report.map(r => {
                                  const { badge, dot } = injColor(r);
                                  return (
                                    <div key={r.playerId} className="flex items-start gap-3 px-3 py-2.5 hover:bg-zinc-800/20 transition-colors">
                                      <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-[11px] font-bold text-zinc-200">{r.playerName}</span>
                                          <span className={`text-[9px] font-black border rounded px-1 py-0.5 ${badge}`}>{r.status}</span>
                                        </div>
                                        <div className="text-[10px] text-zinc-500 mt-0.5">{r.description}</div>
                                      </div>
                                      <div className="text-[9px] text-zinc-700 shrink-0 tabular-nums whitespace-nowrap">{r.date}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  );
                })()}

                {/* Yesterday results panel (tennis) */}
                {matchViewTab === "yesterday" && expandedMatch.sport === "tennis" && (
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
                    {((!v2StatsGroups || v2StatsGroups.length === 0) && (!v2Incidents || v2Incidents.length === 0) && !v2StatsLoading && !v2IncidentsLoading) && (
                      <div className="mt-4 pt-4 border-t border-zinc-700/60">
                        <div className="text-center text-zinc-500 text-sm">Sem dados ao vivo da API para este jogo.</div>
                        <div className="flex justify-center mt-3">
                          <button
                            onClick={() => {
                              setV2StatsGroups(null);
                              setV2Incidents(null);
                              setV2StatsFetchedAt(0);
                              setV2IncidentsFetchedAt(0);
                              setLivePollTick(t => t + 1);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-950/60 text-zinc-200 text-xs font-bold hover:border-zinc-500"
                          >
                            Atualizar
                          </button>
                        </div>
                        <div className="text-center text-zinc-600 text-[10px] mt-2">Se continuar vazio, a SportsAPI pode não disponibilizar incidents/statistics para este jogo.</div>
                      </div>
                    )}
                    {v2StatsGroups && v2StatsGroups.length > 0 && (() => {
                      const rows = extractLiveKeyStats(v2StatsGroups);
                      if (rows.length === 0) {
                        const first = v2StatsGroups[0];
                        return (
                          <div className="mt-4 pt-4 border-t border-zinc-700/60">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Estatísticas ao Vivo</div>
                              {v2StatsLoading && <Loader2 className="animate-spin text-blue-400" size={14} />}
                            </div>
                            <div className="text-zinc-500 text-sm">A API retornou estatísticas, mas sem os campos “posse/remates” detectáveis.</div>
                            {first && first.rows.length > 0 && (
                              <div className="mt-3 rounded-lg border border-zinc-800 overflow-hidden">
                                <div className="bg-zinc-800/40 px-3 py-2 text-[9px] font-black text-zinc-500 uppercase tracking-widest">{first.title}</div>
                                <div className="divide-y divide-zinc-800">
                                  {first.rows.slice(0, 8).map(r => (
                                    <div key={r.name} className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 text-xs">
                                      <div className="text-zinc-400 truncate">{r.name}</div>
                                      <div className="text-blue-400 font-black tabular-nums">{r.home || "-"}</div>
                                      <div className="text-red-400 font-black tabular-nums">{r.away || "-"}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div className="mt-4 pt-4 border-t border-zinc-700/60">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Estatísticas ao Vivo</div>
                            {v2StatsLoading && <Loader2 className="animate-spin text-blue-400" size={14} />}
                          </div>
                          <div className="rounded-lg border border-zinc-800 overflow-hidden">
                            <div className="grid grid-cols-[1fr_4rem_4rem] px-3 py-2 bg-zinc-800/40 text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                              <div />
                              <div className="text-center truncate">{expandedMatch.home.split(" ").slice(-1)[0]}</div>
                              <div className="text-center truncate">{expandedMatch.away.split(" ").slice(-1)[0]}</div>
                            </div>
                            <div className="divide-y divide-zinc-800">
                              {rows.map(r => (
                                <div key={r.key} className="grid grid-cols-[1fr_4rem_4rem] gap-2 px-3 py-2 text-xs">
                                  <div className="text-zinc-400 truncate">{r.label}</div>
                                  <div className="text-center text-blue-400 font-black tabular-nums">{r.home}</div>
                                  <div className="text-center text-red-400 font-black tabular-nums">{r.away}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {expandedMatch.sport === "football" && (
                      <div className="mt-4 pt-4 border-t border-zinc-700/60">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Estatística Avançada</div>
                          {v2IncidentsLoading && <Loader2 className="animate-spin text-blue-400" size={14} />}
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          {([
                            { key: "all", label: "Tudo" },
                            { key: "goals", label: "Golos" },
                            { key: "corners", label: "Cantos" },
                            { key: "cards", label: "Cartões" },
                          ] as const).map(t => (
                            <button
                              key={t.key}
                              onClick={() => setLiveAdvancedTab(t.key)}
                              className={`px-3 py-1.5 rounded-full border text-[11px] font-black transition-colors ${
                                liveAdvancedTab === t.key
                                  ? "bg-white text-zinc-900 border-white"
                                  : "bg-transparent text-zinc-200 border-zinc-600 hover:border-zinc-400"
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>

                        {(() => {
                          const raw = (v2Incidents ?? [])
                            .sort((a, b) => (a.minute ?? 9999) - (b.minute ?? 9999));

                          const filtered = raw.filter(ev => {
                            if (ev.team === "neutral") return liveAdvancedTab === "all";
                            if (liveAdvancedTab === "all") return true;
                            if (liveAdvancedTab === "goals") return ev.kind === "goal";
                            if (liveAdvancedTab === "corners") return ev.kind === "corner";
                            if (liveAdvancedTab === "cards") return ev.kind === "card";
                            return true;
                          });

                          const counts = {
                            home: { corner: 0, goal: 0, yellow: 0, red: 0 },
                            away: { corner: 0, goal: 0, yellow: 0, red: 0 },
                          };

                          const withTitles = filtered.map(ev => {
                            let title = ev.title || "Evento";
                            if (ev.team === "neutral") return { ...ev, displayTitle: title };
                            const side = ev.team === "away" ? "away" : "home";
                            if (ev.kind === "corner") {
                              counts[side].corner += 1;
                              title = `${counts[side].corner}º Pontapé de canto`;
                            } else if (ev.kind === "goal") {
                              counts[side].goal += 1;
                              title = "Golo";
                            } else if (ev.kind === "card") {
                              if (ev.card === "red") {
                                counts[side].red += 1;
                                title = `${counts[side].red}º Cartão vermelho`;
                              } else {
                                counts[side].yellow += 1;
                                title = `${counts[side].yellow}º Cartão amarelo`;
                              }
                            } else if (ev.kind === "sub") {
                              title = "Substituição";
                            }
                            return { ...ev, displayTitle: title };
                          });

                          if (withTitles.length === 0) {
                            return <div className="text-center text-zinc-500 text-sm py-6">Sem eventos disponíveis</div>;
                          }

                          const iconFor = (ev: typeof withTitles[number]) => {
                            if (ev.kind === "goal") return <Zap size={14} className="text-emerald-400" />;
                            if (ev.kind === "corner") return <Flag size={14} className="text-zinc-200" />;
                            if (ev.kind === "card") return <Ticket size={14} className={ev.card === "red" ? "text-red-400" : "text-yellow-400"} />;
                            if (ev.kind === "sub") return <RefreshCw size={14} className="text-zinc-300" />;
                            return <AlertCircle size={14} className="text-zinc-400" />;
                          };

                          return (
                            <div className="relative">
                              <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-zinc-700/60" />
                              <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2">
                                {withTitles.slice(0, 80).map(ev => (
                                  ev.team === "neutral" ? (
                                    <div key={ev.key} className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
                                      <div className="opacity-0 pointer-events-none" />
                                      <div className="flex flex-col items-center gap-1 py-1">
                                        <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                                          {iconFor(ev)}
                                        </div>
                                        <div className="text-[11px] font-black text-zinc-300 tabular-nums">{ev.time || "—"}</div>
                                      </div>
                                      <div className="opacity-0 pointer-events-none" />
                                      <div className="col-span-3 -mt-1">
                                        <div className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl px-4 py-3 flex items-center justify-center gap-2 text-zinc-200 font-bold">
                                          <Clock size={16} className="text-zinc-300" />
                                          {ev.displayTitle}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                  <div key={ev.key} className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start relative">
                                    <div className={`min-w-0 ${ev.team === "home" ? "text-right" : "opacity-0 pointer-events-none"}`}>
                                      <div className="inline-flex max-w-full items-start gap-2 border border-zinc-700/70 bg-zinc-900/40 rounded-xl px-3 py-2">
                                        <div className="min-w-0">
                                          <div className="text-sm font-bold text-white truncate">{ev.displayTitle}</div>
                                          <div className="text-[11px] text-zinc-400 truncate">{ev.detail || expandedMatch.home}</div>
                                        </div>
                                        {ev.kind === "goal" && (ev.score || (expandedMatch.homeScore != null && expandedMatch.awayScore != null)) && (
                                          <div className="shrink-0 px-2 py-0.5 rounded-full border border-emerald-500/60 text-emerald-300 text-[11px] font-black tabular-nums">
                                            {ev.score ?? `${expandedMatch.homeScore}-${expandedMatch.awayScore}`}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex flex-col items-center gap-1 py-1">
                                      <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                                        {iconFor(ev)}
                                      </div>
                                      <div className="text-[11px] font-black text-zinc-300 tabular-nums">{ev.time || "—"}</div>
                                    </div>

                                    <div className={`min-w-0 ${ev.team === "away" ? "text-left" : "opacity-0 pointer-events-none"}`}>
                                      <div className="inline-flex max-w-full items-start gap-2 border border-zinc-700/70 bg-zinc-900/40 rounded-xl px-3 py-2">
                                        {ev.kind === "goal" && (ev.score || (expandedMatch.homeScore != null && expandedMatch.awayScore != null)) && (
                                          <div className="shrink-0 px-2 py-0.5 rounded-full border border-emerald-500/60 text-emerald-300 text-[11px] font-black tabular-nums">
                                            {ev.score ?? `${expandedMatch.homeScore}-${expandedMatch.awayScore}`}
                                          </div>
                                        )}
                                        <div className="min-w-0">
                                          <div className="text-sm font-bold text-white truncate">{ev.displayTitle}</div>
                                          <div className="text-[11px] text-zinc-400 truncate">{ev.detail || expandedMatch.away}</div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  )
                                ))}
                              </div>

                              <div className="mt-3">
                                <div className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl px-4 py-3 flex items-center justify-center gap-2 text-zinc-200 font-bold">
                                  <Clock size={16} className="text-zinc-300" />
                                  {expandedMatch.status === "HT" ? "Fim da 1ª parte" : expandedMatch.status === "FT" ? "Fim da Partida" : "Início da Partida"}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
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
                    {/* Basketball quarter scores below chart */}
                    {expandedMatch.sport === "basketball" && expandedMatch._liveExtra?.quarters && expandedMatch._liveExtra.quarters.length > 0 && (() => {
                      const quarters = expandedMatch._liveExtra.quarters;
                      const QUARTER_LABELS = ["Q1", "Q2", "Q3", "Q4", "OT"];
                      return (
                        <div className="mt-4 pt-4 border-t border-zinc-700/60">
                          <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-2">Placar por Quarto</div>
                          <div className="rounded-lg border border-zinc-800 overflow-hidden">
                            <div className="grid text-[9px] font-bold text-zinc-500 px-3 py-1.5 border-b border-zinc-800" style={{ gridTemplateColumns: `1fr repeat(${quarters.length + 1}, 2.5rem)` }}>
                              <div />
                              {quarters.map((_: [number, number], i: number) => <div key={i} className="text-center">{QUARTER_LABELS[i] ?? `Q${i+1}`}</div>)}
                              <div className="text-center">TOT</div>
                            </div>
                            {[0, 1].map(idx => {
                              const name = idx === 0 ? expandedMatch.home : expandedMatch.away;
                              const total = idx === 0 ? expandedMatch.homeScore : expandedMatch.awayScore;
                              return (
                                <div key={idx} className={`grid text-[10px] px-3 py-1.5 ${idx === 0 ? "border-b border-zinc-800/60" : ""}`} style={{ gridTemplateColumns: `1fr repeat(${quarters.length + 1}, 2.5rem)` }}>
                                  <div className="text-zinc-300 font-bold truncate">{name.split(" ").slice(-1)[0]}</div>
                                  {quarters.map(([h, a]: [number, number], i: number) => (
                                    <div key={i} className={`text-center font-black tabular-nums ${(idx === 0 ? h > a : a > h) ? "text-white" : "text-zinc-600"}`}>{idx === 0 ? h : a}</div>
                                  ))}
                                  <div className="text-center font-black text-white tabular-nums">{total ?? 0}</div>
                                </div>
                              );
                            })}
                          </div>
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

                {/* All Odds Markets panel */}
                {matchViewTab === "odds" && (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 mb-2 animate-in fade-in duration-200">
                    <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">📊 Todos os Mercados</div>
                    {allOddsLoading || !allOddsData ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="animate-spin text-blue-400" size={28} />
                      </div>
                    ) : allOddsData.length === 0 ? (
                      <div className="text-center text-zinc-500 py-8">
                        <div className="text-2xl mb-2">📭</div>
                        <div className="text-sm font-medium">Mercados indisponíveis</div>
                        <div className="text-xs text-zinc-600 mt-1">Odds não disponíveis para este jogo</div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={15} />
                          <Input
                            value={allOddsQuery}
                            onChange={(e) => setAllOddsQuery(e.target.value)}
                            placeholder="Pesquisar mercados, grupos ou opções"
                            className="pl-9 h-10 bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2.5 py-1 text-[10px] font-black text-zinc-400">
                            {selectedAllOddsSections.length} secções
                          </div>
                          <div className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2.5 py-1 text-[10px] font-black text-zinc-400">
                            {selectedAllOddsSections.reduce((acc, section) => acc + section.markets.length, 0)} mercados
                          </div>
                          <div className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-black text-red-400">
                            {selectedAllOddsSections.reduce((acc, section) => acc + section.selectedCount, 0)} selecionados
                          </div>
                          {allOddsQuery.trim() && (
                            <button
                              type="button"
                              onClick={() => setAllOddsQuery("")}
                              className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2.5 py-1 text-[10px] font-black text-zinc-400 hover:text-white"
                            >
                              Limpar busca
                            </button>
                          )}
                        </div>
                        {selectedAllOddsSections.length === 0 ? (
                          <div className="text-center text-zinc-500 py-10">
                            <div className="text-2xl mb-2">🔎</div>
                            <div className="text-sm font-medium">Nenhum mercado encontrado</div>
                            <div className="text-xs text-zinc-600 mt-1">Tenta outro nome de mercado, grupo ou opção</div>
                          </div>
                        ) : selectedAllOddsSections.map(section => {
                          const isSectionOpen = allOddsQuery.trim()
                            ? true
                            : (allOddsSectionOpen[section.section] ?? ["Principal", "Golos", "Jogadores"].includes(section.section));
                          return (
                          <div key={section.section} className="space-y-3">
                            <button
                              type="button"
                              onClick={() => setAllOddsSectionOpen(prev => ({ ...prev, [section.section]: !isSectionOpen }))}
                              className={`w-full flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left ${
                                section.hasSelection
                                  ? "border-red-500/25 bg-red-500/5"
                                  : "border-zinc-800 bg-zinc-950/60"
                              }`}
                            >
                              <div className="h-px flex-1 bg-zinc-800" />
                              <div className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.18em]">{section.section}</div>
                              <div className="rounded-full bg-zinc-800 px-2 py-0.5 text-[9px] font-black text-zinc-300">
                                {section.markets.length}
                              </div>
                              {section.selectedCount > 0 && (
                                <div className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[9px] font-black text-red-400">
                                  {section.selectedCount}
                                </div>
                              )}
                              <div className="text-zinc-500">
                                {isSectionOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </div>
                              <div className="h-px flex-1 bg-zinc-800" />
                            </button>
                            {isSectionOpen && section.markets.map(({ market, originalIndex, featured, hasSelection, selectedCount, choices }) => (
                              <div
                                key={`${section.section}-${originalIndex}`}
                                className={`rounded-lg border p-3 ${
                                  hasSelection
                                    ? "bg-red-500/[0.04] border-red-500/20 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.08)]"
                                    : featured
                                    ? "bg-zinc-950/90 border-zinc-700 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.08)]"
                                    : "bg-zinc-950/60 border-zinc-800"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <div className="min-w-0">
                                    {market.group && market.group !== market.name && market.group !== section.section && (
                                      <div className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.18em] mb-1">
                                        {market.group}
                                      </div>
                                    )}
                                    <div className={`text-[10px] font-black uppercase tracking-wider ${featured ? "text-zinc-200" : "text-zinc-400"}`}>{market.name}</div>
                                  </div>
                                  <div className="shrink-0 flex items-center gap-1.5">
                                    {hasSelection && (
                                      <div className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-red-400">
                                        {selectedCount} no boleto
                                      </div>
                                    )}
                                    {featured && (
                                      <div className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-red-400">
                                        Destaque
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className={`grid gap-2 ${market.choices.length === 2 ? "grid-cols-2" : market.choices.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                                  {choices.map((choice) => (
                                    <button
                                      key={choice.ci}
                                      onClick={() => {
                                        const slip = bets.find(b => b.matchId === expandedMatch.id && b.market === choice.marketKey);
                                        if (!slip) {
                                          setBets(prev => [...prev.filter(b => !(b.matchId === expandedMatch.id && (b.market ?? "").startsWith(`all_${originalIndex}_`))), {
                                            matchId: expandedMatch.id,
                                            matchTitle: `${expandedMatch.home} — ${expandedMatch.away}`,
                                            odd: choice.odds,
                                            market: choice.marketKey,
                                            selection: `${market.name}: ${choice.label}`,
                                            label: choice.label,
                                          }]);
                                        } else {
                                          setBets(prev => prev.filter(b => !(b.matchId === expandedMatch.id && b.market === choice.marketKey)));
                                        }
                                      }}
                                      className={`flex flex-col items-center py-2.5 px-2 rounded-md text-xs font-bold transition-all border ${
                                        choice.isSelected
                                          ? "bg-red-600 border-red-500 text-white"
                                          : featured
                                          ? "bg-zinc-800/90 border-zinc-600 text-zinc-100 hover:border-red-500/50 hover:text-white"
                                          : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                                      }`}
                                    >
                                      <span className="text-[10px] text-inherit opacity-70 mb-0.5">{choice.label}</span>
                                      <span className="font-black text-base tabular-nums">{choice.odds.toFixed(2)}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )})}
                      </div>
                    )}
                  </div>
                )}

                {/* Lineups panel */}
                {matchViewTab === "lineups" && (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 mb-2 animate-in fade-in duration-200">
                    <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">
                      👥 Escalação
                      {lineupsData?.confirmed && <span className="ml-2 text-green-400 normal-case font-bold text-[9px]">✓ Confirmada</span>}
                    </div>
                    {lineupsLoading || !lineupsData ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="animate-spin text-blue-400" size={28} />
                      </div>
                    ) : lineupsData.home.starters.length === 0 && lineupsData.away.starters.length === 0 ? (
                      <div className="text-center text-zinc-500 py-8">
                        <div className="text-2xl mb-2">📋</div>
                        <div className="text-sm font-medium">Escalação não disponível</div>
                        <div className="text-xs text-zinc-600 mt-1">Ainda não foi divulgada para este jogo</div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {(["home", "away"] as const).map(side => {
                          const teamData = lineupsData[side];
                          const teamName = side === "home" ? expandedMatch.home : expandedMatch.away;
                          const starters = teamData.starters;
                          const bench = teamData.bench;
                          return (
                            <div key={side}>
                              <div className="flex items-center justify-between mb-2">
                                <div className={`text-[10px] font-black uppercase tracking-wider truncate ${side === "home" ? "text-blue-400" : "text-red-400"}`}>{teamName}</div>
                                {teamData.formation && <div className="text-[9px] text-zinc-500 font-bold shrink-0 ml-1">{teamData.formation}</div>}
                              </div>
                              <div className="space-y-1">
                                {starters.map((p, i) => (
                                  <div key={i} className="flex items-center gap-1.5 bg-zinc-950/60 rounded px-2 py-1.5">
                                    <span className="text-[9px] font-black text-zinc-600 w-4 text-right shrink-0">{p.number || "—"}</span>
                                    <span className={`text-[9px] font-black px-1 rounded shrink-0 ${
                                      p.position === "GR" ? "bg-yellow-500/20 text-yellow-400" :
                                      p.position === "DEF" ? "bg-blue-500/20 text-blue-400" :
                                      p.position === "MEI" ? "bg-green-500/20 text-green-400" :
                                      "bg-red-500/20 text-red-400"
                                    }`}>{p.position || "?"}</span>
                                    <span className="text-[11px] text-zinc-200 font-medium truncate">{p.shortName ?? p.name}</span>
                                    {p.rating && <span className="text-[9px] text-zinc-500 ml-auto shrink-0">{p.rating.toFixed(1)}</span>}
                                  </div>
                                ))}
                                {bench.length > 0 && (
                                  <>
                                    <div className="text-[8px] text-zinc-600 font-black uppercase tracking-wider pt-1.5 pl-1">Banco</div>
                                    {bench.map((p, i) => (
                                      <div key={i} className="flex items-center gap-1.5 bg-zinc-800/30 rounded px-2 py-1">
                                        <span className="text-[9px] font-black text-zinc-700 w-4 text-right shrink-0">{p.number || "—"}</span>
                                        <span className="text-[9px] font-bold text-zinc-600 shrink-0">{p.position || "?"}</span>
                                        <span className="text-[10px] text-zinc-500 truncate">{p.shortName ?? p.name}</span>
                                      </div>
                                    ))}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Confrontos (H2H) panel */}
                {matchViewTab === "confrontos" && (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 mb-2 animate-in fade-in duration-200">
                    {confrontosLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="animate-spin text-blue-400" size={28} />
                      </div>
                    ) : !confrontosData ? (
                      <div className="text-center py-8">
                        <div className="text-zinc-600 text-2xl mb-2">⚔️</div>
                        <div className="text-zinc-500 text-sm font-medium">Histórico indisponível</div>
                        <div className="text-zinc-600 text-xs mt-1">Dados H2H não disponíveis para este jogo</div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* H2H Record */}
                        <div className="bg-zinc-950/60 rounded-lg border border-zinc-800 p-4">
                          <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-4">
                            Histórico de Confrontos Directos
                          </div>
                          <div className="grid grid-cols-3 gap-3 text-center mb-4">
                            <div>
                              <div className="text-3xl font-black text-blue-400">{confrontosData.homeWins}</div>
                              <div className="text-[10px] text-zinc-500 mt-1 truncate">{expandedMatch.home.split(" ").slice(0, 2).join(" ")}</div>
                            </div>
                            <div>
                              <div className="text-3xl font-black text-yellow-400">{confrontosData.draws}</div>
                              <div className="text-[10px] text-zinc-500 mt-1">Empates</div>
                            </div>
                            <div>
                              <div className="text-3xl font-black text-red-400">{confrontosData.awayWins}</div>
                              <div className="text-[10px] text-zinc-500 mt-1 truncate">{expandedMatch.away.split(" ").slice(0, 2).join(" ")}</div>
                            </div>
                          </div>
                          {(confrontosData.homeWins + confrontosData.draws + confrontosData.awayWins) > 0 && (() => {
                            const total = confrontosData.homeWins + confrontosData.draws + confrontosData.awayWins;
                            const homePct = Math.round(confrontosData.homeWins / total * 100);
                            const drawPct = Math.round(confrontosData.draws / total * 100);
                            const awayPct = 100 - homePct - drawPct;
                            return (
                              <div className="mt-2 space-y-1">
                                <div className="h-3 rounded-full overflow-hidden flex">
                                  {homePct > 0 && <div className="bg-blue-500 h-full transition-all" style={{ width: `${homePct}%` }} />}
                                  {drawPct > 0 && <div className="bg-yellow-400 h-full transition-all" style={{ width: `${drawPct}%` }} />}
                                  {awayPct > 0 && <div className="bg-red-500 h-full transition-all" style={{ width: `${awayPct}%` }} />}
                                </div>
                                <div className="flex justify-between text-[9px] text-zinc-600">
                                  <span>{homePct}%</span>
                                  {drawPct > 0 && <span>{drawPct}%</span>}
                                  <span>{awayPct}%</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Recent Meetings */}
                        {confrontosData.recentMeetings.length > 0 ? (
                          <div className="bg-zinc-950/60 rounded-lg border border-zinc-800 p-4">
                            <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">
                              Últimos Encontros
                            </div>
                            <div className="space-y-0">
                              {confrontosData.recentMeetings.map((m, i) => {
                                const homeWon = m.score1 > m.score2;
                                const awayWon = m.score2 > m.score1;
                                return (
                                  <div key={i} className="flex items-center gap-2 py-2 border-b border-zinc-800/40 last:border-0">
                                    <span className="text-[9px] text-zinc-600 shrink-0 w-20 tabular-nums">{m.date}</span>
                                    <span className={`flex-1 text-[11px] font-semibold truncate text-right ${homeWon ? "text-white" : "text-zinc-500"}`}>{m.team1}</span>
                                    <span className="shrink-0 font-black text-sm tabular-nums text-white bg-zinc-800 px-2 py-0.5 rounded">{m.score1} - {m.score2}</span>
                                    <span className={`flex-1 text-[11px] font-semibold truncate ${awayWon ? "text-white" : "text-zinc-500"}`}>{m.team2}</span>
                                    {m.league && <span className="text-[9px] text-zinc-600 shrink-0 max-w-[72px] truncate hidden sm:block">{m.league}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-zinc-950/60 rounded-lg border border-zinc-800 p-5 text-center">
                            <div className="text-zinc-600 text-2xl mb-2">📋</div>
                            <div className="text-zinc-500 text-sm font-medium">Histórico de partidas não disponível</div>
                            <div className="text-zinc-600 text-xs mt-1">O historial directo entre as equipas não está disponível</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Market tabs inline — only visible in markets view */}
                {matchViewTab === "markets" && (
                  <div className="px-3 pt-2 pb-4">
                    {renderMatchMarkets(expandedMatch)}
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

              const tennisOddsAsMatches: Match[] = (selectedSport === "tennis" || selectedSport === "all")
                ? tennisOddsMatches.map(o => ({
                    id: `tennis-odds-${o.matchId}`,
                    home: o.players[0].name,
                    away: o.players[1].name,
                    league: o.tournamentName,
                    sport: "tennis",
                    time: o.time,
                    date: o.date,
                    hasRealOdds: true,
                    odds: { home: o.matchOdds[0], draw: 0, away: o.matchOdds[1] },
                    markets: o.markets ?? _emptyMkt(),
                  } as Match))
                : [];

              // Convert real volleyball odds to MatchCard-compatible Match objects (O/U 3.5 sets in markets)
              const volleyOddsAsMatches: Match[] = (selectedSport === "volleyball" || selectedSport === "all")
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

              // Convert real NBA odds → Match objects with all available markets
              const basketballAsMatches: Match[] = (selectedSport === "all" || selectedSport === "basketball")
                ? basketballOddsMatches.map(o => ({
                    id: `nba-odds-${o.matchId}`,
                    home: o.homeTeam.name, away: o.awayTeam.name,
                    league: "NBA", country: "USA",
                    time: o.time, date: o.date,
                    sport: "basketball", hasRealOdds: true,
                    odds: { home: o.homeOdds, draw: 0, away: o.awayOdds },
                    markets: o.markets ?? _emptyMkt(),
                  } as Match))
                : [];

              // Convert real NHL odds → Match objects with all available markets
              const hockeyAsMatches: Match[] = (selectedSport === "all" || selectedSport === "hockey")
                ? hockeyOddsMatches.map(o => ({
                    id: `nhl-odds-${o.matchId}`,
                    home: o.homeTeam.name, away: o.awayTeam.name,
                    league: "NHL", country: "USA",
                    time: o.time, date: o.date,
                    sport: "hockey", hasRealOdds: true,
                    odds: { home: o.homeOdds, draw: o.drawOdds ?? 0, away: o.awayOdds },
                    markets: o.markets ?? _emptyMkt(),
                  } as Match))
                : [];

              // All upcoming: odds-based + all sports from /upcoming (deduped), filtered by league if active
              const allUpcoming = (() => {
                const combined = [
                  ...tennisOddsAsMatches,
                  ...volleyOddsAsMatches,
                  ...basketballAsMatches,
                  ...hockeyAsMatches,
                  ...upcomingMatches.filter(m => {
                    const sport = m.sport ?? "football";
                    if (sport === "tennis")     return !tennisOddsAsMatches.some(t => t.home === m.home && t.away === m.away);
                    if (sport === "volleyball") return !volleyOddsAsMatches.some(v => v.home === m.home && v.away === m.away);
                    if (sport === "basketball") return !basketballAsMatches.some(b => b.home === m.home && b.away === m.away);
                    if (sport === "hockey")     return !hockeyAsMatches.some(h => h.home === m.home && h.away === m.away);
                    // Football — exclude World Cup matches (dedicated Copa do Mundo page)
                    const lg = (m.league ?? "").toLowerCase();
                    const isWC = lg.includes("world cup") || lg.includes("fifa world") || lg.includes("mundial 2026") || lg.includes("wc 2026") || lg.includes("copa do mundo") || lg.includes("copa mundial");
                    return !isWC;
                  }),
                ];
                // Filter by country across all sports, preferring the explicit match country.
                if (selectedCountry) {
                  const seen2 = new Set<string>();
                  return combined
                    .filter(m => countryMatchesFilter(m.country, selectedCountry, m.league))
                    .filter(m => { const k = String(m.id); if (seen2.has(k)) return false; seen2.add(k); return true; });
                }
                if (!selectedLeague) return combined;
                // ML-aware filter: matches major-league label (from chips) OR legacy flexible matching (from sidebar)
                const _mlPats: Array<{p: string[], label: string}> = [
                  { p: ["champions league","liga dos campeões","liga campeões"], label: "Champions" },
                  { p: ["europa league","liga europa"], label: "Europa League" },
                  { p: ["conference league","liga conferência"], label: "Conference" },
                  { p: ["international friendlies","international friendly","amistosos internacionais","amistosos","friendlies","friendly"], label: "International Friendlies" },
                  { p: ["premier league"], label: "Premier League" },
                  { p: ["la liga","laliga"], label: "La Liga" },
                  { p: ["bundesliga"], label: "Bundesliga" },
                  { p: ["serie a"], label: "Serie A" },
                  { p: ["ligue 1","ligue1"], label: "Ligue 1" },
                  { p: ["primeira liga","liga portugal","liga nos","liga bwin"], label: "Primeira Liga" },
                  { p: ["eredivisie"], label: "Eredivisie" },
                  { p: ["super lig","süper lig"], label: "Süper Lig" },
                  { p: ["liga mx"], label: "Liga MX" },
                  { p: ["mls"], label: "MLS" },
                  { p: ["brasileirao","brasileirão","campeonato brasileiro"], label: "Brasileirão" },
                  { p: ["copa libertadores","libertadores"], label: "Libertadores" },
                  { p: ["fa cup"], label: "FA Cup" },
                  { p: ["copa del rey"], label: "Copa del Rey" },
                  { p: ["coppa italia"], label: "Coppa Italia" },
                  { p: ["dfb pokal","dfl pokal"], label: "DFB Pokal" },
                  { p: ["nba"], label: "NBA" },
                  { p: ["nhl"], label: "NHL" },
                  { p: ["mlb"], label: "MLB" },
                  { p: ["wimbledon"], label: "Wimbledon" },
                  { p: ["roland garros","french open"], label: "Roland Garros" },
                  { p: ["us open"], label: "US Open" },
                  { p: ["australian open"], label: "Australian Open" },
                  { p: ["atp 1000","masters 1000","rolex masters","monte-carlo","monte carlo","madrid open"], label: "ATP Masters" },
                ];
                const _fml = (n: string) => { const ln = (n ?? "").toLowerCase(); return _mlPats.find(ml => ml.p.some(p => ln.includes(p))); };
                const seen = new Set<string>();
                return combined
                  .filter(m => { const ml = _fml(m.league); return (ml && ml.label === selectedLeague) || leagueMatchesFilter(m.league, selectedLeague); })
                  .filter(m => { const k = String(m.id); if (seen.has(k)) return false; seen.add(k); return true; });
              })();

              const filteredUpcoming = selectedSport === "all" ? allUpcoming : allUpcoming.filter(m => (m.sport ?? "football") === selectedSport);
              const visibleUpcoming = filteredUpcoming.filter((m) => {
                const q = upcomingSearchQuery.trim().toLowerCase();
                if (!q) return true;
                return m.home.toLowerCase().includes(q)
                  || m.away.toLowerCase().includes(q)
                  || (m.league ?? "").toLowerCase().includes(q);
              });
              const featuredUpcoming = visibleUpcoming.slice(0, 3);
              const featuredIds = new Set(featuredUpcoming.map(m => String(m.id)));
              const listUpcoming = visibleUpcoming.filter(m => !featuredIds.has(String(m.id)));

              // Sport grouping for display
              const SPORT_GROUPS = [
                { key: "football",   emoji: "⚽", label: "Futebol" },
                { key: "tennis",     emoji: "🎾", label: "Ténis" },
                { key: "basketball", emoji: "🏀", label: "Basquete" },
                { key: "hockey",     emoji: "🏒", label: "Hóquei" },
                { key: "volleyball", emoji: "🏐", label: "Voleibol" },
              ] as const;
              const sportGroups = SPORT_GROUPS
                .map(g => ({ ...g, matches: listUpcoming.filter(m => (m.sport ?? "football") === g.key) }))
                .filter(g => g.matches.length > 0);

              // Derive tournament display label from raw API name
              const tournamentLabel = (raw: string) =>
                raw.replace(/^(Atp|Wta)\s*-\s*Singles:\s*/i, "").replace(/\s*\([^)]*\)/g, "").trim();

              return (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="relative mb-4">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                    <input
                      type="text"
                      value={upcomingSearchQuery}
                      onChange={e => setUpcomingSearchQuery(e.target.value)}
                      placeholder="Pesquisar equipa ou liga…"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-8 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/60 transition-colors"
                    />
                    {upcomingSearchQuery && (
                      <button
                        onClick={() => setUpcomingSearchQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* ─── League filter chips (grandes ligas com logos oficiais) ── */}
                  {filteredUpcoming.length > 0 && (() => {
                    if (selectedSport === "tennis") {
                      const tennisMatches = filteredUpcoming.filter(m => (m.sport ?? "football") === "tennis");
                      const seen = new Set<string>();
                      const chips = tennisMatches
                        .map(m => tournamentLabel(m.league ?? ""))
                        .filter(Boolean)
                        .filter((t) => { if (seen.has(t)) return false; seen.add(t); return true; })
                        .slice(0, 24);

                      const selectedLabel = selectedLeague ? tournamentLabel(selectedLeague) : "";
                      if (selectedLabel && !seen.has(selectedLabel)) {
                        chips.push(selectedLabel);
                        seen.add(selectedLabel);
                      }
                      if (chips.length < 2 && !selectedLabel) return null;

                      const chipMeta = (label: string): { label: string; flag: string; main: string; sub: string } => {
                        const parts = label.split(",").map(x => x.trim()).filter(Boolean);
                        const main = parts[0] ?? label;
                        const sub = parts.length > 1 ? parts.slice(1).join(", ") : "";
                        const flag = sub ? (COUNTRY_FLAGS[sub.toLowerCase()] ?? "") : "";
                        return { label, flag, main, sub };
                      };

                      return (
                        <div className="overflow-x-auto flex gap-2.5 pb-3 mb-5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                          <button
                            {...makeTap(() => setSelectedLeague(null))}
                            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border whitespace-nowrap text-sm font-semibold transition-all flex-shrink-0 ${!selectedLabel ? "border-amber-500 bg-amber-500/10 text-white shadow-[0_0_10px_rgba(245,158,11,0.18)]" : "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-zinc-500 hover:text-white"}`}
                          >
                            <span className="shrink-0">🎾</span>
                            <span>Todas</span>
                          </button>
                          {chips.map((raw, i) => {
                            const { label, flag, main, sub } = chipMeta(raw);
                            const active = selectedLabel === label;
                            return (
                              <button
                                key={i}
                                {...makeTap(() => setSelectedLeague(active ? null : label))}
                                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border whitespace-nowrap text-sm font-semibold transition-all flex-shrink-0 ${active ? "border-amber-500 bg-amber-500/10 text-white shadow-[0_0_10px_rgba(245,158,11,0.18)]" : "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-zinc-500 hover:text-white"}`}
                                title={sub ? `${main}, ${sub}` : main}
                              >
                                <span className="shrink-0">🎾</span>
                                {flag && <span className="shrink-0">{flag}</span>}
                                <span className="max-w-[180px] truncate">{main}</span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    }
                    const ML = [
                      { p: ["champions league","liga dos campeões","liga campeões"], label: "Champions", logo: "https://media.api-sports.io/football/leagues/2.png", color: "#001489" },
                      { p: ["europa league","liga europa"], label: "Europa League", logo: "https://media.api-sports.io/football/leagues/3.png", color: "#F77F00" },
                      { p: ["conference league","liga conferência"], label: "Conference", logo: "https://media.api-sports.io/football/leagues/848.png", color: "#00B386" },
                      { p: ["international friendlies","international friendly","amistosos internacionais","amistosos","friendlies","friendly"], label: "International Friendlies", logo: "https://media.api-sports.io/football/leagues/10.png", color: "#dc2626" },
                      { p: ["premier league"], label: "Premier League", logo: "https://media.api-sports.io/football/leagues/39.png", color: "#3D195B" },
                      { p: ["la liga","laliga"], label: "La Liga", logo: "https://media.api-sports.io/football/leagues/140.png", color: "#FF4B44" },
                      { p: ["bundesliga"], label: "Bundesliga", logo: "https://media.api-sports.io/football/leagues/78.png", color: "#D3010C" },
                      { p: ["serie a"], label: "Serie A", logo: "https://media.api-sports.io/football/leagues/135.png", color: "#024494" },
                      { p: ["ligue 1","ligue1"], label: "Ligue 1", logo: "https://media.api-sports.io/football/leagues/61.png", color: "#243F8B" },
                      { p: ["primeira liga","liga portugal","liga nos","liga bwin"], label: "Primeira Liga", logo: "https://media.api-sports.io/football/leagues/94.png", color: "#00924B" },
                      { p: ["eredivisie"], label: "Eredivisie", logo: "https://media.api-sports.io/football/leagues/88.png", color: "#D00000" },
                      { p: ["super lig","süper lig"], label: "Süper Lig", logo: "https://media.api-sports.io/football/leagues/203.png", color: "#E30A17" },
                      { p: ["liga mx"], label: "Liga MX", logo: "https://media.api-sports.io/football/leagues/262.png", color: "#013369" },
                      { p: ["mls"], label: "MLS", logo: "https://media.api-sports.io/football/leagues/253.png", color: "#003087" },
                      { p: ["brasileirao","brasileirão","campeonato brasileiro"], label: "Brasileirão", logo: "https://media.api-sports.io/football/leagues/71.png", color: "#009C3B" },
                      { p: ["copa libertadores","libertadores"], label: "Libertadores", logo: "https://media.api-sports.io/football/leagues/11.png", color: "#006B3F" },
                      { p: ["fa cup"], label: "FA Cup", logo: "https://media.api-sports.io/football/leagues/45.png", color: "#3C1F78" },
                      { p: ["copa del rey"], label: "Copa del Rey", logo: "https://media.api-sports.io/football/leagues/143.png", color: "#FFCC02" },
                      { p: ["coppa italia"], label: "Coppa Italia", logo: "https://media.api-sports.io/football/leagues/137.png", color: "#009246" },
                      { p: ["dfb pokal","dfl pokal"], label: "DFB Pokal", logo: "https://media.api-sports.io/football/leagues/81.png", color: "#D3010C" },
                      { p: ["nba"], label: "NBA", logo: "https://media.api-sports.io/basketball/leagues/12.png", color: "#006BB6" },
                      { p: ["nhl"], label: "NHL", logo: "https://media.api-sports.io/hockey/leagues/57.png", color: "#17468C" },
                      { p: ["mlb"], label: "MLB", logo: "https://media.api-sports.io/baseball/leagues/1.png", color: "#003087" },
                      { p: ["wimbledon"], label: "Wimbledon", logo: "https://media.api-sports.io/football/leagues/45.png", color: "#3D1F3A" },
                      { p: ["roland garros","french open"], label: "Roland Garros", logo: "https://upload.wikimedia.org/wikipedia/fr/thumb/0/0f/Roland-Garros-Logo.svg/120px-Roland-Garros-Logo.svg.png", color: "#B75A3A" },
                      { p: ["us open"], label: "US Open", logo: "https://upload.wikimedia.org/wikipedia/en/thumb/e/e8/US_Open_Logo_2017.svg/120px-US_Open_Logo_2017.svg.png", color: "#003087" },
                      { p: ["australian open"], label: "Australian Open", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Australian_Open_Logo_2017.svg/120px-Australian_Open_Logo_2017.svg.png", color: "#00AEEF" },
                      { p: ["atp 1000","masters 1000","rolex masters","monte-carlo","monte carlo","madrid open"], label: "ATP Masters", logo: "https://media.api-sports.io/football/leagues/2.png", color: "#2C5F8B" },
                    ];
                    const byLabel = new Map(ML.map(m => [m.label, m] as const));
                    const findML = (name: string) => {
                      const n = name.toLowerCase();
                      return ML.find(ml => ml.p.some(pt => n.includes(pt)));
                    };
                    const seenLabels = new Set<string>();
                    const chips: Array<{ label: string; logo: string; color: string }> = [];
                    for (const m of filteredUpcoming) {
                      const key = m.league ?? "";
                      if (key) {
                        const ml = findML(key);
                        if (ml && !seenLabels.has(ml.label)) { seenLabels.add(ml.label); chips.push({ label: ml.label, logo: ml.logo, color: ml.color }); }
                      }
                    }
                    if (selectedLeague && !seenLabels.has(selectedLeague)) {
                      const ml = byLabel.get(selectedLeague);
                      if (ml) {
                        chips.push({ label: ml.label, logo: ml.logo, color: ml.color });
                        seenLabels.add(ml.label);
                      } else {
                        chips.push({ label: selectedLeague, logo: "", color: "#dc2626" });
                        seenLabels.add(selectedLeague);
                      }
                    }
                    if (chips.length < 2 && !selectedLeague) return null;
                    return (
                      <div className="overflow-x-auto flex gap-2.5 pb-3 mb-5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {chips.length >= 2 && (
                          <button
                            {...makeTap(() => setSelectedLeague(null))}
                            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border whitespace-nowrap text-sm font-semibold transition-all flex-shrink-0 ${!selectedLeague ? "border-amber-500 bg-amber-500/10 text-white shadow-[0_0_10px_rgba(245,158,11,0.18)]" : "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-zinc-500 hover:text-white"}`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
                            <span>Todas</span>
                          </button>
                        )}
                        {chips.map((c, i) => {
                          const active = selectedLeague === c.label;
                          return (
                            <button
                              key={i}
                              {...makeTap(() => setSelectedLeague(active ? null : c.label))}
                              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border whitespace-nowrap text-sm font-semibold transition-all flex-shrink-0 ${active ? "border-amber-500 bg-amber-500/10 text-white shadow-[0_0_10px_rgba(245,158,11,0.18)]" : "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-zinc-500 hover:text-white"}`}
                            >
                              {c.logo ? (
                                <>
                                  <img
                                    src={c.logo}
                                    alt={c.label}
                                    width={20}
                                    height={20}
                                    className="rounded object-contain shrink-0"
                                    style={{ background: "transparent" }}
                                    onError={(e) => {
                                      const t = e.currentTarget;
                                      t.style.display = "none";
                                      const fb = t.nextElementSibling as HTMLElement | null;
                                      if (fb) fb.style.display = "flex";
                                    }}
                                  />
                                  <span
                                    style={{ display: "none", width: 20, height: 20, borderRadius: 4, backgroundColor: c.color + "cc", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, color: "#fff", flexShrink: 0 }}
                                  >
                                    {c.label.slice(0, 3).toUpperCase()}
                                  </span>
                                </>
                              ) : (
                                <span
                                  style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: c.color + "cc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, color: "#fff", flexShrink: 0 }}
                                >
                                  {c.label.slice(0, 3).toUpperCase()}
                                </span>
                              )}
                              <span className="max-w-[140px] truncate">{c.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {!selectedLeague && (selectedSport === "all" || selectedSport === "football") && (
                    <AnimatedCopaBanner onOpen={() => setShowWCPanel(true)} />
                  )}

                  {featuredUpcoming.length > 0 && (
                    <div className="mb-5 space-y-2">
                      {featuredUpcoming.map(match => <MatchCard key={`featured-${match.id}`} match={match} />)}
                    </div>
                  )}

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
                          const finished = (tournamentDetail?.matches ?? []).filter(m => {
                            const s = String(m.status ?? "").trim().toLowerCase();
                            return s === "finished" || s === "retired" || s === "walk over" || s === "walkover" || s === "w/o" || s === "wo";
                          }).slice().reverse();

                          const StatusBadge = ({ status }: { status: string }) => {
                            const s = String(status ?? "").trim().toLowerCase();
                            if (s === "retired") return <span className="text-[8px] font-black bg-red-900/40 text-red-400 border border-red-800/30 rounded px-1">RET</span>;
                            if (s === "walk over" || s === "walkover" || s === "w/o" || s === "wo") return <span className="text-[8px] font-black bg-zinc-800 text-zinc-500 border border-zinc-700 rounded px-1">W/O</span>;
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
                  {upcomingLoading ? (
                    <div className="space-y-3">
                      {[1,2,3,4,5,6].map(i => (
                        <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 animate-pulse">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-10 h-3 bg-zinc-700 rounded" />
                            <div className="w-24 h-3 bg-zinc-700 rounded" />
                            <div className="ml-auto w-12 h-3 bg-zinc-700 rounded" />
                          </div>
                          <div className="flex items-center justify-between mb-4">
                            <div className="w-28 h-4 bg-zinc-700 rounded" />
                            <div className="w-6 h-4 bg-zinc-800 rounded" />
                            <div className="w-28 h-4 bg-zinc-700 rounded" />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="h-10 bg-zinc-800 rounded-lg" />
                            <div className="h-10 bg-zinc-800 rounded-lg" />
                            <div className="h-10 bg-zinc-800 rounded-lg" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : visibleUpcoming.length === 0 ? (
                    <div className="py-20 text-center text-zinc-500 bg-zinc-900/50 rounded-xl border border-zinc-800">
                      <Trophy className="mx-auto mb-4 opacity-20" size={48} />
                      <p className="font-medium">
                        {upcomingSearchQuery.trim()
                          ? "Nenhum evento encontrado para a pesquisa."
                          : selectedCountry
                          ? `Nenhum evento para ${selectedCountry}.`
                          : selectedLeague
                            ? "Nenhum evento para esta liga."
                            : "Nenhum evento programado no momento."}
                      </p>
                    </div>
                  ) : (selectedLeague || selectedCountry) ? (
                    (() => {
                      // Helpers for date sorting and display
                      const dateSortKey = (d?: string): string => {
                        if (!d) return "9999-99-99";
                        if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) {
                          const [dd, mm, yyyy] = d.split(".");
                          return `${yyyy}-${mm}-${dd}`;
                        }
                        return d;
                      };
                      const formatDateHeader = (d?: string): string => {
                        if (!d) return "Data desconhecida";
                        let date: Date;
                        if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) {
                          const [dd, mm, yyyy] = d.split(".");
                          date = new Date(parseInt(yyyy!), parseInt(mm!) - 1, parseInt(dd!));
                        } else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
                          date = new Date(d);
                        } else return d;
                        const today = new Date(); today.setHours(0, 0, 0, 0);
                        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
                        date.setHours(0, 0, 0, 0);
                        if (date.getTime() === today.getTime()) return "Hoje";
                        if (date.getTime() === tomorrow.getTime()) return "Amanhã";
                        return date.toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "short" });
                      };
                      // Sort by date then time
                      const sorted = [...listUpcoming].sort((a, b) => {
                        const dk = dateSortKey(a.date).localeCompare(dateSortKey(b.date));
                        if (dk !== 0) return dk;
                        return (a.time ?? "").localeCompare(b.time ?? "");
                      });
                      // Group by date
                      const groups = new Map<string, typeof sorted>();
                      for (const m of sorted) {
                        const dk = m.date ?? "sem-data";
                        if (!groups.has(dk)) groups.set(dk, []);
                        groups.get(dk)!.push(m);
                      }
                      return (
                        <div className="space-y-6">
                          {Array.from(groups.entries()).map(([dk, matches]) => (
                            <div key={dk}>
                              <div className="flex items-center gap-3 mb-3">
                                <span className="text-sm font-black uppercase tracking-wide text-zinc-400 capitalize">
                                  {formatDateHeader(dk)}
                                </span>
                                <span className="text-[10px] font-bold bg-zinc-800 text-zinc-500 rounded px-1.5 py-0.5 tabular-nums">
                                  {matches.length}
                                </span>
                                <div className="flex-1 h-px bg-zinc-800" />
                              </div>
                              <div className="space-y-2">
                                {matches.map(match => <MatchCard key={match.id} match={match} />)}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()
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

                  {/* ─── Calendário MLB — Próximos Jogos ───────────────────── */}
                  {(selectedSport === "all" || selectedSport === "baseball") && (mlbSchedule?.upcomingMatches.length ?? 0) > 0 && !selectedLeague && (() => {
                    const upcoming = mlbSchedule!.upcomingMatches;
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
                    const fmtDate = (s: string) => {
                      const [d, m, y] = s.split(".");
                      const dt = new Date(parseInt(y!), parseInt(m!) - 1, parseInt(d!));
                      if (dt.getTime() === today.getTime()) return "Hoje";
                      if (dt.getTime() === tomorrow.getTime()) return "Amanhã";
                      return dt.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short" });
                    };
                    const normTeam = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "");
                    const mlbOddsMap = new Map<string, MLBOddsEntry>();
                    mlbOddsMatches.forEach(o => {
                      const h = normTeam(o.homeTeam.name), a = normTeam(o.awayTeam.name);
                      mlbOddsMap.set(`${o.date}-${h}-${a}`, o);
                      mlbOddsMap.set(`${o.date}-${a}-${h}`, { ...o, homeTeam: o.awayTeam, awayTeam: o.homeTeam, homeOdds: o.awayOdds, awayOdds: o.homeOdds });
                    });
                    // Only show games that have real API odds
                    const upcomingWithOdds = upcoming.filter(g => {
                      const k = `${g.date}-${normTeam(g.home)}-${normTeam(g.away)}`;
                      return mlbOddsMap.has(k);
                    });
                    if (upcomingWithOdds.length === 0) return null;
                    const byDate = upcomingWithOdds.reduce<Record<string, typeof upcoming>>((acc, m) => {
                      (acc[m.date] ??= []).push(m); return acc;
                    }, {});
                    return (
                      <div className="mb-6 mt-6">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-base font-black italic uppercase tracking-tight text-zinc-400">⚾ Beisebol</span>
                          <span className="text-[10px] font-bold bg-zinc-800 text-zinc-500 rounded px-1.5 py-0.5">{upcomingWithOdds.length}</span>
                        </div>
                        <div className="space-y-3">
                          {Object.entries(byDate).slice(0, 7).map(([date, games]) => (
                            <div key={date}>
                              <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                <span>{fmtDate(date)}</span>
                                <span className="flex-1 h-px bg-zinc-800" />
                                <span>{date.split(".").slice(0,2).join("/")}</span>
                              </div>
                              <div className="flex flex-col gap-2">
                                {games.map(g => {
                                  const oddsKey = `${g.date}-${normTeam(g.home)}-${normTeam(g.away)}`;
                                  const go = mlbOddsMap.get(oddsKey)!;
                                  const fakeMatch = {
                                    id: `mlb-cal-${g.id}`,
                                    home: g.home,
                                    away: g.away,
                                    league: "USA: MLB",
                                    country: "USA",
                                    sport: "baseball",
                                    time: g.time,
                                    date: g.date,
                                    hasRealOdds: true,
                                    odds: { home: go.homeOdds, draw: 0, away: go.awayOdds },
                                    markets: go.markets ?? _emptyMkt(),
                                  } as unknown as Match;
                                  return <MatchCard key={g.id} match={fakeMatch} />;
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ─── Calendário NBA — Próximos Jogos ───────────────────── */}
                  {false && (selectedSport === "all" || selectedSport === "basketball") && (basketballSchedule?.upcomingMatches.length ?? 0) > 0 && !selectedLeague && (() => {
                    const upcoming = basketballSchedule!.upcomingMatches;
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
                    const fmtDate = (s: string) => {
                      const [d, m, y] = s.split(".");
                      const dt = new Date(parseInt(y!), parseInt(m!) - 1, parseInt(d!));
                      if (dt.getTime() === today.getTime()) return "Hoje";
                      if (dt.getTime() === tomorrow.getTime()) return "Amanhã";
                      return dt.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
                    };
                    const normTeam = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "");
                    const nbaOddsMap = new Map<string, NBAOddsEntry>();
                    basketballOddsMatches.forEach(o => {
                      const h = normTeam(o.homeTeam.name);
                      const a = normTeam(o.awayTeam.name);
                      nbaOddsMap.set(`${o.date}-${h}-${a}`, o);
                      nbaOddsMap.set(`${o.date}-${a}-${h}`, { ...o, homeTeam: o.awayTeam, awayTeam: o.homeTeam, homeOdds: o.awayOdds, awayOdds: o.homeOdds });
                    });
                    const byDate = upcoming.reduce<Record<string, typeof upcoming>>((acc, m) => {
                      (acc[m.date] ??= []).push(m); return acc;
                    }, {});
                    const OddBtn = ({ matchId, sel, odd, label, market }: { matchId: string; sel: "home" | "away"; odd: number; label: string; market: string }) => {
                      const fakeMatch = { id: `nba-odds-${matchId}`, home: label, away: "", league: "NBA", odds: { home: 0, draw: 0, away: 0 } } as unknown as Match;
                      const selected = !!bets.find(b => b.matchId === fakeMatch.id && b.market === market && b.selection === sel);
                      return (
                        <button onClick={() => toggleBet(fakeMatch, sel, odd, market, label)}
                          className={`flex-1 flex flex-col items-center px-1 py-1 rounded text-[9px] font-black tabular-nums border transition-colors ${selected ? "bg-red-600 border-red-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"}`}>
                          <span className="text-[7px] font-bold text-zinc-500 uppercase leading-none mb-0.5">{sel === "home" ? "1" : "2"}</span>
                          <span>{odd.toFixed(2)}</span>
                        </button>
                      );
                    };
                    return (
                      <div className="mb-6 mt-6">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-base font-black italic uppercase tracking-tight text-zinc-400">🏀 Calendário NBA</span>
                          <span className="text-[10px] font-semibold text-zinc-600 normal-case italic hidden sm:block">— {basketballSchedule!.season || "Play Offs"}</span>
                          <span className="text-[10px] font-bold bg-zinc-800 text-zinc-500 rounded px-1.5 py-0.5">{upcoming.length}</span>
                          {basketballOddsMatches.length > 0 && <span className="text-[9px] font-bold text-green-600/80 bg-green-500/10 border border-green-500/20 rounded px-1.5 py-0.5">{basketballOddsMatches.length} com odds</span>}
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
                                  const go = nbaOddsMap.get(oddsKey);
                                  return (
                                    <div key={g.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 hover:border-zinc-700 transition-colors">
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs font-bold text-zinc-300 truncate">🏀 {g.home}</div>
                                          <div className="text-xs text-zinc-600 truncate">{g.away}</div>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <div className="text-[10px] font-black text-zinc-400 tabular-nums">{g.time.slice(0,5)}</div>
                                          {g.venue && <div className="text-[9px] text-zinc-700 truncate max-w-[80px]">{g.venue.split(" ").slice(0,2).join(" ")}</div>}
                                        </div>
                                      </div>
                                      {go && (
                                        <div className="flex gap-1 mt-2">
                                          <OddBtn matchId={go.matchId} sel="home" odd={go.homeOdds} label={g.home} market="Resultado" />
                                          <OddBtn matchId={go.matchId} sel="away" odd={go.awayOdds} label={g.away} market="Resultado" />
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

                  {/* ─── Calendário NHL — Próximos Jogos ───────────────────── */}
                  {false && (selectedSport === "all" || selectedSport === "hockey") && (hockeySchedule?.upcomingMatches.length ?? 0) > 0 && !selectedLeague && (() => {
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
                    const normTeam = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "");
                    const hockeyOddsMap = new Map<string, HockeyOddsEntry>();
                    hockeyOddsMatches.forEach(o => {
                      const h = normTeam(o.homeTeam.name);
                      const a = normTeam(o.awayTeam.name);
                      hockeyOddsMap.set(`${o.date}-${h}-${a}`, o);
                      hockeyOddsMap.set(`${o.date}-${a}-${h}`, { ...o, homeTeam: o.awayTeam, awayTeam: o.homeTeam, homeOdds: o.awayOdds, awayOdds: o.homeOdds });
                    });
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
                      <div className="mb-6 mt-6">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-base font-black italic uppercase tracking-tight text-zinc-400">🏒 Calendário NHL</span>
                          <span className="text-[10px] font-semibold text-zinc-600 normal-case italic hidden sm:block">— {hockeySchedule!.season || "Play Offs"}</span>
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
                </div>
              );
            })()}

            {!expandedMatch && activeTab === "live" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="mb-4">
                  <h2 className="text-2xl font-black italic uppercase tracking-tight flex items-center gap-2">
                    <Activity className="text-red-600" /> Ao Vivo
                    {liveMatches.length > 0 && (() => {
                      const nLive = liveMatches.filter(m => m.startsIn === undefined).length;
                      const nSoon = liveMatches.filter(m => m.startsIn !== undefined).length;
                      return (
                        <span className="text-sm font-normal text-zinc-400 ml-1">
                          ({nLive > 0 ? `${nLive} ao vivo` : ""}
                          {nLive > 0 && nSoon > 0 ? " · " : ""}
                          {nSoon > 0 ? `${nSoon} em breve` : ""})
                        </span>
                      );
                    })()}
                  </h2>
                </div>

                {/* ── Search bar ── */}
                {liveMatches.length > 0 && (
                  <div className="relative mb-3">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                    <input
                      type="text"
                      value={liveSearchQuery}
                      onChange={e => setLiveSearchQuery(e.target.value)}
                      placeholder="Pesquisar equipa ou liga…"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-8 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/60 transition-colors"
                    />
                    {liveSearchQuery && (
                      <button
                        onClick={() => setLiveSearchQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )}

                {/* ── Sport filter bar ── */}
                {liveMatches.length > 0 && (() => {
                  const sportsMeta: { key: string; label: string; icon: string }[] = [
                    { key: "all",        label: "Todos",     icon: "⚡" },
                    { key: "football",   label: "Futebol",   icon: "⚽" },
                    { key: "basketball", label: "Basquete",  icon: "🏀" },
                    { key: "tennis",     label: "Ténis",     icon: "🎾" },
                    { key: "hockey",     label: "Hóquei",    icon: "🏒" },
                    { key: "baseball",   label: "Basebol",   icon: "⚾" },
                    { key: "volleyball", label: "Voleibol",  icon: "🏐" },
                  ];
                  const presentSports = new Set(liveMatches.map(m => m.sport ?? "football"));
                  const visible = sportsMeta.filter(s => s.key === "all" || presentSports.has(s.key));
                  if (visible.length <= 2) return null; // only show if there's real choice
                  return (
                    <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-none">
                      {visible.map(s => {
                        const active = liveSportFilter === s.key;
                        return (
                          <button
                            key={s.key}
                            {...makeTap(() => setLiveSportFilter(s.key))}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                              active
                                ? "bg-red-600 border-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.4)]"
                                : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white"
                            }`}
                          >
                            <span>{s.icon}</span>
                            <span>{s.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {(() => {
                  const filterBySport = (m: Match) => {
                    const bySport = liveSportFilter === "all" || (m.sport ?? "football") === liveSportFilter;
                    const q = liveSearchQuery.trim().toLowerCase();
                    const bySearch = !q || m.home.toLowerCase().includes(q) || m.away.toLowerCase().includes(q) || (m.league ?? "").toLowerCase().includes(q);
                    return bySport && bySearch;
                  };
                  const actualLive = liveMatches.filter(m => m.startsIn === undefined && filterBySport(m));
                  const emBreve = liveMatches.filter(m => m.startsIn !== undefined && filterBySport(m));
                  if (liveLoading && liveMatches.length === 0) {
                    return (
                      <div className="space-y-3 py-2">
                        {[1,2,3,4,5,6].map(i => (
                          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 animate-pulse">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-10 h-3 bg-zinc-700 rounded" />
                              <div className="w-24 h-3 bg-zinc-700 rounded" />
                              <div className="ml-auto w-12 h-3 bg-zinc-700 rounded" />
                            </div>
                            <div className="flex items-center justify-between mb-4">
                              <div className="w-28 h-4 bg-zinc-700 rounded" />
                              <div className="w-6 h-4 bg-zinc-800 rounded" />
                              <div className="w-28 h-4 bg-zinc-700 rounded" />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="h-10 bg-zinc-800 rounded-lg" />
                              <div className="h-10 bg-zinc-800 rounded-lg" />
                              <div className="h-10 bg-zinc-800 rounded-lg" />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  if (liveMatches.length === 0) {
                    return (
                      <div className="py-20 text-center text-zinc-500 bg-zinc-900/50 rounded-xl border border-zinc-800">
                        <Activity className="mx-auto mb-4 opacity-20" size={48} />
                        <p className="font-medium">Nenhum jogo ao vivo no momento.</p>
                        <p className="text-sm mt-1">Volte em breve para acompanhar as partidas em tempo real.</p>
                      </div>
                    );
                  }
                  if (actualLive.length === 0 && emBreve.length === 0) {
                    return (
                      <div className="py-12 text-center text-zinc-500 bg-zinc-900/50 rounded-xl border border-zinc-800">
                        <p className="font-medium">Nenhum jogo deste desporto ao vivo.</p>
                        <button {...makeTap(() => setLiveSportFilter("all"))} className="mt-3 text-sm text-red-500 hover:text-red-400 underline">
                          Ver todos os desportos
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-5">
                      {actualLive.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                            <span className="text-xs font-bold text-red-500 uppercase tracking-wider">Ao Vivo Agora</span>
                            <span className="text-xs text-zinc-600">({actualLive.length})</span>
                          </div>
                          {actualLive.map(match => <LiveMatchCard key={match.id} match={match} />)}
                        </div>
                      )}
                      {emBreve.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 mb-3">
                            <Clock size={12} className="text-amber-400" />
                            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Em Breve</span>
                            <span className="text-xs text-zinc-600">({emBreve.length})</span>
                          </div>
                          {emBreve.map(match => <LiveMatchCard key={match.id} match={match} />)}
                        </div>
                      )}
                    </div>
                  );
                })()}
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
                      {[...myBets].reverse().map(bet => {
                        const isWon = bet.status === "won";
                        const isCO = bet.status === "cashed_out";
                        const isPending = bet.status === "pending";
                        const isVoided = bet.status === "voided";
                        const previewStatus = isPending ? (bet.statusPreview ?? "pending") : null;
                        const credit = isWon
                          ? parseFloat(bet.potentialWin)
                          : isCO && bet.cashoutValue
                          ? parseFloat(bet.cashoutValue)
                          : isVoided
                          ? parseFloat(bet.stake)
                          : null;
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
                                  <span className={`font-semibold ${
                                    isWon ? "text-green-500"
                                    : isCO ? "text-yellow-500"
                                    : isPending
                                      ? previewStatus === "won" ? "text-green-500"
                                        : previewStatus === "lost" ? "text-red-500"
                                        : previewStatus === "void" ? "text-blue-400"
                                        : "text-zinc-400"
                                      : isVoided ? "text-blue-400"
                                      : "text-red-500"
                                  }`}>
                                    {isWon
                                      ? "Ganhou"
                                      : isCO
                                        ? "Cash Out"
                                        : isPending
                                          ? previewStatus === "won"
                                            ? "A liquidar — Ganha"
                                            : previewStatus === "lost"
                                              ? "A liquidar — Perdida"
                                              : previewStatus === "void"
                                                ? "A liquidar — Anulada"
                                                : "Pendente"
                                          : isVoided
                                            ? "Anulada"
                                            : "Perdeu"}
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
                <h2 className="text-2xl font-black italic uppercase tracking-tight mb-5 flex items-center gap-2">
                  <History className="text-red-600" /> Minhas Apostas
                </h2>

                {/* Tabs */}
                <div className="flex border-b border-zinc-800 mb-5">
                  {(["abertas", "resolvidas", "cashout", "anuladas"] as const).map((t) => {
                    const cnt =
                      t === "abertas" ? myBets.filter(b => b.status === "pending").length
                      : t === "cashout" ? myBets.filter(b => b.status === "cashed_out").length
                      : t === "anuladas" ? myBets.filter(b => b.status === "voided").length
                      : myBets.filter(b => b.status === "won" || b.status === "lost").length;
                    const lbl =
                      t === "abertas" ? "Abertas"
                      : t === "cashout" ? "Cash Out"
                      : t === "anuladas" ? "Anuladas"
                      : "Resolvidas";
                    return (
                      <button key={t} onClick={() => setBetFilterTab(t)}
                        className={`px-4 py-2.5 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${betFilterTab === t ? "border-red-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
                        {lbl}
                        {cnt > 0 && <span className="bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-black leading-none">{cnt}</span>}
                      </button>
                    );
                  })}
                </div>

                {myBetsLoading && !myBetsInitialized.current ? (
                  <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-red-600" size={32} /></div>
                ) : (() => {
                  const filtered = myBets.filter(b =>
                    betFilterTab === "abertas"
                      ? b.status === "pending"
                      : betFilterTab === "cashout"
                        ? b.status === "cashed_out"
                        : betFilterTab === "anuladas"
                          ? b.status === "voided"
                          : (b.status === "won" || b.status === "lost")
                  );
                  if (filtered.length === 0) return (
                    <div className="py-20 text-center text-zinc-500 bg-zinc-900/50 rounded-xl border border-zinc-800">
                      <Trophy className="mx-auto mb-4 opacity-20" size={48} />
                      <p className="font-medium">
                        {betFilterTab === "abertas"
                          ? "Sem apostas abertas."
                          : betFilterTab === "cashout"
                            ? "Sem apostas em Cash Out."
                            : betFilterTab === "anuladas"
                              ? "Sem apostas anuladas."
                              : "Sem apostas resolvidas."}
                      </p>
                      {betFilterTab === "abertas" && <p className="text-sm mt-1">Escolha um jogo e faça sua primeira aposta!</p>}
                    </div>
                  );
                  return (
                    <div className="space-y-4">
                      {filtered.map(bet => {
                        const sels = getBetSelections(bet);
                        const isMultiple = sels.length > 1;
                        const isPending = bet.status === "pending";
                        const isWon = bet.status === "won";
                        const isLost = bet.status === "lost";
                        const isCashedOut = bet.status === "cashed_out";
                        const isVoided = bet.status === "voided";
                        const ticketCode = `BT62-${String(bet.id).padStart(6, "0")}`;
                        const betDate = new Date(bet.createdAt);
                        const dateStr = betDate.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
                        const timeStr = betDate.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
                        const settledAt = bet.settledAt ? new Date(bet.settledAt) : null;
                        const settledDateStr = settledAt ? settledAt.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;
                        const settledTimeStr = settledAt ? settledAt.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) : null;
                        const settlementMins = typeof bet.settlementSeconds === "number" ? Math.max(0, Math.round(bet.settlementSeconds / 60)) : null;
                        const previewStatus = isPending ? (bet.statusPreview ?? "pending") : null;

                        const isActivePending = isPending;
                        // Card & text colours
                        const cardBg   = isLost ? "bg-[#7b1111]" : "bg-white";
                        const selsBg   = isLost ? "bg-[#8f1616]" : "bg-white";
                        const divider  = isLost ? "divide-[#a02020]/50" : "divide-gray-100";
                        const txtMain  = isLost ? "text-white"     : "text-gray-900";
                        const txtSub   = isLost ? "text-red-200"   : "text-gray-500";
                        const summBg   = isLost ? "bg-[#6b0f0f]/60 border-[#a02020]/40" : "bg-gray-50 border-gray-100";
                        const summDiv  = isLost ? "divide-[#a02020]/30" : "divide-gray-100";
                        const summTxt  = isLost ? "text-red-100"   : "text-gray-600";

                        return (
                          <div key={bet.id} className={`rounded-2xl overflow-hidden shadow-xl ${cardBg}`} style={{ boxShadow: isLost ? "0 8px 32px rgba(120,0,0,0.5)" : "0 4px 20px rgba(0,0,0,0.35)" }}>

                            {/* ── HEADER ── */}
                            <div className="bg-red-700 px-5 py-4 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="bg-white/20 rounded-xl p-2 shrink-0">
                                  <ListOrdered size={20} className="text-white" />
                                </div>
                                <div>
                                  <div className="font-black text-white text-[17px] leading-tight italic">Boletim de Aposta</div>
                                  <div className="flex items-center gap-1.5 text-red-200 text-[11px] font-medium mt-0.5">
                                    <CalendarDays size={11} />
                                    {dateStr} • {timeStr}
                                  </div>
                                  {!isPending && settledAt && (
                                    <div className="text-red-100 text-[11px] font-medium mt-0.5">
                                      Liquidada: {settledDateStr} • {settledTimeStr}{settlementMins !== null ? ` (${settlementMins} min)` : ""}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {isActivePending && (
                                <div className="w-9 h-9 bg-white/25 border-2 border-white/60 rounded-full flex items-center justify-center shrink-0">
                                  <Check size={18} className="text-white" strokeWidth={3} />
                                </div>
                              )}
                              {isWon && (
                                <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center shrink-0 shadow-lg">
                                  <Check size={18} className="text-red-600" strokeWidth={3} />
                                </div>
                              )}
                              {isLost && (
                                <div className="w-9 h-9 bg-white/20 border-2 border-white/40 rounded-full flex items-center justify-center shrink-0">
                                  <X size={18} className="text-white" strokeWidth={3} />
                                </div>
                              )}
                              {isCashedOut && (
                                <div className="w-9 h-9 bg-yellow-400 rounded-full flex items-center justify-center shrink-0 shadow-lg">
                                  <CircleDollarSign size={18} className="text-yellow-900" />
                                </div>
                              )}
                            </div>

                            {/* ── SELECTIONS HEADER ── */}
                            <div className={`px-5 pt-4 pb-2 flex items-center gap-2 ${isLost ? "bg-[#8f1616]" : "bg-gray-50 border-b border-gray-100"}`}>
                              <ListOrdered size={13} className={txtSub} />
                              <span className={`text-[11px] font-black uppercase tracking-widest ${txtSub}`}>Seleções</span>
                            </div>

                            {/* ── SELECTIONS LIST ── */}
                            <div className={`${selsBg} divide-y ${divider}`}>
                              {sels.map((sel, i) => {
                                const outcome = getSelOutcome(sel, bet.status);
                                const displayedSelOdd = outcome === "void" ? 1 : Number(sel.odd);
                                const lm = isActivePending ? findLiveMatchForSel(sel) : null;
                                const liveOdd = lm ? getLiveOddForSel(sel, lm) : null;
                                const isSelectionLive = !!lm && (
                                  lm.isLive === true
                                  || (!!lm.status && !["Not Started", "Encerrado", "Finished"].includes(lm.status))
                                );
                                const displayMin = lm
                                  ? (lm.status === "HT"
                                    ? "HT"
                                    : lm.sport === "tennis"
                                      ? (lm.status ?? "Em Jogo")
                                      : `${lm.minute ?? 0}'`)
                                  : null;

                                // Per-selection left icon
                                let leftIcon: ReactNode;
                                if (isLost) {
                                  leftIcon = outcome === "void"
                                    ? <div className="w-6 h-6 rounded-full bg-zinc-700/40 border border-white/20 flex items-center justify-center shrink-0"><span className="text-white text-[11px] font-black leading-none">—</span></div>
                                    : outcome === "green"
                                    ? <div className="w-6 h-6 rounded-full bg-white/30 flex items-center justify-center shrink-0"><Check size={13} className="text-white" strokeWidth={3} /></div>
                                    : outcome === "red"
                                    ? <div className="w-6 h-6 rounded-full bg-red-950/60 border border-white/20 flex items-center justify-center shrink-0"><X size={13} className="text-white" strokeWidth={2.5} /></div>
                                    : <div className="w-6 h-6 rounded-full bg-zinc-800/60 border border-white/20 flex items-center justify-center shrink-0"><Clock size={13} className="text-white" /></div>;
                                } else if (isWon) {
                                  leftIcon = outcome === "void"
                                    ? <div className="w-6 h-6 rounded-full bg-zinc-200 border border-zinc-300 flex items-center justify-center shrink-0"><span className="text-zinc-600 text-[11px] font-black leading-none">—</span></div>
                                    : <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shrink-0"><Check size={13} className="text-white" strokeWidth={3} /></div>;
                                } else if (isCashedOut) {
                                  leftIcon = <div className="w-6 h-6 rounded-full bg-yellow-500/70 flex items-center justify-center shrink-0"><CircleDollarSign size={11} className="text-white" /></div>;
                                } else {
                                  if (outcome === "live-win") {
                                    leftIcon = <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shrink-0"><Check size={13} className="text-white" strokeWidth={3} /></div>;
                                  } else if (outcome === "live-lose") {
                                    leftIcon = <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center shrink-0"><X size={13} className="text-white" strokeWidth={2.5} /></div>;
                                  } else if (outcome === "void") {
                                    leftIcon = <div className="w-6 h-6 rounded-full bg-zinc-200 border border-zinc-300 flex items-center justify-center shrink-0"><span className="text-zinc-600 text-[11px] font-black leading-none">—</span></div>;
                                  } else {
                                    const storedSport = String(sel.sport ?? "").trim().toLowerCase();
                                    const mkt = String(sel.market ?? "").trim();
                                    const mt  = (sel.matchTitle ?? "").toLowerCase();
                                    const ticketSport =
                                      storedSport ||
                                      (mkt === "quartos" || (mkt === "totais" && mt.includes("nba")) ? "basketball"
                                        : mkt === "periodos" || mkt === "puckLine" || mt.includes("nhl") ? "hockey"
                                        : mkt === "innings" || mt.includes("mlb") ? "baseball"
                                        : mkt === "sets" || mt.includes("volei") || mt.includes("volley") ? "volleyball"
                                        : mkt === "jogos" || mt.includes("tennis") || mt.includes("tênis") ? "tennis"
                                        : "football");
                                    leftIcon = <span className="text-xl shrink-0 leading-none">{sportEmoji(ticketSport)}</span>;
                                  }
                                }

                                // Final score for resolved bets
                                const normT = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
                                const [th = "", ta = ""] = (sel.matchTitle ?? "").split(" vs ");
                                const fsKey = `${normT(th)}-${normT(ta)}`;
                                const fs = sel.finalScore ?? (!isActivePending ? finishedMatchScores.current.get(fsKey) : null);

                                return (
                                  <div key={i} className="px-5 py-3.5 flex items-start gap-3">
                                    {leftIcon}
                                    <div className="flex-1 min-w-0">
                                      <div className={`font-bold text-[13px] leading-snug ${txtMain}`}>
                                        {i + 1}. {sel.matchTitle}
                                      </div>
                                      <div className={`text-[11px] mt-0.5 ${txtSub}`}>{getSelLabel(sel)}</div>
                                      {(() => {
                                        const when = (() => {
                                          const d = (sel as any).scheduledDate ?? (sel as any).date;
                                          const t = (sel as any).scheduledTime ?? (sel as any).time;
                                          if (d && t) return `${d} • ${t}`;
                                          return t || d || null;
                                        })();
                                        const lg = (sel as any).league as string | undefined;
                                        if (!lg && !when) return null;
                                        return (
                                          <div className={`text-[10px] mt-0.5 ${txtSub} truncate`}>
                                            {[lg, when].filter(Boolean).join(" • ")}
                                          </div>
                                        );
                                      })()}
                                      {/* Live / upcoming badge */}
                                      {isSelectionLive && (
                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                          <span className="flex items-center gap-1 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                                            Ao vivo <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse ml-0.5" />
                                          </span>
                                          <span className="text-[11px] font-black text-gray-700 tabular-nums">{displayMin} • {lm.homeScore ?? 0}–{lm.awayScore ?? 0}</span>
                                          {liveOdd !== null && Math.abs(liveOdd - sel.odd) > 0.01 && (
                                            <span className={`text-[10px] font-bold ${liveOdd < sel.odd ? "text-green-500" : "text-red-500"}`}>
                                              {liveOdd < sel.odd ? "▼" : "▲"} {liveOdd.toFixed(2)}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      {lm && !isSelectionLive && (
                                        <div className="flex items-center gap-2 mt-1.5">
                                          <span className="flex items-center gap-1 bg-zinc-700 text-zinc-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                                            <Clock size={9} />
                                            {formatMatchWhen(lm) ?? (lm.scheduledTime ?? lm.time ?? "Em breve")}
                                          </span>
                                        </div>
                                      )}
                                      {/* Final score */}
                                      {fs && (
                                        <div className={`text-[11px] mt-1 font-semibold ${txtSub}`}>
                                          Resultado: {fs.home} - {fs.away}
                                        </div>
                                      )}
                                      {sel.settlementNote && (
                                        <div className="mt-1.5 inline-flex max-w-full rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold leading-snug text-amber-700">
                                          {sel.settlementNote}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                      <div className="bg-red-600 text-white font-black text-[13px] px-3 py-1 rounded-lg tabular-nums">
                                        {Number.isFinite(displayedSelOdd) ? displayedSelOdd.toFixed(2) : "1.00"}
                                      </div>
                                      {isWon && (
                                        <span className="text-[10px] font-black text-green-600 flex items-center gap-0.5">{sportEmoji(sel.sport)} VENCIDO</span>
                                      )}
                                      {isActivePending && outcome === "live-win" && (
                                        <span className="text-[10px] font-black text-green-600">VENCIDO</span>
                                      )}
                                      {isActivePending && outcome === "live-lose" && (
                                        <span className="text-[10px] font-black text-red-600">PERDIDO</span>
                                      )}
                                      {outcome === "void" && (
                                        <span className="text-[10px] font-black text-zinc-500">ANULADA</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* ── SUMMARY BOX ── */}
                            <div className={`mx-4 my-4 rounded-xl border divide-y ${summBg} ${summDiv}`}>
                              {[
                                {
                                  label: "Tipo de aposta:",
                                  value: isMultiple ? "Múltipla" : "Simples",
                                  valueCls: "text-red-500 font-bold",
                                },
                                {
                                  label: "Total de odds:",
                                  value: parseFloat(bet.totalOdds).toFixed(2),
                                  valueCls: `font-semibold ${txtMain}`,
                                },
                                {
                                  label: "Valor apostado:",
                                  value: `€${parseFloat(bet.stake).toFixed(2)}`,
                                  valueCls: `font-semibold ${txtMain}`,
                                },
                                {
                                  label: isWon ? "Ganho confirmado:" : isCashedOut ? "Cash Out recebido:" : isLost ? "Retorno:" : isVoided ? "Reembolso:" : "Retorno potencial:",
                                  value: isLost
                                    ? "€0,00"
                                    : isVoided
                                    ? `€${parseFloat(bet.stake).toFixed(2)}`
                                    : isCashedOut && bet.cashoutValue
                                    ? `€${parseFloat(bet.cashoutValue).toFixed(2)}`
                                    : `€${parseFloat(bet.potentialWin).toFixed(2)}`,
                                  valueCls: isWon ? "font-black text-green-600 text-base" : isCashedOut ? "font-black text-yellow-600 text-base" : isLost ? "font-bold text-red-100" : isVoided ? "font-black text-blue-300 text-base" : `font-black ${txtMain}`,
                                },
                                ...(!isPending ? (() => {
                                  const net =
                                    typeof bet.netProfit === "string" && !Number.isNaN(parseFloat(bet.netProfit))
                                      ? parseFloat(bet.netProfit)
                                      : null;
                                  if (net === null) return [];
                                  const cls =
                                    net > 0 ? "font-black text-green-600 text-base"
                                    : net < 0 ? (isLost ? "font-black text-red-100 text-base" : "font-black text-red-600 text-base")
                                    : isVoided ? "font-black text-blue-300 text-base" : `font-black ${txtMain}`;
                                  const sign = net > 0 ? "+" : "";
                                  return [{
                                    label: "Lucro/Prejuízo:",
                                    value: `${sign}€${net.toFixed(2)}`,
                                    valueCls: cls,
                                  }];
                                })() : []),
                              ].map(({ label, value, valueCls }, ri) => (
                                <div key={ri} className={`flex items-center justify-between px-4 py-3 text-sm ${summTxt}`}>
                                  <span>{label}</span>
                                  <span className={valueCls}>{value}</span>
                                </div>
                              ))}
                            </div>

                            {/* ── CASH OUT BUTTON ── */}
                            {isActivePending ? (
                              bet.cashoutStatus === "available" ? (
                                cashoutExpandedId === bet.id ? (
                                <div className="mx-4 mb-4 rounded-2xl bg-green-600 px-5 py-4 flex items-center gap-3">
                                  <CircleDollarSign size={20} className="text-white shrink-0" />
                                  <div className="flex-1">
                                    <span className="text-[11px] text-green-100 block leading-none mb-0.5">Cash Out estimado</span>
                                    <span className="font-black text-white text-lg leading-none">€ {cashoutEstimate(bet)}</span>
                                  </div>
                                  <button onClick={() => setCashoutExpandedId(null)} disabled={cashingOut === bet.id} className="text-green-100 hover:text-white text-xs px-3 py-1.5 rounded-lg transition-colors">Cancelar</button>
                                  <button onClick={() => handleCashout(bet)} disabled={cashingOut === bet.id}
                                    className="bg-white text-green-700 font-black text-sm px-4 py-2 rounded-xl flex items-center gap-1.5 disabled:opacity-50">
                                    {cashingOut === bet.id ? <Loader2 size={13} className="animate-spin" /> : "CONFIRMAR"}
                                  </button>
                                </div>
                                ) : (
                                <button onClick={() => setCashoutExpandedId(bet.id)} disabled={cashingOut === bet.id}
                                  className="mx-4 mb-4 w-[calc(100%-2rem)] bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-black text-[15px] py-4 rounded-2xl flex items-center justify-center gap-2.5 transition-colors shadow-lg shadow-red-900/40 disabled:opacity-50">
                                  <RefreshCw size={18} />
                                  Cash Out disponível
                                </button>
                                )
                              ) : bet.cashoutStatus === "suspended" ? (
                                <div className="mx-4 mb-4 bg-gray-100 text-gray-500 font-bold text-[14px] py-4 rounded-2xl flex items-center justify-center gap-2 cursor-not-allowed select-none">
                                  <Lock size={15} />
                                  Cash Out suspenso{bet.cashoutReason ? ` — ${bet.cashoutReason}` : ""}
                                </div>
                              ) : (
                                <div className="mx-4 mb-4 bg-gray-100 text-gray-400 font-bold text-[14px] py-4 rounded-2xl flex items-center justify-center gap-2 cursor-not-allowed select-none">
                                  <Lock size={15} />
                                  Cash Out indisponível
                                </div>
                              )
                            ) : isCashedOut || isWon ? (
                              <div className="mx-4 mb-4 bg-gray-100 text-gray-400 font-bold text-[14px] py-4 rounded-2xl flex items-center justify-center gap-2 cursor-not-allowed select-none">
                                <Lock size={15} />
                                Cash Out encerrado
                              </div>
                            ) : isLost ? (
                              <div className="mx-4 mb-4 bg-[#6b0f0f]/60 border border-[#a02020]/50 text-red-300/70 font-bold text-[14px] py-4 rounded-2xl flex items-center justify-center gap-2 cursor-not-allowed select-none">
                                <RefreshCw size={15} className="opacity-40" />
                                Cash Out indisponível
                                <Lock size={13} className="ml-auto mr-0 opacity-40" />
                              </div>
                            ) : null}

                            {/* ── FOOTER ── */}
                            <div className={`flex items-center justify-between px-5 py-3.5 ${isLost ? "bg-[#6b0f0f]" : "bg-red-700"}`}>
                              <div className="flex items-center gap-2.5">
                                <Ticket size={16} className="text-white/60 shrink-0" />
                                <div>
                                  <span className="text-[9px] text-white/50 block leading-none font-medium uppercase tracking-wide">Código do bilhete:</span>
                                  <button
                                    onClick={() => { navigator.clipboard.writeText(ticketCode); toast.success("Código copiado!"); }}
                                    className="text-[13px] font-black text-white font-mono hover:text-red-200 transition-colors">
                                    {ticketCode}
                                  </button>
                                </div>
                              </div>
                              <div>
                                {isActivePending && (
                                  <div className="flex items-center gap-1.5 bg-white/20 text-white text-[11px] font-bold px-3 py-1.5 rounded-full">
                                    <ShieldCheck size={13} /> Aposta confirmada
                                  </div>
                                )}
                                {isWon && (
                                  <div className="flex items-center gap-1.5 bg-white/25 text-white text-[11px] font-bold px-3 py-1.5 rounded-full">
                                    <Trophy size={13} /> Bilhete vencedor
                                  </div>
                                )}
                                {isLost && (
                                  <div className="flex items-center gap-1.5 bg-red-950/60 border border-white/20 text-white/80 text-[11px] font-bold px-3 py-1.5 rounded-full">
                                    <X size={13} /> Bilhete perdido
                                  </div>
                                )}
                                {isCashedOut && (
                                  <div className="flex items-center gap-1.5 bg-yellow-400 text-yellow-900 text-[11px] font-bold px-3 py-1.5 rounded-full">
                                    <CircleDollarSign size={13} /> Cash Out
                                  </div>
                                )}
                              </div>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </main>

        {/* DESKTOP BET SLIP */}
        <aside className="hidden lg:block w-96 border-l border-zinc-900 bg-zinc-950 sticky top-16 h-[calc(100vh-4rem)]">
          {BetSlipContent()}
        </aside>
      </div>

      {/* ── MOBILE BET SLIP ── collapsed bar + full-screen overlay */}

      {/* 1. Collapsed bar — slides up when bets are added, hidden when full-screen is open */}
      <AnimatePresence>
        {bets.length > 0 && !betSlipOpenMobile && (
          <motion.div
            key="betslip-bar"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
            className="lg:hidden fixed left-0 right-0 z-[55] px-3"
            style={{
              bottom: showAppBanner
                ? "calc(5.5rem + env(safe-area-inset-bottom, 0px))"
                : "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
            }}
            {...makeTap(() => setBetSlipOpenMobile(true))}
          >
            <div
              className="rounded-2xl px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform cursor-pointer select-none"
              style={{
                background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)",
                boxShadow: "0 6px 28px rgba(220,38,38,0.5), 0 2px 8px rgba(0,0,0,0.6)",
              }}
            >
              {/* Count badge */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm text-white shrink-0"
                style={{ background: "rgba(255,255,255,0.18)" }}
              >
                {bets.length}
              </div>
              {/* Selections info */}
              <div className="flex-1 min-w-0">
                <div className="text-white/60 text-[10px] truncate leading-tight">
                  {bets.map(b => b.label).join(" · ")}
                </div>
                <div className="text-white font-bold text-[13px] leading-snug">
                  {effectiveBetMode === "multipla"
                    ? `Múltipla (${bets.length})`
                    : `Simples (${bets.length})`}
                </div>
              </div>
              {/* Odds badge — amber, like reference */}
              <div className="rounded-xl px-3 py-2 shrink-0" style={{ background: "#f59e0b" }}>
                <span className="font-black text-black text-[17px] leading-none tabular-nums">{totalOdds}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Full-screen bet slip overlay */}
      <AnimatePresence>
        {betSlipOpenMobile && (
          <motion.div
            key="betslip-fullscreen"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            className="lg:hidden fixed inset-0 z-[60] flex flex-col"
            style={{ background: "#0f0f0f", paddingTop: "env(safe-area-inset-top, 0px)" }}
          >
            {/* Top bar */}
            <div
              className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/80 shrink-0"
              style={{ background: "#0a0a0a" }}
            >
              <button
                {...makeTap(() => setBetSlipOpenMobile(false))}
                className="w-9 h-9 flex items-center justify-center rounded-full"
                style={{ background: "rgba(255,255,255,0.07)" }}
              >
                <ChevronDown size={20} className="text-white" />
              </button>

              {/* Stake summary pill */}
              <div
                className="flex items-center gap-1.5 rounded-full px-4 py-1.5"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <Plus size={12} className="text-zinc-400" />
                <span className="text-white font-bold text-[13px] tabular-nums">
                  {effectiveBetMode === "simples"
                    ? `${bets.reduce((s, b) => s + parseFloat(betStakes[betKey(b)] || "0"), 0).toFixed(2)} €`
                    : `${parseFloat(stake || "0").toFixed(2)} €`}
                </span>
              </div>

              {/* Clear all */}
              <button
                {...makeTap(() => { setBets([]); setBetStakes({}); setStake(""); setBetSlipOpenMobile(false); })}
                className="w-9 h-9 flex items-center justify-center rounded-full"
                style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)" }}
              >
                <Trash2 size={16} className="text-red-500" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-800 shrink-0" style={{ background: "#0a0a0a" }}>
              <button
                {...makeTap(() => { if (!hasDuplicateMatches) setBetMode("simples"); })}
                className={`flex-1 py-3 text-[13px] font-bold transition-all ${effectiveBetMode === "simples" ? "text-white border-b-2 border-red-600" : "text-zinc-500"}`}
              >
                Simples
              </button>
              <button
                {...makeTap(() => { if (!hasDuplicateMatches) setBetMode("multipla"); })}
                disabled={hasDuplicateMatches}
                className={`flex-1 py-3 text-[13px] font-bold transition-all ${effectiveBetMode === "multipla" ? "text-white border-b-2 border-red-600" : hasDuplicateMatches ? "text-zinc-700" : "text-zinc-500"}`}
              >
                Múltipla ({bets.length})
              </button>
            </div>

            {/* Scrollable bet cards */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              <AnimatePresence>
                {bets.map((bet) => {
                  const nowMs = Date.now();
                  const lmatch = liveMatches.find(m => String(m.id) === String(bet.matchId));
                  const mkt = bet.market ?? "result";
                  const isSusp = lmatch?.marketSuspension
                    ? ((lmatch.marketSuspension[mkt] ?? 0) > nowMs || (lmatch.marketSuspension["result"] ?? 0) > nowMs)
                    : false;
                  return (
                    <motion.div
                      key={`fs-${bet.matchId}-${bet.market}-${bet.selection}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="relative rounded-2xl overflow-hidden"
                      style={{
                        background: isSusp ? "rgba(120,53,15,0.25)" : "rgba(255,255,255,0.04)",
                        border: isSusp ? "1px solid rgba(245,158,11,0.35)" : "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {isSusp && (
                        <div className="absolute inset-0 flex items-center justify-center z-10 backdrop-blur-[2px] rounded-2xl" style={{ background: "rgba(0,0,0,0.55)" }}>
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black animate-pulse" style={{ background: "#f59e0b", color: "#000" }}>
                            <Lock size={10} /> ODDS SUSPENSAS
                          </div>
                        </div>
                      )}
                      <div className="px-4 py-3">
                        {/* Match header + remove */}
                        <div className="flex items-start justify-between mb-1.5">
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wider truncate" style={{ color: "#dc2626" }}>
                              {bet.matchTitle.split(" vs ")[0]?.trim()}
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate">{bet.matchTitle}</div>
                          </div>
                          <button
                            {...makeTap(() => removeBet(bet.matchId, bet.market || "result", bet.selection))}
                            className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 z-20"
                            style={{ background: "rgba(220,38,38,0.15)" }}
                          >
                            <X size={11} className="text-red-400" />
                          </button>
                        </div>
                        {/* Selection + odd */}
                        <div className="flex items-center justify-between">
                          <div className="flex-1 pr-3">
                            <div className="text-white font-bold text-[14px] leading-tight">{bet.label}</div>
                            <div className="text-zinc-600 text-[11px] mt-0.5">Seleção</div>
                          </div>
                          <span
                            className="font-black text-[22px] leading-none shrink-0"
                            style={{ color: isSusp ? "#f59e0b" : "#dc2626" }}
                          >
                            {bet.odd.toFixed(2)}
                          </span>
                        </div>
                        {/* Simples: individual stake */}
                        {effectiveBetMode === "simples" && (
                          <div className="mt-3">
                            <div className="flex gap-1.5 mb-1.5">
                              {[5, 10, 25, 50].map(amt => (
                                <button
                                  key={amt}
                                  {...makeTap(() => setBetStakes(prev => ({ ...prev, [betKey(bet)]: String(amt) })))}
                                  className="flex-1 py-1 rounded-lg text-[11px] font-bold transition-all"
                                  style={parseFloat(betStakes[betKey(bet)] || "0") === amt
                                    ? { background: "#dc2626", color: "#fff" }
                                    : { background: "rgba(255,255,255,0.05)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.07)" }}
                                >
                                  €{amt}
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center rounded-xl overflow-hidden" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                              <span className="pl-3 text-zinc-500 text-sm font-bold">€</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="Outro valor"
                                value={betStakes[betKey(bet)] || ""}
                                onChange={e => {
                                  const v = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
                                  setBetStakes(prev => ({ ...prev, [betKey(bet)]: v }));
                                }}
                                onFocus={e => {
                                  const el = e.currentTarget;
                                  setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 350);
                                }}
                                className="flex-1 bg-transparent text-white text-sm font-mono px-2 py-2 outline-none placeholder-zinc-600"
                              />
                              {parseFloat(betStakes[betKey(bet)] || "0") > 0 && (
                                <span className="pr-3 text-[12px] font-bold" style={{ color: "#22c55e" }}>
                                  → €{(parseFloat(betStakes[betKey(bet)] || "0") * bet.odd).toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Footer: stake input + summary + CTA */}
            <div
              className="px-4 pt-3 shrink-0 border-t border-zinc-800"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 1rem))", background: "#0a0a0a" }}
            >
              {/* Múltipla: Montante input + odds badge */}
              {effectiveBetMode === "multipla" && (
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="flex-1 flex items-center rounded-xl overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    <span className="pl-3 text-zinc-600 text-sm shrink-0">Montante</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={stake}
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
                        setStake(v);
                      }}
                      onFocus={e => {
                        const el = e.currentTarget;
                        setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 350);
                      }}
                      className="flex-1 bg-transparent text-white font-mono px-2 py-3 outline-none placeholder-zinc-700 text-sm text-right"
                    />
                    <span className="pr-3 text-zinc-600 text-sm shrink-0">€</span>
                  </div>
                  <div className="rounded-xl px-3 py-2.5 shrink-0" style={{ background: "#f59e0b" }}>
                    <span className="font-black text-black text-[17px] leading-none tabular-nums">{totalOdds}</span>
                  </div>
                </div>
              )}

              {/* Ganhos possíveis */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-zinc-500 text-sm">Ganhos possíveis</span>
                <span className="font-bold text-[15px]" style={{ color: "#22c55e" }}>
                  {effectiveBetMode === "simples"
                    ? `${simplesPotential} €`
                    : `${(parseFloat(stake || "0") * parseFloat(totalOdds)).toFixed(2)} €`}
                </span>
              </div>

              {/* APOSTAR button */}
              <button
                {...makeTap(handlePlaceBet)}
                disabled={isPlacingBet}
                className="w-full h-13 rounded-2xl font-black text-[15px] text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg,#dc2626 0%,#991b1b 100%)",
                  boxShadow: "0 4px 20px rgba(220,38,38,0.4)",
                }}
              >
                {isPlacingBet
                  ? <><Loader2 className="animate-spin" size={16} /> A PROCESSAR...</>
                  : auth.user ? "APOSTAR" : "ENTRAR PARA APOSTAR"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MOBILE APP DOWNLOAD BANNER */}
      <AnimatePresence>
        {showAppBanner && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
            className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-2 pointer-events-none"
          >
            <div className="pointer-events-auto max-w-lg mx-auto bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl shadow-black/60 p-4 flex items-center gap-3">
              <div className="flex-shrink-0 w-11 h-11 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/40">
                <Smartphone size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white leading-tight">Bet62 na tua bolso</p>
                <p className="text-xs text-zinc-400 mt-0.5 leading-tight">Apostas ao vivo, notificações e muito mais — disponível para iOS e Android.</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href="https://apps.apple.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => { localStorage.setItem("bet62_app_banner_dismissed", "1"); setShowAppBanner(false); }}
                  className="flex flex-col items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-lg px-2.5 py-1.5 transition-colors"
                >
                  <span className="text-[9px] text-zinc-400 leading-none">Disponível na</span>
                  <span className="text-[11px] font-bold text-white leading-tight">App Store</span>
                </a>
                <a
                  href="https://play.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => { localStorage.setItem("bet62_app_banner_dismissed", "1"); setShowAppBanner(false); }}
                  className="flex flex-col items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-lg px-2.5 py-1.5 transition-colors"
                >
                  <span className="text-[9px] text-zinc-400 leading-none">Obtém no</span>
                  <span className="text-[11px] font-bold text-white leading-tight">Google Play</span>
                </a>
                <button
                  onClick={() => { localStorage.setItem("bet62_app_banner_dismissed", "1"); setShowAppBanner(false); }}
                  className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors ml-1"
                  aria-label="Fechar"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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


      {/* AUTH MODAL */}
      {authModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4" onClick={() => setAuthModalOpen(false)}>
          <div className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 text-white rounded-xl overflow-hidden max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setAuthModalOpen(false)}
              className="absolute right-3 top-3 w-8 h-8 rounded-full bg-zinc-900/80 hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors z-10"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>

            <div className="bg-zinc-900 p-6 border-b border-zinc-800 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-red-600/10 blur-xl"></div>
              <div className="relative font-black text-3xl tracking-tighter italic">
                <span className="text-white">BET</span><span className="text-red-600">62</span>
              </div>
            </div>

            <div className="grid grid-cols-2 bg-zinc-950 border-b border-zinc-800">
              <button
                onClick={() => setAuthMode("login")}
                className={`py-4 text-sm font-bold uppercase transition-colors border-b-2 ${authMode === "login" ? "bg-zinc-900 text-white border-red-600" : "text-zinc-400 border-transparent hover:text-white"}`}
              >
                Entrar
              </button>
              <button
                onClick={() => setAuthMode("register")}
                className={`py-4 text-sm font-bold uppercase transition-colors border-b-2 ${authMode === "register" ? "bg-zinc-900 text-white border-red-600" : "text-zinc-400 border-transparent hover:text-white"}`}
              >
                Criar Conta
              </button>
            </div>

            <div className="p-6">
              {authMode === "login" ? (
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
              ) : (
                <form onSubmit={handleRegisterSubmit} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-name" className="text-sm">Nome Completo</Label>
                    <Input id="reg-name" type="text" placeholder="Seu nome completo" className="bg-zinc-900 border-zinc-800 text-white" required value={regName} onChange={e => setRegName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-nif" className="text-sm">NIF</Label>
                      <Input
                        id="reg-nif"
                        type="text"
                        inputMode="numeric"
                        placeholder="999 999 999"
                        required
                        maxLength={11}
                        value={regNif}
                        onChange={e => setRegNif(nifMask(e.target.value))}
                        className={`bg-zinc-900 text-white transition-colors ${
                          regNif.replace(/\s/g, "").length === 9
                            ? validatePortugueseNif(regNif.replace(/\s/g, ""))
                              ? "border-green-600 focus-visible:ring-green-600"
                              : "border-red-500 focus-visible:ring-red-500"
                            : "border-zinc-800"
                        }`}
                      />
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
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── DEPOSIT / WITHDRAW MODAL ──────────────────────────── */}
      <DepositWithdrawModal
        open={depositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        onSuccess={() => { auth.refreshUser(); }}
        onPromoNotif={(type) => { setDepositModalOpen(false); setTimeout(() => setPromoNotif({ type }), 350); }}
        onAuthInvalid={(message) => {
          auth.invalidateSession(message ?? "Sessão expirada. Entre novamente para continuar.");
          setAuthMode("login");
          setAuthModalOpen(true);
          setDepositModalOpen(false);
        }}
        balance={auth.user ? parseFloat(auth.user.balance) : 0}
        token={auth.token}
        kycStatus={auth.user?.kycStatus ?? "not_submitted"}
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
              {promoNotif.type === "freebets10" && (
                <>
                  <img src="https://images.unsplash.com/photo-1553481187-be93c21490a9?q=80&w=800&auto=format&fit=crop" className="absolute inset-0 w-full h-full object-cover scale-105" alt="Promoção Free Bet — deposite €10 e ganhe €5 em apostas grátis" />
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-600/85 to-black/95" />
                  <div className="relative z-10 p-8 text-center">
                    <div className="text-5xl mb-3">🎁</div>
                    <div className="inline-block px-3 py-1 rounded-full bg-white/15 text-xs font-black tracking-widest text-white mb-4">FREE BET ATIVADA</div>
                    <h2 className="text-3xl font-black text-white leading-tight mb-2">Parabéns!</h2>
                    <p className="text-white/90 text-base mb-1">Está a participar na promoção</p>
                    <p className="text-violet-300 font-black text-xl mb-4">DEPOSITE €10 → GANHE €5</p>
                    <div className="bg-white/10 border border-white/20 rounded-2xl p-4 mb-6">
                      <div className="text-4xl font-black text-violet-300 mb-1">€5</div>
                      <div className="text-sm text-white/70">em Free Bets creditados na sua conta</div>
                    </div>
                    <p className="text-white/60 text-xs leading-relaxed mb-6">Complete apostas qualificadas com odds ≥ 2.50 para utilizar as suas free bets.</p>
                    <Button onClick={() => setPromoNotif(null)} className="w-full bg-violet-500 hover:bg-violet-600 text-white font-black h-12">COMEÇAR A APOSTAR</Button>
                  </div>
                </>
              )}
              {promoNotif.type === "freebets20" && (
                <>
                  <img src="https://images.unsplash.com/photo-1521412644187-c49fa049e84d?q=80&w=800&auto=format&fit=crop" className="absolute inset-0 w-full h-full object-cover scale-105" alt="Promoção Free Bet — deposite €20 e ganhe €10 em apostas grátis" />
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/85 to-black/95" />
                  <div className="relative z-10 p-8 text-center">
                    <div className="text-5xl mb-3">🎉</div>
                    <div className="inline-block px-3 py-1 rounded-full bg-white/15 text-xs font-black tracking-widest text-white mb-4">FREE BET ATIVADA</div>
                    <h2 className="text-3xl font-black text-white leading-tight mb-2">Parabéns!</h2>
                    <p className="text-white/90 text-base mb-1">Está a participar na promoção</p>
                    <p className="text-emerald-300 font-black text-xl mb-4">DEPOSITE €20 → GANHE €10</p>
                    <p className="text-white/70 text-sm leading-relaxed mb-6">Complete 4 apostas qualificadas com odds ≥ 2.00 e stake mínima de €2 para receber os seus €10 em free bets.</p>
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
                  <img src="https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=800&auto=format&fit=crop" className="absolute inset-0 w-full h-full object-cover scale-105" alt="Bónus de boas-vindas — 100% no primeiro depósito duplicado" />
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
                  <img src="https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=800&auto=format&fit=crop" className="absolute inset-0 w-full h-full object-cover scale-105" alt="Cashback semanal — recupere 10% das suas perdas em apostas" />
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

      {/* ─── WIN ANIMATION ─────────────────────────────────────────── */}
      <AnimatePresence>
        {winAnim && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center"
            style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.97) 100%)" }}
            onClick={() => setWinAnim(null)}
          >
            {/* confetti pieces */}
            {Array.from({ length: 36 }).map((_, i) => {
              const colors = ["#ef4444","#f59e0b","#22c55e","#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316"];
              const color = colors[i % colors.length]!;
              const left = `${5 + (i * 97 % 90)}%`;
              const delay = (i * 0.07) % 0.9;
              const size = 6 + (i % 5) * 3;
              return (
                <motion.div
                  key={i}
                  className="absolute rounded-sm"
                  style={{ left, top: "-10px", width: size, height: size, background: color, originX: "50%", originY: "50%" }}
                  animate={{ y: ["0vh", "105vh"], rotate: [0, 360 + i * 30], opacity: [1, 0.7, 0] }}
                  transition={{ duration: 2.2 + (i % 5) * 0.3, delay, ease: "easeIn", repeat: 1, repeatDelay: 0.5 }}
                />
              );
            })}

            {/* central card */}
            <motion.div
              initial={{ scale: 0.4, y: 80, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              className="relative z-10 rounded-3xl border border-white/20 shadow-[0_0_80px_rgba(34,197,94,0.45)] overflow-hidden max-w-sm w-full mx-4"
              style={{ background: "linear-gradient(135deg, #0a2a0a 0%, #052010 50%, #0a1a0a 100%)" }}
              onClick={e => e.stopPropagation()}
            >
              <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 50% 0%, #22c55e 0%, transparent 70%)" }} />
              <div className="relative z-10 p-8 text-center">
                <motion.div
                  animate={{ scale: [1, 1.2, 1], rotate: [0, -8, 8, -4, 0] }}
                  transition={{ duration: 0.7, delay: 0.3 }}
                  className="text-7xl mb-4 select-none"
                >🏆</motion.div>
                <div className="inline-block px-3 py-1 rounded-full bg-green-500/20 border border-green-500/40 text-green-400 text-xs font-black tracking-widest mb-4">APOSTA GANHA</div>
                <h2 className="text-4xl font-black text-white mb-1">Parabéns!</h2>
                <p className="text-zinc-400 text-sm mb-5 truncate px-2">{winAnim.title}</p>
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.4, type: "spring", stiffness: 400 }}
                  className="rounded-2xl border border-green-500/30 bg-green-500/10 p-5 mb-6"
                >
                  <div className="text-5xl font-black text-green-400 mb-1">€ {winAnim.amount.toFixed(2)}</div>
                  <div className="text-green-600 text-sm font-bold">creditado na sua conta</div>
                </motion.div>
                <Button onClick={() => setWinAnim(null)} className="w-full bg-green-600 hover:bg-green-500 text-white font-black h-12 text-base rounded-xl">
                  CONTINUAR A APOSTAR
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── CASHOUT ANIMATION ─────────────────────────────────────── */}
      <AnimatePresence>
        {cashoutAnim && (
          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="fixed bottom-6 left-1/2 z-[300] w-[340px] max-w-[calc(100vw-2rem)]"
            style={{ translateX: "-50%" }}
            onClick={() => setCashoutAnim(null)}
          >
            <div
              className="rounded-2xl border border-emerald-500/40 shadow-[0_8px_40px_rgba(16,185,129,0.35)] overflow-hidden"
              style={{ background: "linear-gradient(135deg, #052018 0%, #041510 100%)" }}
            >
              <motion.div
                className="h-1 bg-emerald-500 origin-left"
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 3, ease: "linear" }}
              />
              <div className="flex items-center gap-4 px-5 py-4">
                <motion.div
                  animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="text-3xl shrink-0 select-none"
                >💰</motion.div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black tracking-widest text-emerald-400 uppercase mb-0.5">Cash Out Realizado</div>
                  <div className="text-2xl font-black text-white">€ {cashoutAnim.amount.toFixed(2)}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">adicionado ao seu saldo</div>
                </div>
                <button onClick={() => setCashoutAnim(null)} className="text-zinc-600 hover:text-white shrink-0 p-1">
                  <X size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── BET PLACED ANIMATION ───────────────────────────────────────── */}
      <AnimatePresence>
        {betPlacedAnim && (
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="fixed bottom-24 left-1/2 z-[300] pointer-events-none"
            style={{ translateX: "-50%" }}
          >
            <div
              className="rounded-2xl border border-red-500/30 shadow-[0_8px_40px_rgba(220,38,38,0.25)] px-6 py-4 flex flex-col items-center gap-2 min-w-[200px]"
              style={{ background: "linear-gradient(135deg, #1a0505 0%, #0d0d0d 100%)" }}
            >
              {/* progress bar draining */}
              <motion.div
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600 origin-left rounded-b-2xl"
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 2.5, ease: "linear" }}
              />
              {/* swaying crossed-fingers emoji */}
              <motion.div
                className="text-5xl select-none"
                animate={{
                  rotate: [0, -18, 18, -14, 14, -8, 8, -4, 4, 0],
                  y: [0, -6, 0, -4, 0, -2, 0],
                }}
                transition={{ duration: 1.4, ease: "easeInOut", times: [0, 0.1, 0.25, 0.38, 0.5, 0.63, 0.75, 0.85, 0.93, 1] }}
              >
                🤞
              </motion.div>
              <div className="text-sm font-black text-white tracking-wide">Boa sorte!</div>
              <div className="text-xs text-zinc-500">Aposta registada com sucesso</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

// ─── PROMO CARD 3D ─────────────────────────────────────────────────────────
type PromoItem = {
  id: string; title: string; subtitle: string; description: string;
  badge: string; image: string; gradient: string;
  highlight: string; highlightLabel: string;
  terms: string[]; cta: string; action: () => void;
  cornerIcon?: string; alwaysActive?: boolean;
  /** Optional PNG overlay (e.g. transparent trophy) rendered on top-right of the card */
  overlayImg?: string;
};

function PromoCard3D({
  promo, index, isLoggedIn, cashbackData,
}: {
  promo: PromoItem;
  index: number;
  isLoggedIn: boolean;
  cashbackData: { totalLost: number; cashback: number; bets: number } | null;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });
  const [hovered, setHovered] = useState(false);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = cardRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setTilt({ x: (y - 0.5) * -9, y: (x - 0.5) * 11 });
    setGlare({ x: x * 100, y: y * 100, opacity: 0.11 });
  };

  const onLeave = () => {
    setTilt({ x: 0, y: 0 });
    setGlare({ x: 50, y: 50, opacity: 0 });
    setHovered(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.07, ease: [0.23, 1, 0.32, 1] }}
      style={{ perspective: 1100 }}
    >
      <motion.div
        ref={cardRef}
        onMouseMove={onMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={onLeave}
        animate={{ rotateX: tilt.x, rotateY: tilt.y }}
        style={{ transformStyle: "preserve-3d" }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="relative overflow-hidden rounded-[28px] min-h-[280px] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      >
        {/* Background image */}
        <motion.img
          src={promo.image}
          alt={promo.title}
          className="absolute inset-0 w-full h-full object-cover"
          animate={{ scale: hovered ? 1.09 : 1.03 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
        />

        {/* Colour overlays */}
        <div className={`absolute inset-0 bg-gradient-to-r ${promo.gradient}`} />
        <div className="absolute inset-0 bg-black/52" />

        {/* Optional transparent overlay image (e.g. trophy without background) */}
        {promo.overlayImg && (
          <motion.img
            src={promo.overlayImg}
            alt=""
            className="absolute right-4 bottom-0 pointer-events-none select-none"
            style={{
              height: 220,
              width: "auto",
              objectFit: "contain",
              filter: "drop-shadow(0 0 28px rgba(255,185,0,0.80)) drop-shadow(0 0 60px rgba(255,100,0,0.40))",
              opacity: 0.95,
            }}
            animate={{ y: hovered ? -10 : 0, rotate: hovered ? 3 : 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          />
        )}

        {/* Dynamic glare */}
        <div
          className="absolute inset-0 pointer-events-none z-20 rounded-[28px]"
          style={{
            background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,${glare.opacity}) 0%, transparent 52%)`,
          }}
        />

        {/* Top rim light */}
        <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent pointer-events-none" />

        {/* Corner icon (e.g. 🔥 for Boost card) */}
        {promo.cornerIcon && (
          <div className="absolute top-4 right-4 z-30 text-4xl leading-none pointer-events-none select-none drop-shadow-2xl"
            style={{ filter: "drop-shadow(0 0 12px rgba(255,100,0,0.8))" }}>
            {promo.cornerIcon}
          </div>
        )}

        {/* Content */}
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
            <motion.button
              onClick={isLoggedIn || promo.id === "superodds" || promo.alwaysActive ? promo.action : () => {}}
              className="mt-5 px-6 py-3 rounded-2xl bg-white text-black font-black text-sm tracking-wide shadow-lg"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
            >
              {!isLoggedIn && promo.id !== "superodds" && !promo.alwaysActive ? "ENTRAR PARA ATIVAR" : promo.cta}
            </motion.button>
          </div>

          <div className="hidden lg:flex flex-col items-center shrink-0">
            <motion.div
              className="bg-white/10 backdrop-blur-2xl border border-white/15 rounded-[24px] px-7 py-5 text-center min-w-[140px]"
              animate={{ scale: hovered ? 1.08 : 1, y: hovered ? -5 : 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 24 }}
            >
              <div className="text-white/50 text-[10px] font-bold mb-1 uppercase tracking-widest">Promoção Ativa</div>
              <div className="text-5xl font-black text-white leading-none">{promo.highlight}</div>
              <div className="mt-2 text-emerald-300 font-semibold text-xs">{promo.highlightLabel}</div>
            </motion.div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      </motion.div>
    </motion.div>
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
  const [, navigate] = useLocation();
  useEffect(() => { onFetchCashback(); }, []);

  const promos = [
    {
      id: "worldcup",
      title: "FIFA WORLD CUP 2026",
      subtitle: "CANADA · MÉXICO · USA — COMEÇA 11 JUN",
      description: "A maior Copa do Mundo da história com 48 seleções. Aposte em todos os grupos, oitavas, quartas e finais com odds exclusivas.",
      badge: "🏆 COPA DO MUNDO",
      image: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=1400&auto=format&fit=crop",
      overlayImg: trophyImg,
      gradient: "from-yellow-500/60 via-orange-600/40 to-purple-800/55",
      highlight: "48",
      highlightLabel: "seleções · 104 jogos",
      terms: ["Disponível para todos os utilizadores.", "Odds ao vivo durante a Copa.", "Mercados: 1X2, Golos, Especiais.", "Apostas combinadas com boost disponíveis."],
      cta: "VER JOGOS DA COPA",
      alwaysActive: true,
      action: () => navigate("/copa-do-mundo"),
    },
    {
      id: "boost6x",
      title: "BOOST 6% NA MÚLTIPLA",
      subtitle: "6 SELEÇÕES · QUALQUER ESPORTE",
      description: "Faça Múltiplas de 6 jogos e ganhe 6% extra na sua múltipla. Quanto mais seleções, maior o boost — até 100% de bónus!",
      badge: "MÚLTIPLA BOOST",
      image: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?q=80&w=1400&auto=format&fit=crop",
      gradient: "from-orange-500/60 to-red-700/60",
      highlight: "+6%",
      highlightLabel: "na múltipla de 6",
      terms: ["Mínimo de 6 seleções na múltipla.", "Odds mínimas de 1.50 por seleção.", "Boost automático calculado no momento.", "Válido em todos os esportes da plataforma."],
      cta: "APOSTAR MÚLTIPLA",
      cornerIcon: "🔥",
      alwaysActive: true,
      action: () => {},
    },
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
      id: "freebets10",
      title: "DEPOSITE €10 E GANHE €5",
      subtitle: "FREE BETS PARA COMEÇAR",
      description: "Deposite apenas €10 e receba €5 em free bets para explorar as melhores apostas da plataforma.",
      badge: "FREE BET",
      image: "https://images.unsplash.com/photo-1553481187-be93c21490a9?q=80&w=1400&auto=format&fit=crop",
      gradient: "from-violet-500/60 to-purple-800/60",
      highlight: "€5",
      highlightLabel: "em free bets",
      terms: ["Depósito mínimo de €10.", "Free bets creditadas automaticamente.", "Odds mínimas qualificadas: 2.50.", "Free bets válidas por 7 dias."],
      cta: "DEPOSITAR €10",
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
      terms: ["Depósito mínimo de €20.", "4 apostas qualificadas obrigatórias.", "Odds mínimas de 2.00.", "Stake mínima de €2 por aposta.", "Free bets válidas por 7 dias."],
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
    <div className="bg-[#050816] min-h-[60vh]">
      {/* ── Section header ── */}
      <div className="relative overflow-hidden px-4 sm:px-6 pt-7 pb-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(220,38,38,0.13),transparent_65%)] pointer-events-none" />
        <div
          className="absolute inset-0 opacity-[0.025] pointer-events-none"
          style={{ backgroundImage: "repeating-linear-gradient(90deg,white 0,white 1px,transparent 0,transparent 100%)", backgroundSize: "44px 44px" }}
        />
        <div className="relative max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 bg-red-600/15 text-red-400 text-[10px] font-black tracking-[0.22em] px-4 py-2 rounded-full border border-red-500/25 mb-4">
              <Gift size={11} /> PROMOÇÕES EXCLUSIVAS
            </span>
            <h1 className="text-white font-black text-2xl sm:text-3xl tracking-tight">
              Ofertas{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-yellow-400">
                Especiais
              </span>
            </h1>
            <p className="text-white/45 text-sm mt-2">Aproveite os melhores bónus do mercado</p>
          </motion.div>
        </div>
      </div>

      {/* ── 3D Promo cards ── */}
      <div className="px-4 sm:px-6 pb-8">
        <div className="max-w-5xl mx-auto space-y-5">
          {promos.map((promo, index) => (
            <PromoCard3D
              key={promo.id}
              promo={promo}
              index={index}
              isLoggedIn={isLoggedIn}
              cashbackData={cashbackData}
            />
          ))}
        </div>
      </div>

      {/* ── Terms ── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-10">
        <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-white/5 backdrop-blur-2xl px-6 py-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.10),transparent_40%)] pointer-events-none" />
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
type CardIntentResponse = { orderId?: string; clientSecret?: string | null; publishableKey?: string | null; error?: string };

function CardDepositInlineForm({
  orderId,
  onSucceeded,
  onProcessing,
}: {
  orderId: string;
  onSucceeded: () => void;
  onProcessing: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/api/payments/card-return?orderId=${encodeURIComponent(orderId)}`,
        },
        redirect: "if_required",
      });

      if (result.error) {
        toast.error(result.error.message ?? "Erro ao confirmar pagamento por cartão.");
        return;
      }

      if (result.paymentIntent?.status === "succeeded") {
        toast.success("Pagamento por cartão confirmado. O saldo será atualizado automaticamente.");
        onSucceeded();
        return;
      }

      if (result.paymentIntent?.status === "processing" || result.paymentIntent?.status === "requires_capture") {
        toast.info("Pagamento em processamento. O saldo será atualizado automaticamente.");
        onProcessing();
        return;
      }

      toast.info("Confirmação adicional necessária. Complete a autenticação do banco.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="rounded-xl border border-zinc-700 bg-zinc-950/70 p-3">
        <PaymentElement
          options={{
            layout: "tabs",
            fields: {
              billingDetails: {
                address: "never",
                email: "auto",
                name: "auto",
                phone: "never",
              },
            },
          }}
        />
      </div>
      <Button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-11 gap-2"
      >
        {submitting ? <Loader2 className="animate-spin" size={16} /> : <Lock size={16} />}
        Confirmar Pagamento Seguro
      </Button>
    </form>
  );
}

function DepositWithdrawModal({
  open, onClose, onSuccess, onPromoNotif, onAuthInvalid, balance, token, kycStatus,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onPromoNotif: (type: "freebets10" | "freebets20") => void;
  onAuthInvalid: (message?: string) => void;
  balance: number;
  token: string | null;
  kycStatus: string;
}) {
  const [payMethod, setPayMethod] = useState<PayMethod>("multibanco");
  const [depositAmount, setDepositAmount] = useState("");
  const [mbwayPhone, setMbwayPhone] = useState("");
  const [loading, setLoading] = useState(false);

  // Per-method result states
  const [mbRef, setMbRef] = useState<MbRef | null>(null);
  const [mbwayDone, setMbwayDone] = useState(false);
  const [mbwayOrderId, setMbwayOrderId] = useState<string | null>(null);
  const [mbwayConfirmed, setMbwayConfirmed] = useState(false);
  const [cardClientSecret, setCardClientSecret] = useState<string | null>(null);
  const [cardOrderId, setCardOrderId] = useState<string | null>(null);
  const [cardPublishableKey, setCardPublishableKey] = useState<string | null>(null);
  const [cardPreparedAmount, setCardPreparedAmount] = useState<number | null>(null);

  // Main tab: deposit vs withdraw
  const [mainTab, setMainTab] = useState<"deposit" | "withdraw">("deposit");

  // Withdrawal form
  const [wAmount, setWAmount] = useState("");
  const [wIban, setWIban] = useState("");
  const [wName, setWName] = useState("");
  const [wNif, setWNif] = useState("");
  const [wDone, setWDone] = useState(false);

  // KYC form (shown before withdrawal when not submitted)
  const [kycDocType, setKycDocType] = useState<"cc" | "passport">("cc");
  const [kycDocNumber, setKycDocNumber] = useState("");
  const [kycNif, setKycNif] = useState("");
  const [kycDone, setKycDone] = useState(false);
  const needsKyc = kycStatus === "not_submitted" && !kycDone;

  const amount = parseFloat(depositAmount.replace(",", "."));
  const amountValid = !isNaN(amount) && amount >= 10 && amount <= 5000;
  const promoHint = amountValid && amount >= 20;
  const isInvalidTokenError = (status?: number, error?: string) => {
    const normalizedError = String(error ?? "").trim().toLowerCase();
    return status === 401 || normalizedError.includes("invalid token") || normalizedError.includes("jwt");
  };
  const stripePromise = useMemo(
    () => (cardPublishableKey ? loadStripe(cardPublishableKey) : null),
    [cardPublishableKey],
  );
  const stripeElementsOptions = useMemo<StripeElementsOptions | undefined>(() => {
    if (!cardClientSecret) return undefined;
    return {
      clientSecret: cardClientSecret,
      appearance: {
        theme: "night",
        variables: {
          colorPrimary: "#10b981",
          colorBackground: "#09090b",
          colorText: "#ffffff",
          colorDanger: "#ef4444",
          borderRadius: "12px",
        },
      },
    };
  }, [cardClientSecret]);

  const METHODS: { id: PayMethod; label: string; logo: string; logo2?: string }[] = [
    { id: "multibanco", label: "Multibanco", logo: "/logo-multibanco.png" },
    { id: "mbway",      label: "MB WAY",     logo: "/logo-mbway.png"      },
    { id: "card",       label: "Cartão",     logo: "/logo-visa.png", logo2: "/logo-mastercard.png" },
  ];

  // Poll MB WAY payment confirmation (every 5s, up to 4 minutes)
  useEffect(() => {
    if (!mbwayOrderId || mbwayConfirmed) return;
    const poll = async () => {
      try {
        const r = await fetch(`/api/payments/status/${mbwayOrderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return;
        const data = await r.json() as { status: string; amount: string };
        if (data.status === "completed") {
          setMbwayConfirmed(true);
          setMbwayOrderId(null);
          toast.success(`Pagamento MB WAY confirmado! € ${parseFloat(data.amount).toFixed(2)} adicionado ao seu saldo.`);
          onSuccess();
        }
      } catch { /* non-critical */ }
    };
    const id = setInterval(poll, 5000);
    const timeout = setTimeout(() => clearInterval(id), 4 * 60 * 1000);
    return () => { clearInterval(id); clearTimeout(timeout); };
  }, [mbwayOrderId, mbwayConfirmed, token, onSuccess]);

  // Poll Multibanco payment confirmation (every 15s while reference is displayed)
  useEffect(() => {
    if (!mbRef?.orderId) return;
    const poll = async () => {
      try {
        const r = await fetch(`/api/payments/status/${mbRef.orderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return;
        const data = await r.json() as { status: string; amount: string };
        if (data.status === "completed") {
          toast.success(`Pagamento Multibanco confirmado! € ${parseFloat(data.amount).toFixed(2)} adicionado ao seu saldo.`);
          onSuccess();
          setMbRef(null);
          onClose();
        }
      } catch { /* non-critical */ }
    };
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, [mbRef?.orderId, token, onSuccess, onClose]);

  function resetCardFlow() {
    setCardClientSecret(null);
    setCardOrderId(null);
    setCardPreparedAmount(null);
  }

  function resetMethod(m: PayMethod) {
    setPayMethod(m);
    setMbRef(null);
    setMbwayDone(false);
    setMbwayOrderId(null);
    setMbwayConfirmed(false);
    resetCardFlow();
  }

  async function handleKycSubmit() {
    if (!kycDocNumber.trim() || kycDocNumber.trim().length < 5) { toast.error("Número de documento inválido."); return; }
    if (kycNif && !/^\d{9}$/.test(kycNif)) { toast.error("NIF inválido. Deve ter 9 dígitos."); return; }
    setLoading(true);
    try {
      const r = await fetch("/api/profile/kyc/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ documentType: kycDocType, documentNumber: kycDocNumber.trim(), nif: kycNif }),
      });
      const data = await r.json() as { kycStatus?: string; error?: string };
      if (!r.ok) {
        if (isInvalidTokenError(r.status, data.error)) { onAuthInvalid("Sessão expirada. Entre novamente para continuar."); return; }
        toast.error(data.error ?? "Erro ao submeter documentos.");
        return;
      }
      setKycDone(true);
      onSuccess();
      toast.success("Documentos submetidos! A verificação será feita em 1-2 dias úteis.");
    } catch { toast.error("Erro de ligação. Tente novamente."); }
    finally { setLoading(false); }
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
      const data = await r.json() as { withdrawal?: { id: number }; error?: string; code?: string };
      if (!r.ok) {
        if (isInvalidTokenError(r.status, data.error)) { onAuthInvalid("Sessão expirada. Entre novamente para continuar."); return; }
        toast.error(data.error ?? "Erro ao submeter pedido.");
        return;
      }
      setWDone(true);
      onSuccess();
      toast.success("Pedido de levantamento submetido! Processado em 2-5 dias úteis.");
    } catch { toast.error("Erro de ligação. Tente novamente."); }
    finally { setLoading(false); }
  }

  function triggerPromoNotif(depositAmount: number) {
    if (depositAmount >= 20) onPromoNotif("freebets20");
    else if (depositAmount >= 10) onPromoNotif("freebets10");
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
      if (!r.ok) {
        if (isInvalidTokenError(r.status, data.error)) { onAuthInvalid("Sessão expirada. Entre novamente para continuar."); return; }
        toast.error(data.error ?? "Erro ao gerar referência.");
        return;
      }
      if (!data.entity || !data.reference || !data.expiresAt || !data.orderId || !data.amount) {
        toast.error("A Stripe não devolveu a entidade e referência Multibanco.");
        return;
      }
      setMbRef({ entity: data.entity!, reference: data.reference!, amount: data.amount!, expiresAt: data.expiresAt!, orderId: data.orderId! });
      toast.success("Referência Multibanco gerada! Pague em qualquer ATM.");
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
      const data = await r.json() as { orderId?: string; amount?: string; status?: string; message?: string; error?: string };
      if (!r.ok) {
        if (isInvalidTokenError(r.status, data.error)) { onAuthInvalid("Sessão expirada. Entre novamente para continuar."); return; }
        toast.error(data.error ?? "Erro ao enviar pedido MB WAY.");
        return;
      }
      if (!data.orderId) {
        toast.error("A Stripe não devolveu a ordem MB WAY.");
        return;
      }
      if (data.status === "completed") {
        setMbwayConfirmed(true);
        setMbwayDone(true);
        setMbwayOrderId(null);
        toast.success(`Pagamento MB WAY confirmado! € ${parseFloat(data.amount ?? String(amount)).toFixed(2)} adicionado ao seu saldo.`);
        onSuccess();
        triggerPromoNotif(amount);
        onClose();
      } else {
        setMbwayDone(true);
        setMbwayConfirmed(false);
        setMbwayOrderId(data.orderId);
        toast.success(data.message ?? "Pedido MB WAY enviado! Confirme na app MB WAY.");
      }
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
      const data = await r.json() as CardIntentResponse;
      if (!r.ok || !data.clientSecret || !data.orderId || !data.publishableKey) {
        if (isInvalidTokenError(r.status, data.error)) { onAuthInvalid("Sessão expirada. Entre novamente para continuar."); return; }
        toast.error(data.error ?? "Erro ao iniciar pagamento por cartão.");
        return;
      }
      setCardClientSecret(data.clientSecret);
      setCardOrderId(data.orderId);
      setCardPublishableKey(data.publishableKey);
      setCardPreparedAmount(amount);
      toast.success("Pagamento por cartão preparado. Introduza os dados abaixo.");
    } catch { toast.error("Erro de ligação. Tente novamente."); }
    finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose(); }}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 px-5 py-4 border-b border-zinc-700 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${mainTab === "deposit" ? "bg-emerald-600" : "bg-orange-600"}`}>
            {mainTab === "deposit" ? <Plus size={18} strokeWidth={3} /> : <ArrowUpCircle size={18} />}
          </div>
          <div>
            <div className="font-black text-base">{mainTab === "deposit" ? "Depósito" : "Levantamento"}</div>
            <div className="text-xs text-zinc-400">{mainTab === "deposit" ? <>Processado por <span className="text-white font-semibold">Stripe</span></> : "Transferência bancária · IBAN"}</div>
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
            ) : needsKyc ? (
              /* ── KYC VERIFICATION FORM ── */
              <div className="space-y-4">
                <div className="bg-amber-900/20 border border-amber-600/40 rounded-xl px-4 py-3 flex gap-3 items-start">
                  <span className="text-xl mt-0.5">🪪</span>
                  <div>
                    <div className="text-sm font-bold text-amber-300 mb-1">Verificação de Identidade Necessária</div>
                    <div className="text-xs text-amber-200/70 leading-relaxed">Para efectuar levantamentos é necessário verificar a sua identidade. Preencha os dados abaixo — serão analisados pela nossa equipa em 1–2 dias úteis.</div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Tipo de Documento</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setKycDocType("cc")}
                      className={`py-2.5 rounded-xl border text-xs font-bold transition-colors ${kycDocType === "cc" ? "border-red-500 bg-red-500/10 text-red-400" : "border-zinc-700 text-zinc-400"}`}
                    >
                      🪪 Cartão de Cidadão
                    </button>
                    <button
                      onClick={() => setKycDocType("passport")}
                      className={`py-2.5 rounded-xl border text-xs font-bold transition-colors ${kycDocType === "passport" ? "border-red-500 bg-red-500/10 text-red-400" : "border-zinc-700 text-zinc-400"}`}
                    >
                      📗 Passaporte
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Número do Documento</label>
                  <Input
                    placeholder={kycDocType === "cc" ? "Ex: 12345678 9 ZX0" : "Ex: AB123456"}
                    className="bg-zinc-900 border-zinc-700 text-white font-mono"
                    value={kycDocNumber}
                    onChange={e => setKycDocNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">NIF (Número de Contribuinte)</label>
                  <Input
                    placeholder="123456789"
                    maxLength={9}
                    className="bg-zinc-900 border-zinc-700 text-white font-mono"
                    value={kycNif}
                    onChange={e => setKycNif(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <Button onClick={handleKycSubmit} disabled={loading} className="w-full bg-red-600 hover:bg-red-500 text-white font-black h-11">
                  {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : <span className="mr-2">🔒</span>}
                  Submeter Documentos
                </Button>
              </div>
            ) : kycStatus === "pending" && !kycDone ? (
              /* ── KYC PENDING NOTICE ── */
              <div className="space-y-4">
                <div className="bg-yellow-900/20 border border-yellow-600/40 rounded-xl px-4 py-4 text-center space-y-2">
                  <div className="text-3xl">⏳</div>
                  <div className="text-sm font-bold text-yellow-300">Verificação em Análise</div>
                  <div className="text-xs text-yellow-200/70 leading-relaxed">Os seus documentos estão a ser verificados pela nossa equipa. Poderá efectuar levantamentos assim que a verificação for concluída.</div>
                </div>
                <div className="bg-orange-900/20 border border-orange-800/40 rounded-xl px-4 py-3 text-xs text-orange-300 leading-relaxed">
                  Mínimo de levantamento: <strong className="text-white">€20</strong>. Processado por transferência bancária em 2–5 dias úteis.
                </div>
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
                    {[20, 50, 100, 250].map((v: number) => (
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
              className={`flex flex-col items-center gap-1.5 py-3 text-[10px] font-bold transition-colors border-b-2 ${payMethod === m.id ? "border-emerald-500 text-white bg-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
            >
              {m.logo2 ? (
                <div className="flex items-center gap-1">
                  <img src={m.logo} alt="Visa" className="h-5 w-auto object-contain" draggable={false} />
                  <img src={m.logo2} alt="Mastercard" className="h-5 w-auto object-contain" draggable={false} />
                </div>
              ) : (
                <img src={m.logo} alt={m.label} className="h-6 w-auto max-w-[64px] object-contain" draggable={false} />
              )}
              {m.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {/* Amount selector */}
          <div>
            <p className="text-xs text-zinc-400 mb-2 font-semibold uppercase tracking-widest">Valor</p>
            <div className="grid grid-cols-5 gap-1.5 mb-3">
              {[10, 20, 50, 100, 200].map((v: number) => (
                  <button
                    key={v}
                  onClick={() => {
                    setDepositAmount(String(v));
                    setMbRef(null);
                    setMbwayDone(false);
                    setMbwayOrderId(null);
                    setMbwayConfirmed(false);
                    resetCardFlow();
                  }}
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
                onChange={e => {
                  setDepositAmount(e.target.value);
                  setMbRef(null);
                  setMbwayDone(false);
                  setMbwayOrderId(null);
                  setMbwayConfirmed(false);
                  resetCardFlow();
                }}
              />
            </div>
          </div>
          {amountValid && amount >= 10 && (
            <div className={`rounded-xl p-2.5 flex items-center gap-2.5 text-xs ${amount >= 20 ? "bg-emerald-900/30 border border-emerald-600/30" : "bg-violet-900/30 border border-violet-600/30"}`}>
              <span className="text-lg">🎁</span>
              <span className={`font-semibold ${amount >= 20 ? "text-emerald-300" : "text-violet-300"}`}>
                {amount >= 100 ? "Qualifica para 100% Bónus de Boas-Vindas!" : amount >= 20 ? "Qualifica para €10 em Free Bets!" : "Qualifica para €5 em Free Bets!"}
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
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-11 gap-2"
                  >
                    {loading ? <Loader2 className="animate-spin" size={16} /> : <img src="/logo-multibanco.png" alt="Multibanco" className="h-5 w-auto object-contain" />}
                    Gerar Referência Multibanco
                  </Button>
                </>
              ) : (
                <div className="bg-zinc-900 border border-emerald-600/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <img src="/logo-multibanco.png" alt="Multibanco" className="h-7 w-auto object-contain" />
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
                    Referência válida até <span className="text-zinc-300 font-semibold">{new Date(mbRef.expiresAt).toLocaleString("pt-PT")}</span>.<br />
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
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-11 gap-2"
                  >
                    {loading ? <Loader2 className="animate-spin" size={16} /> : <img src="/logo-mbway.png" alt="MB WAY" className="h-5 w-auto object-contain" />}
                    Enviar Pedido — €{amountValid ? amount.toFixed(2) : "0.00"}
                  </Button>
                </>
              ) : (
                <div className="bg-zinc-900 border border-emerald-600/30 rounded-2xl p-4 text-center space-y-3">
                  <div className="flex justify-center">
                    <img src="/logo-mbway.png" alt="MB WAY" className="h-10 w-auto object-contain animate-pulse" />
                  </div>
                  <div className="font-black text-white text-base">Pedido enviado!</div>
                  <div className="text-sm text-zinc-400">
                    Verifique a App MB WAY no número<br />
                    <span className="text-white font-bold">+351 {mbwayPhone}</span>
                  </div>
                  <div className="text-xs text-zinc-500">Tem 4 minutos para aceitar. Valor: <span className="text-emerald-400 font-bold">€{amount.toFixed(2)}</span></div>
                  <div className="text-xs text-zinc-600 mt-2">O saldo é creditado automaticamente após confirmação.</div>
                  <Button
                    variant="outline"
                    className="w-full border-zinc-700 text-zinc-400 h-9 text-xs"
                    onClick={() => {
                      setMbwayDone(false);
                      setMbwayOrderId(null);
                      setMbwayConfirmed(false);
                    }}
                  >
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
                O pagamento com cartão é processado pela <strong className="text-zinc-200">Stripe</strong> no próprio modal. Só sairás desta página se o teu banco exigir autenticação adicional 3D Secure.
              </div>
              {!cardClientSecret || !stripePromise || cardPreparedAmount !== amount ? (
                <Button
                  onClick={handleCard}
                  disabled={loading || !amountValid}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-11 gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={16} /> : (
                    <div className="flex items-center gap-1">
                      <img src="/logo-visa.png" alt="Visa" className="h-4 w-auto object-contain" />
                      <img src="/logo-mastercard.png" alt="Mastercard" className="h-4 w-auto object-contain" />
                    </div>
                  )}
                  Preparar Pagamento de €{amountValid ? amount.toFixed(2) : "0.00"}
                </Button>
              ) : (
                <div className="space-y-3">
                  {stripeElementsOptions && (
                    <Elements stripe={stripePromise} options={stripeElementsOptions}>
                      <CardDepositInlineForm
                        orderId={cardOrderId ?? ""}
                        onSucceeded={() => {
                          onSuccess();
                          triggerPromoNotif(amount);
                          onClose();
                        }}
                        onProcessing={() => {
                          onSuccess();
                          onClose();
                        }}
                      />
                    </Elements>
                  )}
                  <Button variant="outline" className="w-full border-zinc-700 text-zinc-400 h-9 text-xs" onClick={resetCardFlow}>
                    Recriar pagamento
                  </Button>
                </div>
              )}
              <div className="flex items-center justify-center gap-3 mt-1">
                <img src="/logo-visa.png" alt="Visa" className="h-4 w-auto object-contain opacity-60" />
                <img src="/logo-mastercard.png" alt="Mastercard" className="h-4 w-auto object-contain opacity-60" />
                <span className="text-[10px] text-zinc-600">🔒 Pagamento seguro 3D Secure · Stripe</span>
              </div>
            </div>
          )}

        </div>

        {/* Accepted payment logos footer */}
        {mainTab === "deposit" && (
          <div className="border-t border-zinc-800 px-5 py-3 flex items-center justify-between">
            <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">Métodos aceites</span>
            <div className="flex items-center gap-2">
              <img src="/logo-multibanco.png" alt="Multibanco" className="h-5 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity" />
              <img src="/logo-mbway.png"     alt="MB WAY"     className="h-5 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity" />
              <img src="/logo-visa.png"       alt="Visa"       className="h-4 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity" />
              <img src="/logo-mastercard.png" alt="Mastercard" className="h-4 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity" />
            </div>
          </div>
        )}
        </>)}
      </DialogContent>
    </Dialog>
  );
}
