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
import { ComprehensiveMarketsSheet } from "@/components/ComprehensiveMarketsSheet";
import { BetSlipModal } from "@/components/BetSlipModal";
import type { LiveMatchMarkets } from "@/hooks/useLiveMatches";

type MCIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface UpcomingMatch {
  id: string;
  sport: string;
  home: string;
  away: string;
  kickoff: string;
  odds: { home: number; draw: number; away: number };
  league?: string;
  markets?: LiveMatchMarkets;
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

function UpcomingCard({ match }: { match: UpcomingMatch }) {
  const colors = useColors();
  const { addSelection, removeSelection, hasSelection } = useBetSlip();
  const [marketsOpen, setMarketsOpen] = useState(false);

  const sportCol = SPORT_COLORS[match.sport] ?? colors.mutedForeground;
  const hasDraw = match.odds.draw > 1.01;

  const kickoffDate = new Date(match.kickoff);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const isToday = kickoffDate.toDateString() === today.toDateString();
  const isTomorrow = kickoffDate.toDateString() === tomorrow.toDateString();
  const dateStr = isToday ? "Hoje"
    : isTomorrow ? "Amanhã"
    : kickoffDate.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
  const timeStr = kickoffDate.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });

  function handleOdds(market: string, label: string, value: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (hasSelection(match.id, market)) removeSelection(match.id, market);
    else addSelection({ matchId: match.id, matchTitle: `${match.home} vs ${match.away}`, market, selection: market, label: `${match.home} vs ${match.away} — ${label}`, odds: value });
  }

  const s = StyleSheet.create({
    card: { backgroundColor: colors.card, borderRadius: 12, marginHorizontal: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    stripe: { height: 3, backgroundColor: sportCol },
    body: { padding: 12 },
    topRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
    league: { flex: 1, fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    time: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    date: { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginLeft: 3 },
    teamsRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    team: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    teamAway: { textAlign: "right" as const },
    vsBox: { backgroundColor: colors.muted, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, marginHorizontal: 8 },
    vsText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    oddsRow: { flexDirection: "row", gap: 6 },
    oddsBtn: { flex: 1, borderRadius: 8, borderWidth: 1, paddingVertical: 8, alignItems: "center" },
    oddsLabel: { fontSize: 10, fontFamily: "Inter_500Medium", marginBottom: 1 },
    oddsValue: { fontSize: 13, fontFamily: "Inter_700Bold" },
    marketsHint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
    marketsHintText: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
  });

  return (
    <>
      <Pressable
        style={({ pressed }) => [s.card, { opacity: pressed ? 0.97 : 1 }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMarketsOpen(true); }}
      >
        <View style={s.stripe} />
        <View style={s.body}>
          <View style={s.topRow}>
            <MaterialCommunityIcons name={SPORT_ICONS[match.sport] ?? "trophy"} size={12} color={sportCol} />
            <Text style={s.league} numberOfLines={1}>{match.league ?? match.sport}</Text>
            <Text style={s.time}>{timeStr}</Text>
            <Text style={s.date}>{dateStr}</Text>
          </View>

          <View style={s.teamsRow}>
            <Text style={s.team} numberOfLines={1}>{match.home}</Text>
            <View style={s.vsBox}><Text style={s.vsText}>vs</Text></View>
            <Text style={[s.team, s.teamAway]} numberOfLines={1}>{match.away}</Text>
          </View>

          <View style={s.oddsRow}>
            {[
              { mkt: "1x2-home", lbl: "1", val: match.odds.home, fullLabel: "1 (Casa)" },
              ...(hasDraw ? [{ mkt: "1x2-draw", lbl: "X", val: match.odds.draw, fullLabel: "X (Empate)" }] : []),
              { mkt: "1x2-away", lbl: "2", val: match.odds.away, fullLabel: "2 (Fora)" },
            ].map(({ mkt, lbl, val, fullLabel }) => {
              const sel = hasSelection(match.id, mkt);
              return (
                <Pressable
                  key={mkt}
                  style={({ pressed }) => [s.oddsBtn, { backgroundColor: sel ? colors.primary : colors.muted, borderColor: sel ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 }]}
                  onPress={(e) => { e.stopPropagation?.(); handleOdds(mkt, fullLabel, val); }}
                >
                  <Text style={[s.oddsLabel, { color: sel ? colors.primaryForeground : colors.mutedForeground }]}>{lbl}</Text>
                  <Text style={[s.oddsValue, { color: sel ? colors.primaryForeground : colors.foreground }]}>{val.toFixed(2)}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={s.marketsHint}>
            <Ionicons name="options-outline" size={13} color={colors.mutedForeground} />
            <Text style={s.marketsHintText}>Toca para ver todos os mercados</Text>
          </View>
        </View>
      </Pressable>

      <ComprehensiveMarketsSheet
        visible={marketsOpen}
        match={match}
        onClose={() => setMarketsOpen(false)}
      />
    </>
  );
}

export default function PreGameScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { count } = useBetSlip();
  const [slipVisible, setSlipVisible] = useState(false);
  const [selectedSport, setSelectedSport] = useState("all");

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["upcoming-matches"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/matches/upcoming`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ matches: UpcomingMatch[] }>;
    },
    refetchInterval: 60000,
  });

  const allUpcoming: UpcomingMatch[] = data?.matches ?? [];
  const filtered = selectedSport === "all" ? allUpcoming : allUpcoming.filter((m) => m.sport === selectedSport);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 8, paddingHorizontal: 14, paddingBottom: 8, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    logo: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.primary },
    balancePill: { backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border },
    balanceText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    sportChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, marginRight: 8, borderWidth: 1 },
    sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
    sectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, textTransform: "uppercase" as const, letterSpacing: 0.8 },
    sectionCount: { backgroundColor: colors.muted, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
    sectionCountText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
    emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    fab: { position: "absolute", bottom: (Platform.OS === "web" ? 84 : 90) + insets.bottom, right: 18, backgroundColor: colors.primary, borderRadius: 28, flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 13, gap: 8, elevation: 8, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
    fabText: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    badge: { backgroundColor: colors.primaryForeground, borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
    badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.primary },
  });

  type ListItem =
    | { type: "header"; id: string; count: number }
    | { type: "match"; id: string; match: UpcomingMatch };

  const items: ListItem[] = [];
  if (filtered.length > 0) {
    items.push({ type: "header", id: "h", count: filtered.length });
    filtered.forEach((m) => items.push({ type: "match", id: m.id, match: m }));
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <View style={s.logoRow}>
            <Text style={s.logo}>BET62</Text>
          </View>
          {user ? (
            <View style={s.balancePill}>
              <Ionicons name="wallet-outline" size={14} color={colors.foreground} />
              <Text style={s.balanceText}>€{parseFloat(user.balance).toFixed(2)}</Text>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [s.balancePill, { opacity: pressed ? 0.8 : 1 }]}
              onPress={() => router.push("/(auth)/login")}
            >
              <Ionicons name="person-outline" size={14} color={colors.foreground} />
              <Text style={s.balanceText}>Entrar</Text>
            </Pressable>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 2 }}>
          {SPORTS.map((sp) => {
            const active = selectedSport === sp.key;
            const col = SPORT_COLORS[sp.key] ?? colors.primary;
            return (
              <Pressable
                key={sp.key}
                style={[s.sportChip, { backgroundColor: active ? col : colors.muted, borderColor: active ? col : colors.border }]}
                onPress={() => { setSelectedSport(sp.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: active ? "#ffffff" : colors.foreground }}>{sp.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingTop: 6, paddingBottom: Platform.OS === "web" ? 140 : 160 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <MaterialCommunityIcons name="soccer-field" size={52} color={colors.border} />
              <Text style={s.emptyText}>Sem pré-jogos disponíveis</Text>
              <Text style={s.emptySubtext}>Tenta outro desporto ou volta mais tarde</Text>
            </View>
          }
          renderItem={({ item }) => {
            if (item.type === "header") {
              return (
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>Próximos Eventos</Text>
                  <View style={s.sectionCount}><Text style={s.sectionCountText}>{item.count}</Text></View>
                </View>
              );
            }
            return <UpcomingCard match={item.match} />;
          }}
        />
      )}

      {count > 0 && !slipVisible && (
        <Pressable
          style={({ pressed }) => [s.fab, { opacity: pressed ? 0.9 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSlipVisible(true); }}
        >
          <Ionicons name="receipt-outline" size={20} color={colors.primaryForeground} />
          <Text style={s.fabText}>Aposta</Text>
          <View style={s.badge}><Text style={s.badgeText}>{count}</Text></View>
        </Pressable>
      )}

      <BetSlipModal visible={slipVisible} onClose={() => setSlipVisible(false)} />
    </View>
  );
}
