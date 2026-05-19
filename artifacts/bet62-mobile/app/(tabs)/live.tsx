import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { type ComponentProps, useEffect, useRef, useState } from "react";
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
import { getMatchBannerUrl, getLeagueFlag } from "@/utils/teamBanners";

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
  football: "#22c55e", basketball: "#f97316", tennis: "#eab308",
  hockey: "#60a5fa", volleyball: "#a78bfa", baseball: "#fb7185",
};

const SPORT_ICONS: Record<string, MCIconName> = {
  football: "soccer", basketball: "basketball", tennis: "tennis",
  hockey: "hockey-puck", volleyball: "volleyball", baseball: "baseball",
};

function TennisScoreRow({
  sets, currentPoints, home, away, colors,
}: {
  sets: Array<[number, number]>;
  currentPoints?: [number | string, number | string];
  home: string; away: string;
  colors: ReturnType<typeof useColors>;
}) {
  const currentIdx = sets.length - 1;
  function SetCell({ value, isCurrent }: { value: number; isCurrent: boolean }) {
    return (
      <View style={{ width: 22, height: 20, borderRadius: 4, alignItems: "center", justifyContent: "center", backgroundColor: isCurrent ? colors.primary + "25" : "#00000000", borderWidth: 1, borderColor: isCurrent ? colors.primary + "80" : "#ffffff25" }}>
        <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: isCurrent ? colors.primary : "#ffffff" }}>{value}</Text>
      </View>
    );
  }
  function PtCell({ value }: { value: number | string }) {
    return (
      <View style={{ width: 26, height: 20, borderRadius: 4, alignItems: "center", justifyContent: "center", backgroundColor: "#f59e0b15", borderWidth: 1, borderColor: "#f59e0b40" }}>
        <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#f59e0b" }}>{String(value)}</Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{home}</Text>
        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{away}</Text>
      </View>
      <View style={{ gap: 5 }}>
        <View style={{ flexDirection: "row", gap: 3 }}>
          {sets.map((s, i) => <SetCell key={i} value={s[0]} isCurrent={i === currentIdx} />)}
          {currentPoints != null && <PtCell value={currentPoints[0]} />}
        </View>
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

  const prevOddsRef = useRef<Record<string, number>>({});
  const [oddsDir, setOddsDir] = useState<Record<string, "up" | "down">>({});
  useEffect(() => {
    const entries: Array<[string, number]> = [
      ["home", match.odds.home], ["draw", match.odds.draw], ["away", match.odds.away],
    ];
    const dirs: Record<string, "up" | "down"> = {};
    let changed = false;
    for (const [k, v] of entries) {
      const prev = prevOddsRef.current[k];
      if (prev !== undefined && Math.abs(v - prev) >= 0.01) {
        dirs[k] = v > prev ? "up" : "down";
        changed = true;
      }
      prevOddsRef.current[k] = v;
    }
    if (changed) {
      setOddsDir((d) => ({ ...d, ...dirs }));
      const t = setTimeout(() => setOddsDir({}), 4000);
      return () => clearTimeout(t);
    }
  }, [match.odds.home, match.odds.draw, match.odds.away]);

  const sportColor = SPORT_COLORS[match.sport] ?? colors.mutedForeground;
  const now = Date.now();
  const hasBlockingEvent = (() => {
    const r = (match.suspensionReason ?? "").toUpperCase();
    return r.includes("VAR") || r.includes("PENAL") || r.includes("PÊNALTI") || r.includes("PENÁLT") ||
      r === "GOLO" || r.includes("GOAL") || r.includes("CHANCE");
  })();
  const suspended = (match.marketSuspension?.["result"] != null && match.marketSuspension["result"]! > now) || hasBlockingEvent;
  const sets = match._liveExtra?.sets;
  const currentPoints = match._liveExtra?.currentPoints;
  const periods = match._liveExtra?.periods;
  const quarters = match._liveExtra?.quarters;
  const innings = match._liveExtra?.innings;
  const isFootball = !match.sport || match.sport === "football";
  const isTennis = match.sport === "tennis";
  const isHockey = match.sport === "hockey";
  const isBball = match.sport === "basketball";
  const isBase = match.sport === "baseball";
  const hasDraw = match.odds.draw > 1.01;
  const bannerUrl = getMatchBannerUrl(match.home, match.away);

  function handleOdds(market: string, label: string, value: number) {
    if (suspended) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (hasSelection(match.id, market)) removeSelection(match.id, market);
    else addSelection({ matchId: match.id, matchTitle: `${match.home} vs ${match.away}`, market, selection: market, label: `${match.home} vs ${match.away} — ${label}`, odds: value, date: match.date, time: match.time });
  }

  const minuteLabel = isTennis ? `S${match.minute ?? 1}` : `${match.minute ?? 0}'`;

  const OddsButton = ({ mkt, lbl, val }: { mkt: string; lbl: string; val: number }) => {
    const sel = hasSelection(match.id, mkt);
    const dir = mkt === "1x2-home" ? oddsDir["home"]
      : mkt === "1x2-draw" ? oddsDir["draw"]
      : mkt === "1x2-away" ? oddsDir["away"]
      : undefined;
    return (
      <Pressable
        style={({ pressed }) => ({
          flex: 1, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 4,
          alignItems: "center" as const,
          backgroundColor: suspended ? "#18181f" : sel ? colors.primary : "#1c1c26",
          borderWidth: 1,
          borderColor: suspended ? "#2a2a35" : sel ? colors.primary : dir === "up" ? "#22c55e55" : dir === "down" ? "#ef444455" : "#2e2e3c",
          opacity: suspended ? 0.5 : pressed ? 0.78 : 1,
        })}
        onPress={(e) => { e.stopPropagation?.(); handleOdds(mkt, lbl, val); }}
      >
        <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: sel ? "#fff" : "#9ca3af", marginBottom: 2 }}>{lbl}</Text>
        {suspended
          ? <Ionicons name="lock-closed" size={11} color="#6b7280" />
          : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              {dir === "up" && <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#22c55e", lineHeight: 14 }}>▲</Text>}
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: dir === "up" ? "#22c55e" : dir === "down" ? "#f87171" : "#ffffff" }}>
                {val.toFixed(2)}
              </Text>
              {dir === "down" && <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#f87171", lineHeight: 14 }}>▼</Text>}
            </View>
          )
        }
      </Pressable>
    );
  };

  const isObviousLiveResult = isFootball && !suspended && (() => {
    const minOdd = Math.min(match.odds.home, match.odds.away);
    if (minOdd <= 1.05) return true;
    const min = match.minute ?? 0;
    const diff = Math.abs((match.homeScore ?? 0) - (match.awayScore ?? 0));
    if (min >= 80 && diff >= 2) return true;
    if (min >= 85 && diff >= 1) return true;
    return false;
  })();

  const suspText = (() => {
    const r = (match.suspensionReason ?? "").toUpperCase();
    if (r.includes("VAR")) return "📺 REVISÃO VAR";
    if (r.includes("PENAL") || r.includes("PÊNALTI") || r.includes("PENÁLT")) return "🎯 PENÁLTI";
    if (r.includes("GOLO") || r.includes("GOAL")) return "⚽ GOLO!";
    if (r.includes("CHANCE")) return "⚡ GRANDE CHANCE";
    return "⏸ SUSPENSO";
  })();

  const OddsRowContent = suspended ? (
    <View style={{ borderRadius: 8, borderWidth: 1, backgroundColor: "#3b0000", borderColor: "#7f1d1d", paddingVertical: 14, alignItems: "center" as const }}>
      <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#fca5a5", letterSpacing: 3, textTransform: "uppercase" as const }}>
        {suspText}
      </Text>
    </View>
  ) : isObviousLiveResult ? (
    <Pressable
      style={{ borderRadius: 8, borderWidth: 1, backgroundColor: "#2d1500", borderColor: "#92400e55", paddingVertical: 14, alignItems: "center" as const }}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMarketsOpen(true); }}
    >
      <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#f59e0b", letterSpacing: 3, textTransform: "uppercase" as const }}>
        APOSTA JÁ
      </Text>
    </Pressable>
  ) : isTennis ? (
    <View style={{ flexDirection: "row" as const, gap: 6 }}>
      <OddsButton mkt="1x2-home" lbl={match.home.split(" ").pop() ?? match.home} val={match.odds.home} />
      <OddsButton mkt="1x2-away" lbl={match.away.split(" ").pop() ?? match.away} val={match.odds.away} />
    </View>
  ) : (
    <View style={{ flexDirection: "row" as const, gap: 6 }}>
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
                  <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#ffffffdd" }}>{match.league ?? match.sport}</Text>
                </View>
                <View style={{ flex: 1 }} />
                <View style={{ backgroundColor: "#f59e0b22", borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: "#f59e0b55" }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#f59e0b" }}>{minuteLabel}</Text>
                </View>
              </View>
              <View style={{ position: "absolute" as const, bottom: 0, left: 0, right: 0, backgroundColor: "#000000aa", paddingHorizontal: 12, paddingTop: 20, paddingBottom: 10 }}>
                {isTennis && sets && sets.length > 0 ? (
                  <TennisScoreRow sets={sets} currentPoints={currentPoints} home={match.home} away={match.away} colors={colors} />
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" }} numberOfLines={1}>{match.home}</Text>
                    <View style={{ backgroundColor: "#000000cc", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.primary + "55" }}>
                      <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 1 }}>{match.homeScore} – {match.awayScore}</Text>
                      {(isHockey && periods && periods.length > 0) && <PeriodBreakdown periods={periods} colors={colors} />}
                      {(isBball && quarters && quarters.length > 0) && <PeriodBreakdown periods={quarters} colors={colors} />}
                      {(isBase && innings && innings.length > 0) && (
                        <Text style={{ fontSize: 9, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" }}>{innings.length}ª ent.</Text>
                      )}
                    </View>
                    <Text style={{ flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "right" as const }} numberOfLines={1}>{match.away}</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={{ padding: 10 }}>
              {OddsRowContent}
            </View>
          </>
        ) : (
          <View>
            <View style={{ height: 3, backgroundColor: sportColor }} />
            <View style={{ padding: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
                <MaterialCommunityIcons name={SPORT_ICONS[match.sport] ?? "trophy"} size={11} color={sportColor} />
                <Text style={{ fontSize: 14, marginLeft: 1, marginRight: 2 }}>{getLeagueFlag(match.league, match.country)}</Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, flex: 1 }} numberOfLines={1}>
                  {match.league ?? match.sport}
                </Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#f59e0b" }}>{minuteLabel}</Text>
              </View>
              {isTennis && sets && sets.length > 0 ? (
                <View style={{ marginBottom: 10 }}>
                  <TennisScoreRow sets={sets} currentPoints={currentPoints} home={match.home} away={match.away} colors={colors} />
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                  <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{match.home}</Text>
                  <View style={{ backgroundColor: "#0c0c12", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginHorizontal: 6, borderWidth: 1, borderColor: colors.primary + "40", alignItems: "center" }}>
                    {(isHockey && periods && periods.length > 0) ? (
                      <View style={{ alignItems: "center" }}>
                        <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#ffffff" }}>{match.homeScore} – {match.awayScore}</Text>
                        <PeriodBreakdown periods={periods} colors={colors} />
                      </View>
                    ) : (isBball && quarters && quarters.length > 0) ? (
                      <View style={{ alignItems: "center" }}>
                        <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#ffffff" }}>{match.homeScore} – {match.awayScore}</Text>
                        <PeriodBreakdown periods={quarters} colors={colors} />
                      </View>
                    ) : (isBase && innings && innings.length > 0) ? (
                      <View style={{ alignItems: "center" }}>
                        <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#ffffff" }}>{match.homeScore} – {match.awayScore}</Text>
                        <Text style={{ fontSize: 9, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{innings.length}ª ent.</Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#ffffff" }}>{match.homeScore} – {match.awayScore}</Text>
                    )}
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "right" as const }} numberOfLines={1}>{match.away}</Text>
                </View>
              )}
              {OddsRowContent}
            </View>
          </View>
        )}
      </Pressable>

      <ComprehensiveMarketsSheet
        visible={marketsOpen}
        match={{
          id: match.id, sport: match.sport, home: match.home, away: match.away,
          odds: match.odds, markets: match.markets, marketSuspension: match.marketSuspension,
          homeScore: match.homeScore, awayScore: match.awayScore,
          isLive: true, minute: match.minute, status: match.status,
          league: match.league, suspensionReason: match.suspensionReason,
          _liveExtra: match._liveExtra,
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

  const { matches, connected, lastUpdated } = useLiveMatches();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const filtered = matches.filter((m) => m.hasRealOdds !== false && (selectedSport === "all" || m.sport === selectedSport));

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 8, paddingHorizontal: 14, paddingBottom: 8, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    logo: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.primary },
    connBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.border },
    connDot: { width: 7, height: 7, borderRadius: 4 },
    connText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
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

  const lastUpdStr = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  type ListItem =
    | { type: "header"; id: string; count: number }
    | { type: "match"; id: string; match: LiveMatch };

  const items: ListItem[] = [];
  if (filtered.length > 0) {
    items.push({ type: "header", id: "h", count: filtered.length });
    filtered.forEach((m) => items.push({ type: "match", id: m.id, match: m }));
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <Text style={s.logo}>AO VIVO</Text>
          <View style={s.connBadge}>
            <View style={[s.connDot, { backgroundColor: connected ? "#22c55e" : "#f59e0b" }]} />
            <Text style={[s.connText, { color: connected ? "#22c55e" : "#f59e0b" }]}>
              {connected ? (lastUpdStr ?? "Ligado") : "A ligar..."}
            </Text>
          </View>
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

      {matches.length === 0 && !connected ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingTop: 6, paddingBottom: Platform.OS === "web" ? 140 : 160 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <MaterialCommunityIcons name="soccer-field" size={52} color={colors.border} />
              <Text style={s.emptyText}>Sem jogos ao vivo</Text>
              <Text style={s.emptySubtext}>Nenhum jogo em curso neste momento</Text>
            </View>
          }
          renderItem={({ item }) => {
            if (item.type === "header") {
              return (
                <View style={s.sectionHeader}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }} />
                  <Text style={s.sectionTitle}>Ao Vivo Agora</Text>
                  <View style={s.sectionCount}><Text style={s.sectionCountText}>{item.count}</Text></View>
                </View>
              );
            }
            return <LiveMatchCard match={item.match} />;
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
