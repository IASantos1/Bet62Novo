import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { type ComponentProps, useState } from "react";
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

type MCIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export interface MatchInfo {
  id: string;
  sport: string;
  home: string;
  away: string;
  odds: { home: number; draw: number; away: number };
  markets?: LiveMatchMarkets;
  marketSuspension?: Record<string, number>;
  homeScore?: number;
  awayScore?: number;
  isLive?: boolean;
  minute?: number;
  status?: string;
  _liveExtra?: {
    sets?: Array<[number, number]>;
    currentPoints?: [number | string, number | string];
    periods?: Array<[number, number]>;
    quarters?: Array<[number, number]>;
    innings?: Array<[number, number]>;
  };
}

interface Props {
  visible: boolean;
  match: MatchInfo;
  onClose: () => void;
}

type TabKey =
  | "todos" | "resultado" | "dupla" | "gols" | "placar"
  | "handicap" | "1tempo" | "htft" | "escanteios" | "cartoes"
  | "pontos" | "1periodo" | "sets" | "periodos" | "runline";

interface TabDef { key: TabKey; label: string }

const SPORT_ICONS: Record<string, MCIconName> = {
  football: "soccer",
  basketball: "basketball",
  tennis: "tennis",
  hockey: "hockey-puck",
  volleyball: "volleyball",
  baseball: "baseball",
};

const SPORT_COLORS: Record<string, string> = {
  football: "#22c55e",
  basketball: "#f97316",
  tennis: "#eab308",
  hockey: "#60a5fa",
  volleyball: "#a78bfa",
  baseball: "#fb7185",
};

function getTabsForSport(sport: string): TabDef[] {
  switch (sport) {
    case "basketball": return [
      { key: "todos", label: "Todos" },
      { key: "resultado", label: "Resultado" },
      { key: "handicap", label: "Handicap" },
      { key: "pontos", label: "Pontos" },
      { key: "1periodo", label: "1º Período" },
    ];
    case "tennis": return [
      { key: "todos", label: "Todos" },
      { key: "resultado", label: "Resultado" },
      { key: "sets", label: "Sets" },
    ];
    case "hockey": return [
      { key: "todos", label: "Todos" },
      { key: "resultado", label: "Resultado" },
      { key: "gols", label: "Golos" },
      { key: "periodos", label: "Períodos" },
      { key: "handicap", label: "Handicap" },
    ];
    case "volleyball": return [
      { key: "todos", label: "Todos" },
      { key: "resultado", label: "Resultado" },
      { key: "sets", label: "Sets" },
      { key: "handicap", label: "Handicap" },
    ];
    case "baseball": return [
      { key: "todos", label: "Todos" },
      { key: "resultado", label: "Resultado" },
      { key: "runline", label: "Run Line" },
      { key: "pontos", label: "Pontos" },
    ];
    default: return [
      { key: "todos", label: "Todos" },
      { key: "resultado", label: "Resultado" },
      { key: "dupla", label: "Dupla Chance" },
      { key: "gols", label: "Golos" },
      { key: "placar", label: "Placar Exato" },
      { key: "handicap", label: "Handicap" },
      { key: "1tempo", label: "1º Tempo" },
      { key: "htft", label: "HT/FT" },
      { key: "escanteios", label: "Escanteios" },
      { key: "cartoes", label: "Cartões" },
    ];
  }
}

