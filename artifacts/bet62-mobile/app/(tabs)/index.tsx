import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { type ComponentProps, useState } from "react";
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { DepositModal } from "@/components/DepositModal";
import type { LiveMatchMarkets } from "@/hooks/useLiveMatches";
import { getMatchBannerUrlStable, getLeagueFlag } from "@/utils/teamBanners";
import { findMajorLeague, type MajorLeague } from "@/utils/majorLeagues";

type MCIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface UpcomingMatch {
  id: string;
  sport: string;
  home: string;
  away: string;
  date: string;
  time: string;
  odds: { home: number; draw: number; away: number };
  league?: string;
  country?: string;
  markets?: LiveMatchMarkets;
  hasRealOdds?: boolean;
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
  football: "#22c55e", basketball: "#f97316", tennis: "#eab308",
  hockey: "#60a5fa", volleyball: "#a78bfa", baseball: "#fb7185",
};

const SPORT_ICONS: Record<string, MCIconName> = {
  football: "soccer", basketball: "basketball", tennis: "tennis",
  hockey: "hockey-puck", volleyball: "volleyball", baseball: "baseball",
};

function LeagueChips({
  matches, selected, onSelect,
}: {
  matches: UpcomingMatch[];
  selected: string | null;
  onSelect: (l: string | null) => void;
}) {
  const colors = useColors();
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());

  const seenLabels = new Set<string>();
  const chips: Array<{ config: MajorLeague }> = [];
  for (const m of matches) {
    const key = m.league ?? "";
    if (key) {
      const ml = findMajorLeague(key);
      if (ml && !seenLabels.has(ml.label)) {
        seenLabels.add(ml.label);
        chips.push({ config: ml });
      }
    }
  }
  if (chips.length < 2) return null;

  return (
    <View style={{ marginBottom: 4 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 6, gap: 8 }}
      >
        <Pressable
          onPress={() => { onSelect(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          style={({ pressed }) => ({
            flexDirection: "row" as const, alignItems: "center" as const, gap: 6,
            paddingHorizontal: 12, paddingVertical: 8,
            borderRadius: 14, borderWidth: 1.5,
            borderColor: !selected ? "#f59e0b" : colors.border,
            backgroundColor: !selected ? "rgba(245,158,11,0.10)" : colors.card,
            opacity: pressed ? 0.78 : 1,
          })}
        >
          <Ionicons name="grid-outline" size={15} color={!selected ? "#f59e0b" : colors.mutedForeground} />
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: !selected ? "#fff" : colors.mutedForeground }}>
            Todas
          </Text>
        </Pressable>

        {chips.map(({ config }) => {
          const active = selected === config.label;
          const hasErr = imgErrors.has(config.label);
          return (
            <Pressable
              key={config.label}
              onPress={() => { onSelect(active ? null : config.label); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={({ pressed }) => ({
                flexDirection: "row" as const, alignItems: "center" as const, gap: 8,
                paddingHorizontal: 12, paddingVertical: 8,
                borderRadius: 14, borderWidth: 1.5,
                borderColor: active ? "#f59e0b" : colors.border,
                backgroundColor: active ? "rgba(245,158,11,0.10)" : colors.card,
                opacity: pressed ? 0.78 : 1,
              })}
            >
              {hasErr ? (
                <View style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: config.color + "cc", alignItems: "center" as const, justifyContent: "center" as const }}>
                  <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold", color: "#fff" }}>
                    {config.label.slice(0, 3).toUpperCase()}
                  </Text>
                </View>
              ) : (
                <Image
                  source={{ uri: config.logo }}
                  style={{ width: 22, height: 22, borderRadius: 3 }}
                  onError={() => setImgErrors(prev => new Set([...prev, config.label]))}
                  resizeMode="contain"
                />
              )}
              <Text
                style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: active ? "#fff" : colors.foreground, maxWidth: 120 }}
                numberOfLines={1}
              >
                {config.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function parseKickoff(date: string, time: string): Date {
  const raw = date ?? "";
  const timeParts = (time ?? "00:00").split(":").map(Number);
  const [h = 0, mi = 0] = timeParts;
  if (raw.includes(".")) {
    const [d = 1, mo = 1, y = 2025] = raw.split(".").map(Number);
    return new Date(y, mo - 1, d, h, mi);
  }
  const [y = 2025, mo = 1, d = 1] = raw.split("-").map(Number);
  return new Date(y, mo - 1, d, h, mi);
}

const BANNER_CFGS = [
  { title: "MÚLTIPLAS", subtitle: "POPULARES", label: "🔥 COMBOS POPULARES", count: "200+ apostas" },
  { title: "TOP", subtitle: "APOSTAS",    label: "⭐ MAIS APOSTADOS",    count: "150+ apostas" },
  { title: "ALTO",    subtitle: "RETORNO",  label: "💰 ALTO RETORNO",     count: "100+ apostas" },
  { title: "EM",      subtitle: "DESTAQUE", label: "🏆 FAVORITOS DO DIA", count: "80+ apostas"  },
] as const;

function PopularBanners({ matches }: { matches: UpcomingMatch[] }) {
  const { addSelection, hasSelection } = useBetSlip();
  if (matches.length === 0) return null;

  const withOdds = matches.filter((m) => m.odds.home > 1.01);
  const favPool  = withOdds.filter((m) => m.odds.home >= 1.20 && m.odds.home < 1.50).sort((a, b) => a.odds.home - b.odds.home);
  const medPool  = withOdds.filter((m) => m.odds.home >= 1.50 && m.odds.home < 2.00).sort((a, b) => a.odds.home - b.odds.home);
  const mid25Pool = withOdds.filter((m) => m.odds.home >= 2.00 && m.odds.home < 3.00).sort((a, b) => Math.abs(a.odds.home - 2.5) - Math.abs(b.odds.home - 2.5));
  const high31Pool = withOdds.filter((m) => m.odds.home >= 2.80).sort((a, b) => Math.abs(a.odds.home - 3.10) - Math.abs(b.odds.home - 3.10));

  const usedIds = new Set<string>();
  const pickN = (pool: UpcomingMatch[], n: number): UpcomingMatch[] => {
    const out: UpcomingMatch[] = [];
    for (const m of pool) {
      if (!usedIds.has(m.id)) { out.push(m); usedIds.add(m.id); if (out.length === n) break; }
    }
    return out;
  };

  const chunks: UpcomingMatch[][] = [];
  for (let i = 0; i < 3; i++) {
    const favs  = pickN(favPool, 3);
    const spike = pickN(mid25Pool, 1);
    const chunk = [...favs, ...spike];
    if (chunk.length > 0) chunks.push(chunk);
  }
  const meds   = pickN(medPool, 3);
  const spike4 = pickN(high31Pool, 1);
  const last   = [...meds, ...spike4];
  if (last.length > 0) chunks.push(last);

  if (chunks.length === 0) return null;

  const addAll = (events: UpcomingMatch[]) => {
    events.forEach((m) => {
      if (!hasSelection(m.id, "1x2-home")) {
        addSelection({
          matchId: m.id,
          matchTitle: `${m.home} vs ${m.away}`,
          market: "1x2-home",
          selection: "1x2-home",
          label: `${m.home} vs ${m.away} — Casa`,
          odds: m.odds.home,
          date: m.date,
          time: m.time,
        });
      }
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={{ marginBottom: 4 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 10 }}
      >
        {chunks.map((events, bi) => {
          const cfg = BANNER_CFGS[bi];
          if (!cfg) return null;
          const totalOdds = events.reduce((acc, m) => acc * m.odds.home, 1).toFixed(2);
          return (
            <View
              key={bi}
              style={{
                width: 264, borderRadius: 18, padding: 14,
                backgroundColor: "#120505",
                borderWidth: 1, borderColor: "rgba(220,38,38,0.22)",
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#ffffff", fontStyle: "italic" }}>{cfg.title}</Text>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#dc2626", fontStyle: "italic", marginTop: -4 }}>{cfg.subtitle}</Text>
                </View>
                <View style={{ backgroundColor: "#0b0b0b", borderRadius: 10, borderWidth: 2, borderColor: "#dc2626", paddingHorizontal: 10, paddingVertical: 6, alignItems: "center" }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#ffffff", fontStyle: "italic", lineHeight: 16 }}>BET</Text>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#dc2626", fontStyle: "italic", lineHeight: 16 }}>62</Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#dc2626" }}>{cfg.label}</Text>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#9ca3af" }}>{cfg.count}</Text>
              </View>

              <View style={{ gap: 5, marginBottom: 12 }}>
                {events.map((m, ei) => (
                  <View
                    key={ei}
                    style={{
                      backgroundColor: "#0d0d0d", borderRadius: 10, padding: 8,
                      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                      borderWidth: 1, borderColor: "rgba(220,38,38,0.10)",
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#ffffff" }} numberOfLines={1}>{m.home}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "#71717a" }} numberOfLines={1}>vs {m.away}</Text>
                    </View>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#dc2626", marginLeft: 8 }}>{m.odds.home.toFixed(2)}</Text>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{
                  backgroundColor: "#0b0b0b", borderRadius: 10, borderWidth: 1, borderColor: "#dc2626",
                  paddingHorizontal: 12, paddingVertical: 8, alignItems: "center",
                }}>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 8, color: "#71717a" }}>ODD TOTAL</Text>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#dc2626" }}>{totalOdds}</Text>
                </View>
                <Pressable
                  style={({ pressed }) => ({
                    flex: 1, borderRadius: 10, alignItems: "center" as const, justifyContent: "center" as const,
                    backgroundColor: "#dc2626", opacity: pressed ? 0.82 : 1,
                  })}
                  onPress={() => addAll(events)}
                >
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#ffffff", textAlign: "center" }}>
                    {"ADICIONAR\nAO BOLETIM"}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function UpcomingCard({ match }: { match: UpcomingMatch }) {
  const colors = useColors();
  const { addSelection, removeSelection, hasSelection } = useBetSlip();
  const [marketsOpen, setMarketsOpen] = useState(false);

  const sportCol = SPORT_COLORS[match.sport] ?? colors.mutedForeground;
  const hasDraw = match.odds.draw > 1.01;
  const bannerUrl = getMatchBannerUrlStable(String(match.id), match.home, match.away);

  const kickoffDate = parseKickoff(match.date, match.time);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const isToday = kickoffDate.toDateString() === today.toDateString();
  const isTomorrow = kickoffDate.toDateString() === tomorrow.toDateString();
  const dateStr = isToday ? "Hoje" : isTomorrow ? "Amanhã"
    : kickoffDate.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
  const timeStr = kickoffDate.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });

  function handleOdds(market: string, label: string, value: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (hasSelection(match.id, market)) removeSelection(match.id, market);
    else addSelection({
      matchId: match.id,
      matchTitle: `${match.home} vs ${match.away}`,
      homeTeam: match.home,
      awayTeam: match.away,
      market,
      selection: market,
      label: `${match.home} vs ${match.away} — ${label}`,
      odds: value,
      date: match.date,
      time: match.time,
    });
  }

  const OddsButton = ({ mkt, lbl, val }: { mkt: string; lbl: string; val: number }) => {
    const sel = hasSelection(match.id, mkt);
    return (
      <Pressable
        style={({ pressed }) => ({
          flex: 1, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 4,
          alignItems: "center" as const,
          backgroundColor: sel ? colors.primary : "#1c1c26",
          borderWidth: 1,
          borderColor: sel ? colors.primary : "#2e2e3c",
          opacity: pressed ? 0.78 : 1,
        })}
        onPress={(e) => { e.stopPropagation?.(); handleOdds(mkt, lbl, val); }}
      >
        <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: sel ? "#fff" : "#9ca3af", marginBottom: 2 }}>{lbl}</Text>
        <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#ffffff" }}>{val.toFixed(2)}</Text>
      </Pressable>
    );
  };

  const oddsButtons = (
    <View style={{ flexDirection: "row", gap: 6 }}>
      <OddsButton mkt="1x2-home" lbl="Casa" val={match.odds.home} />
      {hasDraw && <OddsButton mkt="1x2-draw" lbl="Emp." val={match.odds.draw} />}
      <OddsButton mkt="1x2-away" lbl="Fora" val={match.odds.away} />
    </View>
  );

  return (
    <>
      <Pressable
        style={({ pressed }) => ({
          backgroundColor: colors.card,
          borderRadius: 12,
          marginHorizontal: 14,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden" as const,
          opacity: pressed ? 0.97 : 1,
        })}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMarketsOpen(true); }}
      >
        {bannerUrl ? (
          <>
            <View style={{ height: 145, position: "relative" as const, overflow: "hidden" as const }}>
              <Image source={{ uri: bannerUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "#00000065" }]} />
              <View style={{ position: "absolute" as const, top: 10, left: 12, right: 12, flexDirection: "row" as const, alignItems: "center" as const }}>
                <Text style={{ fontSize: 14, marginRight: 3 }}>{getLeagueFlag(match.league, match.country)}</Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#ffffffdd" }}>{match.league ?? match.sport}</Text>
                <View style={{ flex: 1 }} />
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#ffffffdd" }}>{dateStr} • {timeStr}</Text>
              </View>
              <View style={{ position: "absolute" as const, bottom: 0, left: 0, right: 0, paddingHorizontal: 12, paddingTop: 28, paddingBottom: 11, backgroundColor: "#000000aa" }}>
                <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#ffffff" }} numberOfLines={1}>
                  {match.home} <Text style={{ fontFamily: "Inter_400Regular", color: "#ffffffaa", fontSize: 15 }}>vs</Text> {match.away}
                </Text>
              </View>
            </View>
            <View style={{ padding: 10, paddingTop: 10 }}>
              {oddsButtons}
            </View>
          </>
        ) : (
          <View style={{ padding: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <MaterialCommunityIcons name={SPORT_ICONS[match.sport] ?? "trophy"} size={11} color={sportCol} />
              <Text style={{ fontSize: 14, marginLeft: 4, marginRight: 2 }}>{getLeagueFlag(match.league, match.country)}</Text>
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, flex: 1 }} numberOfLines={1}>
                {match.league ?? match.sport}
              </Text>
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{dateStr} • {timeStr}</Text>
            </View>
            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 10 }} numberOfLines={1}>
              {match.home} <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>vs</Text> {match.away}
            </Text>
            {oddsButtons}
          </View>
        )}
      </Pressable>

      <ComprehensiveMarketsSheet
        visible={marketsOpen}
        match={{ ...match, isLive: false, date: match.date, time: match.time, country: match.country }}
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
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [depositVisible, setDepositVisible] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["upcoming-matches"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/matches/upcoming`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ matches: UpcomingMatch[] }>;
    },
    refetchInterval: 60000,
    placeholderData: (prev) => prev,
  });

  const allUpcoming: UpcomingMatch[] = data?.matches ?? [];
  const sportFiltered = allUpcoming.filter((m) => selectedSport === "all" || m.sport === selectedSport);
  const leagueFiltered = selectedLeague
    ? sportFiltered.filter((m) => findMajorLeague(m.league ?? "")?.label === selectedLeague)
    : sportFiltered;
  const searchLower = searchQuery.trim().toLowerCase();
  const filtered = searchLower
    ? leagueFiltered.filter((m) =>
        m.home.toLowerCase().includes(searchLower) ||
        m.away.toLowerCase().includes(searchLower) ||
        (m.league ?? "").toLowerCase().includes(searchLower)
      )
    : leagueFiltered;
  const featuredMatches = filtered.slice(0, 3);

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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <View style={s.balancePill}>
                <Ionicons name="wallet-outline" size={14} color={colors.foreground} />
                <Text style={s.balanceText}>€{parseFloat(user.balance).toFixed(2)}</Text>
              </View>
              <Pressable
                style={({ pressed }) => ({
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: colors.primary,
                  alignItems: "center" as const, justifyContent: "center" as const,
                  opacity: pressed ? 0.8 : 1,
                  elevation: 4, shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
                })}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setDepositVisible(true); }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </Pressable>
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

      </View>

      {isLoading ? (
        <ScrollView contentContainerStyle={{ paddingTop: 6, paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
          <View style={{ marginHorizontal: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 }}>
            <View style={{ height: 10, width: 100, backgroundColor: "#2e2e3c", borderRadius: 5 }} />
            <View style={{ height: 18, width: 28, backgroundColor: "#2e2e3c", borderRadius: 9 }} />
          </View>
          {[1, 2, 3, 4, 5].map(i => (
            <View key={i} style={{ marginHorizontal: 14, marginBottom: 10, borderRadius: 12, backgroundColor: "#1c1c26", padding: 12, borderWidth: 1, borderColor: "#2e2e3c" }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 6 }}>
                <View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: "#2e2e3c" }} />
                <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: "#2e2e3c" }} />
                <View style={{ height: 10, width: 120, backgroundColor: "#2e2e3c", borderRadius: 5 }} />
                <View style={{ flex: 1 }} />
                <View style={{ height: 10, width: 60, backgroundColor: "#2e2e3c", borderRadius: 5 }} />
              </View>
              <View style={{ height: 15, width: "70%", backgroundColor: "#2e2e3c", borderRadius: 5, marginBottom: 12 }} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1, height: 44, backgroundColor: "#2e2e3c", borderRadius: 8 }} />
                <View style={{ flex: 1, height: 44, backgroundColor: "#2e2e3c", borderRadius: 8 }} />
                <View style={{ flex: 1, height: 44, backgroundColor: "#2e2e3c", borderRadius: 8 }} />
              </View>
            </View>
          ))}
        </ScrollView>
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
          ListHeaderComponent={
            <>
              <View style={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 2 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 16,
                    paddingHorizontal: 12,
                    paddingVertical: Platform.OS === "ios" ? 12 : 10,
                    marginBottom: 8,
                  }}
                >
                  <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Pesquisar equipa ou liga..."
                    placeholderTextColor={colors.mutedForeground}
                    style={{
                      flex: 1,
                      fontSize: 16,
                      fontFamily: "Inter_500Medium",
                      color: colors.foreground,
                      paddingVertical: 0,
                    }}
                  />
                  {searchQuery ? (
                    <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
                    </Pressable>
                  ) : null}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
                  {SPORTS.map((sp) => {
                    const active = selectedSport === sp.key;
                    const col = SPORT_COLORS[sp.key] ?? colors.primary;
                    return (
                      <Pressable
                        key={sp.key}
                        style={[s.sportChip, { backgroundColor: active ? col : colors.muted, borderColor: active ? col : colors.border }]}
                        onPress={() => {
                          setSelectedSport(active ? "all" : sp.key);
                          setSelectedLeague(null);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: active ? "#ffffff" : colors.foreground }}>
                          {sp.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <LeagueChips matches={sportFiltered} selected={selectedLeague} onSelect={setSelectedLeague} />

              {featuredMatches.length > 0 ? (
                <View style={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 6, gap: 10 }}>
                  {featuredMatches.map((match) => (
                    <UpcomingCard key={`featured-${match.id}`} match={match} />
                  ))}
                </View>
              ) : null}

              <PopularBanners matches={filtered} />
            </>
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
      <DepositModal visible={depositVisible} onClose={() => setDepositVisible(false)} />
    </View>
  );
}
