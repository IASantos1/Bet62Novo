import { Ionicons } from "@expo/vector-icons";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useBetSlip } from "@/context/BetSlipContext";
import type { LiveMatchMarkets } from "@/hooks/useLiveMatches";
import { getLeagueFlag } from "@/utils/teamBanners";

type TabKey =
  | "todos" | "resultado" | "dupla" | "gols" | "especiais" | "placar"
  | "handicap" | "1tempo" | "2tempo" | "htft" | "escanteios" | "cartoes"
  | "prolongamento" | "penaltis"
  | "pontos" | "1periodo" | "sets" | "periodos" | "runline" | "stats";

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
  if (isLive) return `${minute ?? 0}' • AO VIVO`;
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
  sport: string, isLive: boolean, show2tempo: boolean, showET: boolean, showPen: boolean
): TabDef[] {
  const statsTab: TabDef = { key: "stats", label: "Estat." };

  if (sport === "basketball") return [
    { key: "todos", label: "Todos" }, { key: "resultado", label: "Vencedor" },
    { key: "handicap", label: "Handicap" }, { key: "pontos", label: "Pontos" },
    { key: "1periodo", label: "1º Período" }, ...(isLive ? [statsTab] : []),
  ];
  if (sport === "tennis") return [
    { key: "todos", label: "Todos" }, { key: "resultado", label: "Vencedor" },
    { key: "sets", label: "Sets" }, ...(isLive ? [statsTab] : []),
  ];
  if (sport === "hockey") return [
    { key: "todos", label: "Todos" }, { key: "resultado", label: "Resultado" },
    { key: "gols", label: "Golos" }, { key: "periodos", label: "Períodos" },
    { key: "handicap", label: "Handicap" }, ...(isLive ? [statsTab] : []),
  ];
  if (sport === "volleyball") return [
    { key: "todos", label: "Todos" }, { key: "resultado", label: "Resultado" },
    { key: "sets", label: "Sets" }, { key: "handicap", label: "Handicap" },
    ...(isLive ? [statsTab] : []),
  ];
  if (sport === "baseball") return [
    { key: "todos", label: "Todos" }, { key: "resultado", label: "Resultado" },
    { key: "runline", label: "Run Line" }, { key: "pontos", label: "Corridas" },
    ...(isLive ? [statsTab] : []),
  ];
  // Football
  if (showPen) return [
    { key: "todos", label: "Todos" }, { key: "penaltis", label: "🎯 Penáltis" },
  ];
  if (showET) return [
    { key: "todos", label: "Todos" }, { key: "prolongamento", label: "⏱ Prorrogação" },
  ];
  return [
    { key: "todos", label: "Todos" }, { key: "resultado", label: "Resultado" },
    { key: "dupla", label: "Dupla Chance" }, { key: "gols", label: "Golos" },
    { key: "especiais", label: "Especiais" }, { key: "handicap", label: "Handicap" },
    { key: "1tempo", label: "1º Tempo" },
    ...(show2tempo ? [{ key: "2tempo" as TabKey, label: "2º Tempo" }] : []),
    { key: "htft", label: "HT/FT" }, { key: "placar", label: "Placar" },
    { key: "escanteios", label: "Escanteios" }, { key: "cartoes", label: "Cartões" },
    ...(isLive ? [statsTab] : []),
  ];
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
  const show2tempo = liveHalf === 0 || liveHalf === 2;
  const showET = isFootball && isLive && !!m?.etExtra;
  const showPen = isFootball && isLive && !!m?.penExtra;

  const tabs = getTabsForSport(match.sport, isLive, show2tempo, showET, showPen);
  const [activeTab, setActiveTab] = useState<TabKey>("todos");

  useEffect(() => {
    if (visible) setActiveTab("todos");
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
      if (prev !== undefined && Math.abs(v - prev) >= 0.02) {
        dirs[k] = v > prev ? "up" : "down";
        changed = true;
      }
      prevOddsRef.current[k] = v;
    }
    if (changed) {
      setFlashDirs((d) => ({ ...d, ...dirs }));
      const t = setTimeout(() => setFlashDirs({}), 3500);
      return () => clearTimeout(t);
    }
  }, [match.odds.home, match.odds.draw, match.odds.away, isLive]);

  const now = Date.now();
  function susp(market: string): boolean {
    const exp = match.marketSuspension?.[market];
    return exp != null && exp > now;
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
    });
  }

  function getDir(market: string): "up" | "down" | undefined {
    if (market === "1x2-home") return flashDirs["home"];
    if (market === "1x2-draw") return flashDirs["draw"];
    if (market === "1x2-away") return flashDirs["away"];
    return undefined;
  }

  function checkObvious(market: string, value: number): boolean {
    if (!isLive || !isFootball) return false;
    if (market !== "1x2-home" && market !== "1x2-away") return false;
    if (value <= 1.05) return true;
    const diff = Math.abs((match.homeScore ?? 0) - (match.awayScore ?? 0));
    const min = match.minute ?? 0;
    if (min >= 80 && diff >= 2) return true;
    if (min >= 85 && diff >= 1) return true;
    return false;
  }

  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const leagueFlag = getLeagueFlag(match.league, match.country);
  const dateStr = formatDateDisplay(match.date, isLive, match.minute, match.time);
  const hasDraw = match.odds.draw > 1.01;

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "#00000080" },
    sheet: { flex: 1, backgroundColor: colors.background, marginTop: 48 + (Platform.OS === "web" ? 0 : insets.top), borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: "hidden" },
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
    oddsValueRow: { flexDirection: "row", alignItems: "center", gap: 2 },
    subsectionLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 6, marginBottom: 4 },
    htftRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
    htftBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: "center", borderWidth: 1 },
    htftLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 1 },
    htftValue: { fontSize: 13, fontFamily: "Inter_700Bold" },
    statsPlaceholder: { alignItems: "center", justifyContent: "center", paddingVertical: 50, gap: 10 },
  });

  function SH({ title }: { title: string }) {
    return (
      <View style={s.sectionHeader}>
        <Text style={s.sectionHeaderText}>{title}</Text>
      </View>
    );
  }

  function Section({
    title, children, tabKey,
  }: { title: string; children: React.ReactNode; tabKey: TabKey }) {
    if (activeTab !== "todos" && activeTab !== tabKey) return null;
    return (
      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 2 }}>
        <SH title={title} />
        {children}
      </View>
    );
  }

  function OddsBtn({
    market, label, value, dir,
  }: { market: string; label: string; value: number; dir?: "up" | "down" }) {
    const isSusp = susp(market) || value <= 1.01;
    const isLowOdds = value < 1.15 && (market === "1x2-home" || market === "1x2-draw" || market === "1x2-away");
    const isObvious = checkObvious(market, value);
    const isSelected = hasSelection(match.id, market);

    if (isSusp || isLowOdds) {
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
          <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#f59e0b", textTransform: "uppercase", letterSpacing: 0.5 }}>Aposta Já!</Text>
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
          <Text style={[s.oddsValue, { color: "#fff" }]}>{value.toFixed(2)}</Text>
          {dir === "up" && <Text style={{ color: "#22c55e", fontSize: 9, fontFamily: "Inter_700Bold" }}>▲</Text>}
          {dir === "down" && <Text style={{ color: "#ef4444", fontSize: 9, fontFamily: "Inter_700Bold" }}>▼</Text>}
        </View>
      </Pressable>
    );
  }

  const isSuspendedGlobal = susp("result");

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.sheet}>

          {/* ── Header ── */}
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
                  <Ionicons name="bar-chart-outline" size={16} color={colors.mutedForeground} />
                </Pressable>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>vs</Text>
              </View>
              <Text style={[s.teamText, { textAlign: "right" }]} numberOfLines={1}>{match.away}</Text>
            </View>

            {isLive && (
              <View style={s.scoreRow}>
                <Text style={s.teamText} numberOfLines={1}>{match.home}</Text>
                <View style={{ alignItems: "center", gap: 4 }}>
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
                <Text style={[s.teamText, { textAlign: "right" }]} numberOfLines={1}>{match.away}</Text>
              </View>
            )}

            {isSuspendedGlobal && (
              <View style={s.suspBanner}>
                <Ionicons name="warning" size={14} color="#ef4444" />
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#ef4444" }}>
                  {match.suspensionReason?.includes("VAR") ? "📺 REVISÃO VAR"
                    : match.suspensionReason?.includes("PENAL") ? "🎯 PENÁLTI"
                    : match.suspensionReason === "GOLO" ? "⚽ GOLO"
                    : "⚠️ " + (match.suspensionReason ?? "SUSPENSO")
                  }{" "}— Odds em atualização
                </Text>
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

          {/* ── Content ── */}
          <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

            {/* STATS placeholder */}
            {activeTab === "stats" && (
              <View style={s.statsPlaceholder}>
                <Ionicons name="bar-chart-outline" size={40} color={colors.border} />
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>Estatísticas em breve</Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>Dados ao vivo disponíveis durante o jogo</Text>
              </View>
            )}

            {activeTab !== "stats" && (
              <>
                {/* ── RESULTADO FINAL ── */}
                {match.odds.home > 1.01 && (
                  <Section title="Resultado Final" tabKey="resultado">
                    <View style={s.row}>
                      <OddsBtn market="1x2-home" label={isFootball || isHockey ? "Casa (1)" : match.home} value={match.odds.home} dir={getDir("1x2-home")} />
                      {hasDraw && <OddsBtn market="1x2-draw" label="Empate (X)" value={match.odds.draw} dir={getDir("1x2-draw")} />}
                      <OddsBtn market="1x2-away" label={isFootball || isHockey ? "Fora (2)" : match.away} value={match.odds.away} dir={getDir("1x2-away")} />
                    </View>
                  </Section>
                )}

                {/* ── DUPLA CHANCE ── */}
                {isFootball && m?.doubleChance && m.doubleChance.homeOrDraw > 1.01 && (
                  <Section title="Dupla Chance" tabKey="dupla">
                    <View style={s.row}>
                      <OddsBtn market="dc-home-draw" label="1 ou X" value={m.doubleChance.homeOrDraw} />
                      <OddsBtn market="dc-away-draw" label="X ou 2" value={m.doubleChance.awayOrDraw} />
                      <OddsBtn market="dc-home-away" label="1 ou 2" value={m.doubleChance.homeOrAway} />
                    </View>
                  </Section>
                )}

                {/* ── AMBAS AS EQUIPAS MARCAM ── */}
                {isFootball && m?.bothTeamsScore && m.bothTeamsScore.yes > 1.01 && (
                  <Section title="Ambas as Equipas Marcam" tabKey="dupla">
                    <View style={s.row}>
                      <OddsBtn market="btts-yes" label="Sim" value={m.bothTeamsScore.yes} />
                      <OddsBtn market="btts-no" label="Não" value={m.bothTeamsScore.no} />
                    </View>
                  </Section>
                )}

                {/* ── TOTAL DE GOLOS ── */}
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

                {/* ── AMBAS MARCAM — 1º TEMPO ── */}
                {isFootball && m?.btts1H && m.btts1H.yes > 1.01 && (
                  <Section title="Ambas Marcam — 1º Tempo" tabKey="gols">
                    <View style={s.row}>
                      <OddsBtn market="btts1h-yes" label="Sim" value={m.btts1H.yes} />
                      <OddsBtn market="btts1h-no" label="Não" value={m.btts1H.no} />
                    </View>
                  </Section>
                )}

                {/* ── GOLOS PAR / ÍMPAR ── */}
                {isFootball && m?.goalOddEven && m.goalOddEven.odd > 1.01 && (
                  <Section title="Total Golos — Par / Ímpar" tabKey="gols">
                    <View style={s.row}>
                      <OddsBtn market="godd" label="Ímpar" value={m.goalOddEven.odd} />
                      <OddsBtn market="geven" label="Par" value={m.goalOddEven.even} />
                    </View>
                  </Section>
                )}

                {/* ── GOLOS EXATOS ── */}
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

                {/* ── GOLOS — CASA ── */}
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

                {/* ── GOLOS — FORA ── */}
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

                {/* ── VITÓRIA A ZEROS ── */}
                {isFootball && m?.winToNil && m.winToNil.home > 1.01 && (
                  <Section title="Vitória a Zeros (Win to Nil)" tabKey="especiais">
                    <View style={s.row}>
                      <OddsBtn market="wtn-home" label={match.home} value={m.winToNil.home} />
                      <OddsBtn market="wtn-away" label={match.away} value={m.winToNil.away} />
                    </View>
                  </Section>
                )}

                {/* ── FOLHA LIMPA ── */}
                {isFootball && m?.cleanSheet && m.cleanSheet.home > 1.01 && (
                  <Section title="Folha Limpa (Clean Sheet)" tabKey="especiais">
                    <View style={s.row}>
                      <OddsBtn market="cs-home" label={match.home} value={m.cleanSheet.home} />
                      <OddsBtn market="cs-away" label={match.away} value={m.cleanSheet.away} />
                    </View>
                  </Section>
                )}

                {/* ── VENCER OS DOIS TEMPOS ── */}
                {isFootball && m?.toWinBothHalves && m.toWinBothHalves.home > 1.01 && (
                  <Section title="Vencer os Dois Tempos" tabKey="especiais">
                    <View style={s.row}>
                      <OddsBtn market="wbh-home" label={match.home} value={m.toWinBothHalves.home} />
                      <OddsBtn market="wbh-away" label={match.away} value={m.toWinBothHalves.away} />
                    </View>
                  </Section>
                )}

                {/* ── TEMPO COM MAIS GOLOS ── */}
                {isFootball && m?.highestScoringHalf && m.highestScoringHalf.first > 1.01 && (
                  <Section title="Tempo com Mais Golos" tabKey="especiais">
                    <View style={s.row}>
                      <OddsBtn market="hsh-first" label="1º Tempo" value={m.highestScoringHalf.first} />
                      <OddsBtn market="hsh-second" label="2º Tempo" value={m.highestScoringHalf.second} />
                      <OddsBtn market="hsh-equal" label="Igual" value={m.highestScoringHalf.equal} />
                    </View>
                  </Section>
                )}

                {/* ── HANDICAP ── */}
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

                {/* ── HANDICAP (PONTOS) — basquete, hóquei ── */}
                {!isFootball && m?.handicapPoints && m.handicapPoints.home > 1.01 && (
                  <Section title="Handicap" tabKey="handicap">
                    <View style={s.row}>
                      <OddsBtn market="hcp-home" label={`${match.home} ${m.handicapPoints.line > 0 ? "+" : ""}${m.handicapPoints.line}`} value={m.handicapPoints.home} />
                      <OddsBtn market="hcp-away" label={`${match.away} ${m.handicapPoints.line > 0 ? "-" : "+"}${Math.abs(m.handicapPoints.line)}`} value={m.handicapPoints.away} />
                    </View>
                  </Section>
                )}

                {/* ── 1º TEMPO ── */}
                {isFootball && m?.halfTime && m.halfTime.home > 1.01 && (
                  <Section title="1º Tempo — Resultado" tabKey="1tempo">
                    <View style={s.row}>
                      <OddsBtn market="ht-home" label="Casa (1)" value={m.halfTime.home} />
                      {m.halfTime.draw > 1.01 && <OddsBtn market="ht-draw" label="Empate (X)" value={m.halfTime.draw} />}
                      <OddsBtn market="ht-away" label="Fora (2)" value={m.halfTime.away} />
                    </View>
                  </Section>
                )}

                {/* ── 1º GOLO ── */}
                {isFootball && m?.firstGoal && m.firstGoal.home > 1.01 && (
                  <Section title="1º Golo" tabKey="1tempo">
                    <View style={s.row}>
                      <OddsBtn market="fg-home" label={match.home} value={m.firstGoal.home} />
                      <OddsBtn market="fg-none" label="Sem Golos" value={m.firstGoal.noGoal} />
                      <OddsBtn market="fg-away" label={match.away} value={m.firstGoal.away} />
                    </View>
                  </Section>
                )}

                {/* ── 2º TEMPO ── */}
                {isFootball && m?.secondHalf && m.secondHalf.home > 1.01 && (
                  <Section title="2º Tempo — Resultado" tabKey="2tempo">
                    <View style={s.row}>
                      <OddsBtn market="sh-home" label="Casa (1)" value={m.secondHalf.home} />
                      {m.secondHalf.draw > 1.01 && <OddsBtn market="sh-draw" label="Empate (X)" value={m.secondHalf.draw} />}
                      <OddsBtn market="sh-away" label="Fora (2)" value={m.secondHalf.away} />
                    </View>
                  </Section>
                )}

                {/* ── HT/FT ── */}
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

                {/* ── ESCANTEIOS ── */}
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

                {/* ── CARTÕES ── */}
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

                {/* ── PRORROGAÇÃO ── */}
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

                {/* ── PENÁLTIS ── */}
                {isFootball && showPen && m?.penExtra && m.penExtra.winner.home > 1.01 && (
                  <Section title="Vencedor nos Penáltis" tabKey="penaltis">
                    <View style={s.row}>
                      <OddsBtn market="pen-home" label={match.home} value={m.penExtra.winner.home} />
                      <OddsBtn market="pen-away" label={match.away} value={m.penExtra.winner.away} />
                    </View>
                  </Section>
                )}

                {/* ── HÓQUEI: GOLOS ── */}
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

                {/* ── HÓQUEI: PERÍODOS ── */}
                {isHockey && m?.halfTime && m.halfTime.home > 1.01 && (
                  <Section title="1º Período" tabKey="periodos">
                    <View style={s.row}>
                      <OddsBtn market="p1-home" label={match.home} value={m.halfTime.home} />
                      {m.halfTime.draw > 1.01 && <OddsBtn market="p1-draw" label="Empate" value={m.halfTime.draw} />}
                      <OddsBtn market="p1-away" label={match.away} value={m.halfTime.away} />
                    </View>
                  </Section>
                )}

                {/* ── BASQUETE: PONTOS ── */}
                {isBball && m?.totalGoals && m.totalGoals.over05 > 1.01 && (
                  <Section title="Total de Pontos" tabKey="pontos">
                    {(
                      [
                        { line: String(m._total ?? "215.5"), o: m.totalGoals.over25, u: m.totalGoals.under25, ko: "pts-o", ku: "pts-u" },
                      ].filter((r) => r.o > 1.01)
                    ).map((row) => (
                      <View key={row.line} style={s.row}>
                        <OddsBtn market={row.ko} label={`Mais ${row.line}`} value={row.o} />
                        <OddsBtn market={row.ku} label={`Menos ${row.line}`} value={row.u} />
                      </View>
                    ))}
                  </Section>
                )}

                {/* ── BASQUETE / HÓQUEI: 1º PERÍODO ── */}
                {(isBball || isHockey) && m?.halfTime && m.halfTime.home > 1.01 && (
                  <Section title={isBball ? "1º Quarto" : "1º Período"} tabKey="1periodo">
                    <View style={s.row}>
                      <OddsBtn market="ht-home" label={match.home} value={m.halfTime.home} />
                      {m.halfTime.draw > 1.01 && <OddsBtn market="ht-draw" label="Empate" value={m.halfTime.draw} />}
                      <OddsBtn market="ht-away" label={match.away} value={m.halfTime.away} />
                    </View>
                  </Section>
                )}

                {/* ── TÉNIS: SETS ── */}
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

                {/* ── VOLEIBOL / HÓQUEI: PERÍODO 1 ── */}
                {isVolley && m?.halfTime && m.halfTime.home > 1.01 && (
                  <Section title="Set 1" tabKey="sets">
                    <View style={s.row}>
                      <OddsBtn market="p1-home" label={match.home} value={m.halfTime.home} />
                      {m.halfTime.draw > 1.01 && <OddsBtn market="p1-draw" label="Empate" value={m.halfTime.draw} />}
                      <OddsBtn market="p1-away" label={match.away} value={m.halfTime.away} />
                    </View>
                  </Section>
                )}

                {/* ── BASEBALL: PONTOS ── */}
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

                {/* ── BASEBALL: RUN LINE ── */}
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
    </Modal>
  );
}

/** Tennis score header inside the markets sheet */
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
