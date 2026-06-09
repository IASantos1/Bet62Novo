import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { type ComponentProps, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useBetSlip } from "@/context/BetSlipContext";
import { API_BASE } from "@/context/AuthContext";
import { useLiveMatches, type LiveMatchMarkets } from "@/hooks/useLiveMatches";
import { ComprehensiveMarketsSheet } from "@/components/ComprehensiveMarketsSheet";
import { BetSlipModal } from "@/components/BetSlipModal";
import { getLeagueFlag } from "@/utils/teamBanners";

type MCIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface UpcomingMatch {
  id: string;
  sport: string;
  home: string;
  away: string;
  date?: string;
  time?: string;
  odds: { home: number; draw: number; away: number };
  league?: string;
  country?: string;
  hasRealOdds?: boolean;
}

interface MatchResult {
  id: string;
  sport: string;
  home: string;
  away: string;
  date?: string;
  time?: string;
  odds: { home: number; draw: number; away: number };
  league?: string;
  isLive?: boolean;
  homeScore?: number;
  awayScore?: number;
  markets?: LiveMatchMarkets;
  marketSuspension?: Record<string, number>;
}

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

const SPORT_LIST = [
  { key: "football", label: "Futebol" },
  { key: "basketball", label: "Basquete" },
  { key: "tennis", label: "Ténis" },
  { key: "hockey", label: "Hóquei" },
  { key: "volleyball", label: "Voleibol" },
  { key: "baseball", label: "Baseball" },
];