function TennisScoreHeader({
  sets,
  currentPoints,
  home,
  away,
  colors,
}: {
  sets: Array<[number, number]>;
  currentPoints?: [number | string, number | string];
  home: string;
  away: string;
  colors: ReturnType<typeof useColors>;
}) {
  const currentSet = sets.length - 1;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {/* Team names */}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{home}</Text>
        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{away}</Text>
      </View>
      {/* Set scores — one column per set */}
      {sets.map((set, idx) => {
        const isCurrent = idx === currentSet;
        return (
          <View key={idx} style={{ alignItems: "center", gap: 4 }}>
            <View style={[{
              width: 32, height: 28, borderRadius: 6,
              alignItems: "center", justifyContent: "center",
              backgroundColor: isCurrent ? colors.primary + "30" : "#ffffff10",
              borderWidth: isCurrent ? 1 : 0,
              borderColor: colors.primary + "60",
            }]}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: isCurrent ? colors.primary : colors.foreground }}>{set[0]}</Text>
            </View>
            <View style={[{
              width: 32, height: 28, borderRadius: 6,
              alignItems: "center", justifyContent: "center",
              backgroundColor: isCurrent ? colors.primary + "30" : "#ffffff10",
              borderWidth: isCurrent ? 1 : 0,
              borderColor: colors.primary + "60",
            }]}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: isCurrent ? colors.primary : colors.foreground }}>{set[1]}</Text>
            </View>
          </View>
        );
      })}
      {/* Current game points */}
      {currentPoints && (
        <View style={{ alignItems: "center", gap: 4, marginLeft: 4 }}>
          <View style={{ width: 36, height: 28, borderRadius: 6, backgroundColor: "#f59e0b20", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#f59e0b" }}>{String(currentPoints[0])}</Text>
          </View>
          <View style={{ width: 36, height: 28, borderRadius: 6, backgroundColor: "#f59e0b20", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#f59e0b" }}>{String(currentPoints[1])}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

export function ComprehensiveMarketsSheet({ visible, match, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addSelection, removeSelection, hasSelection } = useBetSlip();
  const [activeTab, setActiveTab] = useState<TabKey>("todos");

  const tabs = getTabsForSport(match.sport);
  const m = match.markets;
  const now = Date.now();
  const sportColor = SPORT_COLORS[match.sport] ?? colors.primary;

  function susp(key: string) {
    return match.marketSuspension?.[key] != null && match.marketSuspension[key]! > now;
  }

  function handleOdds(market: string, label: string, value: number) {
    if (!value || value <= 1.01) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const fullLabel = `${match.home} vs ${match.away} — ${label}`;
    if (hasSelection(match.id, market)) {
      removeSelection(match.id, market);
    } else {
      addSelection({
        matchId: match.id,
        matchTitle: `${match.home} vs ${match.away}`,
        market, selection: market,
        label: fullLabel,
        odds: value,
      });
    }
  }

  const topPad = Platform.OS === "ios" ? insets.top : insets.top + 4;
  const isFootball = match.sport === "football";
  const isTennis = match.sport === "tennis";
  const isBball = match.sport === "basketball";
  const isHockey = match.sport === "hockey";
  const isVolley = match.sport === "volleyball";
  const isBaseball = match.sport === "baseball";
  const hasDraw = match.odds.draw > 1.01;

  const hasLiveScore = match.isLive && match.homeScore !== undefined;
  const sets = match._liveExtra?.sets;
  const currentPoints = match._liveExtra?.currentPoints;
  const periods = match._liveExtra?.periods;
  const quarters = match._liveExtra?.quarters;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: 10,
      paddingTop: topPad + 4,
    },
    headerTop: {
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: 14, paddingBottom: 10, gap: 10,
    },
    backBtn: { padding: 6 },
    matchTitle: {
      flex: 1, fontSize: 15,
      fontFamily: "Inter_700Bold", color: colors.foreground,
    },
    sportBadge: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: sportColor + "20", borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 5,
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
    scoreArea: {
      paddingHorizontal: 14, paddingBottom: 4,
    },
    simpleScore: {
      flexDirection: "row", alignItems: "center", gap: 12,
    },
    teamName: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    scoreBox: {
      backgroundColor: "#0c0c12", borderRadius: 8,
      paddingHorizontal: 14, paddingVertical: 8,
      borderWidth: 1, borderColor: colors.primary + "40",
    },
    scoreText: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#ffffff", letterSpacing: 2 },
    minuteBadge: {
      backgroundColor: "#f59e0b20", borderRadius: 6,
      paddingHorizontal: 8, paddingVertical: 4,
    },
    minuteText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#f59e0b" },
    tabBar: {
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    tab: { paddingHorizontal: 14, paddingVertical: 9, marginLeft: 2 },
    tabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    section: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 },
    sectionTitle: {
      fontSize: 10, fontFamily: "Inter_700Bold",
      color: colors.mutedForeground,
      textTransform: "uppercase" as const, letterSpacing: 0.8,
      marginBottom: 8,
    },
    row: { flexDirection: "row", gap: 6, marginBottom: 6 },
    oddsBtn: {
      flex: 1, borderRadius: 8, borderWidth: 1,
      paddingVertical: 10, paddingHorizontal: 4, alignItems: "center",
    },
    oddsLabel: { fontSize: 10, fontFamily: "Inter_500Medium", marginBottom: 2 },
    oddsValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
    suspBanner: {
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: "#ef444415", borderRadius: 6,
      paddingHorizontal: 10, paddingVertical: 5, margin: 14,
    },
    suspText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#ef4444" },
    htftGrid: { gap: 6, paddingHorizontal: 14, paddingBottom: 8 },
    htftRow: { flexDirection: "row", gap: 6 },
    htftBtn: {
      flex: 1, borderRadius: 8, borderWidth: 1,
      paddingVertical: 9, paddingHorizontal: 4, alignItems: "center",
    },
    htftLabel: { fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center" as const, marginBottom: 2 },
    htftValue: { fontSize: 12, fontFamily: "Inter_700Bold" },
  });

  function OddsBtn({ market, label, value }: { market: string; label: string; value: number }) {
    const sel = hasSelection(match.id, market);
    const suspended = susp(market) || value <= 1.01;
    return (
      <Pressable
        style={({ pressed }) => [s.oddsBtn, {
          backgroundColor: suspended ? colors.muted : sel ? colors.primary : colors.muted,
          borderColor: suspended ? colors.border : sel ? colors.primary : colors.border,
          opacity: suspended ? 0.5 : pressed ? 0.8 : 1,
        }]}
        onPress={suspended ? undefined : () => handleOdds(market, label, value)}
      >
        {suspended
          ? <Ionicons name="lock-closed" size={12} color={colors.mutedForeground} />
          : <>
              <Text style={[s.oddsLabel, { color: sel ? colors.primaryForeground : colors.mutedForeground }]} numberOfLines={1}>{label}</Text>
              <Text style={[s.oddsValue, { color: sel ? colors.primaryForeground : colors.foreground }]}>{value.toFixed(2)}</Text>
            </>
        }
      </Pressable>
    );
  }

  function Section({ title, children, tabKey }: { title: string; children: React.ReactNode; tabKey: TabKey }) {
    if (activeTab !== "todos" && activeTab !== tabKey) return null;
    return (
      <View style={s.section}>
        <Text style={s.sectionTitle}>{title}</Text>
        {children}
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={s.container}>
        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerTop}>
            <Pressable style={s.backBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back" size={22} color={colors.foreground} />
            </Pressable>
            <Text style={s.matchTitle} numberOfLines={1}>{match.home} vs {match.away}</Text>
            <View style={s.sportBadge}>
              {match.isLive && <View style={s.liveDot} />}
              <MaterialCommunityIcons name={SPORT_ICONS[match.sport] ?? "trophy"} size={16} color={sportColor} />
            </View>
          </View>

          {/* Score area */}
          {hasLiveScore && (
            <View style={s.scoreArea}>
              {isTennis && sets && sets.length > 0 ? (
                <TennisScoreHeader sets={sets} currentPoints={currentPoints} home={match.home} away={match.away} colors={colors} />
              ) : (
                <View style={s.simpleScore}>
                  <Text style={s.teamName} numberOfLines={1}>{match.home}</Text>
                  <View style={s.scoreBox}>
                    <Text style={s.scoreText}>
                      {match.homeScore ?? 0} – {match.awayScore ?? 0}
                    </Text>
                  </View>
                  <Text style={[s.teamName, { textAlign: "right" as const }]} numberOfLines={1}>{match.away}</Text>
                  {match.minute != null && (
                    <View style={s.minuteBadge}>
                      <Text style={s.minuteText}>{isTennis ? `Set ${match.minute}` : `${match.minute}'`}</Text>
                    </View>
                  )}
                </View>
              )}
              {/* Period breakdown for hockey/basketball */}
              {(isHockey || isBball) && (periods ?? quarters) && (periods ?? quarters)!.length > 0 && (
                <View style={{ flexDirection: "row", gap: 5, marginTop: 6, paddingHorizontal: 2 }}>
                  {(periods ?? quarters)!.map((p, i) => (
                    <View key={i} style={{ backgroundColor: "#ffffff10", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>{p[0]}–{p[1]}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Tab bar ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.tabBar}
          contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 4 }}
        >
          {tabs.map((t) => (
            <Pressable
              key={t.key}
              style={[s.tab, {
                backgroundColor: activeTab === t.key ? colors.primary : "transparent",
                borderRadius: 8,
              }]}
              onPress={() => setActiveTab(t.key)}
            >
              <Text style={[s.tabText, { color: activeTab === t.key ? colors.primaryForeground : colors.mutedForeground }]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ── Markets content ── */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 50 + insets.bottom }}
        >
          {/* Global suspension banner */}
          {susp("result") && (
            <View style={s.suspBanner}>
              <Ionicons name="warning" size={14} color="#ef4444" />
              <Text style={s.suspText}>Mercados suspensos — evento em análise</Text>
            </View>
          )}

          {/* ── RESULTADO ── */}
          {(activeTab === "todos" || activeTab === "resultado") && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Resultado Final</Text>
              <View style={s.row}>
                <OddsBtn market="1x2-home" label={match.home} value={match.odds.home} />
                {hasDraw && <OddsBtn market="1x2-draw" label="Empate" value={match.odds.draw} />}
                <OddsBtn market="1x2-away" label={match.away} value={match.odds.away} />
              </View>
            </View>
          )}

          {/* ── DUPLA HIPÓTESE ── */}
          {isFootball && m?.doubleChance && m.doubleChance.homeOrDraw > 1.01 && (
            <Section title="Dupla Hipótese" tabKey="dupla">
              <View style={s.row}>
                <OddsBtn market="dc-hd" label={`${match.home} ou X`} value={m.doubleChance.homeOrDraw} />
                <OddsBtn market="dc-12" label="1 ou 2" value={m.doubleChance.homeOrAway} />
                <OddsBtn market="dc-da" label={`X ou ${match.away}`} value={m.doubleChance.awayOrDraw} />
              </View>
              {(m.bothTeamsScore?.yes ?? 0) > 1.01 && (
                <View style={s.row}>
                  <OddsBtn market="bts-yes" label="Ambas Marcam — Sim" value={m.bothTeamsScore!.yes} />
                  <OddsBtn market="bts-no" label="Ambas Marcam — Não" value={m.bothTeamsScore!.no} />
                </View>
              )}
            </Section>
          )}

          {/* ── TOTAL GOLOS / PONTOS / RUNS ── */}
          {m?.totalGoals && m.totalGoals.over25 > 1.01 && (
            <Section
              title={isBball ? "Total de Pontos" : isBaseball ? "Total de Runs" : isVolley ? "Total de Sets" : "Total de Golos"}
              tabKey={isBball || isBaseball ? "pontos" : "gols"}
            >
              {([
                { label: "0.5", o: m.totalGoals.over05, u: m.totalGoals.under05, ko: "tg-o05", ku: "tg-u05" },
                { label: "1.5", o: m.totalGoals.over15, u: m.totalGoals.under15, ko: "tg-o15", ku: "tg-u15" },
                { label: "2.5", o: m.totalGoals.over25, u: m.totalGoals.under25, ko: "tg-o25", ku: "tg-u25" },
                { label: "3.5", o: m.totalGoals.over35, u: m.totalGoals.under35, ko: "tg-o35", ku: "tg-u35" },
                { label: "4.5", o: m.totalGoals.over45, u: m.totalGoals.under45, ko: "tg-o45", ku: "tg-u45" },
                { label: "5.5", o: m.totalGoals.over55, u: m.totalGoals.under55, ko: "tg-o55", ku: "tg-u55" },
                { label: "6.5", o: m.totalGoals.over65, u: m.totalGoals.under65, ko: "tg-o65", ku: "tg-u65" },
              ] as { label: string; o: number; u: number; ko: string; ku: string }[])
                .filter((r) => r.o > 1.01 && r.u > 1.01)
                .map((row) => (
                  <View key={row.label} style={s.row}>
                    <OddsBtn market={row.ko} label={`Mais ${row.label}`} value={row.o} />
                    <OddsBtn market={row.ku} label={`Menos ${row.label}`} value={row.u} />
                  </View>
                ))}
            </Section>
          )}

          {/* ── GOLOS EXATOS ── */}
          {isFootball && m?.exactGoals && m.exactGoals.g2 > 1.01 && (
            <Section title="Golos Exatos" tabKey="placar">
              <View style={s.row}>
                <OddsBtn market="eg-0" label="0 Golos" value={m.exactGoals.g0} />
                <OddsBtn market="eg-1" label="1 Golo" value={m.exactGoals.g1} />
                <OddsBtn market="eg-2" label="2 Golos" value={m.exactGoals.g2} />
              </View>
              <View style={s.row}>
                <OddsBtn market="eg-3" label="3 Golos" value={m.exactGoals.g3} />
                <OddsBtn market="eg-4" label="4 Golos" value={m.exactGoals.g4} />
                <OddsBtn market="eg-5p" label="5+ Golos" value={m.exactGoals.g5plus} />
              </View>
            </Section>
          )}

          {/* ── HANDICAP ── */}
          {m?.handicap && m.handicap.homeMinusOne > 1.01 && (
            <Section
              title={isBaseball ? "Run Line" : "Handicap"}
              tabKey={isBaseball ? "runline" : "handicap"}
            >
              <View style={s.row}>
                <OddsBtn market="hc-hm1" label={`${match.home} -1`} value={m.handicap.homeMinusOne} />
                <OddsBtn market="hc-ap1" label={`${match.away} +1`} value={m.handicap.awayPlusOne} />
              </View>
              {m.handicap.homeMinusOneHalf > 1.01 && (
                <View style={s.row}>
                  <OddsBtn market="hc-hm15" label={`${match.home} -1.5`} value={m.handicap.homeMinusOneHalf} />
                  <OddsBtn market="hc-ap15" label={`${match.away} +1.5`} value={m.handicap.awayPlusOneHalf} />
                </View>
              )}
              {m?.handicapPoints && m.handicapPoints.home > 1.01 && (
                <View style={s.row}>
                  <OddsBtn market="hcp-home" label={`${match.home} ${m.handicapPoints.line > 0 ? "+" : ""}${m.handicapPoints.line}`} value={m.handicapPoints.home} />
                  <OddsBtn market="hcp-away" label={`${match.away} ${m.handicapPoints.line > 0 ? "-" : "+"}${Math.abs(m.handicapPoints.line)}`} value={m.handicapPoints.away} />
                </View>
              )}
            </Section>
          )}

          {/* ── 1º TEMPO / 1º PERÍODO ── */}
          {m?.halfTime && m.halfTime.home > 1.01 && (
            <Section
              title={isBball ? "1º Período" : isHockey ? "1º Período" : "1º Tempo"}
              tabKey={isBball || isHockey ? "1periodo" : "1tempo"}
            >
              <View style={s.row}>
                <OddsBtn market="ht-home" label={match.home} value={m.halfTime.home} />
                {m.halfTime.draw > 1.01 && <OddsBtn market="ht-draw" label="Empate" value={m.halfTime.draw} />}
                <OddsBtn market="ht-away" label={match.away} value={m.halfTime.away} />
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

          {/* ── HT/FT ── */}
          {isFootball && m?.htft && m.htft.hh > 1.01 && (activeTab === "todos" || activeTab === "htft") && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Intervalo / Final (HT/FT)</Text>
              {[
                [{ k: "htft-hh", l: "1 / 1", v: m.htft.hh }, { k: "htft-hd", l: "1 / X", v: m.htft.hd }, { k: "htft-ha", l: "1 / 2", v: m.htft.ha }],
                [{ k: "htft-dh", l: "X / 1", v: m.htft.dh }, { k: "htft-dd", l: "X / X", v: m.htft.dd }, { k: "htft-da", l: "X / 2", v: m.htft.da }],
                [{ k: "htft-ah", l: "2 / 1", v: m.htft.ah }, { k: "htft-ad", l: "2 / X", v: m.htft.ad }, { k: "htft-aa", l: "2 / 2", v: m.htft.aa }],
              ].map((row, ri) => (
                <View key={ri} style={[s.htftGrid, { paddingHorizontal: 0, marginBottom: 6 }]}>
                  <View style={s.htftRow}>
                    {row.map(({ k, l, v }) => {
                      const sel = hasSelection(match.id, k);
                      return (
                        <Pressable
                          key={k}
                          style={({ pressed }) => [s.htftBtn, {
                            backgroundColor: sel ? colors.primary : colors.muted,
                            borderColor: sel ? colors.primary : colors.border,
                            opacity: pressed ? 0.8 : 1,
                          }]}
                          onPress={() => handleOdds(k, `HT/FT ${l}`, v)}
                        >
                          <Text style={[s.htftLabel, { color: sel ? colors.primaryForeground : colors.mutedForeground }]}>{l}</Text>
                          <Text style={[s.htftValue, { color: sel ? colors.primaryForeground : colors.foreground }]}>{v.toFixed(2)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ── ESCANTEIOS ── */}
          {isFootball && m?.corners && m.corners.o85 > 1.01 && (
            <Section title="Escanteios" tabKey="escanteios">
              {([
                { label: "8.5", o: m.corners.o85, u: m.corners.u85, ko: "oc85", ku: "uc85" },
                { label: "9.5", o: m.corners.o95, u: m.corners.u95, ko: "oc95", ku: "uc95" },
                { label: "10.5", o: m.corners.o105, u: m.corners.u105, ko: "oc105", ku: "uc105" },
              ].filter((r) => r.o > 1.01).map((row) => (
                <View key={row.label} style={s.row}>
                  <OddsBtn market={row.ko} label={`Mais ${row.label}`} value={row.o} />
                  <OddsBtn market={row.ku} label={`Menos ${row.label}`} value={row.u} />
                </View>
              )))}
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

          {/* ── TÉNIS SETS ── */}
          {isTennis && m?.tennisExtra && (activeTab === "todos" || activeTab === "sets") && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Mercados de Set</Text>
              {m.tennisExtra.firstSet.home > 1.01 && (
                <>
                  <Text style={[s.sectionTitle, { marginTop: 6, fontSize: 9 }]}>VENCEDOR SET 1</Text>
                  <View style={s.row}>
                    <OddsBtn market="s1-home" label={match.home} value={m.tennisExtra.firstSet.home} />
                    <OddsBtn market="s1-away" label={match.away} value={m.tennisExtra.firstSet.away} />
                  </View>
                </>
              )}
              {m.tennisExtra.set2.home > 1.01 && (
                <>
                  <Text style={[s.sectionTitle, { marginTop: 6, fontSize: 9 }]}>VENCEDOR SET 2</Text>
                  <View style={s.row}>
                    <OddsBtn market="s2-home" label={match.home} value={m.tennisExtra.set2.home} />
                    <OddsBtn market="s2-away" label={match.away} value={m.tennisExtra.set2.away} />
                  </View>
                </>
              )}
              {(m.tennisExtra.totalSets?.over15 ?? 0) > 1.01 && (
                <>
                  <Text style={[s.sectionTitle, { marginTop: 6, fontSize: 9 }]}>TOTAL DE SETS</Text>
                  <View style={s.row}>
                    <OddsBtn market="ts-o15" label="Mais 1.5 sets" value={m.tennisExtra.totalSets!.over15} />
                    <OddsBtn market="ts-u15" label="Menos 1.5 sets" value={m.tennisExtra.totalSets!.under15} />
                  </View>
                </>
              )}
            </View>
          )}

          {/* ── PERÍODO 1 (voleibol/hóquei) ── */}
          {(isVolley || isHockey) && m?.halfTime && m.halfTime.home > 1.01 && (activeTab === "todos" || activeTab === "periodos") && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{isVolley ? "Set 1" : "1º Período"}</Text>
              <View style={s.row}>
                <OddsBtn market="p1-home" label={match.home} value={m.halfTime.home} />
                {m.halfTime.draw > 1.01 && <OddsBtn market="p1-draw" label="Empate" value={m.halfTime.draw} />}
                <OddsBtn market="p1-away" label={match.away} value={m.halfTime.away} />
              </View>
            </View>
          )}

        </ScrollView>
      </View>
    </Modal>
  );
}
