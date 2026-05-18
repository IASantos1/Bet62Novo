import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LiveMatchSimulator } from "./LiveMatchSimulator";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useBetSlip } from "@/context/BetSlipContext";
import type { LiveMatchMarkets } from "@/hooks/useLiveMatches";
import { getLeagueFlag } from "@/utils/teamBanners";

type TabKey =
  | "stats" | "classificacao" | "aovivo"
  | "todos" | "resultado" | "dupla" | "gols" | "especiais" | "placar"
  | "handicap" | "1tempo" | "2tempo" | "htft" | "escanteios" | "cartoes"
  | "prolongamento" | "penaltis"
  | "pontos" | "1periodo" | "sets" | "periodos" | "runline";

interface TabDef { key: TabKey; label: string }

export interface MatchInfo {
  id: string;
  sport: string;
  home: string;
  away: string;
  odds: { home: number; draw: number; away: number };
  markets?: LiveMatchMarkets;
  marketSuspension?: Record<string, number | undefined>;
  homeScore?: number;
  awayScore?: number;
  isLive: boolean;
  minute?: number;
  status?: string;
  league?: string;
  country?: string;
  date?: string;
  time?: string;
  suspensionReason?: string;
  _suspensionReason?: string;
  _liveExtra?: {
    sets?: Array<[number, number]>;
    currentPoints?: [number | string, number | string];
    periods?: Array<[number, number]>;
    quarters?: Array<[number, number]>;
    innings?: Array<[number | null, number | null]>;
  };
}

interface Props {
  visible: boolean;
  match: MatchInfo;
  onClose: () => void;
}

function formatDateDisplay(date?: string, isLive?: boolean, minute?: number, time?: string): string {
  if (isLive) return `AO VIVO ${minute ?? 0}'`;
  if (!date) return time ?? "";
  let kickoff: Date;
  if (date.includes(".")) {
    const parts = date.split(".").map(Number);
    kickoff = new Date(parts[2] ?? 2025, (parts[1] ?? 1) - 1, parts[0] ?? 1);
  } else {
    const parts = date.split("-").map(Number);
    kickoff = new Date(parts[0] ?? 2025, (parts[1] ?? 1) - 1, parts[2] ?? 1);
  }
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const isToday = kickoff.toDateString() === today.toDateString();
  const isTomorrow = kickoff.toDateString() === tomorrow.toDateString();
  const ds = isToday ? "Hoje" : isTomorrow ? "Amanhã"
    : kickoff.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
  return time ? `${ds} • ${time}` : ds;
}

function getTabsForSport(
  sport: string, isLive: boolean, show1tempo: boolean, show2tempo: boolean, showET: boolean, showPen: boolean
): TabDef[] {
  // Stats (📊) and Ao Vivo (⚡) are accessible via header icons — not shown in tab bar
  if (sport === "basketball") return [
    { key: "todos", label: "Todos" }, { key: "resultado", label: "Vencedor" },
    { key: "handicap", label: "Handicap" }, { key: "pontos", label: "Pontos" },
    { key: "1periodo", label: "1º Quarto" },
  ];
  if (sport === "tennis") return [
    { key: "todos", label: "Todos" }, { key: "resultado", label: "Vencedor" },
    { key: "sets", label: "Sets" },
  ];
  if (sport === "hockey") return [
    { key: "todos", label: "Todos" }, { key: "resultado", label: "Resultado" },
    { key: "gols", label: "Golos" }, { key: "periodos", label: "Períodos" },
    { key: "handicap", label: "Handicap" },
  ];
  if (sport === "volleyball") return [
    { key: "todos", label: "Todos" }, { key: "resultado", label: "Resultado" },
    { key: "sets", label: "Sets" }, { key: "handicap", label: "Handicap" },
  ];
  if (sport === "baseball") return [
    { key: "todos", label: "Todos" }, { key: "resultado", label: "Resultado" },
    { key: "runline", label: "Run Line" }, { key: "pontos", label: "Corridas" },
  ];
  if (showPen) return [{ key: "todos", label: "Todos" }, { key: "penaltis", label: "🎯 Penáltis" }];
  if (showET) return [{ key: "todos", label: "Todos" }, { key: "prolongamento", label: "⏱ Prorrogação" }];
  return [
    { key: "todos", label: "Todos" }, { key: "resultado", label: "Resultado" },
    { key: "dupla", label: "Dupla Chance" }, { key: "gols", label: "Golos" },
    { key: "especiais", label: "Especiais" }, { key: "handicap", label: "Handicap" },
    ...(show1tempo ? [{ key: "1tempo" as TabKey, label: "1º Tempo" }] : []),
    ...(show2tempo ? [{ key: "2tempo" as TabKey, label: "2º Tempo" }] : []),
    { key: "htft", label: "HT/FT" }, { key: "placar", label: "Placar" },
    { key: "escanteios", label: "Escanteios" }, { key: "cartoes", label: "Cartões" },
  ];
}

