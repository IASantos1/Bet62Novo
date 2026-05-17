import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { type ComponentProps, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useBetSlip } from "@/context/BetSlipContext";
import { API_BASE } from "@/context/AuthContext";
import { useLiveMatches, type LiveMatch, type LiveMatchMarkets } from "@/hooks/useLiveMatches";
import { BetSlipModal } from "@/components/BetSlipModal";

type MCIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface UpcomingMatch {
  id: string;
  sport: string;
  home: string;
  away: string;
  kickoff: string;
  odds: { home: number; draw: number; away: number };
  league?: string;
}

const SPORTS = [
  { key: "all", label: "Todos" },
  { key: "football", label: "Futebol" },
  { key: "basketball", label: "Basquete" },
  { key: "tennis", label: "Ténis" },
  { key: "hockey", label: "Hóquei" },
  { key: "volleyball", label: "Voleibol" },
  { key: "baseball", label: "Baseball" },
];

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

function SportIcon({ sport, color, size = 16 }: { sport: string; color: string; size?: number }) {
  const iconName: MCIconName = SPORT_ICONS[sport] ?? "trophy-outline";
  return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
}

function OddsButton({
  label, value, selected, suspended, onPress,
}: {
  label: string; value: number; selected: boolean; suspended?: boolean; onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [oddsStyles.btn, {
        backgroundColor: suspended ? colors.muted : selected ? colors.primary : colors.muted,
        borderColor: suspended ? colors.border : selected ? colors.primary : colors.border,
        opacity: suspended ? 0.6 : pressed ? 0.85 : 1,
      }]}
      onPress={suspended ? undefined : onPress}
    >
      {suspended ? (
        <>
          <Ionicons name="lock-closed" size={11} color={colors.mutedForeground} />
          <Text style={[oddsStyles.value, { color: colors.mutedForeground, fontSize: 11 }]}>SUSP.</Text>
        </>
      ) : (
        <>
          <Text style={[oddsStyles.label, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>{label}</Text>
          <Text style={[oddsStyles.value, { color: selected ? colors.primaryForeground : colors.foreground }]}>{value.toFixed(2)}</Text>
        </>
      )}
    </Pressable>
  );
}

const oddsStyles = StyleSheet.create({
  btn: { flex: 1, borderRadius: 8, borderWidth: 1, paddingVertical: 8, alignItems: "center" },
  label: { fontSize: 10, fontFamily: "Inter_500Medium", marginBottom: 2 },
  value: { fontSize: 14, fontFamily: "Inter_700Bold" },
});

function LiveBadge() {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primaryForeground }} />
      <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: colors.primaryForeground }}>AO VIVO</Text>
    </View>
  );
}

function TennisScore({ sets, currentPoints }: {
  sets?: Array<[number, number]>;
  currentPoints?: [number | string, number | string];
}) {
  const colors = useColors();
  if (!sets || sets.length === 0) return null;
  const doneSets = sets.slice(0, -1);
  const currentSet = sets[sets.length - 1];
  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
        {doneSets.map((s, i) => (
          <View key={i} style={{ backgroundColor: "#ffffff10", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>{s[0]}-{s[1]}</Text>
          </View>
        ))}
        {currentSet && (
          <View style={{ backgroundColor: colors.primary + "30", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: colors.primary + "60" }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.foreground }}>{currentSet[0]}-{currentSet[1]}</Text>
          </View>
        )}
      </View>
      {currentPoints && (
        <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.warning ?? "#f59e0b" }}>
          {String(currentPoints[0])} : {String(currentPoints[1])}
        </Text>
      )}
    </View>
  );
}

function PeriodScore({ periods, label }: { periods: Array<[number, number]>; label?: string }) {
  const colors = useColors();
  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <View style={{ flexDirection: "row", gap: 3 }}>
        {periods.map((p, i) => (
          <View key={i} style={{ backgroundColor: "#ffffff10", borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}>
            <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>{p[0]}-{p[1]}</Text>
          </View>
        ))}
      </View>
      {label && <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{label}</Text>}
    </View>
  );
}

