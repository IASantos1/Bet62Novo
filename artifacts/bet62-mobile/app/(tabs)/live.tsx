import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { type ComponentProps, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useBetSlip } from "@/context/BetSlipContext";
import { useLiveMatches, type LiveMatch } from "@/hooks/useLiveMatches";
import { ComprehensiveMarketsSheet } from "@/components/ComprehensiveMarketsSheet";
import { BetSlipModal } from "@/components/BetSlipModal";
import { getTeamBannerUrl } from "@/utils/teamBanners";

type MCIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const SPORTS = [
  { key: "all", label: "Todos" },
  { key: "football", label: "Futebol" },
  { key: "basketball", label: "Basquete" },
  { key: "tennis", label: "Ténis" },
  { key: "hockey", label: "Hóquei" },
  { key: "volleyball", label: "Voleibol" },
  { key: "baseball", label: "Baseball" },
];

const SPORT_COLORS: Record<string, string> = {
  football: "#22c55e",
  basketball: "#f97316",
  tennis: "#eab308",
  hockey: "#60a5fa",
  volleyball: "#a78bfa",
  baseball: "#fb7185",
};

const SPORT_ICONS: Record<string, MCIconName> = {
  football: "soccer",
  basketball: "basketball",
  tennis: "tennis",
  hockey: "hockey-puck",
  volleyball: "volleyball",
  baseball: "baseball",
};

