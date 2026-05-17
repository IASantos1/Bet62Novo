import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useBetSlip } from "@/context/BetSlipContext";
import type { LiveMatch, LiveMatchMarkets } from "@/hooks/useLiveMatches";

interface MatchInfo {
  id: string;
  sport: string;
  home: string;
  away: string;
  odds: { home: number; draw: number; away: number };
  markets?: LiveMatchMarkets;
  marketSuspension?: Record<string, number>;
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

export function ComprehensiveMarketsSheet({ visible, match, onClose }: Props) {
  const colors = useColors();
  const { addSelection, removeSelection, hasSelection } = useBetSlip();
  const [activeTab, setActiveTab] = useState<TabKey>("todos");

  const tabs = getTabsForSport(match.sport);
  const m = match.markets;
  const now = Date.now();

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
      addSelection({ matchId: match.id, matchTitle: `${match.home} vs ${match.away}`, market, selection: market, label: fullLabel, odds: value });
    }
  }

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "#00000070", justifyContent: "flex-end" },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "90%" },
    handle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 2 },
    topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    matchTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    tabBar: { borderBottomWidth: 1, borderBottomColor: colors.border },
    tab: { paddingHorizontal: 14, paddingVertical: 10, marginLeft: 4 },
    tabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    section: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
    sectionTitle: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.mutedForeground, textTransform: "uppercase" as const, letterSpacing: 0.8, marginBottom: 8 },
    row: { flexDirection: "row", gap: 6, marginBottom: 6 },
    oddsBtn: { flex: 1, borderRadius: 8, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 6, alignItems: "center" },
    oddsLabel: { fontSize: 10, fontFamily: "Inter_500Medium", marginBottom: 2 },
    oddsValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
    fullBtn: { flex: 2 },
    suspBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#ef444415", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginHorizontal: 14, marginBottom: 6 },
    suspText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#ef4444" },
    htftGrid: { gap: 6, paddingHorizontal: 14, paddingBottom: 8 },
    htftRow: { flexDirection: "row", gap: 6 },
    htftBtn: { flex: 1, borderRadius: 8, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 4, alignItems: "center" },
    htftLabel: { fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center" as const, marginBottom: 2 },
    htftValue: { fontSize: 12, fontFamily: "Inter_700Bold" },
  });

  function OddsBtn({ market, label, value, colspan }: { market: string; label: string; value: number; colspan?: boolean }) {
    const sel = hasSelection(match.id, market);
    const suspended = susp(market) || value <= 1.01;
    return (
      <Pressable
        style={({ pressed }) => [
          s.oddsBtn,
          colspan ? s.fullBtn : {},
          {
            backgroundColor: suspended ? colors.muted : sel ? colors.primary : colors.muted,
            borderColor: suspended ? colors.border : sel ? colors.primary : colors.border,
            opacity: suspended ? 0.55 : pressed ? 0.8 : 1,
          },
        ]}
        onPress={suspended ? undefined : () => handleOdds(market, label, value)}
      >
        {suspended ? (
          <Ionicons name="lock-closed" size={11} color={colors.mutedForeground} />
        ) : (
          <>
            <Text style={[s.oddsLabel, { color: sel ? colors.primaryForeground : colors.mutedForeground }]} numberOfLines={1}>{label}</Text>
            <Text style={[s.oddsValue, { color: sel ? colors.primaryForeground : colors.foreground }]}>{value.toFixed(2)}</Text>
          </>
        )}
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

  const hasDraw = match.odds.draw > 1.01;
  const isFootball = match.sport === "football";
  const isTennis = match.sport === "tennis";
  const isBball = match.sport === "basketball";
  const isHockey = match.sport === "hockey";
  const isVolley = match.sport === "volleyball";
  const isBaseball = match.sport === "baseball";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable>
          <View style={s.sheet}>
            <View style={s.handle} />

            <View style={s.topBar}>
              <Text style={s.matchTitle} numberOfLines={2}>{match.home}{"\n"}{match.away}</Text>
              <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close-circle" size={24} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 4 }}>
              {tabs.map((t) => (
                <Pressable
                  key={t.key}
                  style={[s.tab, { backgroundColor: activeTab === t.key ? colors.primary : "transparent", borderRadius: 8 }]}
                  onPress={() => setActiveTab(t.key)}
                >
                  <Text style={[s.tabText, { color: activeTab === t.key ? colors.primaryForeground : colors.mutedForeground }]}>{t.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>

              {/* ── RESULTADO ── */}
              {(activeTab === "todos" || activeTab === "resultado") && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>Resultado Final</Text>
                  {susp("result") && (
                    <View style={s.suspBadge}>
                      <Ionicons name="warning" size={12} color="#ef4444" />
                      <Text style={s.suspText}>Mercado suspenso</Text>
                    </View>
                  )}
                  <View style={s.row}>
                    <OddsBtn market="1x2-home" label={match.home} value={match.odds.home} />
                    {hasDraw && <OddsBtn market="1x2-draw" label="Empate" value={match.odds.draw} />}
                    <OddsBtn market="1x2-away" label={match.away} value={match.odds.away} />
                  </View>
                </View>
              )}

              {/* ── DUPLA CHANCE (football) ── */}
              {isFootball && m?.doubleChance && m.doubleChance.homeOrDraw > 1.01 && (
                <Section title="Dupla Hipótese" tabKey="dupla">
                  <View style={s.row}>
                    <OddsBtn market="dc-hd" label={`${match.home} ou X`} value={m.doubleChance.homeOrDraw} />
                    <OddsBtn market="dc-12" label="1 ou 2" value={m.doubleChance.homeOrAway} />
                    <OddsBtn market="dc-da" label={`X ou ${match.away}`} value={m.doubleChance.awayOrDraw} />
                  </View>
                  {m.bothTeamsScore && m.bothTeamsScore.yes > 1.01 && (
                    <View style={s.row}>
                      <OddsBtn market="bts-yes" label="Ambas Marcam — Sim" value={m.bothTeamsScore.yes} />
                      <OddsBtn market="bts-no" label="Ambas Marcam — Não" value={m.bothTeamsScore.no} />
                    </View>
                  )}
                </Section>
              )}

              {/* ── TOTAL GOLOS / PONTOS ── */}
              {m?.totalGoals && m.totalGoals.over25 > 1.01 && (
                <Section title={isFootball ? "Total de Golos" : isBball ? "Total de Pontos" : isHockey ? "Total de Golos" : isVolley ? "Total de Sets" : isBaseball ? "Total de Runs" : "Total"} tabKey={isBball || isBaseball ? "pontos" : "gols"}>
                  {([
                    { label: "0.5", o: m.totalGoals.over05, u: m.totalGoals.under05, ko: "o05", ku: "u05" },
                    { label: "1.5", o: m.totalGoals.over15, u: m.totalGoals.under15, ko: "o15", ku: "u15" },
                    { label: "2.5", o: m.totalGoals.over25, u: m.totalGoals.under25, ko: "o25", ku: "u25" },
                    { label: "3.5", o: m.totalGoals.over35, u: m.totalGoals.under35, ko: "o35", ku: "u35" },
                    { label: "4.5", o: m.totalGoals.over45, u: m.totalGoals.under45, ko: "o45", ku: "u45" },
                    { label: "5.5", o: m.totalGoals.over55, u: m.totalGoals.under55, ko: "o55", ku: "u55" },
                    { label: "6.5", o: m.totalGoals.over65, u: m.totalGoals.under65, ko: "o65", ku: "u65" },
                  ] as { label: string; o: number; u: number; ko: string; ku: string }[])
                    .filter((row) => row.o > 1.01 && row.u > 1.01)
                    .map((row) => (
                      <View key={row.label} style={s.row}>
                        <OddsBtn market={`tg-${row.ko}`} label={`Mais ${row.label}`} value={row.o} />
                        <OddsBtn market={`tg-${row.ku}`} label={`Menos ${row.label}`} value={row.u} />
                      </View>
                    ))}
                </Section>
              )}

              {/* ── GOLOS EXATOS (football only) ── */}
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
                <Section title={isBball ? "Handicap de Pontos" : isBaseball ? "Run Line" : "Handicap"} tabKey={isBaseball ? "runline" : "handicap"}>
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
                <Section title={isBball ? "1º Período" : isHockey ? "1º Período" : "1º Tempo"} tabKey={isBball || isHockey ? "1periodo" : "1tempo"}>
                  <View style={s.row}>
                    <OddsBtn market="ht-home" label={match.home} value={m.halfTime.home} />
                    {m.halfTime.draw > 1.01 && <OddsBtn market="ht-draw" label="Empate" value={m.halfTime.draw} />}
                    <OddsBtn market="ht-away" label={match.away} value={m.halfTime.away} />
                  </View>
                </Section>
              )}

              {/* ── 1º GOLO (football) ── */}
              {isFootball && m?.firstGoal && m.firstGoal.home > 1.01 && (
                <Section title="1º Golo" tabKey="1tempo">
                  <View style={s.row}>
                    <OddsBtn market="fg-home" label={match.home} value={m.firstGoal.home} />
                    <OddsBtn market="fg-none" label="Sem Golos" value={m.firstGoal.noGoal} />
                    <OddsBtn market="fg-away" label={match.away} value={m.firstGoal.away} />
                  </View>
                </Section>
              )}

              {/* ── HT/FT (football) ── */}
              {isFootball && m?.htft && m.htft.hh > 1.01 && (activeTab === "todos" || activeTab === "htft") && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>Intervalo / Final (HT/FT)</Text>
                  <View style={s.htftGrid}>
                    <View style={s.htftRow}>
                      <Pressable style={({ pressed }) => [s.htftBtn, { backgroundColor: hasSelection(match.id, "htft-hh") ? colors.primary : colors.muted, borderColor: hasSelection(match.id, "htft-hh") ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 }]} onPress={() => handleOdds("htft-hh", "HT/FT: 1/1", m.htft!.hh)}>
                        <Text style={[s.htftLabel, { color: hasSelection(match.id, "htft-hh") ? colors.primaryForeground : colors.mutedForeground }]}>1 / 1</Text>
                        <Text style={[s.htftValue, { color: hasSelection(match.id, "htft-hh") ? colors.primaryForeground : colors.foreground }]}>{m.htft.hh.toFixed(2)}</Text>
                      </Pressable>
                      <Pressable style={({ pressed }) => [s.htftBtn, { backgroundColor: hasSelection(match.id, "htft-hd") ? colors.primary : colors.muted, borderColor: hasSelection(match.id, "htft-hd") ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 }]} onPress={() => handleOdds("htft-hd", "HT/FT: 1/X", m.htft!.hd)}>
                        <Text style={[s.htftLabel, { color: hasSelection(match.id, "htft-hd") ? colors.primaryForeground : colors.mutedForeground }]}>1 / X</Text>
                        <Text style={[s.htftValue, { color: hasSelection(match.id, "htft-hd") ? colors.primaryForeground : colors.foreground }]}>{m.htft.hd.toFixed(2)}</Text>
                      </Pressable>
                      <Pressable style={({ pressed }) => [s.htftBtn, { backgroundColor: hasSelection(match.id, "htft-ha") ? colors.primary : colors.muted, borderColor: hasSelection(match.id, "htft-ha") ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 }]} onPress={() => handleOdds("htft-ha", "HT/FT: 1/2", m.htft!.ha)}>
                        <Text style={[s.htftLabel, { color: hasSelection(match.id, "htft-ha") ? colors.primaryForeground : colors.mutedForeground }]}>1 / 2</Text>
                        <Text style={[s.htftValue, { color: hasSelection(match.id, "htft-ha") ? colors.primaryForeground : colors.foreground }]}>{m.htft.ha.toFixed(2)}</Text>
                      </Pressable>
                    </View>
                    <View style={s.htftRow}>
                      <Pressable style={({ pressed }) => [s.htftBtn, { backgroundColor: hasSelection(match.id, "htft-dh") ? colors.primary : colors.muted, borderColor: hasSelection(match.id, "htft-dh") ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 }]} onPress={() => handleOdds("htft-dh", "HT/FT: X/1", m.htft!.dh)}>
                        <Text style={[s.htftLabel, { color: hasSelection(match.id, "htft-dh") ? colors.primaryForeground : colors.mutedForeground }]}>X / 1</Text>
                        <Text style={[s.htftValue, { color: hasSelection(match.id, "htft-dh") ? colors.primaryForeground : colors.foreground }]}>{m.htft.dh.toFixed(2)}</Text>
                      </Pressable>
                      <Pressable style={({ pressed }) => [s.htftBtn, { backgroundColor: hasSelection(match.id, "htft-dd") ? colors.primary : colors.muted, borderColor: hasSelection(match.id, "htft-dd") ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 }]} onPress={() => handleOdds("htft-dd", "HT/FT: X/X", m.htft!.dd)}>
                        <Text style={[s.htftLabel, { color: hasSelection(match.id, "htft-dd") ? colors.primaryForeground : colors.mutedForeground }]}>X / X</Text>
                        <Text style={[s.htftValue, { color: hasSelection(match.id, "htft-dd") ? colors.primaryForeground : colors.foreground }]}>{m.htft.dd.toFixed(2)}</Text>
                      </Pressable>
                      <Pressable style={({ pressed }) => [s.htftBtn, { backgroundColor: hasSelection(match.id, "htft-da") ? colors.primary : colors.muted, borderColor: hasSelection(match.id, "htft-da") ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 }]} onPress={() => handleOdds("htft-da", "HT/FT: X/2", m.htft!.da)}>
                        <Text style={[s.htftLabel, { color: hasSelection(match.id, "htft-da") ? colors.primaryForeground : colors.mutedForeground }]}>X / 2</Text>
                        <Text style={[s.htftValue, { color: hasSelection(match.id, "htft-da") ? colors.primaryForeground : colors.foreground }]}>{m.htft.da.toFixed(2)}</Text>
                      </Pressable>
                    </View>
                    <View style={s.htftRow}>
                      <Pressable style={({ pressed }) => [s.htftBtn, { backgroundColor: hasSelection(match.id, "htft-ah") ? colors.primary : colors.muted, borderColor: hasSelection(match.id, "htft-ah") ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 }]} onPress={() => handleOdds("htft-ah", "HT/FT: 2/1", m.htft!.ah)}>
                        <Text style={[s.htftLabel, { color: hasSelection(match.id, "htft-ah") ? colors.primaryForeground : colors.mutedForeground }]}>2 / 1</Text>
                        <Text style={[s.htftValue, { color: hasSelection(match.id, "htft-ah") ? colors.primaryForeground : colors.foreground }]}>{m.htft.ah.toFixed(2)}</Text>
                      </Pressable>
                      <Pressable style={({ pressed }) => [s.htftBtn, { backgroundColor: hasSelection(match.id, "htft-ad") ? colors.primary : colors.muted, borderColor: hasSelection(match.id, "htft-ad") ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 }]} onPress={() => handleOdds("htft-ad", "HT/FT: 2/X", m.htft!.ad)}>
                        <Text style={[s.htftLabel, { color: hasSelection(match.id, "htft-ad") ? colors.primaryForeground : colors.mutedForeground }]}>2 / X</Text>
                        <Text style={[s.htftValue, { color: hasSelection(match.id, "htft-ad") ? colors.primaryForeground : colors.foreground }]}>{m.htft.ad.toFixed(2)}</Text>
                      </Pressable>
                      <Pressable style={({ pressed }) => [s.htftBtn, { backgroundColor: hasSelection(match.id, "htft-aa") ? colors.primary : colors.muted, borderColor: hasSelection(match.id, "htft-aa") ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 }]} onPress={() => handleOdds("htft-aa", "HT/FT: 2/2", m.htft!.aa)}>
                        <Text style={[s.htftLabel, { color: hasSelection(match.id, "htft-aa") ? colors.primaryForeground : colors.mutedForeground }]}>2 / 2</Text>
                        <Text style={[s.htftValue, { color: hasSelection(match.id, "htft-aa") ? colors.primaryForeground : colors.foreground }]}>{m.htft.aa.toFixed(2)}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              )}

              {/* ── ESCANTEIOS (football) ── */}
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

              {/* ── CARTÕES (football) ── */}
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

              {/* ── TENNIS SETS ── */}
              {isTennis && m?.tennisExtra && (activeTab === "todos" || activeTab === "sets") && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>Mercados de Set</Text>
                  {m.tennisExtra.firstSet.home > 1.01 && (
                    <>
                      <Text style={[s.sectionTitle, { marginTop: 4, marginBottom: 6, fontSize: 9 }]}>VENCEDOR SET 1</Text>
                      <View style={s.row}>
                        <OddsBtn market="s1-home" label={match.home} value={m.tennisExtra.firstSet.home} />
                        <OddsBtn market="s1-away" label={match.away} value={m.tennisExtra.firstSet.away} />
                      </View>
                    </>
                  )}
                  {m.tennisExtra.set2.home > 1.01 && (
                    <>
                      <Text style={[s.sectionTitle, { marginTop: 4, marginBottom: 6, fontSize: 9 }]}>VENCEDOR SET 2</Text>
                      <View style={s.row}>
                        <OddsBtn market="s2-home" label={match.home} value={m.tennisExtra.set2.home} />
                        <OddsBtn market="s2-away" label={match.away} value={m.tennisExtra.set2.away} />
                      </View>
                    </>
                  )}
                  {m.tennisExtra.totalSets && m.tennisExtra.totalSets.over15 > 1.01 && (
                    <>
                      <Text style={[s.sectionTitle, { marginTop: 4, marginBottom: 6, fontSize: 9 }]}>TOTAL DE SETS</Text>
                      <View style={s.row}>
                        <OddsBtn market="ts-o15" label="Mais 1.5 sets" value={m.tennisExtra.totalSets.over15} />
                        <OddsBtn market="ts-u15" label="Menos 1.5 sets" value={m.tennisExtra.totalSets.under15} />
                      </View>
                    </>
                  )}
                </View>
              )}

              {/* ── VOLEIBOL / HOCKEY PERÍODOS ── */}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}
