import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useBetSlip } from "@/context/BetSlipContext";
import { API_BASE } from "@/context/AuthContext";

export default function BetSlipScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token, refreshUser } = useAuth();
  const { selections, removeSelection, clearSlip, totalOdds, count } = useBetSlip();
  const queryClient = useQueryClient();
  const [stake, setStake] = useState("");
  const [loading, setLoading] = useState(false);

  const stakeValue = parseFloat(stake) || 0;
  const potentialWin = stakeValue * totalOdds;
  const balance = parseFloat(user?.balance ?? "0");

  async function handlePlaceBet() {
    if (!user || !token) {
      router.dismiss();
      router.push("/(auth)/login");
      return;
    }
    if (stakeValue < 0.5) {
      Alert.alert("Aposta inválida", "Valor mínimo de aposta: €0.50");
      return;
    }
    if (stakeValue > balance) {
      Alert.alert("Saldo insuficiente", `O teu saldo é €${balance.toFixed(2)}`);
      return;
    }
    if (count === 0) {
      Alert.alert("Erro", "Adiciona pelo menos uma seleção");
      return;
    }

    const matchId = selections.map((s) => s.matchId).join("+");
    const matchTitle = selections.map((s) => s.matchTitle).join(" / ");

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/bets/place`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          matchId,
          matchTitle,
          selections: selections.map((s) => ({ label: s.label, odds: s.odds })),
          stake: stakeValue.toFixed(2),
          potentialWin: potentialWin.toFixed(2),
          totalOdds: totalOdds.toFixed(4),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["my-bets"] });
      clearSlip();
      router.dismiss();
      Alert.alert("Aposta registada!", `Ganho potencial: €${potentialWin.toFixed(2)}`);
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao registar aposta.");
    } finally {
      setLoading(false);
    }
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
      paddingTop: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    closeBtn: { padding: 4 },
    clearBtn: { padding: 4 },
    clearText: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    scroll: { flex: 1 },
    content: { padding: 16, gap: 12 },
    selectionCard: {
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    selectionInfo: { flex: 1 },
    selectionLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 2 },
    selectionOdds: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.primary },
    removeBtn: { padding: 4, marginTop: -2 },
    stakeCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    stakeLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 8 },
    stakeRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
    quickAmtBtn: {
      flex: 1,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.muted,
      padding: 8,
      alignItems: "center",
    },
    quickAmtText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    stakeInput: {
      backgroundColor: colors.input,
      borderRadius: 10,
      padding: 14,
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      textAlign: "center",
    },
    summaryCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
    },
    summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    summaryLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    summaryValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    summaryValueBig: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.success ?? "#22c55e" },
    divider: { height: 1, backgroundColor: colors.border },
    balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    balanceLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    balanceValue: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    footer: {
      padding: 16,
      paddingBottom: insets.bottom + 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    placeBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: "center",
    },
    placeBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 60 },
    emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
  });

  const quickAmounts = [5, 10, 25, 50];

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable style={s.closeBtn} onPress={() => router.dismiss()}>
          <Ionicons name="close" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={s.headerTitle}>Boletim de Aposta</Text>
        {count > 0 ? (
          <Pressable style={s.clearBtn} onPress={() => { clearSlip(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
            <Text style={s.clearText}>Limpar</Text>
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {count === 0 ? (
          <View style={s.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color={colors.border} />
            <Text style={s.emptyText}>Boletim vazio</Text>
            <Text style={s.emptySubtext}>Seleciona odds para adicionar apostas</Text>
          </View>
        ) : (
          <>
            {selections.map((sel, i) => (
              <View key={i} style={s.selectionCard}>
                <View style={s.selectionInfo}>
                  <Text style={s.selectionLabel} numberOfLines={2}>{sel.label}</Text>
                  <Text style={s.selectionOdds}>{sel.odds.toFixed(2)}</Text>
                </View>
                <Pressable
                  style={s.removeBtn}
                  onPress={() => { removeSelection(sel.matchId, sel.market); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Ionicons name="close-circle-outline" size={22} color={colors.mutedForeground} />
                </Pressable>
              </View>
            ))}

            <View style={s.stakeCard}>
              <Text style={s.stakeLabel}>Valor da aposta</Text>
              <View style={s.stakeRow}>
                {quickAmounts.map((amt) => (
                  <Pressable
                    key={amt}
                    style={({ pressed }) => [
                      s.quickAmtBtn,
                      stake === String(amt) && { backgroundColor: colors.primary, borderColor: colors.primary },
                      { opacity: pressed ? 0.8 : 1 },
                    ]}
                    onPress={() => { setStake(String(amt)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Text style={[s.quickAmtText, stake === String(amt) && { color: colors.primaryForeground }]}>
                      €{amt}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={s.stakeInput}
                value={stake}
                onChangeText={setStake}
                keyboardType="numeric"
                placeholder="€ 0.00"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            <View style={s.summaryCard}>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Seleções</Text>
                <Text style={s.summaryValue}>{count}</Text>
              </View>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Odds totais</Text>
                <Text style={s.summaryValue}>{totalOdds.toFixed(2)}</Text>
              </View>
              <View style={s.divider} />
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Ganho potencial</Text>
                <Text style={s.summaryValueBig}>€{potentialWin.toFixed(2)}</Text>
              </View>
              {user && (
                <View style={s.balanceRow}>
                  <Text style={s.balanceLabel}>Saldo disponível</Text>
                  <Text style={s.balanceValue}>€{balance.toFixed(2)}</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {count > 0 && (
        <View style={s.footer}>
          <Pressable
            style={({ pressed }) => [s.placeBtn, { opacity: pressed || loading ? 0.8 : 1 }]}
            onPress={handlePlaceBet}
            disabled={loading || stakeValue <= 0}
            testID="place-bet-btn"
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={s.placeBtnText}>
                {user ? `Apostar €${stakeValue.toFixed(2)}` : "Entrar para apostar"}
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}
