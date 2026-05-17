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
  selections: Array<{ label: string; odds: number }>;
  stake: string;
  potentialWin: string;
  totalOdds: string;
  status: "pending" | "won" | "lost" | "cashed_out";
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

function BetCard({ bet, token, onCashout }: { bet: Bet; token: string | null; onCashout: () => void }) {
  const colors = useColors();
  const [cashingOut, setCashingOut] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const stake = parseFloat(bet.stake);
  const totalOdds = parseFloat(bet.totalOdds);
  const potentialWin = parseFloat(bet.potentialWin);
  const estimatedCashout = (stake * 0.92).toFixed(2);

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
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    title: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1, marginRight: 8 },
    badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: color + "22" },
    badgeText: { fontSize: 12, fontFamily: "Inter_700Bold", color },
    selections: { marginBottom: 10, gap: 4 },
    selectionRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    selectionText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, flex: 1 },
    selectionOdds: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.foreground },
    statsRow: { flexDirection: "row", gap: 12, marginBottom: bet.status === "pending" ? 12 : 0 },
    stat: { flex: 1 },
    statLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 2 },
    statValue: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground },
    cashoutBtn: {
      backgroundColor: colors.warning ? colors.warning + "22" : "#f59e0b22",
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.warning ?? "#f59e0b",
      padding: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    cashoutBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.warning ?? "#f59e0b" },
    cashoutBtnValue: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.warning ?? "#f59e0b" },
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
    expandedValue: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#22c55e" },
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
    date: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 8 },
  });

  const selections = Array.isArray(bet.selections) ? bet.selections : [];

  return (
    <View style={s.card}>
      <View style={s.inner}>
        <View style={s.header}>
          <Text style={s.title} numberOfLines={1}>{bet.matchTitle}</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>{statusLabel(bet.status)}</Text>
          </View>
        </View>

        {selections.length > 0 && (
          <View style={s.selections}>
            {selections.map((sel, i) => (
              <View key={i} style={s.selectionRow}>
                <Ionicons name="chevron-forward" size={12} color={colors.mutedForeground} />
                <Text style={s.selectionText} numberOfLines={1}>{sel.label}</Text>
                <Text style={s.selectionOdds}>{sel.odds?.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statLabel}>Apostado</Text>
            <Text style={s.statValue}>€{stake.toFixed(2)}</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statLabel}>Odds</Text>
            <Text style={s.statValue}>{totalOdds.toFixed(2)}</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statLabel}>{bet.status === "won" ? "Ganho" : "Ganho potencial"}</Text>
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
                <Text style={s.cashoutBtnText}>Cash Out</Text>
                <Text style={s.cashoutBtnValue}>€ {estimatedCashout}</Text>
              </>
            )}
          </Pressable>
        )}

        <Text style={s.date}>{dateStr}</Text>
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
  });

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
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
    emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    loginBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
    loginBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Minhas Apostas</Text>
        {user && <Text style={s.subtitle}>{data?.length ?? 0} apostas registadas</Text>}
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
          data={data ?? []}
          keyExtractor={(b) => String(b.id)}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: Platform.OS === "web" ? 100 : 120 }}
          scrollEnabled={!!(data && data.length > 0)}
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
