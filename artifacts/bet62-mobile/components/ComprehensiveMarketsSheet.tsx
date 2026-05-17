import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { type ComponentProps, useState } from "react";
import {
  Image,
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
import { getTeamBannerUrl } from "@/utils/teamBanners";

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
  league?: string;
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
  | "pontos" | "1periodo" | "sets" | "periodos" | "runline" | "stats";

interface TabDef { key: TabKey; label: string }

const SPORT_ICONS: Record<string, MCIconName> = {
  football: "soccer", basketball: "basketball", tennis: "tennis",
  hockey: "hockey-puck", volleyball: "volleyball", baseball: "baseball",
};

const SPORT_COLORS: Record<string, string> = {
  football: "#22c55e", basketball: "#f97316", tennis: "#eab308",
  hockey: "#60a5fa", volleyball: "#a78bfa", baseball: "#fb7185",
};

function getTabsForSport(sport: string, isLive: boolean): TabDef[] {
  const statsTab: TabDef = { key: "stats", label: "Estatísticas" };
  switch (sport) {
    case "basketball": return [{ key: "todos", label: "Todos" }, { key: "resultado", label: "Resultado" }, { key: "handicap", label: "Handicap" }, { key: "pontos", label: "Pontos" }, { key: "1periodo", label: "1º Período" }, ...(isLive ? [statsTab] : [])];
    case "tennis":     return [{ key: "todos", label: "Todos" }, { key: "resultado", label: "Resultado" }, { key: "sets", label: "Sets" }, ...(isLive ? [statsTab] : [])];
    case "hockey":     return [{ key: "todos", label: "Todos" }, { key: "resultado", label: "Resultado" }, { key: "gols", label: "Golos" }, { key: "periodos", label: "Períodos" }, { key: "handicap", label: "Handicap" }, ...(isLive ? [statsTab] : [])];
    case "volleyball": return [{ key: "todos", label: "Todos" }, { key: "resultado", label: "Resultado" }, { key: "sets", label: "Sets" }, { key: "handicap", label: "Handicap" }, ...(isLive ? [statsTab] : [])];
    case "baseball":   return [{ key: "todos", label: "Todos" }, { key: "resultado", label: "Resultado" }, { key: "runline", label: "Run Line" }, { key: "pontos", label: "Pontos" }, ...(isLive ? [statsTab] : [])];
    default:           return [{ key: "todos", label: "Todos" }, { key: "resultado", label: "Resultado" }, { key: "dupla", label: "Dupla" }, { key: "gols", label: "Golos" }, { key: "placar", label: "Placar" }, { key: "handicap", label: "Handicap" }, { key: "1tempo", label: "1ºTempo" }, { key: "htft", label: "HT/FT" }, { key: "escanteios", label: "Cant." }, { key: "cartoes", label: "Cartões" }, ...(isLive ? [statsTab] : [])];
  }
}

/** Stable deterministic int from string seed */
function stableInt(seed: string, min: number, max: number): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return min + Math.abs(h) % (max - min + 1);
}

/** Implied double-chance odds from two 1X2 outcomes */
function impliedDC(o1: number, o2: number, margin = 0.975): number {
  if (o1 <= 1.01 || o2 <= 1.01) return 1.01;
  return Math.max(1.02, +(1 / (1 / o1 + 1 / o2) * margin).toFixed(2));
}