function seededRand(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function ComprehensiveMarketsSheet({ visible, match, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addSelection, removeSelection, hasSelection } = useBetSlip();

  const isLive = match.isLive;
  const isFootball = match.sport === "football";
  const isBball = match.sport === "basketball";
  const isTennis = match.sport === "tennis";
  const isHockey = match.sport === "hockey";
  const isVolley = match.sport === "volleyball";
  const m = match.markets;

  const liveHalf = isFootball && isLive && !m?.etExtra && !m?.penExtra
    ? (match.status === "HT" ? 0 : (match.minute ?? 0) > 45 ? 2 : 1)
    : null;
  // show1tempo: pre-match (null) or 1st half (1) — hides when HT (0) or 2nd half (2)
  const show1tempo = liveHalf === null || liveHalf === 1;
  // show2tempo: at HT break (0) or during 2nd half (2)
  const show2tempo = liveHalf === 0 || liveHalf === 2;
  const showET = isFootball && isLive && !!m?.etExtra;
  const showPen = isFootball && isLive && !!m?.penExtra;

  const tabs = getTabsForSport(match.sport, isLive, show1tempo, show2tempo, showET, showPen);
  const [activeTab, setActiveTab] = useState<TabKey>("todos");
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  useEffect(() => {
    if (visible) setActiveTab("todos");
    if (!visible) setSimulatorOpen(false);
  }, [visible, match.id]);

  const prevOddsRef = useRef<Record<string, number>>({});
  const [flashDirs, setFlashDirs] = useState<Record<string, "up" | "down">>({});
  useEffect(() => {
    if (!isLive) return;
    const entries: Array<[string, number]> = [
      ["home", match.odds.home], ["draw", match.odds.draw], ["away", match.odds.away],
    ];
    const dirs: Record<string, "up" | "down"> = {};
    let changed = false;
    for (const [k, v] of entries) {
      const prev = prevOddsRef.current[k];
      if (prev !== undefined && Math.abs(v - prev) >= 0.01) {
        dirs[k] = v > prev ? "up" : "down";
        changed = true;
      }
      prevOddsRef.current[k] = v;
    }
    if (changed) {
      setFlashDirs((d) => ({ ...d, ...dirs }));
      const t = setTimeout(() => setFlashDirs({}), 4000);
      return () => clearTimeout(t);
    }
  }, [match.odds.home, match.odds.draw, match.odds.away, isLive]);

  const now = Date.now();
  function hasBlockingReason(): boolean {
    if (!isLive) return false;
    const r = ((match._suspensionReason ?? match.suspensionReason) ?? "").toUpperCase();
    return r.includes("VAR") || r.includes("PENAL") || r.includes("PÊNALTI") || r.includes("PENÁLT") ||
      r === "GOLO!" || r === "GOLO" || r.includes("GOAL") || r.includes("CHANCE");
  }

  function susp(market: string): boolean {
    // If the global "result" market is suspended, lock ALL markets
    const globalExp = match.marketSuspension?.["result"];
    if (globalExp != null && globalExp > now) return true;
    // Check specific market key
    const exp = match.marketSuspension?.[market];
    if (exp != null && exp > now) return true;
    return hasBlockingReason();
  }

  function handleOdds(market: string, label: string, value: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (hasSelection(match.id, market)) removeSelection(match.id, market);
    else addSelection({
      matchId: match.id,
      matchTitle: `${match.home} vs ${match.away}`,
      market, selection: market,
      label: `${match.home} vs ${match.away} — ${label}`,
      odds: value,
      date: match.date,
      time: match.time,
    });
  }

  function getDir(market: string): "up" | "down" | undefined {
    if (market === "1x2-home") return flashDirs["home"];
    if (market === "1x2-draw") return flashDirs["draw"];
    if (market === "1x2-away") return flashDirs["away"];
    return undefined;
  }

  function checkObvious(market: string, value: number): boolean {
    if (market !== "1x2-home" && market !== "1x2-away") return false;
    if (value <= 1.01) return true;
    if (!isLive || !isFootball) return false;
    if (value <= 1.04) return true;
    const diff = Math.abs((match.homeScore ?? 0) - (match.awayScore ?? 0));
    const min = match.minute ?? 0;
    if (min >= 80 && diff >= 2) return true;
    if (min >= 85 && diff >= 1) return true;
    return false;
  }

  function computeStats() {
    const { home: hO, draw: dO, away: aO } = match.odds;
    const rawH = 1 / Math.max(1.01, hO);
    const rawD = dO > 1.02 ? 1 / dO : 0;
    const rawA = 1 / Math.max(1.01, aO);
    const margin = rawH + rawD + rawA;
    const probH = Math.round(rawH / margin * 100);
    const probD = rawD > 0 ? Math.round(rawD / margin * 100) : 0;
    const probA = 100 - probH - probD;

    let bttsProb: number | null = null;
    if (m?.bothTeamsScore && m.bothTeamsScore.yes > 1.02) {
      const rY = 1 / m.bothTeamsScore.yes, rN = 1 / m.bothTeamsScore.no;
      bttsProb = Math.round(rY / (rY + rN) * 100);
    }
    let over15: number | null = null, over25: number | null = null;
    if (m?.totalGoals) {
      if ((m.totalGoals.over15 ?? 0) > 1.02) {
        const rO = 1 / m.totalGoals.over15, rU = 1 / m.totalGoals.under15;
        over15 = Math.round(rO / (rO + rU) * 100);
      }
      if ((m.totalGoals.over25 ?? 0) > 1.02) {
        const rO = 1 / m.totalGoals.over25, rU = 1 / m.totalGoals.under25;
        over25 = Math.round(rO / (rO + rU) * 100);
      }
    }
    let eg: number = m?._total ?? 0;
    if (!eg && m?.totalGoals?.over25 && m.totalGoals.over25 > 1.02) {
      const rO = 1 / m.totalGoals.over25, rU = 1 / m.totalGoals.under25;
      eg = Math.round((2.5 + (rO / (rO + rU) > 0.5 ? 0.5 : -0.3)) * 100) / 100;
    }
    if (!eg) eg = 2.55;

    let avgCards: number | null = null;
    if (m?.cards?.o35 && m.cards.o35 > 1.02) {
      const rO = 1 / m.cards.o35, rU = 1 / m.cards.u35;
      avgCards = Math.round((3.5 + (rO / (rO + rU) > 0.5 ? 0.7 : -0.5)) * 100) / 100;
    }
    let avgCorners: number | null = null;
    if (m?.corners?.o85 && m.corners.o85 > 1.02) {
      const rO = 1 / m.corners.o85, rU = 1 / m.corners.u85;
      avgCorners = Math.round((8.5 + (rO / (rO + rU) > 0.5 ? 1.5 : -0.8)) * 100) / 100;
    }
    const total = 17;
    const wH = Math.round(probH / 100 * total);
    const wD = probD > 0 ? Math.round(probD / 100 * total) : 0;
    const wA = Math.max(0, total - wH - wD);
    return { probH, probD, probA, bttsProb, over15, over25, eg, avgCards, avgCorners, wH, wD, wA };
  }

  function genPressure(minutes: number) {
    const seed = [...match.home].reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0)
      + [...match.away].reduce((a, c, i) => a + c.charCodeAt(0) * (i + 100), 0);
    const count = Math.max(1, Math.min(minutes, 90));
    return Array.from({ length: count }, (_, i) => ({
      home: Math.max(2, Math.round(seededRand(seed + i * 2.1) * 9 + 2)),
      away: Math.max(2, Math.round(seededRand(seed + i * 3.7 + 100) * 9 + 2)),
    }));
  }

  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const leagueFlag = getLeagueFlag(match.league, match.country);
  const dateStr = formatDateDisplay(match.date, isLive, match.minute, match.time);
  const hasDraw = match.odds.draw > 1.01;

  const isObviousLiveResult = isLive && isFootball && (() => {
    const minOdd = Math.min(match.odds.home, match.odds.away);
    if (minOdd <= 1.05) return true;
    const min = match.minute ?? 0;
    const diff = Math.abs((match.homeScore ?? 0) - (match.awayScore ?? 0));
    if (min >= 80 && diff >= 2) return true;
    if (min >= 85 && diff >= 1) return true;
    return false;
  })();

  const isSuspendedGlobal = susp("result");
  const isBigChance = isLive && isFootball && !isSuspendedGlobal && !isObviousLiveResult &&
    (match.odds.home <= 1.06 || match.odds.away <= 1.06) && (match.minute ?? 0) > 0;
  const showSuspBanner = isSuspendedGlobal || isBigChance;

  function getSuspText(): string {
    if (isBigChance) {
      const who = match.odds.home <= 1.06 ? match.home : match.away;
      return `⚡ GRANDE CHANCE DE GOLO — ${who}`;
    }
    const r = ((match._suspensionReason ?? match.suspensionReason) ?? "").toUpperCase();
    if (r.includes("VAR")) return "📺 REVISÃO VAR";
    if (r.includes("PENAL") || r.includes("PÊNALTI") || r.includes("PENÁLT")) return "🎯 PENÁLTI";
    if (r.includes("GOLO") || r.includes("GOAL")) return "⚽ GOLO MARCADO";
    if (r.includes("CHANCE")) return "⚡ GRANDE CHANCE DE GOLO";
    if (r.includes("SUSPEN")) return "⏸ MERCADOS SUSPENSOS";
    return "⚠️ ODDS EM ATUALIZAÇÃO";
  }

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "#00000080" },
    sheet: { flex: 1, backgroundColor: colors.background, marginTop: Platform.OS === "web" ? 0 : insets.top, borderTopLeftRadius: 0, borderTopRightRadius: 0, overflow: "hidden" },
    header: { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    backRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingTop: topPad + 12, paddingBottom: 6 },
    backText: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    leagueRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 6 },
    leagueText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    dateText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: isLive ? "#f59e0b" : colors.mutedForeground },
    teamsRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingBottom: 12 },
    teamText: { flex: 1, fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground },
    scoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 14, paddingBottom: 10 },
    scoreBox: { backgroundColor: "#0c0c18", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: colors.primary + "55" },
    scoreText: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#ffffff", letterSpacing: 2 },
    minuteBadge: { backgroundColor: "#f59e0b18", borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: "#f59e0b44" },
    suspBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#ef444418", marginHorizontal: 14, marginBottom: 8, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#ef444444" },
    bigChanceBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#f59e0b12", marginHorizontal: 14, marginBottom: 8, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#f59e0b44" },
    tabBar: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
    tabContent: { paddingVertical: 8, paddingLeft: 10, gap: 6 },
    tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginRight: 4 },
    scroll: { flex: 1 },
    sectionHeader: { backgroundColor: "#27272a", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8 },
    sectionHeaderText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#a1a1aa", textTransform: "uppercase", letterSpacing: 1 },
    row: { flexDirection: "row", gap: 6, marginBottom: 6 },
    oddsBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 6, alignItems: "center", borderWidth: 1 },
    oddsBtnNorm: { backgroundColor: "#1c1c26", borderColor: "#2e2e3c" },
    oddsBtnSel: { backgroundColor: colors.primary, borderColor: colors.primary },
    oddsBtnLocked: { backgroundColor: "#18181f", borderColor: "#2a2a35", opacity: 0.45 },
    oddsBtnObvious: { backgroundColor: "#451a03", borderColor: "#d97706" },
    oddsLabel: { fontSize: 10, fontFamily: "Inter_500Medium", marginBottom: 2 },
    oddsValue: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#ffffff" },
    oddsValueRow: { flexDirection: "row", alignItems: "center", gap: 3 },
    subsectionLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 6, marginBottom: 4 },
    htftRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
    htftBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: "center", borderWidth: 1 },
    htftLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 1 },
    htftValue: { fontSize: 13, fontFamily: "Inter_700Bold" },
    statCard: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, padding: 16 },
    statSectionTitle: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#ef4444", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 },
    statRow: { flexDirection: "row", marginBottom: 14 },
    statCol: { flex: 1 },
    statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 2 },
    statValue: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, lineHeight: 26 },
    statSubtitle: { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    probBar: { height: 6, backgroundColor: "#27272a", borderRadius: 3, overflow: "hidden", marginTop: 4 },
    winCountRow: { flexDirection: "row", justifyContent: "space-around", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
    winCountNum: { fontSize: 26, fontFamily: "Inter_700Bold", textAlign: "center" },
    winCountLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginTop: 2 },
  });

  function SH({ title }: { title: string }) {
    return (
      <View style={s.sectionHeader}>
        <Text style={s.sectionHeaderText}>{title}</Text>
      </View>
    );
  }

  function Section({ title, children, tabKey }: { title: string; children: React.ReactNode; tabKey: TabKey }) {
    if (activeTab !== "todos" && activeTab !== tabKey) return null;
    return (
      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 2 }}>
        <SH title={title} />
        {children}
      </View>
    );
  }

  function OddsBtn({ market, label, value, dir }: { market: string; label: string; value: number; dir?: "up" | "down" }) {
    const isSusp = susp(market);
    const isObvious = checkObvious(market, value);
    const isLowOdds = !isObvious && value < 1.15 && (market === "1x2-home" || market === "1x2-draw" || market === "1x2-away");
    const isSelected = hasSelection(match.id, market);

    if (isSusp) {
      return (
        <View style={[s.oddsBtn, s.oddsBtnLocked]}>
          <Text style={[s.oddsLabel, { color: "#6b7280" }]} numberOfLines={1}>{label}</Text>
          <Ionicons name="lock-closed" size={11} color="#4b5563" />
        </View>
      );
    }
    if (isObvious) {
      return (
        <View style={[s.oddsBtn, s.oddsBtnObvious]}>
          <Text style={[s.oddsLabel, { color: "#d97706" }]} numberOfLines={1}>{label}</Text>
          <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#f59e0b", textTransform: "uppercase", letterSpacing: 0.4 }}>Aposta Já!</Text>
        </View>
      );
    }
    if (isLowOdds) {
      return (
        <View style={[s.oddsBtn, s.oddsBtnLocked]}>
          <Text style={[s.oddsLabel, { color: "#6b7280" }]} numberOfLines={1}>{label}</Text>
          <Ionicons name="lock-closed" size={11} color="#4b5563" />
        </View>
      );
    }
    return (
      <Pressable
        style={({ pressed }) => [s.oddsBtn, isSelected ? s.oddsBtnSel : s.oddsBtnNorm, { opacity: pressed ? 0.75 : 1 }]}
        onPress={() => handleOdds(market, label, value)}
      >
        <Text style={[s.oddsLabel, { color: isSelected ? "#ffffffcc" : "#9ca3af" }]} numberOfLines={1}>{label}</Text>
        <View style={s.oddsValueRow}>
          {dir === "up" && <Text style={{ color: "#22c55e", fontSize: 11, fontFamily: "Inter_700Bold", lineHeight: 14 }}>▲</Text>}
          <Text style={[s.oddsValue, { color: dir === "up" ? "#22c55e" : dir === "down" ? "#f87171" : "#fff" }]}>{value.toFixed(2)}</Text>
          {dir === "down" && <Text style={{ color: "#f87171", fontSize: 11, fontFamily: "Inter_700Bold", lineHeight: 14 }}>▼</Text>}
        </View>
      </Pressable>
    );
  }

  function StatsContent() {
    const st = computeStats();
    return (
      <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
        <View style={s.statCard}>
          <Text style={s.statSectionTitle}>Frente a Frente — Média</Text>
          <View style={s.statRow}>
            <View style={s.statCol}>
              <Text style={s.statLabel}>Golos Marcados</Text>
              <Text style={s.statValue}>{st.eg.toFixed(2)}</Text>
              <Text style={s.statSubtitle}>Liga: 2.55</Text>
            </View>
            <View style={s.statCol}>
              <Text style={s.statLabel}>AEM</Text>
              <Text style={s.statValue}>{st.bttsProb ?? 46}%</Text>
              <Text style={s.statSubtitle}>Liga: 46%</Text>
            </View>
          </View>
          {isFootball && (
            <View style={s.statRow}>
              <View style={s.statCol}>
                <Text style={s.statLabel}>Mais de 1.5</Text>
                <Text style={s.statValue}>{st.over15 ?? 79}%</Text>
                <Text style={s.statSubtitle}>Liga: 79%</Text>
              </View>
              <View style={s.statCol}>
                <Text style={s.statLabel}>Mais de 2.5</Text>
                <Text style={s.statValue}>{st.over25 ?? 50}%</Text>
                <Text style={s.statSubtitle}>Liga: 50%</Text>
              </View>
            </View>
          )}
          {isFootball && (
            <View style={[s.statRow, { marginBottom: 0 }]}>
              <View style={s.statCol}>
                <Text style={s.statLabel}>Total Cartões</Text>
                <Text style={s.statValue}>{(st.avgCards ?? 3.80).toFixed(2)}</Text>
              </View>
              <View style={s.statCol}>
                <Text style={s.statLabel}>Cantos</Text>
                <Text style={s.statValue}>{(st.avgCorners ?? 9.50).toFixed(2)}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={s.statCard}>
          <Text style={s.statSectionTitle}>Probabilidade de Vitória</Text>
          <View style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.foreground }} numberOfLines={1}>{match.home}</Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.foreground }}>{st.probH}%</Text>
            </View>
            <View style={s.probBar}>
              <View style={{ height: 6, width: `${st.probH}%`, backgroundColor: "#3b82f6", borderRadius: 3 }} />
            </View>
          </View>
          {st.probD > 0 && (
            <View style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.foreground }}>Empate</Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.foreground }}>{st.probD}%</Text>
              </View>
              <View style={s.probBar}>
                <View style={{ height: 6, width: `${st.probD}%`, backgroundColor: "#eab308", borderRadius: 3 }} />
              </View>
            </View>
          )}
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.foreground }} numberOfLines={1}>{match.away}</Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.foreground }}>{st.probA}%</Text>
            </View>
            <View style={s.probBar}>
              <View style={{ height: 6, width: `${st.probA}%`, backgroundColor: "#ef4444", borderRadius: 3 }} />
            </View>
          </View>
          <View style={s.winCountRow}>
            <View style={{ alignItems: "center" }}>
              <Text style={[s.winCountNum, { color: "#3b82f6" }]}>{st.wH}</Text>
              <Text style={s.winCountLabel}>Vitórias {match.home.split(" ")[0]}</Text>
            </View>
            {st.probD > 0 && (
              <View style={{ alignItems: "center" }}>
                <Text style={[s.winCountNum, { color: "#eab308" }]}>{st.wD}</Text>
                <Text style={s.winCountLabel}>Empates</Text>
              </View>
            )}
            <View style={{ alignItems: "center" }}>
              <Text style={[s.winCountNum, { color: "#ef4444" }]}>{st.wA}</Text>
              <Text style={s.winCountLabel}>Vitórias {match.away.split(" ")[0]}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  function AoVivoContent() {
    const minutes = match.minute ?? 1;
    const data = genPressure(minutes);
    const HALF = 52;
    return (
      <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
        {/* Simulator launch button */}
        <Pressable
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: pressed ? "#1a1a28" : "#14141e",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#2e2e3c",
            paddingHorizontal: 14,
            paddingVertical: 12,
            marginBottom: 12,
            opacity: pressed ? 0.85 : 1,
          })}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setSimulatorOpen(true);
          }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#1e3a5f", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2a4f7a" }}>
            <MaterialCommunityIcons
              name={
                match.sport === "basketball" ? "basketball" :
                match.sport === "tennis" ? "tennis-ball" :
                match.sport === "hockey" ? "hockey-puck" :
                match.sport === "baseball" ? "baseball" :
                match.sport === "volleyball" ? "volleyball" :
                "soccer"
              }
              size={22}
              color="#60a5fa"
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 }}>
              <Ionicons name="flash" size={12} color="#f59e0b" />
              <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#f59e0b" }}>AO VIVO</Text>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" }} />
            </View>
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Ver Simulação 3D</Text>
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>Campo animado com dados em tempo real</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        <View style={s.statCard}>
          <Text style={s.statSectionTitle}>Pressão em Tempo Real</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#ef4444" }}>{match.home}</Text>
            <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#a1a1aa" }}>{minutes}'</Text>
            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#22c55e" }}>{match.away}</Text>
          </View>
          <View style={{ height: HALF * 2 + 2, flexDirection: "row", alignItems: "center", gap: 1 }}>
            {data.map((pt, i) => (
              <View key={i} style={{ flex: 1, height: HALF * 2 + 2, flexDirection: "column", alignItems: "center" }}>
                <View style={{ height: HALF, justifyContent: "flex-end", width: "100%", alignItems: "center" }}>
                  <View style={{ width: "70%", height: Math.max(3, Math.round((pt.home / 11) * HALF)), backgroundColor: "#ef4444", borderRadius: 2 }} />
                </View>
                <View style={{ height: 1, width: "100%", backgroundColor: "#3f3f46" }} />
                <View style={{ height: HALF, justifyContent: "flex-start", width: "100%", alignItems: "center" }}>
                  <View style={{ width: "70%", height: Math.max(3, Math.round((pt.away / 11) * HALF)), backgroundColor: "#22c55e", borderRadius: 2 }} />
                </View>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
            <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: "#6b7280" }}>0'</Text>
            <Text style={{ fontSize: 8, fontFamily: "Inter_400Regular", color: "#4b5563" }}>1º tempo</Text>
            <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: "#6b7280" }}>{minutes}'</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 16, marginTop: 12, marginBottom: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" }} />
              <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: "#9ca3af" }}>Ataque {match.home.split(" ")[0]}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" }} />
              <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: "#9ca3af" }}>Ataque {match.away.split(" ")[0]}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "#6b7280", textAlign: "center", marginTop: 10 }}>
            Nenhum evento registado neste momento.
          </Text>
        </View>
      </View>
    );
  }

  function ClassificacaoContent() {
    return (
      <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
        <View style={s.statCard}>
          <Text style={s.statSectionTitle}>Classificação</Text>
          <View style={{ alignItems: "center", paddingVertical: 30, gap: 10 }}>
            <Ionicons name="trophy-outline" size={36} color={colors.border} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>
              {match.league ?? "Liga"}
            </Text>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
              Classificação disponível em breve
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.sheet}>

          <View style={s.header}>
            <Pressable style={s.backRow} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="arrow-back" size={16} color={colors.mutedForeground} />
              <Text style={s.backText}>Voltar aos eventos</Text>
            </Pressable>

            <View style={s.leagueRow}>
              <Text style={s.leagueText}>{leagueFlag} {match.league ?? match.sport}</Text>
              <View style={{ flex: 1 }} />
              <Text style={s.dateText}>{dateStr}</Text>
            </View>

            <View style={s.teamsRow}>
              <Text style={s.teamText} numberOfLines={1}>{match.home}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Pressable onPress={() => setActiveTab("stats")} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="bar-chart-outline" size={16} color={activeTab === "stats" ? colors.primary : colors.mutedForeground} />
                </Pressable>
                {isLive && (
                  <Pressable onPress={() => setActiveTab("aovivo")} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="pulse-outline" size={16} color={activeTab === "aovivo" ? "#22c55e" : colors.mutedForeground} />
                  </Pressable>
                )}
              </View>
              <Text style={[s.teamText, { textAlign: "right" }]} numberOfLines={1}>{match.away}</Text>
            </View>

            {isLive && (
              <View style={{ alignItems: "center", paddingBottom: 10, gap: 5 }}>
                <View style={s.scoreBox}>
                  <Text style={s.scoreText}>{match.homeScore ?? 0} – {match.awayScore ?? 0}</Text>
                </View>
                <View style={s.minuteBadge}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#f59e0b" }}>
                    {isTennis ? `Set ${match.minute ?? 1}` : `${match.minute ?? 0}'`}
                    {match.status === "HT" ? " • INT." : ""}
                  </Text>
                </View>
              </View>
            )}

            {showSuspBanner && (
              <View style={isBigChance ? s.bigChanceBanner : s.suspBanner}>
                <Ionicons name={isBigChance ? "flash" : "warning"} size={14} color={isBigChance ? "#f59e0b" : "#ef4444"} />
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: isBigChance ? "#f59e0b" : "#ef4444" }}>
                  {getSuspText()}
                </Text>
                {!isBigChance && (
                  <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: "#ef444480", marginLeft: 2 }}>
                    — Odds em atualização
                  </Text>
                )}
              </View>
            )}

            <View style={s.tabBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabContent}>
                {tabs.map((tab) => {
                  const active = activeTab === tab.key;
                  return (
                    <Pressable
                      key={tab.key}
                      style={[s.tab, {
                        backgroundColor: active ? colors.primary : "transparent",
                        borderColor: active ? colors.primary : colors.border,
                      }]}
                      onPress={() => { setActiveTab(tab.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: active ? "#fff" : colors.foreground }}>{tab.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

            {activeTab === "aovivo" && isLive && <AoVivoContent />}

            {activeTab === "stats" && <StatsContent />}

            {activeTab !== "aovivo" && activeTab !== "stats" && (
              <>
                {match.odds.home > 1.01 && !isObviousLiveResult && (
                  <Section title="Resultado Final" tabKey="resultado">
                    <View style={s.row}>
                      <OddsBtn market="1x2-home" label={isFootball || isHockey ? "Casa (1)" : match.home} value={match.odds.home} dir={getDir("1x2-home")} />
                      {hasDraw && <OddsBtn market="1x2-draw" label="Empate (X)" value={match.odds.draw} dir={getDir("1x2-draw")} />}
                      <OddsBtn market="1x2-away" label={isFootball || isHockey ? "Fora (2)" : match.away} value={match.odds.away} dir={getDir("1x2-away")} />
                    </View>
                  </Section>
                )}

                {isFootball && m?.doubleChance && m.doubleChance.homeOrDraw > 1.01 && (
                  <Section title="Dupla Chance" tabKey="dupla">
                    <View style={s.row}>
                      <OddsBtn market="dc-home-draw" label="1 ou X" value={m.doubleChance.homeOrDraw} />
                      <OddsBtn market="dc-away-draw" label="X ou 2" value={m.doubleChance.awayOrDraw} />
                      <OddsBtn market="dc-home-away" label="1 ou 2" value={m.doubleChance.homeOrAway} />
                    </View>
                  </Section>
                )}

                {isFootball && m?.bothTeamsScore && m.bothTeamsScore.yes > 1.01 && (
                  <Section title="Ambas as Equipas Marcam" tabKey="dupla">
                    <View style={s.row}>
                      <OddsBtn market="btts-yes" label="Sim" value={m.bothTeamsScore.yes} />
                      <OddsBtn market="btts-no" label="Não" value={m.bothTeamsScore.no} />
                    </View>
                  </Section>
                )}

                {isFootball && m?.totalGoals && m.totalGoals.over05 > 1.01 && (
                  <Section title="Total de Golos" tabKey="gols">
                    {(
                      [
                        { line: "0.5", o: m.totalGoals.over05, u: m.totalGoals.under05, ko: "tg-o05", ku: "tg-u05" },
                        { line: "1.5", o: m.totalGoals.over15, u: m.totalGoals.under15, ko: "tg-o15", ku: "tg-u15" },
                        { line: "2.5", o: m.totalGoals.over25, u: m.totalGoals.under25, ko: "tg-o25", ku: "tg-u25" },
                        { line: "3.5", o: m.totalGoals.over35, u: m.totalGoals.under35, ko: "tg-o35", ku: "tg-u35" },
                        { line: "4.5", o: m.totalGoals.over45, u: m.totalGoals.under45, ko: "tg-o45", ku: "tg-u45" },
                        { line: "5.5", o: m.totalGoals.over55, u: m.totalGoals.under55, ko: "tg-o55", ku: "tg-u55" },
                        { line: "6.5", o: m.totalGoals.over65, u: m.totalGoals.under65, ko: "tg-o65", ku: "tg-u65" },
                      ].filter((r) => r.o > 1.01)
                    ).map((row) => (
                      <View key={row.line} style={s.row}>
                        <OddsBtn market={row.ko} label={`Mais ${row.line}`} value={row.o} />
                        <OddsBtn market={row.ku} label={`Menos ${row.line}`} value={row.u} />
                      </View>
                    ))}
                  </Section>
                )}

                {isFootball && m?.btts1H && m.btts1H.yes > 1.01 && (
                  <Section title="Ambas Marcam — 1º Tempo" tabKey="gols">
                    <View style={s.row}>
                      <OddsBtn market="btts1h-yes" label="Sim" value={m.btts1H.yes} />
                      <OddsBtn market="btts1h-no" label="Não" value={m.btts1H.no} />
                    </View>
                  </Section>
                )}

                {isFootball && m?.goalOddEven && m.goalOddEven.odd > 1.01 && (
                  <Section title="Total Golos — Par / Ímpar" tabKey="gols">
                    <View style={s.row}>
                      <OddsBtn market="godd" label="Ímpar" value={m.goalOddEven.odd} />
                      <OddsBtn market="geven" label="Par" value={m.goalOddEven.even} />
                    </View>
                  </Section>
                )}

                {isFootball && m?.exactGoals && m.exactGoals.g0 > 1.01 && (
                  <Section title="Golos Exatos" tabKey="placar">
                    <View style={s.row}>
                      <OddsBtn market="eg-0" label="0 Golos" value={m.exactGoals.g0} />
                      <OddsBtn market="eg-1" label="1 Golo" value={m.exactGoals.g1} />
                      <OddsBtn market="eg-2" label="2 Golos" value={m.exactGoals.g2} />
                    </View>
                    <View style={s.row}>
                      <OddsBtn market="eg-3" label="3 Golos" value={m.exactGoals.g3} />
                      <OddsBtn market="eg-4" label="4 Golos" value={m.exactGoals.g4} />
                      <OddsBtn market="eg-5plus" label="5+ Golos" value={m.exactGoals.g5plus} />
                    </View>
                  </Section>
                )}

                {isFootball && m?.teamGoals && m.teamGoals.homeOver05 > 1.01 && (
                  <Section title={`Golos — ${match.home}`} tabKey="gols">
                    {(
                      [
                        { line: "0.5", o: m.teamGoals.homeOver05, u: m.teamGoals.homeUnder05, ko: "hg-o05", ku: "hg-u05" },
                        { line: "1.5", o: m.teamGoals.homeOver15, u: m.teamGoals.homeUnder15, ko: "hg-o15", ku: "hg-u15" },
                        { line: "2.5", o: m.teamGoals.homeOver25, u: m.teamGoals.homeUnder25, ko: "hg-o25", ku: "hg-u25" },
                      ].filter((r) => r.o > 1.01)
                    ).map((row) => (
                      <View key={row.line} style={s.row}>
                        <OddsBtn market={row.ko} label={`Mais ${row.line}`} value={row.o} />
                        <OddsBtn market={row.ku} label={`Menos ${row.line}`} value={row.u} />
                      </View>
                    ))}
                  </Section>
                )}

                {isFootball && m?.teamGoals && m.teamGoals.awayOver05 > 1.01 && (
                  <Section title={`Golos — ${match.away}`} tabKey="gols">
                    {(
                      [
                        { line: "0.5", o: m.teamGoals.awayOver05, u: m.teamGoals.awayUnder05, ko: "ag-o05", ku: "ag-u05" },
                        { line: "1.5", o: m.teamGoals.awayOver15, u: m.teamGoals.awayUnder15, ko: "ag-o15", ku: "ag-u15" },
                        { line: "2.5", o: m.teamGoals.awayOver25, u: m.teamGoals.awayUnder25, ko: "ag-o25", ku: "ag-u25" },
                      ].filter((r) => r.o > 1.01)
                    ).map((row) => (
                      <View key={row.line} style={s.row}>
                        <OddsBtn market={row.ko} label={`Mais ${row.line}`} value={row.o} />
                        <OddsBtn market={row.ku} label={`Menos ${row.line}`} value={row.u} />
                      </View>
                    ))}
                  </Section>
                )}

                {isFootball && m?.winToNil && m.winToNil.home > 1.01 && (
                  <Section title="Vitória a Zeros (Win to Nil)" tabKey="especiais">
                    <View style={s.row}>
                      <OddsBtn market="wtn-home" label={match.home} value={m.winToNil.home} />
                      <OddsBtn market="wtn-away" label={match.away} value={m.winToNil.away} />
                    </View>
                  </Section>
                )}

                {isFootball && m?.cleanSheet && m.cleanSheet.home > 1.01 && (
                  <Section title="Folha Limpa (Clean Sheet)" tabKey="especiais">
                    <View style={s.row}>
                      <OddsBtn market="cs-home" label={match.home} value={m.cleanSheet.home} />
                      <OddsBtn market="cs-away" label={match.away} value={m.cleanSheet.away} />
                    </View>
                  </Section>
                )}

                {isFootball && m?.toWinBothHalves && m.toWinBothHalves.home > 1.01 && (
                  <Section title="Vencer os Dois Tempos" tabKey="especiais">
                    <View style={s.row}>
                      <OddsBtn market="wbh-home" label={match.home} value={m.toWinBothHalves.home} />
                      <OddsBtn market="wbh-away" label={match.away} value={m.toWinBothHalves.away} />
                    </View>
                  </Section>
                )}

                {isFootball && m?.highestScoringHalf && m.highestScoringHalf.first > 1.01 && (
                  <Section title="Tempo com Mais Golos" tabKey="especiais">
                    <View style={s.row}>
                      <OddsBtn market="hsh-first" label="1º Tempo" value={m.highestScoringHalf.first} />
                      <OddsBtn market="hsh-second" label="2º Tempo" value={m.highestScoringHalf.second} />
                      <OddsBtn market="hsh-equal" label="Igual" value={m.highestScoringHalf.equal} />
                    </View>
                  </Section>
                )}

                {isFootball && m?.handicap && m.handicap.homeMinusOne > 1.01 && (
                  <Section title="Handicap Europeu" tabKey="handicap">
                    <View style={s.row}>
                      <OddsBtn market="hcp-home1" label={`${match.home} -1`} value={m.handicap.homeMinusOne} />
                      <OddsBtn market="hcp-away1" label={`${match.away} +1`} value={m.handicap.awayPlusOne} />
                    </View>
                    {m.handicap.homeMinusOneHalf > 1.01 && (
                      <View style={s.row}>
                        <OddsBtn market="hcp-home15" label={`${match.home} -1.5`} value={m.handicap.homeMinusOneHalf} />
                        <OddsBtn market="hcp-away15" label={`${match.away} +1.5`} value={m.handicap.awayPlusOneHalf} />
                      </View>
                    )}
                  </Section>
                )}

                {!isFootball && m?.handicapPoints && m.handicapPoints.home > 1.01 && (
                  <Section title="Handicap" tabKey="handicap">
                    <View style={s.row}>
                      <OddsBtn market="hcp-home" label={`${match.home} ${m.handicapPoints.line > 0 ? "+" : ""}${m.handicapPoints.line}`} value={m.handicapPoints.home} />
                      <OddsBtn market="hcp-away" label={`${match.away} ${m.handicapPoints.line > 0 ? "-" : "+"}${Math.abs(m.handicapPoints.line)}`} value={m.handicapPoints.away} />
                    </View>
                  </Section>
                )}

                {isFootball && show1tempo && m?.halfTime && m.halfTime.home > 1.01 && (
                  <Section title="1º Tempo — Resultado" tabKey="1tempo">
                    <View style={s.row}>
                      <OddsBtn market="ht-home" label="Casa (1)" value={m.halfTime.home} />
                      {m.halfTime.draw > 1.01 && <OddsBtn market="ht-draw" label="Empate (X)" value={m.halfTime.draw} />}
                      <OddsBtn market="ht-away" label="Fora (2)" value={m.halfTime.away} />
                    </View>
                  </Section>
                )}

                {isFootball && show1tempo && m?.firstGoal && m.firstGoal.home > 1.01 && (
                  <Section title="1º Golo" tabKey="1tempo">
                    <View style={s.row}>
                      <OddsBtn market="fg-home" label={match.home} value={m.firstGoal.home} />
                      <OddsBtn market="fg-none" label="Sem Golos" value={m.firstGoal.noGoal} />
                      <OddsBtn market="fg-away" label={match.away} value={m.firstGoal.away} />
                    </View>
                  </Section>
                )}

                {isFootball && m?.secondHalf && m.secondHalf.home > 1.01 && (
                  <Section title="2º Tempo — Resultado" tabKey="2tempo">
                    <View style={s.row}>
                      <OddsBtn market="sh-home" label="Casa (1)" value={m.secondHalf.home} />
                      {m.secondHalf.draw > 1.01 && <OddsBtn market="sh-draw" label="Empate (X)" value={m.secondHalf.draw} />}
                      <OddsBtn market="sh-away" label="Fora (2)" value={m.secondHalf.away} />
                    </View>
                  </Section>
                )}

                {isFootball && m?.htft && m.htft.hh > 1.01 && (activeTab === "todos" || activeTab === "htft") && (
                  <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 2 }}>
                    <SH title="Intervalo / Final (HT/FT)" />
                    {[
                      [{ k: "htft-hh", l: "1/1", v: m.htft.hh }, { k: "htft-hd", l: "1/X", v: m.htft.hd }, { k: "htft-ha", l: "1/2", v: m.htft.ha }],
                      [{ k: "htft-dh", l: "X/1", v: m.htft.dh }, { k: "htft-dd", l: "X/X", v: m.htft.dd }, { k: "htft-da", l: "X/2", v: m.htft.da }],
                      [{ k: "htft-ah", l: "2/1", v: m.htft.ah }, { k: "htft-ad", l: "2/X", v: m.htft.ad }, { k: "htft-aa", l: "2/2", v: m.htft.aa }],
                    ].map((row, ri) => (
                      <View key={ri} style={s.htftRow}>
                        {row.map(({ k, l, v }) => {
                          const sel = hasSelection(match.id, k);
                          return (
                            <Pressable key={k} style={({ pressed }) => [s.htftBtn, { backgroundColor: sel ? colors.primary : "#1c1c26", borderColor: sel ? colors.primary : "#2e2e3c", opacity: pressed ? 0.78 : 1 }]} onPress={() => handleOdds(k, `HT/FT ${l}`, v)}>
                              <Text style={[s.htftLabel, { color: sel ? "#fff" : "#9ca3af" }]}>{l}</Text>
                              <Text style={[s.htftValue, { color: "#fff" }]}>{v.toFixed(2)}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                )}

                {isFootball && m?.corners && m.corners.o85 > 1.01 && (
                  <Section title="Escanteios" tabKey="escanteios">
                    {(
                      [
                        { label: "8.5", o: m.corners.o85, u: m.corners.u85, ko: "oc85", ku: "uc85" },
                        { label: "9.5", o: m.corners.o95, u: m.corners.u95, ko: "oc95", ku: "uc95" },
                        { label: "10.5", o: m.corners.o105, u: m.corners.u105, ko: "oc105", ku: "uc105" },
                      ].filter((r) => r.o > 1.01)
                    ).map((row) => (
                      <View key={row.label} style={s.row}>
                        <OddsBtn market={row.ko} label={`Mais ${row.label}`} value={row.o} />
                        <OddsBtn market={row.ku} label={`Menos ${row.label}`} value={row.u} />
                      </View>
                    ))}
                  </Section>
                )}

                {isFootball && m?.cards && m.cards.o35 > 1.01 && (
                  <Section title="Cartões" tabKey="cartoes">
                    <View style={s.row}>
                      <OddsBtn market="cards-o35" label="Mais 3.5" value={m.cards.o35} />
                      <OddsBtn market="cards-u35" label="Menos 3.5" value={m.cards.u35} />
                    </View>
                    {m.cards.o45 > 1.01 && (
                      <View style={s.row}>
                        <OddsBtn market="cards-o45" label="Mais 4.5" value={m.cards.o45} />
                        <OddsBtn market="cards-u45" label="Menos 4.5" value={m.cards.u45} />
                      </View>
                    )}
                  </Section>
                )}

                {isFootball && showET && m?.etExtra && (
                  <>
                    {m.etExtra.tieWinner.home > 1.01 && (
                      <Section title="Vencedor da Eliminatória" tabKey="prolongamento">
                        <View style={s.row}>
                          <OddsBtn market="et-tie-home" label={match.home} value={m.etExtra.tieWinner.home} />
                          <OddsBtn market="et-tie-away" label={match.away} value={m.etExtra.tieWinner.away} />
                        </View>
                      </Section>
                    )}
                    {m.etExtra.etResult.home > 1.01 && (
                      <Section title="Resultado da Prorrogação" tabKey="prolongamento">
                        <View style={s.row}>
                          <OddsBtn market="et-res-home" label="Casa" value={m.etExtra.etResult.home} />
                          <OddsBtn market="et-res-draw" label="Pen." value={m.etExtra.etResult.draw} />
                          <OddsBtn market="et-res-away" label="Fora" value={m.etExtra.etResult.away} />
                        </View>
                      </Section>
                    )}
                    {m.etExtra.totalGoals.o05 > 1.01 && (
                      <Section title="Golos na Prorrogação" tabKey="prolongamento">
                        {(
                          [
                            { line: "0.5", o: m.etExtra.totalGoals.o05, u: m.etExtra.totalGoals.u05, ko: "et-o05", ku: "et-u05" },
                            { line: "1.5", o: m.etExtra.totalGoals.o15, u: m.etExtra.totalGoals.u15, ko: "et-o15", ku: "et-u15" },
                            { line: "2.5", o: m.etExtra.totalGoals.o25, u: m.etExtra.totalGoals.u25, ko: "et-o25", ku: "et-u25" },
                          ].filter((r) => r.o > 1.01)
                        ).map((row) => (
                          <View key={row.line} style={s.row}>
                            <OddsBtn market={row.ko} label={`Mais ${row.line}`} value={row.o} />
                            <OddsBtn market={row.ku} label={`Menos ${row.line}`} value={row.u} />
                          </View>
                        ))}
                      </Section>
                    )}
                    {m.etExtra.nextGoal.home > 1.01 && (
                      <Section title="Próximo Golo" tabKey="prolongamento">
                        <View style={s.row}>
                          <OddsBtn market="et-ng-home" label={match.home} value={m.etExtra.nextGoal.home} />
                          <OddsBtn market="et-ng-away" label={match.away} value={m.etExtra.nextGoal.away} />
                        </View>
                      </Section>
                    )}
                  </>
                )}

                {isFootball && showPen && m?.penExtra && m.penExtra.winner.home > 1.01 && (
                  <Section title="Vencedor nos Penáltis" tabKey="penaltis">
                    <View style={s.row}>
                      <OddsBtn market="pen-home" label={match.home} value={m.penExtra.winner.home} />
                      <OddsBtn market="pen-away" label={match.away} value={m.penExtra.winner.away} />
                    </View>
                  </Section>
                )}

                {isHockey && m?.totalGoals && m.totalGoals.over05 > 1.01 && (
                  <Section title="Total de Golos" tabKey="gols">
                    {(
                      [
                        { line: "0.5", o: m.totalGoals.over05, u: m.totalGoals.under05, ko: "tg-o05", ku: "tg-u05" },
                        { line: "1.5", o: m.totalGoals.over15, u: m.totalGoals.under15, ko: "tg-o15", ku: "tg-u15" },
                        { line: "2.5", o: m.totalGoals.over25, u: m.totalGoals.under25, ko: "tg-o25", ku: "tg-u25" },
                        { line: "3.5", o: m.totalGoals.over35, u: m.totalGoals.under35, ko: "tg-o35", ku: "tg-u35" },
                        { line: "4.5", o: m.totalGoals.over45, u: m.totalGoals.under45, ko: "tg-o45", ku: "tg-u45" },
                        { line: "5.5", o: m.totalGoals.over55, u: m.totalGoals.under55, ko: "tg-o55", ku: "tg-u55" },
                      ].filter((r) => r.o > 1.01)
                    ).map((row) => (
                      <View key={row.line} style={s.row}>
                        <OddsBtn market={row.ko} label={`Mais ${row.line}`} value={row.o} />
                        <OddsBtn market={row.ku} label={`Menos ${row.line}`} value={row.u} />
                      </View>
                    ))}
                  </Section>
                )}

                {isHockey && m?.halfTime && m.halfTime.home > 1.01 && (
                  <Section title="1º Período" tabKey="periodos">
                    <View style={s.row}>
                      <OddsBtn market="p1-home" label={match.home} value={m.halfTime.home} />
                      {m.halfTime.draw > 1.01 && <OddsBtn market="p1-draw" label="Empate" value={m.halfTime.draw} />}
                      <OddsBtn market="p1-away" label={match.away} value={m.halfTime.away} />
                    </View>
                  </Section>
                )}

                {isBball && m?.totalGoals && m.totalGoals.over05 > 1.01 && (
                  <Section title="Total de Pontos" tabKey="pontos">
                    {(
                      [{ line: String(m._total ?? "215.5"), o: m.totalGoals.over25, u: m.totalGoals.under25, ko: "pts-o", ku: "pts-u" }]
                        .filter((r) => r.o > 1.01)
                    ).map((row) => (
                      <View key={row.line} style={s.row}>
                        <OddsBtn market={row.ko} label={`Mais ${row.line}`} value={row.o} />
                        <OddsBtn market={row.ku} label={`Menos ${row.line}`} value={row.u} />
                      </View>
                    ))}
                  </Section>
                )}

                {(isBball || isHockey) && m?.halfTime && m.halfTime.home > 1.01 && (
                  <Section title={isBball ? "1º Quarto" : "1º Período"} tabKey="1periodo">
                    <View style={s.row}>
                      <OddsBtn market="ht-home" label={match.home} value={m.halfTime.home} />
                      {m.halfTime.draw > 1.01 && <OddsBtn market="ht-draw" label="Empate" value={m.halfTime.draw} />}
                      <OddsBtn market="ht-away" label={match.away} value={m.halfTime.away} />
                    </View>
                  </Section>
                )}

                {isTennis && m?.tennisExtra && (activeTab === "todos" || activeTab === "sets") && (
                  <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 2 }}>
                    <SH title="Mercados de Set" />
                    {m.tennisExtra.firstSet.home > 1.01 && (
                      <>
                        <Text style={s.subsectionLabel}>Vencedor Set 1</Text>
                        <View style={s.row}>
                          <OddsBtn market="s1-home" label={match.home} value={m.tennisExtra.firstSet.home} />
                          <OddsBtn market="s1-away" label={match.away} value={m.tennisExtra.firstSet.away} />
                        </View>
                      </>
                    )}
                    {m.tennisExtra.set2.home > 1.01 && (
                      <>
                        <Text style={s.subsectionLabel}>Vencedor Set 2</Text>
                        <View style={s.row}>
                          <OddsBtn market="s2-home" label={match.home} value={m.tennisExtra.set2.home} />
                          <OddsBtn market="s2-away" label={match.away} value={m.tennisExtra.set2.away} />
                        </View>
                      </>
                    )}
                    {(m.tennisExtra.totalSets?.over15 ?? 0) > 1.01 && (
                      <>
                        <Text style={s.subsectionLabel}>Total de Sets</Text>
                        <View style={s.row}>
                          <OddsBtn market="ts-o15" label="Mais 1.5 sets" value={m.tennisExtra.totalSets!.over15} />
                          <OddsBtn market="ts-u15" label="Menos 1.5 sets" value={m.tennisExtra.totalSets!.under15} />
                        </View>
                      </>
                    )}
                  </View>
                )}

                {isVolley && m?.halfTime && m.halfTime.home > 1.01 && (
                  <Section title="Set 1" tabKey="sets">
                    <View style={s.row}>
                      <OddsBtn market="p1-home" label={match.home} value={m.halfTime.home} />
                      {m.halfTime.draw > 1.01 && <OddsBtn market="p1-draw" label="Empate" value={m.halfTime.draw} />}
                      <OddsBtn market="p1-away" label={match.away} value={m.halfTime.away} />
                    </View>
                  </Section>
                )}

                {match.sport === "baseball" && m?.totalGoals && m.totalGoals.over25 > 1.01 && (
                  <Section title="Total de Corridas" tabKey="pontos">
                    {(
                      [
                        { line: "7.5", o: m.totalGoals.over25, u: m.totalGoals.under25, ko: "mlb-o75", ku: "mlb-u75" },
                        { line: "8.5", o: m.totalGoals.over35, u: m.totalGoals.under35, ko: "mlb-o85", ku: "mlb-u85" },
                        { line: "9.5", o: m.totalGoals.over45, u: m.totalGoals.under45, ko: "mlb-o95", ku: "mlb-u95" },
                      ].filter((r) => r.o > 1.01)
                    ).map((row) => (
                      <View key={row.line} style={s.row}>
                        <OddsBtn market={row.ko} label={`Mais ${row.line}`} value={row.o} />
                        <OddsBtn market={row.ku} label={`Menos ${row.line}`} value={row.u} />
                      </View>
                    ))}
                  </Section>
                )}

                {match.sport === "baseball" && m?.handicap && m.handicap.homeMinusOne > 1.01 && (
                  <Section title="Run Line (±1.5)" tabKey="runline">
                    <View style={s.row}>
                      <OddsBtn market="rl-home" label={`${match.home} -1.5`} value={m.handicap.homeMinusOneHalf} />
                      <OddsBtn market="rl-away" label={`${match.away} +1.5`} value={m.handicap.awayPlusOneHalf} />
                    </View>
                  </Section>
                )}
              </>
            )}

          </ScrollView>
        </View>
      </View>
      <LiveMatchSimulator
        visible={simulatorOpen}
        match={match}
        onClose={() => setSimulatorOpen(false)}
      />
    </Modal>
  );
}

export function TennisScoreHeader({
  sets, curPoints, home, away, colors,
}: {
  sets: Array<[number, number]>;
  curPoints?: [number | string, number | string];
  home: string;
  away: string;
  colors: ReturnType<typeof useColors>;
}) {
  const currentIdx = sets.length - 1;
  function Cell({ value, isCurrent, isPoints }: { value: number | string; isCurrent: boolean; isPoints?: boolean }) {
    return (
      <View style={{ width: isPoints ? 34 : 30, height: 26, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: isPoints ? "#f59e0b18" : isCurrent ? colors.primary + "25" : "#ffffff10", borderWidth: 1, borderColor: isPoints ? "#f59e0b40" : isCurrent ? colors.primary + "70" : "#ffffff20" }}>
        <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: isPoints ? "#f59e0b" : isCurrent ? colors.primary : "#ffffff" }}>{String(value)}</Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{home}</Text>
        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{away}</Text>
      </View>
      {sets.map((s, i) => (
        <View key={i} style={{ gap: 4 }}>
          <Cell value={s[0]} isCurrent={i === currentIdx} />
          <Cell value={s[1]} isCurrent={i === currentIdx} />
        </View>
      ))}
      {curPoints && (
        <View style={{ gap: 4 }}>
          <Cell value={curPoints[0]} isCurrent={false} isPoints />
          <Cell value={curPoints[1]} isCurrent={false} isPoints />
        </View>
      )}
    </View>
  );
}
