import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { API_BASE } from "@/context/AuthContext";

interface Bet {
  id: number;
  matchId: string;
  matchTitle: string;
  selections: Array<{ label: string; odds: number; market?: string; matchTitle?: string; date?: string; time?: string }>;
  stake: string;
  potentialWin: string;
  totalOdds: string;
  status: "pending" | "won" | "lost" | "cashed_out";
  cashoutValue?: string | null;
  createdAt: string;
}

function statusColor(status: Bet["status"], colors: ReturnType<typeof useColors>) {
  switch (status) {
    case "won": return colors.success ?? "#22c55e";
    case "lost": return colors.destructive;
    case "cashed_out": return colors.warning ?? "#f59e0b";
    default: return colors.primary;
  }
}

function statusLabel(status: Bet["status"]) {
  switch (status) {
    case "won": return "Ganhou";
    case "lost": return "Perdeu";
    case "cashed_out": return "Cash Out";
    default: return "Pendente";
  }
}

function parseSelectionLabel(raw: string): { match: string | null; pick: string } {
  const sep = raw.indexOf("—");
  if (sep > 0) {
    return { match: raw.slice(0, sep).trim(), pick: raw.slice(sep + 1).trim() };
  }
  const dashSep = raw.indexOf(" - ");
  if (dashSep > 0) {
    return { match: raw.slice(0, dashSep).trim(), pick: raw.slice(dashSep + 3).trim() };
  }
  return { match: null, pick: raw };
}