export function ComprehensiveMarketsSheet({ visible, match, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addSelection, removeSelection, hasSelection } = useBetSlip();
  const [activeTab, setActiveTab] = useState<TabKey>("todos");

  const isLive = !!match.isLive;
  const tabs = getTabsForSport(match.sport, isLive);
  const m = match.markets;
  const now = Date.now();
  const sportColor = SPORT_COLORS[match.sport] ?? colors.primary;
  const topPad = Platform.OS === "ios" ? insets.top : insets.top + 4;

  const isFootball   = match.sport === "football";
  const isTennis     = match.sport === "tennis";
  const isBball      = match.sport === "basketball";
  const isHockey     = match.sport === "hockey";
  const isVolley     = match.sport === "volleyball";
  const isBaseball   = match.sport === "baseball";
  const hasDraw      = match.odds.draw > 1.01;

  const sets      = match._liveExtra?.sets;
  const curPoints = match._liveExtra?.currentPoints;
  const periods   = match._liveExtra?.periods;
  const quarters  = match._liveExtra?.quarters;
  const innings   = match._liveExtra?.innings;

  const homeBanner = getTeamBannerUrl(match.home);
  const awayBanner = getTeamBannerUrl(match.away);

  // ── Fallback: compute DC from 1X2 odds when market data is 0 ──
  const dcRaw = m?.doubleChance;
  const dc = (dcRaw?.homeOrDraw ?? 0) > 1.01 ? dcRaw! : (match.odds.home > 1.01 && match.odds.away > 1.01) ? {
    homeOrDraw: hasDraw ? impliedDC(match.odds.home, match.odds.draw) : 0,
    homeOrAway: impliedDC(match.odds.home, match.odds.away),
    awayOrDraw: hasDraw ? impliedDC(match.odds.draw, match.odds.away) : 0,
  } : null;

  // ── Stats (seeded for stability) ──
  const min = match.minute ?? 45;
  const homeGoals = match.homeScore ?? 0;
  const awayGoals = match.awayScore ?? 0;
  const h = match.odds.home, a = match.odds.away;
  const totalImplied = (h > 1.01 && a > 1.01) ? (1 / h + 1 / a) : 1;
  const homePoss = Math.round(100 * (1 / (h > 1.01 ? h : 2)) / totalImplied);
  const awayPoss = 100 - homePoss;
  const factor = Math.max(0.1, min / 90);
  const homeShots = Math.round((homeGoals * 5 + stableInt(match.id, 3, 9)) * factor);
  const awayShots = Math.round((awayGoals * 5 + stableInt(match.id + "a", 2, 7)) * factor);
  const homeSOT   = Math.round(homeShots * 0.45 + stableInt(match.id + "sot", 0, 2));
  const awaySOT   = Math.round(awayShots * 0.40 + stableInt(match.id + "asot", 0, 1));
  const homeCorn  = Math.round(homeShots * 0.5 + stableInt(match.id + "c", 0, 3));
  const awayCorn  = Math.round(awayShots * 0.45 + stableInt(match.id + "ac", 0, 2));
  const homeYC    = stableInt(match.id + "yc", 0, 3);
  const awayYC    = stableInt(match.id + "ayc", 0, 3);
  const homeFouls = stableInt(match.id + "f", 4, 14);
  const awayFouls = stableInt(match.id + "af", 3, 12);

  function susp(key: string) {
    return match.marketSuspension?.[key] != null && match.marketSuspension[key]! > now;
  }

  function handleOdds(market: string, label: string, value: number) {
    if (!value || value <= 1.01) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const fullLabel = `${match.home} vs ${match.away} — ${label}`;
    if (hasSelection(match.id, market)) removeSelection(match.id, market);
    else addSelection({ matchId: match.id, matchTitle: `${match.home} vs ${match.away}`, market, selection: market, label: fullLabel, odds: value });
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerTop: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 10, gap: 10, paddingTop: topPad + 4 },
    backBtn: { padding: 6 },
    matchTitle: { flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground },
    sportBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: sportColor + "20", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
    tabBar: { borderBottomWidth: 1, borderBottomColor: colors.border },
    tab: { paddingHorizontal: 13, paddingVertical: 9, marginLeft: 2, borderRadius: 8 },
    tabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    section: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 },
    sectionTitle: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.mutedForeground, textTransform: "uppercase" as const, letterSpacing: 0.8, marginBottom: 8 },
    row: { flexDirection: "row", gap: 6, marginBottom: 6 },
    oddsBtn: { flex: 1, borderRadius: 8, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 4, alignItems: "center" },
    oddsLabel: { fontSize: 10, fontFamily: "Inter_500Medium", marginBottom: 2 },
    oddsValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
    htftRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
    htftBtn: { flex: 1, borderRadius: 8, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 4, alignItems: "center" },
    htftLabel: { fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center" as const, marginBottom: 2 },
    htftValue: { fontSize: 12, fontFamily: "Inter_700Bold" },
    statRow: { flexDirection: "row", alignItems: "center", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border + "50" },
    statVal: { width: 40, fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "center" as const, color: colors.foreground },
    statName: { flex: 1, fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, textAlign: "center" as const },
  });

  function OddsBtn({ market, label, value }: { market: string; label: string; value: number }) {
    const sel = hasSelection(match.id, market);
    const suspended = susp(market) || value <= 1.01;
    return (
      <Pressable
        style={({ pressed }) => [s.oddsBtn, { backgroundColor: suspended ? colors.muted : sel ? colors.primary : colors.muted, borderColor: suspended ? colors.border : sel ? colors.primary : colors.border, opacity: suspended ? 0.5 : pressed ? 0.8 : 1 }]}
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

  function StatLine({ label, home, away }: { label: string; home: number | string; away: number | string }) {
    return (
      <View style={s.statRow}>
        <Text style={[s.statVal, { color: colors.primary }]}>{home}</Text>
        <Text style={s.statName}>{label}</Text>
        <Text style={[s.statVal, { color: colors.foreground }]}>{away}</Text>
      </View>
    );
  }

  function PossessionBar({ home, away }: { home: number; away: number }) {
    return (
      <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 }}>
        <Text style={s.sectionTitle}>Posse de Bola</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.primary, width: 36 }}>{home}%</Text>
          <View style={{ flex: 1, height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: colors.muted, flexDirection: "row" }}>
            <View style={{ flex: home, backgroundColor: colors.primary }} />
            <View style={{ flex: away, backgroundColor: colors.border }} />
          </View>
          <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.mutedForeground, width: 36, textAlign: "right" as const }}>{away}%</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }} numberOfLines={1}>{match.home}</Text>
          <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }} numberOfLines={1}>{match.away}</Text>
        </View>
      </View>
    );
  }

  function PeriodTable({ data, label }: { data: Array<[number, number]>; label: string }) {
    return (
      <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
        <Text style={s.sectionTitle}>{label}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {data.map((p, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: colors.muted, borderRadius: 8, padding: 8, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 9, color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginBottom: 4 }}>{label.includes("Set") ? `Set ${i + 1}` : label.includes("Período") ? `P${i + 1}` : label.includes("Q") ? `Q${i + 1}` : `${i + 1}ª`}</Text>
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.primary }}>{p[0]}</Text>
              <View style={{ width: 20, height: 1, backgroundColor: colors.border, marginVertical: 3 }} />
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>{p[1]}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.container}>

        {/* ── Header ── */}
        <View style={{ backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 0 }}>
          {/* Banner behind header */}
          {(homeBanner || awayBanner) && (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 80 + topPad, flexDirection: "row", overflow: "hidden" }}>
              <View style={{ flex: 1, overflow: "hidden" }}>
                {homeBanner && <Image source={{ uri: homeBanner }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
              </View>
              <View style={{ flex: 1, overflow: "hidden" }}>
                {awayBanner && <Image source={{ uri: awayBanner }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
              </View>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000000cc" }]} />
            </View>
          )}

          <View style={s.headerTop}>
            <Pressable style={s.backBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back" size={22} color={colors.foreground} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={s.matchTitle} numberOfLines={1}>{match.home} vs {match.away}</Text>
              {match.league && <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{match.league}</Text>}
            </View>
            <View style={s.sportBadge}>
              {isLive && <View style={s.liveDot} />}
              <MaterialCommunityIcons name={SPORT_ICONS[match.sport] ?? "trophy"} size={16} color={sportColor} />
            </View>
          </View>

          {/* Live score */}
          {isLive && match.homeScore !== undefined && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
              {isTennis && sets && sets.length > 0 ? (
                <TennisScoreHeader sets={sets} curPoints={curPoints} home={match.home} away={match.away} colors={colors} />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{match.home}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ backgroundColor: "#0c0c12", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: colors.primary + "40" }}>
                      <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 2 }}>{match.homeScore ?? 0} – {match.awayScore ?? 0}</Text>
                    </View>
                    {match.minute != null && (
                      <View style={{ backgroundColor: "#f59e0b20", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#f59e0b" }}>{isTennis ? `Set ${match.minute}` : `${match.minute}'`}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "right" as const }} numberOfLines={1}>{match.away}</Text>
                </View>
              )}
              {/* Period breakdown */}
              {(isHockey || isBball) && (periods ?? quarters) && (
                <View style={{ flexDirection: "row", gap: 4, marginTop: 6 }}>
                  {(periods ?? quarters)!.map((p, i) => (
                    <View key={i} style={{ backgroundColor: "#ffffff10", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>{p[0]}–{p[1]}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Tabs ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 4 }}>
          {tabs.map((t) => (
            <Pressable key={t.key} style={[s.tab, { backgroundColor: activeTab === t.key ? colors.primary : "transparent" }]} onPress={() => setActiveTab(t.key)}>
              <Text style={[s.tabText, { color: activeTab === t.key ? colors.primaryForeground : colors.mutedForeground }]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ── Markets / Stats content ── */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 50 + insets.bottom }}>

          {susp("result") && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#ef444415", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, margin: 14 }}>
              <Ionicons name="warning" size={14} color="#ef4444" />
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#ef4444" }}>Mercados suspensos — evento em análise</Text>
            </View>
          )}

          {/* ── ESTATÍSTICAS ── */}
          {activeTab === "stats" && isLive && (
            <View>
              {/* Score summary */}
              <View style={{ padding: 14, alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "right" as const }} numberOfLines={1}>{match.home}</Text>
                  <View style={{ backgroundColor: colors.primary + "20", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: colors.primary + "40" }}>
                    <Text style={{ fontSize: 28, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: 2 }}>{match.homeScore ?? 0} – {match.awayScore ?? 0}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{match.away}</Text>
                </View>
                {match.minute != null && (
                  <View style={{ backgroundColor: "#f59e0b20", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8 }}>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#f59e0b" }}>
                      {isTennis ? `Set ${match.minute}` : isHockey || isBball ? `P${match.minute}` : `${match.minute}'`}
                    </Text>
                  </View>
                )}
              </View>

              {/* Period/set breakdown */}
              {(periods ?? quarters) && (periods ?? quarters)!.length > 0 && (
                <PeriodTable data={(periods ?? quarters)!} label={isHockey ? "Períodos" : isBball ? "Quartos" : "Períodos"} />
              )}
              {sets && sets.length > 0 && isTennis && (
                <PeriodTable data={sets} label="Sets" />
              )}
              {innings && innings.length > 0 && isBaseball && (
                <PeriodTable data={innings} label="Entradas" />
              )}

              {/* Football-specific stats */}
              {isFootball && (
                <>
                  <PossessionBar home={homePoss} away={awayPoss} />
                  <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
                    <View style={{ flexDirection: "row", marginBottom: 4 }}>
                      <Text style={[s.statVal, { color: colors.primary }]}>{match.home}</Text>
                      <Text style={s.statName}></Text>
                      <Text style={[s.statVal, { color: colors.foreground }]}>{match.away}</Text>
                    </View>
                    <StatLine label="Remates" home={homeShots} away={awayShots} />
                    <StatLine label="Remates Enquadrados" home={homeSOT} away={awaySOT} />
                    <StatLine label="Escanteios" home={homeCorn} away={awayCorn} />
                    <StatLine label="Faltas" home={homeFouls} away={awayFouls} />
                    <StatLine label="Cartões Amarelos" home={homeYC} away={awayYC} />
                    <StatLine label="Golos" home={homeGoals} away={awayGoals} />
                  </View>
                  <Text style={{ fontSize: 9, color: colors.mutedForeground + "80", fontFamily: "Inter_400Regular", textAlign: "center" as const, paddingTop: 10, paddingBottom: 4, paddingHorizontal: 20 }}>
                    Estatísticas aproximadas baseadas no estado do jogo
                  </Text>
                </>
              )}
            </View>
          )}

          {activeTab !== "stats" && (
            <>
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
              {isFootball && dc && dc.homeOrAway > 1.01 && (
                <Section title="Dupla Hipótese" tabKey="dupla">
                  <View style={s.row}>
                    <OddsBtn market="dc-hd" label={`${match.home} ou X`} value={dc.homeOrDraw} />
                    <OddsBtn market="dc-12" label="1 ou 2" value={dc.homeOrAway} />
                    <OddsBtn market="dc-da" label={`X ou ${match.away}`} value={dc.awayOrDraw} />
                  </View>
                  {(m?.bothTeamsScore?.yes ?? 0) > 1.01 && (
                    <View style={s.row}>
                      <OddsBtn market="bts-yes" label="Ambas Marcam — Sim" value={m!.bothTeamsScore!.yes} />
                      <OddsBtn market="bts-no" label="Ambas Marcam — Não" value={m!.bothTeamsScore!.no} />
                    </View>
                  )}
                </Section>
              )}

              {/* ── TOTAL GOLOS / PONTOS ── */}
              {m?.totalGoals && m.totalGoals.over25 > 1.01 && (
                <Section title={isBball ? "Total de Pontos" : isBaseball ? "Total de Runs" : "Total de Golos"} tabKey={isBball || isBaseball ? "pontos" : "gols"}>
                  {([
                    { label: "0.5", o: m.totalGoals.over05, u: m.totalGoals.under05, ko: "tg-o05", ku: "tg-u05" },
                    { label: "1.5", o: m.totalGoals.over15, u: m.totalGoals.under15, ko: "tg-o15", ku: "tg-u15" },
                    { label: "2.5", o: m.totalGoals.over25, u: m.totalGoals.under25, ko: "tg-o25", ku: "tg-u25" },
                    { label: "3.5", o: m.totalGoals.over35, u: m.totalGoals.under35, ko: "tg-o35", ku: "tg-u35" },
                    { label: "4.5", o: m.totalGoals.over45, u: m.totalGoals.under45, ko: "tg-o45", ku: "tg-u45" },
                    { label: "5.5", o: m.totalGoals.over55, u: m.totalGoals.under55, ko: "tg-o55", ku: "tg-u55" },
                    { label: "6.5", o: m.totalGoals.over65, u: m.totalGoals.under65, ko: "tg-o65", ku: "tg-u65" },
                  ] as { label: string; o: number; u: number; ko: string; ku: string }[]).filter((r) => r.o > 1.01 && r.u > 1.01).map((row) => (
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
                <Section title={isBaseball ? "Run Line" : "Handicap"} tabKey={isBaseball ? "runline" : "handicap"}>
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

              {/* ── 1º TEMPO / PERÍODO ── */}
              {m?.halfTime && m.halfTime.home > 1.01 && (
                <Section title={isBball || isHockey ? "1º Período" : "1º Tempo"} tabKey={isBball || isHockey ? "1periodo" : "1tempo"}>
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
                    [{ k: "htft-hh", l: "1/1", v: m.htft.hh }, { k: "htft-hd", l: "1/X", v: m.htft.hd }, { k: "htft-ha", l: "1/2", v: m.htft.ha }],
                    [{ k: "htft-dh", l: "X/1", v: m.htft.dh }, { k: "htft-dd", l: "X/X", v: m.htft.dd }, { k: "htft-da", l: "X/2", v: m.htft.da }],
                    [{ k: "htft-ah", l: "2/1", v: m.htft.ah }, { k: "htft-ad", l: "2/X", v: m.htft.ad }, { k: "htft-aa", l: "2/2", v: m.htft.aa }],
                  ].map((row, ri) => (
                    <View key={ri} style={s.htftRow}>
                      {row.map(({ k, l, v }) => {
                        const sel = hasSelection(match.id, k);
                        return (
                          <Pressable key={k} style={({ pressed }) => [s.htftBtn, { backgroundColor: sel ? colors.primary : colors.muted, borderColor: sel ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 }]} onPress={() => handleOdds(k, `HT/FT ${l}`, v)}>
                            <Text style={[s.htftLabel, { color: sel ? colors.primaryForeground : colors.mutedForeground }]}>{l}</Text>
                            <Text style={[s.htftValue, { color: sel ? colors.primaryForeground : colors.foreground }]}>{v.toFixed(2)}</Text>
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
            </>
          )}

        </ScrollView>
      </View>
    </Modal>
  );
}

/** Tennis score header inside the markets sheet */
function TennisScoreHeader({
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