const TOP_COMPETITIONS = [
  { id: "premier", name: "Premier League", sport: "football", country: "Inglaterra" },
  { id: "laliga", name: "La Liga", sport: "football", country: "Espanha" },
  { id: "bundesliga", name: "Bundesliga", sport: "football", country: "Alemanha" },
  { id: "seriea", name: "Serie A", sport: "football", country: "Itália" },
  { id: "ligue1", name: "Ligue 1", sport: "football", country: "França" },
  { id: "liga", name: "Liga Portugal", sport: "football", country: "Portugal" },
  { id: "cl", name: "Champions League", sport: "football", country: "UEFA" },
  { id: "nba", name: "NBA", sport: "basketball", country: "EUA" },
  { id: "nhl", name: "NHL", sport: "hockey", country: "EUA/Canadá" },
  { id: "mlb", name: "MLB", sport: "baseball", country: "EUA" },
  { id: "atp", name: "ATP Tour", sport: "tennis", country: "Internacional" },
  { id: "wta", name: "WTA Tour", sport: "tennis", country: "Internacional" },
];

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { count } = useBetSlip();
  const { addSelection, removeSelection, hasSelection } = useBetSlip();
  const [query, setQuery] = useState("");
  const [activeSport, setActiveSport] = useState<string | null>(null);
  const [slipVisible, setSlipVisible] = useState(false);
  const [marketsMatch, setMarketsMatch] = useState<MatchResult | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { matches: liveMatches } = useLiveMatches();

  const { data: upcomingData } = useQuery({
    queryKey: ["upcoming-matches"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/matches/upcoming`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ matches: UpcomingMatch[] }>;
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const upcoming: UpcomingMatch[] = upcomingData?.matches ?? [];

  const allMatches: MatchResult[] = useMemo(() => {
    const live: MatchResult[] = liveMatches
      .filter((m) => m.hasRealOdds !== false)
      .map((m) => ({
        id: m.id, sport: m.sport, home: m.home, away: m.away,
        odds: m.odds, league: m.league, isLive: true,
        homeScore: m.homeScore, awayScore: m.awayScore,
        markets: m.markets, marketSuspension: m.marketSuspension,
        date: m.date,
        time: m.time,
      }));
    const up: MatchResult[] = upcoming
      .filter((m) => m.hasRealOdds !== false)
      .map((m) => ({
        id: m.id, sport: m.sport, home: m.home, away: m.away,
        date: m.date,
        time: m.time,
        odds: m.odds, league: m.league,
      }));
    return [...live, ...up];
  }, [liveMatches, upcoming]);

  const filtered = useMemo(() => {
    let list = allMatches;
    if (activeSport) list = list.filter((m) => m.sport === activeSport);
    if (query.trim().length >= 2) {
      const q = query.toLowerCase();
      list = list.filter((m) =>
        m.home.toLowerCase().includes(q) ||
        m.away.toLowerCase().includes(q) ||
        (m.league ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [allMatches, activeSport, query]);

  function handleOdds(match: MatchResult, market: string, label: string, value: number) {
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

  const isSearching = query.trim().length >= 2 || activeSport !== null;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 8,
      paddingHorizontal: 14,
      paddingBottom: 10,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 10,
    },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    inputWrap: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: colors.muted, borderRadius: 12,
      paddingHorizontal: 12, paddingVertical: 10, gap: 8,
      borderWidth: 1, borderColor: colors.border,
    },
    input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.foreground },
    sportChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginRight: 8 },
    sectionHeader: {
      paddingHorizontal: 14, paddingVertical: 8,
      backgroundColor: colors.background,
      flexDirection: "row", alignItems: "center", gap: 6,
    },
    sectionTitle: {
      fontSize: 11, fontFamily: "Inter_700Bold",
      color: colors.mutedForeground,
      textTransform: "uppercase" as const, letterSpacing: 0.8,
    },
    sectionCount: { backgroundColor: colors.muted, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
    sectionCountText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    compItem: {
      flexDirection: "row", alignItems: "center", gap: 12,
      paddingHorizontal: 14, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    compIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    compName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    compSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    sportGrid: { flexDirection: "row", flexWrap: "wrap" as const, gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
    sportCard: {
      width: "46%", borderRadius: 12, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.card,
      paddingVertical: 14, paddingHorizontal: 12,
      flexDirection: "row", alignItems: "center", gap: 10,
    },
    sportCardLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    matchCard: {
      flexDirection: "row", alignItems: "center",
      marginHorizontal: 14, marginBottom: 8,
      backgroundColor: colors.card, borderRadius: 10,
      borderWidth: 1, borderColor: colors.border, overflow: "hidden",
    },
    matchStripe: { width: 3, alignSelf: "stretch" },
    matchBody: { flex: 1, padding: 10 },
    matchTeams: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 2 },
    matchLeague: { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 6 },
    matchOdds: { flexDirection: "row", gap: 5 },
    oddsBtn: { flex: 1, borderRadius: 7, borderWidth: 1, paddingVertical: 7, alignItems: "center" },
    oddsLabel: { fontSize: 9, fontFamily: "Inter_500Medium", marginBottom: 1 },
    oddsValue: { fontSize: 12, fontFamily: "Inter_700Bold" },
    liveBadge: {
      flexDirection: "row", alignItems: "center", gap: 3,
      backgroundColor: colors.primary, borderRadius: 4,
      paddingHorizontal: 5, paddingVertical: 2,
      alignSelf: "flex-start", marginBottom: 4,
    },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 10 },
    emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    emptySubtext: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    fab: {
      position: "absolute",
      bottom: (Platform.OS === "web" ? 84 : 90) + insets.bottom,
      right: 18,
      backgroundColor: colors.primary,
      borderRadius: 28,
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: 18, paddingVertical: 13, gap: 8,
      elevation: 8,
      shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    },
    fabText: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    badge: { backgroundColor: colors.primaryForeground, borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
    badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.primary },
  });

  function MatchItem({ match }: { match: MatchResult }) {
    const sportCol = SPORT_COLORS[match.sport] ?? colors.mutedForeground;
    const hasDraw = match.odds.draw > 1.01;
    return (
      <Pressable
        style={({ pressed }) => [s.matchCard, { opacity: pressed ? 0.95 : 1 }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMarketsMatch(match); }}
      >
        <View style={[s.matchStripe, { backgroundColor: sportCol }]} />
        <View style={s.matchBody}>
          {match.isLive && (
            <View style={s.liveBadge}>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primaryForeground }} />
              <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: colors.primaryForeground }}>AO VIVO</Text>
            </View>
          )}
          <Text style={s.matchTeams} numberOfLines={1}>{match.home} vs {match.away}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={{ fontSize: 14 }}>{getLeagueFlag(match.league, (match as { country?: string }).country)}</Text>
            <Text style={s.matchLeague} numberOfLines={1}>{match.league ?? match.sport}</Text>
          </View>
          <View style={s.matchOdds}>
            {([
              { mkt: "1x2-home", lbl: "1", val: match.odds.home },
              ...(hasDraw ? [{ mkt: "1x2-draw", lbl: "X", val: match.odds.draw }] : []),
              { mkt: "1x2-away", lbl: "2", val: match.odds.away },
            ] as { mkt: string; lbl: string; val: number }[]).map(({ mkt, lbl, val }) => {
              const sel = hasSelection(match.id, mkt);
              return (
                <Pressable
                  key={mkt}
                  style={({ pressed }) => [s.oddsBtn, {
                    backgroundColor: sel ? colors.primary : colors.muted,
                    borderColor: sel ? colors.primary : colors.border,
                    opacity: pressed ? 0.8 : 1,
                  }]}
                  onPress={(e) => { e.stopPropagation?.(); handleOdds(match, mkt, lbl, val); }}
                >
                  <Text style={[s.oddsLabel, { color: sel ? colors.primaryForeground : colors.mutedForeground }]}>{lbl}</Text>
                  <Text style={[s.oddsValue, { color: sel ? colors.primaryForeground : colors.foreground }]}>{val.toFixed(2)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={s.container}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.titleRow}>
          <Ionicons name="search" size={22} color={colors.primary} />
          <Text style={s.title}>Pesquisar</Text>
        </View>

        <View style={s.inputWrap}>
          <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
          <TextInput
            style={s.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Equipa, competição ou desporto..."
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        <FlatList
          horizontal
          data={SPORT_LIST}
          keyExtractor={(i) => i.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 2 }}
          renderItem={({ item }) => {
            const active = activeSport === item.key;
            const col = SPORT_COLORS[item.key] ?? colors.primary;
            return (
              <Pressable
                style={[s.sportChip, {
                  backgroundColor: active ? col : colors.muted,
                  borderColor: active ? col : colors.border,
                }]}
                onPress={() => {
                  setActiveSport(active ? null : item.key);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: active ? "#ffffff" : colors.foreground }}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* ── Content ── */}
      {isSearching ? (
        filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons name="search-outline" size={48} color={colors.border} />
            <Text style={s.emptyText}>Sem resultados</Text>
            <Text style={s.emptySubtext}>Tenta outro nome ou desporto</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: Platform.OS === "web" ? 140 : 160 }}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</Text>
                {activeSport && (
                  <Pressable
                    onPress={() => setActiveSport(null)}
                    style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4 }}
                  >
                    <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.primary }}>Limpar filtro</Text>
                    <Ionicons name="close-circle" size={14} color={colors.primary} />
                  </Pressable>
                )}
              </View>
            }
            renderItem={({ item }) => <MatchItem match={item} />}
          />
        )
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 140 : 160 }}
        >
          {/* Sports grid */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Desportos</Text>
          </View>
          <View style={s.sportGrid}>
            {SPORT_LIST.map((sp) => {
              const col = SPORT_COLORS[sp.key] ?? colors.primary;
              return (
                <Pressable
                  key={sp.key}
                  style={({ pressed }) => [s.sportCard, { opacity: pressed ? 0.8 : 1 }]}
                  onPress={() => { setActiveSport(sp.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: col + "22", alignItems: "center", justifyContent: "center" }}>
                    <MaterialCommunityIcons name={SPORT_ICONS[sp.key] ?? "trophy"} size={18} color={col} />
                  </View>
                  <Text style={s.sportCardLabel}>{sp.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Top competitions */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Top Competições</Text>
          </View>
          {TOP_COMPETITIONS.map((comp) => {
            const col = SPORT_COLORS[comp.sport] ?? colors.primary;
            const matchCount = allMatches.filter((m) => m.sport === comp.sport).length;
            return (
              <Pressable
                key={comp.id}
                style={({ pressed }) => [s.compItem, { opacity: pressed ? 0.8 : 1 }]}
                onPress={() => {
                  setActiveSport(comp.sport);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <View style={[s.compIcon, { backgroundColor: col + "20" }]}>
                  <MaterialCommunityIcons name={SPORT_ICONS[comp.sport] ?? "trophy"} size={20} color={col} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.compName}>{comp.name}</Text>
                  <Text style={s.compSub}>{comp.country}</Text>
                </View>
                {matchCount > 0 && (
                  <View style={{ backgroundColor: col + "20", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: col }}>{matchCount}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* ── Markets sheet ── */}
      {marketsMatch && (
        <ComprehensiveMarketsSheet
          visible={true}
          match={{ ...marketsMatch, isLive: marketsMatch.isLive ?? false }}
          onClose={() => setMarketsMatch(null)}
        />
      )}

      {/* ── Bet slip FAB ── */}
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