/** Compact tennis score: names on LEFT stacked, score columns on RIGHT */
function TennisScoreRow({
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
  const currentIdx = sets.length - 1;

  function SetCell({ value, isCurrent }: { value: number; isCurrent: boolean }) {
    return (
      <View style={{
        width: 22, height: 20, borderRadius: 4,
        alignItems: "center", justifyContent: "center",
        backgroundColor: isCurrent ? colors.primary + "25" : "#00000000",
        borderWidth: 1,
        borderColor: isCurrent ? colors.primary + "80" : "#ffffff25",
      }}>
        <Text style={{
          fontSize: 11, fontFamily: "Inter_700Bold",
          color: isCurrent ? colors.primary : "#ffffff",
        }}>{value}</Text>
      </View>
    );
  }

  function PtCell({ value }: { value: number | string }) {
    return (
      <View style={{
        width: 26, height: 20, borderRadius: 4,
        alignItems: "center", justifyContent: "center",
        backgroundColor: "#f59e0b15", borderWidth: 1, borderColor: "#f59e0b40",
      }}>
        <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#f59e0b" }}>{String(value)}</Text>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {/* Left: team names stacked */}
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{home}</Text>
        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{away}</Text>
      </View>
      {/* Right: set score columns */}
      <View style={{ gap: 5 }}>
        {/* Home row */}
        <View style={{ flexDirection: "row", gap: 3 }}>
          {sets.map((s, i) => <SetCell key={i} value={s[0]} isCurrent={i === currentIdx} />)}
          {currentPoints != null && <PtCell value={currentPoints[0]} />}
        </View>
        {/* Away row */}
        <View style={{ flexDirection: "row", gap: 3 }}>
          {sets.map((s, i) => <SetCell key={i} value={s[1]} isCurrent={i === currentIdx} />)}
          {currentPoints != null && <PtCell value={currentPoints[1]} />}
        </View>
      </View>
    </View>
  );
}

function PeriodBreakdown({ periods, colors }: { periods: Array<[number, number]>; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flexDirection: "row", gap: 3, marginTop: 3 }}>
      {periods.map((p, i) => (
        <View key={i} style={{ backgroundColor: "#ffffff10", borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}>
          <Text style={{ fontSize: 9, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>{p[0]}–{p[1]}</Text>
        </View>
      ))}
    </View>
  );
}

function LiveMatchCard({ match }: { match: LiveMatch }) {
  const colors = useColors();
  const { addSelection, removeSelection, hasSelection } = useBetSlip();
  const [marketsOpen, setMarketsOpen] = useState(false);

  const sportColor = SPORT_COLORS[match.sport] ?? colors.mutedForeground;
  const now = Date.now();
  const suspended =
    match.marketSuspension?.["result"] != null &&
    match.marketSuspension["result"]! > now;

  const sets = match._liveExtra?.sets;
  const currentPoints = match._liveExtra?.currentPoints;
  const periods = match._liveExtra?.periods;
  const quarters = match._liveExtra?.quarters;
  const innings = match._liveExtra?.innings;
  const isTennis = match.sport === "tennis";
  const isHockey = match.sport === "hockey";
  const isBball = match.sport === "basketball";
  const isBase = match.sport === "baseball";
  const hasDraw = match.odds.draw > 1.01;

  const homeBanner = getTeamBannerUrl(match.home);
  const awayBanner = getTeamBannerUrl(match.away);
  const hasBanner = !!(homeBanner || awayBanner);

  function handleOdds(market: string, label: string, value: number) {
    if (suspended) return;
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

  const s = StyleSheet.create({
    card: { backgroundColor: colors.card, borderRadius: 12, marginHorizontal: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    stripe: { height: 3, backgroundColor: sportColor },
    body: { padding: 12 },
    topRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
    minute: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#f59e0b" },
    league: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, flex: 1 },
    teamsRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    team: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    teamAway: { textAlign: "right" as const },
    scoreBox: { backgroundColor: "#0c0c12", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginHorizontal: 6, borderWidth: 1, borderColor: colors.primary + "40", alignItems: "center" },
    scoreText: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#ffffff" },
    oddsRow: { flexDirection: "row", gap: 6 },
    oddsBtn: { flex: 1, borderRadius: 8, borderWidth: 1, paddingVertical: 8, alignItems: "center" },
    oddsLabel: { fontSize: 10, fontFamily: "Inter_500Medium", marginBottom: 1 },
    oddsValue: { fontSize: 13, fontFamily: "Inter_700Bold" },
    suspBanner: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#ef444415", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8 },
    suspText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#ef4444" },
  });

  return (
    <>
      <Pressable
        style={({ pressed }) => [s.card, { opacity: pressed ? 0.97 : 1 }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMarketsOpen(true); }}
      >
        {/* Banner or stripe */}
        {hasBanner ? (
          <View style={{ height: 48, flexDirection: "row", overflow: "hidden" }}>
            <View style={{ flex: 1, overflow: "hidden", backgroundColor: sportColor + "18" }}>
              {homeBanner && <Image source={{ uri: homeBanner }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
            </View>
            <View style={{ flex: 1, overflow: "hidden", backgroundColor: sportColor + "10" }}>
              {awayBanner && <Image source={{ uri: awayBanner }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
            </View>
            {/* Score overlay on banner */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#00000060", flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 }]}>
              <Text style={{ flex: 1, color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" }} numberOfLines={1}>{match.home}</Text>
              <View style={{ backgroundColor: "#000000aa", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.primary + "60" }}>
                <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" }}>{match.homeScore} – {match.awayScore}</Text>
              </View>
              <Text style={{ flex: 1, color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "right" as const }} numberOfLines={1}>{match.away}</Text>
            </View>
            {/* Live badge */}
            <View style={{ position: "absolute", top: 6, right: 8, backgroundColor: colors.primary, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, flexDirection: "row", alignItems: "center", gap: 3 }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff" }} />
              <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>{isTennis ? `S${match.minute ?? 1}` : `${match.minute ?? 0}'`}</Text>
            </View>
          </View>
        ) : (
          <View style={s.stripe} />
        )}

        <View style={s.body}>
          {/* Top row: sport icon, league, minute (only if no banner) */}
          <View style={s.topRow}>
            <View style={s.liveDot} />
            <MaterialCommunityIcons name={SPORT_ICONS[match.sport] ?? "trophy"} size={12} color={sportColor} />
            <Text style={s.league} numberOfLines={1}>{match.league ?? match.sport}</Text>
            {!hasBanner && (
              isTennis
                ? <Text style={[s.minute, { color: "#22c55e" }]}>Set {match.minute ?? 1}</Text>
                : <Text style={s.minute}>{match.minute ?? 0}&apos;</Text>
            )}
          </View>

          {/* Teams + Score (only if no banner) */}
          {!hasBanner && (
            isTennis && sets && sets.length > 0 ? (
              <View style={{ marginBottom: 10 }}>
                <TennisScoreRow sets={sets} currentPoints={currentPoints} home={match.home} away={match.away} colors={colors} />
              </View>
            ) : (
              <View style={s.teamsRow}>
                <Text style={s.team} numberOfLines={1}>{match.home}</Text>
                <View style={s.scoreBox}>
                  {(isHockey && periods && periods.length > 0) ? (
                    <View style={{ alignItems: "center" }}>
                      <Text style={s.scoreText}>{match.homeScore} – {match.awayScore}</Text>
                      <PeriodBreakdown periods={periods} colors={colors} />
                    </View>
                  ) : (isBball && quarters && quarters.length > 0) ? (
                    <View style={{ alignItems: "center" }}>
                      <Text style={s.scoreText}>{match.homeScore} – {match.awayScore}</Text>
                      <PeriodBreakdown periods={quarters} colors={colors} />
                    </View>
                  ) : (isBase && innings && innings.length > 0) ? (
                    <View style={{ alignItems: "center" }}>
                      <Text style={s.scoreText}>{match.homeScore} – {match.awayScore}</Text>
                      <Text style={{ fontSize: 9, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{innings.length}ª ent.</Text>
                    </View>
                  ) : (
                    <Text style={s.scoreText}>{match.homeScore} – {match.awayScore}</Text>
                  )}
                </View>
                <Text style={[s.team, s.teamAway]} numberOfLines={1}>{match.away}</Text>
              </View>
            )
          )}

          {/* Tennis set breakdown below banner */}
          {hasBanner && isTennis && sets && sets.length > 0 && (
            <View style={{ marginBottom: 8 }}>
              <TennisScoreRow sets={sets} currentPoints={currentPoints} home={match.home} away={match.away} colors={colors} />
            </View>
          )}

          {/* Suspension banner */}
          {suspended && (
            <View style={s.suspBanner}>
              <Ionicons name="warning" size={12} color="#ef4444" />
              <Text style={s.suspText}>{match.suspensionReason ?? "SUSPENSO"} — MERCADO SUSPENSO</Text>
            </View>
          )}

          {/* Odds row */}
          <View style={s.oddsRow}>
            {(["1x2-home", "1x2-draw", "1x2-away"] as const).map((mkt, idx) => {
              const val = idx === 0 ? match.odds.home : idx === 1 ? match.odds.draw : match.odds.away;
              if (idx === 1 && !hasDraw) return null;
              const label = idx === 0 ? "1" : idx === 1 ? "X" : "2";
              const labelFull = idx === 0 ? "1 (Casa)" : idx === 1 ? "X (Empate)" : "2 (Fora)";
              const sel = hasSelection(match.id, mkt);
              return (
                <Pressable
                  key={mkt}
                  style={({ pressed }) => [s.oddsBtn, { backgroundColor: suspended ? colors.muted : sel ? colors.primary : colors.muted, borderColor: suspended ? colors.border : sel ? colors.primary : colors.border, opacity: suspended ? 0.55 : pressed ? 0.8 : 1 }]}
                  onPress={(e) => { e.stopPropagation?.(); handleOdds(mkt, labelFull, val); }}
                >
                  <Text style={[s.oddsLabel, { color: sel ? colors.primaryForeground : colors.mutedForeground }]}>{label}</Text>
                  <Text style={[s.oddsValue, { color: sel ? colors.primaryForeground : colors.foreground }]}>{val.toFixed(2)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Pressable>

      <ComprehensiveMarketsSheet
        visible={marketsOpen}
        match={{
          id: match.id, sport: match.sport, home: match.home, away: match.away,
          odds: match.odds, markets: match.markets, marketSuspension: match.marketSuspension,
          homeScore: match.homeScore, awayScore: match.awayScore,
          isLive: true, minute: match.minute, status: match.status,
          league: match.league, _liveExtra: match._liveExtra,
        }}
        onClose={() => setMarketsOpen(false)}
      />
    </>
  );
}

export default function LiveScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { count } = useBetSlip();
  const [slipVisible, setSlipVisible] = useState(false);
  const [selectedSport, setSelectedSport] = useState("all");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { matches: allLive, connected, lastUpdated } = useLiveMatches();
  const liveLoaded = lastUpdated > 0;
  const filtered = selectedSport === "all" ? allLive : allLive.filter((m) => m.sport === selectedSport);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 8, paddingHorizontal: 14, paddingBottom: 8, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
    liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primaryForeground },
    liveText: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    countText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    connDot: { width: 8, height: 8, borderRadius: 4 },
    sportChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, marginRight: 8, borderWidth: 1 },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
    emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" as const, paddingHorizontal: 32 },
    fab: { position: "absolute", bottom: (Platform.OS === "web" ? 84 : 90) + insets.bottom, right: 18, backgroundColor: colors.primary, borderRadius: 28, flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 13, gap: 8, elevation: 8, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
    fabText: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    badge: { backgroundColor: colors.primaryForeground, borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
    badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.primary },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={s.liveBadge}>
              <View style={s.liveDot} />
              <Text style={s.liveText}>AO VIVO</Text>
            </View>
            <Text style={s.countText}>{allLive.length} {allLive.length === 1 ? "jogo" : "jogos"}</Text>
          </View>
          <View style={[s.connDot, { backgroundColor: connected ? "#22c55e" : "#f59e0b" }]} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 2 }}>
          {SPORTS.map((sp) => {
            const active = selectedSport === sp.key;
            const col = SPORT_COLORS[sp.key] ?? colors.primary;
            return (
              <Pressable key={sp.key} style={[s.sportChip, { backgroundColor: active ? col : colors.muted, borderColor: active ? col : colors.border }]}
                onPress={() => { setSelectedSport(sp.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: active ? "#ffffff" : colors.foreground }}>{sp.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {!liveLoaded ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingTop: 10, paddingBottom: Platform.OS === "web" ? 140 : 160 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="radio-outline" size={52} color={colors.border} />
              <Text style={s.emptyText}>Sem jogos ao vivo</Text>
              <Text style={s.emptySubtext}>{selectedSport !== "all" ? "Tenta outro desporto ou volta mais tarde" : "Não há eventos ao vivo de momento"}</Text>
            </View>
          }
          renderItem={({ item }) => <LiveMatchCard match={item} />}
        />
      )}

      {count > 0 && !slipVisible && (
        <Pressable style={({ pressed }) => [s.fab, { opacity: pressed ? 0.9 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSlipVisible(true); }}>
          <Ionicons name="receipt-outline" size={20} color={colors.primaryForeground} />
          <Text style={s.fabText}>Aposta</Text>
          <View style={s.badge}><Text style={s.badgeText}>{count}</Text></View>
        </Pressable>
      )}

      <BetSlipModal visible={slipVisible} onClose={() => setSlipVisible(false)} />
    </View>
  );
}