function MarketsSheet({
  visible,
  match,
  markets,
  onClose,
  onOdds,
  hasSelection,
}: {
  visible: boolean;
  match: LiveMatch;
  markets: LiveMatchMarkets;
  onClose: () => void;
  onOdds: (market: string, label: string, value: number) => void;
  hasSelection: (matchId: string, market: string) => boolean;
}) {
  const colors = useColors();
  const now = Date.now();

  function susp(mkt: string) {
    return match.marketSuspension?.[mkt] != null && match.marketSuspension[mkt]! > now;
  }

  const sections: Array<{ title: string; rows: Array<{ label: string; market: string; home: number; draw?: number; away: number }> }> = [];

  if (markets.totalGoals) {
    const tg = markets.totalGoals;
    if (tg.over25 > 1.01 && tg.under25 > 1.01) {
      sections.push({
        title: "Total de Golos",
        rows: [
          ...(tg.over15 > 1.01 ? [{ label: "Mais 1.5", market: "gols-o15", home: tg.over15, away: tg.under15 }] : []),
          { label: "Mais 2.5", market: "gols-o25", home: tg.over25, away: tg.under25 },
          ...(tg.over35 > 1.01 ? [{ label: "Mais 3.5", market: "gols-o35", home: tg.over35, away: tg.under35 }] : []),
          ...(tg.over45 > 1.01 ? [{ label: "Mais 4.5", market: "gols-o45", home: tg.over45, away: tg.under45 }] : []),
        ],
      });
    }
  }

  if (markets.doubleChance) {
    const dc = markets.doubleChance;
    if (dc.homeOrDraw > 1.01) {
      sections.push({
        title: "Dupla Hipótese",
        rows: [
          { label: "1X (1 ou X)", market: "dc-1x", home: dc.homeOrDraw, away: dc.awayOrDraw },
          { label: "12 (1 ou 2)", market: "dc-12", home: dc.homeOrAway, away: dc.awayOrDraw },
          { label: "X2 (X ou 2)", market: "dc-x2", home: dc.awayOrDraw, away: dc.awayOrDraw },
        ],
      });
    }
  }

  if (markets.bothTeamsScore) {
    const bts = markets.bothTeamsScore;
    if (bts.yes > 1.01) {
      sections.push({
        title: "Ambas Marcam",
        rows: [{ label: "Sim", market: "btts-yes", home: bts.yes, away: bts.no }],
      });
    }
  }

  if (markets.halfTime) {
    const ht = markets.halfTime;
    if (ht.home > 1.01) {
      sections.push({
        title: "1º Tempo",
        rows: [{ label: "Casa", market: "ht-home", home: ht.home, draw: ht.draw, away: ht.away }],
      });
    }
  }

  if (markets.tennisExtra) {
    const te = markets.tennisExtra;
    if (te.firstSet.home > 1.01) {
      sections.push({
        title: `Vencedor Set ${te.currentSetNum ?? 1}`,
        rows: [{ label: match.home, market: "firstSet-home", home: te.firstSet.home, away: te.firstSet.away }],
      });
    }
  }

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "#00000060", justifyContent: "flex-end" },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%" },
    handle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 2 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    matchTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1, marginRight: 8 },
    sectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, textTransform: "uppercase" as const, letterSpacing: 0.5, paddingHorizontal: 16, paddingVertical: 8 },
    row: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
    btnGroup: { flex: 1, flexDirection: "row", gap: 6 },
    labelCell: { width: 90, justifyContent: "center" },
    labelText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable>
          <View style={s.sheet}>
            <View style={s.handle} />
            <View style={s.header}>
              <Text style={s.matchTitle} numberOfLines={1}>{match.home} vs {match.away}</Text>
              <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {sections.length === 0 ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>Sem mercados adicionais disponíveis</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                {sections.map((sec) => (
                  <View key={sec.title}>
                    <Text style={s.sectionTitle}>{sec.title}</Text>
                    {sec.rows.map((row) => (
                      <View key={row.market} style={s.row}>
                        <View style={s.labelCell}>
                          <Text style={s.labelText}>{row.label}</Text>
                        </View>
                        <View style={s.btnGroup}>
                          <OddsButton
                            label={row.draw != null ? "1" : "Mais"}
                            value={row.home}
                            selected={hasSelection(match.id, `${row.market}-h`)}
                            suspended={susp(row.market)}
                            onPress={() => onOdds(`${row.market}-h`, `${row.label} — Mais/Casa`, row.home)}
                          />
                          {row.draw != null && row.draw > 1.01 && (
                            <OddsButton
                              label="X"
                              value={row.draw}
                              selected={hasSelection(match.id, `${row.market}-d`)}
                              suspended={susp(row.market)}
                              onPress={() => onOdds(`${row.market}-d`, `${row.label} — Empate`, row.draw!)}
                            />
                          )}
                          <OddsButton
                            label={row.draw != null ? "2" : "Menos"}
                            value={row.away}
                            selected={hasSelection(match.id, `${row.market}-a`)}
                            suspended={susp(row.market)}
                            onPress={() => onOdds(`${row.market}-a`, `${row.label} — Menos/Fora`, row.away)}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MatchCard({ match, isLive }: { match: LiveMatch | UpcomingMatch; isLive: boolean }) {
  const colors = useColors();
  const { addSelection, removeSelection, hasSelection } = useBetSlip();
  const liveMatch = isLive ? (match as LiveMatch) : null;
  const upcomingMatch = !isLive ? (match as UpcomingMatch) : null;
  const [marketsVisible, setMarketsVisible] = useState(false);

  const now = Date.now();
  const resultSuspended = isLive && liveMatch?.marketSuspension?.["result"] != null
    ? liveMatch.marketSuspension["result"]! > now : false;
  const suspensionReason = resultSuspended ? (liveMatch?.suspensionReason ?? "SUSPENSO") : null;

  const sportColor = SPORT_COLORS[match.sport] ?? colors.mutedForeground;

  function handleOdds(market: string, label: string, value: number) {
    if (resultSuspended && market.startsWith("1x2")) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (hasSelection(match.id, market)) {
      removeSelection(match.id, market);
    } else {
      addSelection({
        matchId: match.id,
        matchTitle: `${match.home} vs ${match.away}`,
        market,
        selection: market,
        label: `${match.home} vs ${match.away} — ${label}`,
        odds: value,
      });
    }
  }

  const kickoffStr = upcomingMatch?.kickoff
    ? new Date(upcomingMatch.kickoff).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })
    : null;
  const kickoffDate = upcomingMatch?.kickoff
    ? new Date(upcomingMatch.kickoff).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })
    : null;

  const isTennis = match.sport === "tennis";
  const isHockey = match.sport === "hockey";
  const isBasketball = match.sport === "basketball";
  const isBaseballSport = match.sport === "baseball";
  const sets = liveMatch?._liveExtra?.sets;
  const currentPoints = liveMatch?._liveExtra?.currentPoints;
  const periods = liveMatch?._liveExtra?.periods;
  const quarters = liveMatch?._liveExtra?.quarters;
  const innings = liveMatch?._liveExtra?.innings;

  const hasExtraMarkets = isLive && liveMatch?.markets != null && Object.values(liveMatch.markets).some((v) => v && typeof v === "object" && Object.values(v).some((n) => typeof n === "number" && n > 1.01));

  const s = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      marginHorizontal: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    sportStripe: { height: 3, backgroundColor: sportColor },
    inner: { padding: 14 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    leagueRow: { flexDirection: "row", alignItems: "center", gap: 5, flex: 1 },
    league: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, flex: 1 },
    minuteBadge: { fontSize: 12, fontFamily: "Inter_700Bold", color: colors.warning ?? "#f59e0b" },
    teamsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    teamName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1 },
    teamNameAway: { textAlign: "right" as const },
    scoreBox: { backgroundColor: "#0c0c12", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginHorizontal: 6, borderWidth: 1, borderColor: colors.primary + "50", alignItems: "center" },
    scoreText: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#ffffff" },
    timeBox: { backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginHorizontal: 6 },
    timeText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    oddsRow: { flexDirection: "row", gap: 8 },
    moreMarketsBtn: {
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: colors.muted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    moreMarketsBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
  });

  return (
    <>
      <View style={s.card}>
        <View style={s.sportStripe} />
        <View style={s.inner}>
          <View style={s.header}>
            {isLive ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                <LiveBadge />
                <Text style={s.league} numberOfLines={1}>{liveMatch?.league ?? match.sport}</Text>
              </View>
            ) : (
              <View style={s.leagueRow}>
                <SportIcon sport={match.sport} color={sportColor} size={13} />
                <Text style={s.league} numberOfLines={1}>{match.league ?? match.sport}</Text>
              </View>
            )}
            {isLive && (
              isTennis
                ? <Text style={[s.minuteBadge, { color: colors.success ?? "#22c55e" }]}>Set {liveMatch?.minute ?? 1}</Text>
                : <Text style={s.minuteBadge}>{liveMatch?.minute ?? 0}&apos;</Text>
            )}
            {!isLive && (
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
                {kickoffDate} {kickoffStr}
              </Text>
            )}
          </View>

          <View style={s.teamsRow}>
            <Text style={s.teamName} numberOfLines={1}>{match.home}</Text>
            {isLive ? (
              <View style={s.scoreBox}>
                {isTennis && sets && sets.length > 0 ? (
                  <TennisScore sets={sets} currentPoints={currentPoints} />
                ) : (isHockey && periods && periods.length > 0) ? (
                  <View style={{ alignItems: "center", gap: 2 }}>
                    <Text style={s.scoreText}>{liveMatch!.homeScore} – {liveMatch!.awayScore}</Text>
                    <PeriodScore periods={periods} />
                  </View>
                ) : (isBasketball && quarters && quarters.length > 0) ? (
                  <View style={{ alignItems: "center", gap: 2 }}>
                    <Text style={s.scoreText}>{liveMatch!.homeScore} – {liveMatch!.awayScore}</Text>
                    <PeriodScore periods={quarters} label="Q" />
                  </View>
                ) : (isBaseballSport && innings && innings.length > 0) ? (
                  <View style={{ alignItems: "center", gap: 2 }}>
                    <Text style={s.scoreText}>{liveMatch!.homeScore} – {liveMatch!.awayScore}</Text>
                    <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{innings.length}ª entrada</Text>
                  </View>
                ) : (
                  <Text style={s.scoreText}>{liveMatch!.homeScore} – {liveMatch!.awayScore}</Text>
                )}
              </View>
            ) : (
              <View style={s.timeBox}>
                <Text style={s.timeText}>vs</Text>
              </View>
            )}
            <Text style={[s.teamName, s.teamNameAway]} numberOfLines={1}>{match.away}</Text>
          </View>

          {suspensionReason && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#ef444420", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8, borderWidth: 1, borderColor: "#ef444440" }}>
              <Ionicons name="warning" size={13} color="#ef4444" />
              <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#ef4444", letterSpacing: 0.5 }}>
                {suspensionReason} — MERCADOS SUSPENSOS
              </Text>
            </View>
          )}

          <View style={s.oddsRow}>
            <OddsButton
              label="1"
              value={match.odds.home}
              selected={hasSelection(match.id, "1x2-home")}
              suspended={resultSuspended}
              onPress={() => handleOdds("1x2-home", "1 (Casa)", match.odds.home)}
            />
            {match.odds.draw > 1.01 && (
              <OddsButton
                label="X"
                value={match.odds.draw}
                selected={hasSelection(match.id, "1x2-draw")}
                suspended={resultSuspended}
                onPress={() => handleOdds("1x2-draw", "X (Empate)", match.odds.draw)}
              />
            )}
            <OddsButton
              label="2"
              value={match.odds.away}
              selected={hasSelection(match.id, "1x2-away")}
              suspended={resultSuspended}
              onPress={() => handleOdds("1x2-away", "2 (Fora)", match.odds.away)}
            />
          </View>

          {hasExtraMarkets && (
            <Pressable
              style={({ pressed }) => [s.moreMarketsBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMarketsVisible(true); }}
            >
              <Ionicons name="options-outline" size={14} color={colors.mutedForeground} />
              <Text style={s.moreMarketsBtnText}>Ver mais mercados</Text>
              <Ionicons name="chevron-forward" size={12} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </View>

      {isLive && liveMatch?.markets && (
        <MarketsSheet
          visible={marketsVisible}
          match={liveMatch}
          markets={liveMatch.markets}
          onClose={() => setMarketsVisible(false)}
          onOdds={(market, label, value) => {
            handleOdds(market, label, value);
            setMarketsVisible(false);
          }}
          hasSelection={hasSelection}
        />
      )}
    </>
  );
}

function PromoBanner() {
  const colors = useColors();
  return (
    <View style={{
      marginHorizontal: 16,
      marginBottom: 12,
      marginTop: 4,
      borderRadius: 12,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.primary + "40",
    }}>
      <View style={{
        backgroundColor: colors.primary + "18",
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + "30", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="gift-outline" size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground }}>Bónus de Boas-Vindas</Text>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>100% no 1º depósito até €100 + Freebets</Text>
        </View>
        <View style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.primaryForeground }}>VER</Text>
        </View>
      </View>
    </View>
  );
}