function BetCard({ bet, token, onCashout }: { bet: Bet; token: string | null; onCashout: () => void }) {
  const colors = useColors();
  const [cashingOut, setCashingOut] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const stake = parseFloat(bet.stake);
  const totalOdds = parseFloat(bet.totalOdds);
  const potentialWin = parseFloat(bet.potentialWin);
  // Correct estimate: at minimum you recover stake × 0.92 (the 8% house margin when current ≈ original odds).
  // potentialWin × 0.92 was wrong — that formula assumed you could cash out at near-full win.
  const estimatedCashout = (stake * 0.92).toFixed(2);
  const actualCashout = bet.cashoutValue ? parseFloat(bet.cashoutValue).toFixed(2) : null;

  async function executeCashout() {
    if (!token) { router.push("/(auth)/login"); return; }
    try {
      setCashingOut(true);
      const res = await fetch(`${API_BASE}/bets/${bet.id}/cashout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setExpanded(false);
      Alert.alert("Cash Out", `Recebeste €${parseFloat(data.cashoutValue).toFixed(2)}`);
      onCashout();
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha no cash out.");
    } finally {
      setCashingOut(false);
    }
  }

  function handleCashoutPress() {
    if (!token) { router.push("/(auth)/login"); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExpanded(true);
  }

  const color = statusColor(bet.status, colors);
  const dateStr = new Date(bet.createdAt).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const selections = Array.isArray(bet.selections) ? bet.selections : [];
  const isMultiple = selections.length > 1;

  const s = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      marginHorizontal: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 3,
      borderLeftColor: color,
      overflow: "hidden",
    },
    inner: { padding: 14 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 8 },
    titleWrap: { flex: 1 },
    title: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 2 },
    multipleBadge: { alignSelf: "flex-start", backgroundColor: colors.primary + "22", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 6 },
    multipleBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.primary },
    statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: color + "22", flexShrink: 0 },
    statusBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold", color },
    selections: { marginBottom: 10, gap: 3 },
    selectionRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingVertical: 2 },
    selectionDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.mutedForeground, marginTop: 5 },
    selectionBody: { flex: 1 },
    selectionMatch: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 1 },
    selectionPick: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    selectionOdds: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.primary, alignSelf: "flex-start", marginTop: 2 },
    statsRow: { flexDirection: "row", gap: 0, marginBottom: bet.status === "pending" ? 12 : 8, backgroundColor: colors.muted, borderRadius: 8 },
    stat: { flex: 1, alignItems: "center", paddingVertical: 8 },
    statDivider: { width: 1, backgroundColor: colors.border, marginVertical: 6 },
    statLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 2 },
    statValue: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground },
    cashoutBtn: {
      backgroundColor: (colors.warning ?? "#f59e0b") + "18",
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.warning ?? "#f59e0b",
      padding: 11,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    cashoutBtnLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
    cashoutBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.warning ?? "#f59e0b" },
    cashoutBtnValue: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.warning ?? "#f59e0b" },
    expandedRow: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.muted,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    expandedLeft: { flex: 1 },
    expandedLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 2 },
    expandedValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#22c55e" },
    cancelBtn: { paddingHorizontal: 10, paddingVertical: 8 },
    cancelBtnText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    confirmBtn: {
      backgroundColor: "#16a34a",
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 96,
    },
    confirmBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#ffffff" },
    footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
    date: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    cashoutReceivedRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    cashoutReceivedLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    cashoutReceivedValue: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.warning ?? "#f59e0b" },
  });

  return (
    <View style={s.card}>
      <View style={s.inner}>
        <View style={s.header}>
          <View style={s.titleWrap}>
            {isMultiple && (
              <View style={s.multipleBadge}>
                <Text style={s.multipleBadgeText}>MÚLTIPLA • {selections.length} seleções</Text>
              </View>
            )}
            <Text style={s.title} numberOfLines={2}>{bet.matchTitle}</Text>
          </View>
          <View style={s.statusBadge}>
            <Text style={s.statusBadgeText}>{statusLabel(bet.status)}</Text>
          </View>
        </View>

        {selections.length > 0 && (
          <View style={s.selections}>
            {selections.map((sel, i) => {
              const { match, pick } = parseSelectionLabel(sel.label ?? "");
              const matchDateLabel = sel.date
                ? new Date(sel.date).toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit" }) + (sel.time ? ` ${sel.time.slice(0, 5)}` : "")
                : null;
              return (
                <View key={i} style={s.selectionRow}>
                  <View style={s.selectionDot} />
                  <View style={s.selectionBody}>
                    {matchDateLabel && (
                      <Text style={[s.selectionMatch, { color: colors.primary + "bb", fontSize: 10 }]} numberOfLines={1}>
                        🗓 {matchDateLabel}
                      </Text>
                    )}
                    {match && <Text style={s.selectionMatch} numberOfLines={1}>{match}</Text>}
                    <Text style={s.selectionPick} numberOfLines={1}>{pick}</Text>
                  </View>
                  <Text style={s.selectionOdds}>{(sel.odds ?? 0).toFixed(2)}</Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statLabel}>Apostado</Text>
            <Text style={s.statValue}>€{stake.toFixed(2)}</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={s.statLabel}>Odds</Text>
            <Text style={s.statValue}>{totalOdds.toFixed(2)}</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={s.statLabel}>{bet.status === "won" ? "Ganho" : "Potencial"}</Text>
            <Text style={[s.statValue, { color: bet.status === "won" ? (colors.success ?? "#22c55e") : colors.foreground }]}>
              €{potentialWin.toFixed(2)}
            </Text>
          </View>
        </View>

        {bet.status === "pending" && !expanded && (
          <Pressable
            style={({ pressed }) => [s.cashoutBtn, { opacity: pressed || cashingOut ? 0.8 : 1 }]}
            onPress={handleCashoutPress}
            disabled={cashingOut}
          >
            {cashingOut ? (
              <ActivityIndicator size="small" color={colors.warning ?? "#f59e0b"} />
            ) : (
              <>
                <View style={s.cashoutBtnLeft}>
                  <Ionicons name="cash-outline" size={16} color={colors.warning ?? "#f59e0b"} />
                  <Text style={s.cashoutBtnText}>Cash Out</Text>
                </View>
                <Text style={s.cashoutBtnValue}>€ {estimatedCashout}</Text>
              </>
            )}
          </Pressable>
        )}

        <View style={s.footer}>
          <Text style={s.date}>{dateStr}</Text>
          {bet.status === "cashed_out" && actualCashout && (
            <View style={s.cashoutReceivedRow}>
              <Ionicons name="checkmark-circle" size={13} color={colors.warning ?? "#f59e0b"} />
              <Text style={s.cashoutReceivedLabel}>Recebido </Text>
              <Text style={s.cashoutReceivedValue}>€{actualCashout}</Text>
            </View>
          )}
        </View>
      </View>

      {bet.status === "pending" && expanded && (
        <View style={s.expandedRow}>
          <View style={s.expandedLeft}>
            <Text style={s.expandedLabel}>Cash Out estimado</Text>
            <Text style={s.expandedValue}>€ {estimatedCashout}</Text>
          </View>
          <Pressable
            style={s.cancelBtn}
            onPress={() => setExpanded(false)}
            disabled={cashingOut}
          >
            <Text style={s.cancelBtnText}>Cancelar</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.confirmBtn, { opacity: pressed || cashingOut ? 0.75 : 1 }]}
            onPress={executeCashout}
            disabled={cashingOut}
          >
            {cashingOut ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={s.confirmBtnText}>CONFIRMAR</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function BetsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-bets", token],
    queryFn: async () => {
      if (!token) return [];
      const res = await fetch(`${API_BASE}/bets/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Bet[]>;
    },
    enabled: !!token,
    refetchInterval: 30000,
  });

  const bets = data ?? [];
  const pending = bets.filter((b) => b.status === "pending").length;
  const won = bets.filter((b) => b.status === "won").length;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 8,
      paddingHorizontal: 16,
      paddingBottom: 14,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    statsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
    statChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
    statChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
    emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    loginBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
    loginBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.titleRow}>
          <Text style={s.title}>Minhas Apostas</Text>
        </View>
        {user && <Text style={s.subtitle}>{bets.length} apostas registadas</Text>}
        {user && bets.length > 0 && (
          <View style={s.statsRow}>
            {pending > 0 && (
              <View style={s.statChip}>
                <Ionicons name="time-outline" size={13} color={colors.primary} />
                <Text style={s.statChipText}>{pending} pendente{pending !== 1 ? "s" : ""}</Text>
              </View>
            )}
            {won > 0 && (
              <View style={s.statChip}>
                <Ionicons name="trophy-outline" size={13} color={colors.success ?? "#22c55e"} />
                <Text style={[s.statChipText, { color: colors.success ?? "#22c55e" }]}>{won} ganha{won !== 1 ? "s" : ""}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {!user ? (
        <View style={s.emptyContainer}>
          <Ionicons name="receipt-outline" size={48} color={colors.border} />
          <Text style={s.emptyText}>Inicia sessão para ver as tuas apostas</Text>
          <Pressable style={({ pressed }) => [s.loginBtn, { opacity: pressed ? 0.8 : 1 }]} onPress={() => router.push("/(auth)/login")}>
            <Text style={s.loginBtnText}>Entrar</Text>
          </Pressable>
        </View>
      ) : isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={bets}
          keyExtractor={(b) => String(b.id)}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: Platform.OS === "web" ? 100 : 120 }}
          scrollEnabled={bets.length > 0}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={() => refetch()} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={s.emptyContainer}>
              <Ionicons name="receipt-outline" size={48} color={colors.border} />
              <Text style={s.emptyText}>Sem apostas</Text>
              <Text style={s.emptySubtext}>As tuas apostas aparecerão aqui</Text>
            </View>
          }
          renderItem={({ item }) => (
            <BetCard
              bet={item}
              token={token}
              onCashout={() => {
                refetch();
                queryClient.invalidateQueries({ queryKey: ["my-bets"] });
              }}
            />
          )}
        />
      )}
    </View>
  );
}
