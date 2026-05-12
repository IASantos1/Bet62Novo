import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { type ComponentProps, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
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

type MCIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface LiveMatch {
  id: string;
  sport: string;
  status: string;
  minute?: number;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  odds: { home: number; draw: number; away: number };
  league?: string;
}

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
];

const SPORT_ICONS: Record<string, MCIconName> = {
  football: "soccer",
  basketball: "basketball",
  tennis: "tennis",
  hockey: "hockey-puck",
  volleyball: "volleyball",
};

function SportIcon({ sport, color, size = 16 }: { sport: string; color: string; size?: number }) {
  const iconName: MCIconName = SPORT_ICONS[sport] ?? "trophy-outline";
  return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
}

function OddsButton({
  label,
  value,
  selected,
  onPress,
}: {
  label: string;
  value: number;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        oddsStyles.btn,
        {
          backgroundColor: selected ? colors.primary : colors.muted,
          borderColor: selected ? colors.primary : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      onPress={onPress}
      testID={`odds-${label}`}
    >
      <Text style={[oddsStyles.label, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[oddsStyles.value, { color: selected ? colors.primaryForeground : colors.foreground }]}>
        {value.toFixed(2)}
      </Text>
    </Pressable>
  );
}

const oddsStyles = StyleSheet.create({
  btn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 8,
    alignItems: "center",
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
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

function MatchCard({ match, isLive }: { match: LiveMatch | UpcomingMatch; isLive: boolean }) {
  const colors = useColors();
  const { addSelection, removeSelection, hasSelection } = useBetSlip();
  const liveMatch = isLive ? (match as LiveMatch) : null;
  const upcomingMatch = !isLive ? (match as UpcomingMatch) : null;

  function handleOdds(market: string, label: string, value: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (hasSelection(match.id, market)) {
      removeSelection(match.id, market);
    } else {
      addSelection({
        matchId: match.id,
        matchTitle: `${match.home} vs ${match.away}`,
        market,
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

  const s = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      marginHorizontal: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    league: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, flex: 1 },
    minuteBadge: { fontSize: 12, fontFamily: "Inter_700Bold", color: colors.warning },
    teamsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    teamName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1 },
    teamNameAway: { textAlign: "right" as const },
    scoreBox: { backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginHorizontal: 8 },
    scoreText: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    timeBox: { backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginHorizontal: 8 },
    timeText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    oddsRow: { flexDirection: "row", gap: 8 },
  });

  return (
    <View style={s.card}>
      <View style={s.header}>
        {isLive ? <LiveBadge /> : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <SportIcon sport={match.sport} color={colors.mutedForeground} size={14} />
            <Text style={s.league} numberOfLines={1}>{match.league ?? match.sport}</Text>
          </View>
        )}
        {isLive && <Text style={s.minuteBadge}>{liveMatch?.minute ?? 0}&apos;</Text>}
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
            <Text style={s.scoreText}>{liveMatch!.homeScore} – {liveMatch!.awayScore}</Text>
          </View>
        ) : (
          <View style={s.timeBox}>
            <Text style={s.timeText}>vs</Text>
          </View>
        )}
        <Text style={[s.teamName, s.teamNameAway]} numberOfLines={1}>{match.away}</Text>
      </View>

      <View style={s.oddsRow}>
        <OddsButton
          label="1"
          value={match.odds.home}
          selected={hasSelection(match.id, "1x2-home")}
          onPress={() => handleOdds("1x2-home", "1 (Casa)", match.odds.home)}
        />
        {match.odds.draw > 1.01 && (
          <OddsButton
            label="X"
            value={match.odds.draw}
            selected={hasSelection(match.id, "1x2-draw")}
            onPress={() => handleOdds("1x2-draw", "X (Empate)", match.odds.draw)}
          />
        )}
        <OddsButton
          label="2"
          value={match.odds.away}
          selected={hasSelection(match.id, "1x2-away")}
          onPress={() => handleOdds("1x2-away", "2 (Fora)", match.odds.away)}
        />
      </View>
    </View>
  );
}

export default function MatchesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { count } = useBetSlip();
  const [selectedSport, setSelectedSport] = useState("all");

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: liveData, isLoading: liveLoading, refetch: refetchLive } = useQuery({
    queryKey: ["live-matches"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/matches/live`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ matches: LiveMatch[] }>;
    },
    refetchInterval: 30000,
  });

  const { data: upcomingData, isLoading: upcomingLoading, refetch: refetchUpcoming } = useQuery({
    queryKey: ["upcoming-matches"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/matches/upcoming`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ matches: UpcomingMatch[] }>;
    },
    refetchInterval: 60000,
  });

  const allLive: LiveMatch[] = liveData?.matches ?? [];
  const allUpcoming: UpcomingMatch[] = upcomingData?.matches ?? [];

  const filteredLive = selectedSport === "all" ? allLive : allLive.filter((m) => m.sport === selectedSport);
  const filteredUpcoming = selectedSport === "all" ? allUpcoming : allUpcoming.filter((m) => m.sport === selectedSport);

  const isLoading = liveLoading && upcomingLoading;

  type Section =
    | { type: "section-header"; id: string; title: string; count: number }
    | { type: "live"; id: string; match: LiveMatch }
    | { type: "upcoming"; id: string; match: UpcomingMatch }
    | { type: "empty"; id: string };

  const items: Section[] = [];

  if (filteredLive.length > 0) {
    items.push({ type: "section-header", id: "sh-live", title: "Ao Vivo", count: filteredLive.length });
    filteredLive.forEach((m) => items.push({ type: "live", id: `live-${m.id}`, match: m }));
  }

  if (filteredUpcoming.length > 0) {
    items.push({ type: "section-header", id: "sh-upcoming", title: "Em Breve", count: filteredUpcoming.length });
    filteredUpcoming.forEach((m) => items.push({ type: "upcoming", id: `upcoming-${m.id}`, match: m }));
  }

  if (!isLoading && items.length === 0) {
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
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    logo: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.primary },
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
    sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.mutedForeground, textTransform: "uppercase" as const, letterSpacing: 0.5 },
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
    badge: {
      backgroundColor: colors.primaryForeground,
      borderRadius: 10,
      width: 20,
      height: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.primary },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <Text style={s.logo}>BET62</Text>
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

        <FlatList
          horizontal
          data={SPORTS}
          keyExtractor={(i) => i.key}
          showsHorizontalScrollIndicator={false}
          style={s.sportFilter}
          renderItem={({ item }) => {
            const active = selectedSport === item.key;
            return (
              <Pressable
                style={[
                  s.sportChip,
                  {
                    backgroundColor: active ? colors.primary : colors.muted,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  setSelectedSport(item.key);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: active ? colors.primaryForeground : colors.foreground }}>
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
            <RefreshControl
              refreshing={false}
              onRefresh={() => { refetchLive(); refetchUpcoming(); }}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => {
            if (item.type === "section-header") {
              return (
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>{item.title}</Text>
                  <View style={s.sectionCount}>
                    <Text style={s.sectionCountText}>{item.count}</Text>
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

      {count > 0 && (
        <Pressable
          style={({ pressed }) => [s.betSlipFab, { opacity: pressed ? 0.9 : 1 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/bet-slip");
          }}
          testID="bet-slip-fab"
        >
          <Ionicons name="receipt-outline" size={20} color={colors.primaryForeground} />
          <Text style={s.betSlipFabText}>Aposta</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>{count}</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}