export default function MatchesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { count } = useBetSlip();
  const [slipVisible, setSlipVisible] = useState(false);
  const [selectedSport, setSelectedSport] = useState("all");
  const [showPromo, setShowPromo] = useState(true);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { matches: allLive, connected: liveConnected, lastUpdated } = useLiveMatches();
  const liveLoaded = lastUpdated > 0;

  const { data: upcomingData, isLoading: upcomingLoading, refetch: refetchUpcoming } = useQuery({
    queryKey: ["upcoming-matches"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/matches/upcoming`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ matches: UpcomingMatch[] }>;
    },
    refetchInterval: 60000,
  });

  const allUpcoming: UpcomingMatch[] = upcomingData?.matches ?? [];

  const filteredLive = selectedSport === "all" ? allLive : allLive.filter((m) => m.sport === selectedSport);
  const filteredUpcoming = selectedSport === "all" ? allUpcoming : allUpcoming.filter((m) => m.sport === selectedSport);
  const isLoading = !liveLoaded && upcomingLoading;

  type Section =
    | { type: "promo"; id: string }
    | { type: "section-header"; id: string; title: string; count: number; isLive?: boolean }
    | { type: "live"; id: string; match: LiveMatch }
    | { type: "upcoming"; id: string; match: UpcomingMatch }
    | { type: "empty"; id: string };

  const items: Section[] = [];

  if (showPromo && !user) {
    items.push({ type: "promo", id: "promo" });
  }

  if (filteredLive.length > 0) {
    items.push({ type: "section-header", id: "sh-live", title: "Ao Vivo", count: filteredLive.length, isLive: true });
    filteredLive.forEach((m) => items.push({ type: "live", id: `live-${m.id}`, match: m }));
  }

  if (filteredUpcoming.length > 0) {
    items.push({ type: "section-header", id: "sh-upcoming", title: "Em Breve", count: filteredUpcoming.length });
    filteredUpcoming.forEach((m) => items.push({ type: "upcoming", id: `upcoming-${m.id}`, match: m }));
  }

  if (!isLoading && filteredLive.length === 0 && filteredUpcoming.length === 0) {
    items.push({ type: "empty", id: "empty" });
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 8,
      paddingHorizontal: 16,
      paddingBottom: 8,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    logo: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.primary },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    livePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.primary + "18",
      borderRadius: 16,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: colors.primary + "40",
    },
    livePillDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary },
    livePillText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary },
    balancePill: {
      backgroundColor: colors.card,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    balanceText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    sportFilter: { paddingBottom: 2 },
    sportChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      marginRight: 8,
      borderWidth: 1,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 8,
    },
    sectionTitle: { fontSize: 12, fontFamily: "Inter_700Bold", color: colors.mutedForeground, textTransform: "uppercase" as const, letterSpacing: 0.8 },
    sectionCount: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 7,
      paddingVertical: 2,
      minWidth: 20,
      alignItems: "center",
    },
    sectionCountText: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
    emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    betSlipFab: {
      position: "absolute",
      bottom: (Platform.OS === "web" ? 84 : 90) + insets.bottom,
      right: 20,
      backgroundColor: colors.primary,
      borderRadius: 28,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 14,
      gap: 8,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    betSlipFabText: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    badge: { backgroundColor: colors.primaryForeground, borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
    badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.primary },
    liveIndicator: { flexDirection: "row", alignItems: "center", gap: 4 },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <Text style={s.logo}>BET62</Text>
          <View style={s.headerRight}>
            {allLive.length > 0 && (
              <View style={s.livePill}>
                <View style={s.livePillDot} />
                <Text style={s.livePillText}>{allLive.length} ao vivo</Text>
              </View>
            )}
            {user ? (
              <View style={s.balancePill}>
                <Ionicons name="wallet-outline" size={15} color={colors.foreground} />
                <Text style={s.balanceText}>€{parseFloat(user.balance).toFixed(2)}</Text>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [s.balancePill, { opacity: pressed ? 0.8 : 1 }]}
                onPress={() => router.push("/(auth)/login")}
              >
                <Ionicons name="person-outline" size={15} color={colors.foreground} />
                <Text style={s.balanceText}>Entrar</Text>
              </Pressable>
            )}
          </View>
        </View>

        <FlatList
          horizontal
          data={SPORTS}
          keyExtractor={(i) => i.key}
          showsHorizontalScrollIndicator={false}
          style={s.sportFilter}
          renderItem={({ item }) => {
            const active = selectedSport === item.key;
            const sportCol = SPORT_COLORS[item.key] ?? colors.primary;
            return (
              <Pressable
                style={[s.sportChip, {
                  backgroundColor: active ? sportCol : colors.muted,
                  borderColor: active ? sportCol : colors.border,
                }]}
                onPress={() => { setSelectedSport(item.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: active ? "#ffffff" : colors.foreground }}>
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: Platform.OS === "web" ? 140 : 160 }}
          scrollEnabled={items.length > 0}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={() => refetchUpcoming()} tintColor={colors.primary} />
          }
          renderItem={({ item }) => {
            if (item.type === "promo") {
              return <PromoBanner />;
            }
            if (item.type === "section-header") {
              return (
                <View style={s.sectionHeader}>
                  {item.isLive && (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginRight: -2 }} />
                  )}
                  <Text style={[s.sectionTitle, item.isLive && { color: colors.foreground }]}>{item.title}</Text>
                  <View style={[s.sectionCount, !item.isLive && { backgroundColor: colors.muted }]}>
                    <Text style={[s.sectionCountText, !item.isLive && { color: colors.mutedForeground }]}>{item.count}</Text>
                  </View>
                </View>
              );
            }
            if (item.type === "live") {
              return <MatchCard match={item.match} isLive={true} />;
            }
            if (item.type === "upcoming") {
              return <MatchCard match={item.match} isLive={false} />;
            }
            return (
              <View style={s.emptyContainer}>
                <MaterialCommunityIcons name="soccer-field" size={48} color={colors.border} />
                <Text style={s.emptyText}>Sem jogos disponíveis</Text>
                <Text style={s.emptySubtext}>Tenta outro desporto ou volta mais tarde</Text>
              </View>
            );
          }}
        />
      )}

      {count > 0 && !slipVisible && (
        <Pressable
          style={({ pressed }) => [s.betSlipFab, { opacity: pressed ? 0.9 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSlipVisible(true); }}
          testID="bet-slip-fab"
        >
          <Ionicons name="receipt-outline" size={20} color={colors.primaryForeground} />
          <Text style={s.betSlipFabText}>Aposta</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>{count}</Text>
          </View>
        </Pressable>
      )}

      <BetSlipModal visible={slipVisible} onClose={() => setSlipVisible(false)} />
    </View>
  );
}
