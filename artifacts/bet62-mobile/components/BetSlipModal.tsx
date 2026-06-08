import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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

const QUICK_AMOUNTS = [5, 10, 25, 50];

const MARKET_LABELS: Record<string, string> = {
  resultado: "Resultado Final",
  "1tempo": "Resultado 1º Tempo",
  "2tempo": "Resultado 2º Tempo",
  dupla: "Dupla Hipótese",
  gols: "Total de Golos",
  asiatico: "Handicap Asiático",
  htft: "Intervalo / Final",
  placar: "Placar Exato",
  btts: "Ambas Marcam",
  totais: "Total de Pontos",
  quartos: "Resultado por Período",
  "1periodo": "Resultado 1º Período",
  jogos: "Total de Jogos",
  especiais: "Mercados Especiais",
  "por-set": "Resultado por Set",
  pontos: "Total de Pontos",
};

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function BetSlipModal({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token, refreshUser } = useAuth();
  const { selections, removeSelection, clearSlip, totalOdds, count, applyQuote } = useBetSlip();
  const queryClient = useQueryClient();
  const selectionsRef = useRef(selections);
  useEffect(() => { selectionsRef.current = selections; }, [selections]);

  const [stake, setStake] = useState("");
  const [loading, setLoading] = useState(false);
  const [useFreebet, setUseFreebet] = useState(false);

  // Reset stake when modal closes
  useEffect(() => {
    if (!visible) {
      setStake("");
      setUseFreebet(false);
    }
  }, [visible]);

  const stakeNum = parseFloat(stake) || 0;
  const potentialWin = stakeNum * totalOdds;
  const balance = parseFloat(user?.balance ?? "0");
  const fbBalance = parseFloat(user?.freebetBalance ?? "0");
  const hasFreebet = fbBalance > 0;
  const activeBalance = useFreebet ? fbBalance : balance;
  const isInsufficient = stakeNum > 0 && stakeNum > activeBalance;
  const anySuspended = selections.some((s) => s.suspended);
  const canPlace = stakeNum >= 0.5 && !isInsufficient && count > 0 && !loading && !anySuspended;

  async function fetchQuote(): Promise<Array<{ matchId: string; market: string; odds: number | null; suspended: boolean; reason?: string }> | null> {
    const cur = selectionsRef.current;
    if (!token || cur.length === 0) return null;
    try {
      const res = await fetch(`${API_BASE}/bets/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          selections: cur.map((s) => ({
            matchId: s.matchId,
            market: s.market,
            selection: s.selection ?? s.market,
          })),
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { selections?: Array<{ matchId: string; market: string; odds: number | null; suspended: boolean; reason?: string }> };
      return Array.isArray(data.selections) ? data.selections : null;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (!visible) return;
    if (!token) return;
    if (selections.length === 0) return;
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    fetchQuote().then((q) => { if (mounted && q) applyQuote(q); });
    timer = setInterval(() => {
      fetchQuote().then((q) => { if (mounted && q) applyQuote(q); });
    }, 1000);
    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, [visible, token, selections.length]);

  async function handlePlaceBet() {
    if (!user || !token) {
      onClose();
      setTimeout(() => router.push("/(auth)/login"), 300);
      return;
    }
    if (stakeNum < 0.5) {
      Alert.alert("Aposta inválida", "O valor mínimo de aposta é €0.50.");
      return;
    }
    if (stakeNum > activeBalance) {
      Alert.alert(
        "Saldo insuficiente",
        useFreebet
          ? `Os teus freebets disponíveis são €${fbBalance.toFixed(2)}.`
          : `O teu saldo disponível é €${balance.toFixed(2)}.`
      );
      return;
    }
    if (count === 0) return;

    setLoading(true);
    try {
      const quote = await fetchQuote();
      if (quote) {
        applyQuote(quote);
        const blocked = quote.find((x) => x.suspended);
        if (blocked) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert("Mercado suspenso", blocked.reason ? `Aguarda alguns segundos.\n${blocked.reason}` : "Aguarda alguns segundos e tenta novamente.");
          return;
        }
      }
      const quoteMap = quote ? new Map(quote.map((x) => [`${x.matchId}::${x.market}`, x] as const)) : null;
      const effectiveOdds = selections.reduce((acc, s) => {
        const q = quoteMap?.get(`${s.matchId}::${s.market}`);
        const o = q?.odds != null && Number.isFinite(q.odds) ? q.odds : s.odds;
        return acc * o;
      }, 1);
      const finalWin = stakeNum * effectiveOdds;
      const res = await fetch(`${API_BASE}/bets/place`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          matchId: selections.map((s) => s.matchId).join("+"),
          matchTitle: selections.map((s) => s.matchTitle).join(" / "),
          selections: selections.map((s) => ({
            matchId: s.matchId,
            matchTitle: s.matchTitle,
            homeTeam: s.homeTeam,
            awayTeam: s.awayTeam,
            selection: s.selection ?? s.market,
            market: s.market,
            label: s.label,
            kickoffTime: s.kickoffTime,
            date: s.date,
            time: s.time,
            odds: quoteMap?.get(`${s.matchId}::${s.market}`)?.odds ?? s.odds,
          })),
          stake: stakeNum.toFixed(2),
          potentialWin: (stakeNum * effectiveOdds).toFixed(2),
          totalOdds: effectiveOdds.toFixed(4),
          isFreebet: useFreebet,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao registar aposta");

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["my-bets"] });
      clearSlip();
      onClose();
      Alert.alert(
        "✅ Aposta registada!",
        `Ganho potencial: €${finalWin.toFixed(2)}${useFreebet ? "\n(Apostado com Freebet)" : ""}`
      );
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Erro",
        err instanceof Error ? err.message : "Falha ao registar aposta. Tenta novamente."
      );
    } finally {
      setLoading(false);
    }
  }

  function onToggleFreebet(val: boolean) {
    setUseFreebet(val);
    setStake("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function onQuickAmount(amt: number) {
    setStake(String(amt));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      paddingTop: insets.top + 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerSide: { width: 64, alignItems: "flex-start" },
    headerSideRight: { width: 64, alignItems: "flex-end" },
    headerCenter: { flex: 1, alignItems: "center" },
    headerTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground },
    headerBadge: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      paddingHorizontal: 5,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    headerBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    clearBtn: { paddingVertical: 4, paddingHorizontal: 2 },
    clearText: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.primary },

    scroll: { flex: 1 },
    content: { padding: 16, gap: 12, paddingBottom: 24 },

    sectionLabel: {
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 6,
      marginLeft: 2,
    },

    selectionCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    selectionRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    selectionBody: { flex: 1 },
    selectionMatch: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 2 },
    selectionMeta: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 6 },
    selectionPick: { fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 4 },
    selectionMarketBadge: { alignSelf: "flex-start", backgroundColor: colors.muted, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    selectionMarketText: { fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    selectionOddsCol: { alignItems: "flex-end", gap: 4 },
    selectionOdds: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.primary },
    selectionSusp: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#ef4444", textTransform: "uppercase", letterSpacing: 0.6 },
    removeBtn: { padding: 4 },

    freebetCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: "#7c3aed33",
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    freebetCardActive: { borderColor: "#7c3aed", backgroundColor: "#7c3aed14" },
    freebetIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#7c3aed22", alignItems: "center", justifyContent: "center" },
    freebetBody: { flex: 1 },
    freebetTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.foreground },
    freebetAmount: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#a78bfa", marginTop: 1 },

    stakeCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      gap: 12,
    },
    quickRow: { flexDirection: "row", gap: 8 },
    quickBtn: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted, paddingVertical: 9, alignItems: "center" },
    quickBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    quickText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    quickTextActive: { color: colors.primaryForeground },
    stakeInputWrap: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, flexDirection: "row", alignItems: "center", paddingHorizontal: 16 },
    stakeInputWrapInsuff: { borderColor: colors.primary },
    stakeInputPrefix: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.mutedForeground, marginRight: 4 },
    stakeInput: { flex: 1, paddingVertical: 14, fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    insuffText: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.primary, textAlign: "right", marginTop: -4 },

    summaryCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      gap: 10,
    },
    summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    summaryValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    winRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    winLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    winValue: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.success ?? "#22c55e" },
    balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.muted, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginTop: 2 },
    balanceLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    balanceValue: { fontSize: 12, fontFamily: "Inter_700Bold", color: colors.foreground },

    footer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: insets.bottom + 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: 8,
    },
    placeBtn: { borderRadius: 12, padding: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
    placeBtnEnabled: { backgroundColor: colors.primary },
    placeBtnDisabled: { backgroundColor: colors.muted },
    placeBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    placeBtnTextDisabled: { color: colors.mutedForeground },
    loginNote: { textAlign: "center", fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },

    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 14 },
    emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
    emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground },
    emptySubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingHorizontal: 32 },
    backBtn: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
    backBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={s.container}>
          {/* ── HEADER ── */}
          <View style={s.header}>
            <View style={s.headerSide}>
              <Pressable
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={26} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={s.headerCenter}>
              <Text style={s.headerTitle}>Boletim de Aposta</Text>
              {count > 0 && (
                <View style={s.headerBadge}>
                  <Text style={s.headerBadgeText}>{count}</Text>
                </View>
              )}
            </View>

            <View style={s.headerSideRight}>
              {count > 0 && (
                <Pressable
                  style={s.clearBtn}
                  onPress={() => {
                    clearSlip();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={s.clearText}>Limpar</Text>
                </Pressable>
              )}
            </View>
          </View>

          {count === 0 ? (
            /* ── EMPTY STATE ── */
            <View style={s.emptyWrap}>
              <View style={s.emptyIcon}>
                <Ionicons name="receipt-outline" size={32} color={colors.mutedForeground} />
              </View>
              <Text style={s.emptyTitle}>Boletim vazio</Text>
              <Text style={s.emptySubtitle}>
                Seleciona as tuas odds para adicionar apostas ao boletim.
              </Text>
              <Pressable style={s.backBtn} onPress={onClose}>
                <Text style={s.backBtnText}>Ver jogos</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* ── SELECTIONS ── */}
              <ScrollView
                style={s.scroll}
                contentContainerStyle={s.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
                scrollEventThrottle={16}
              >
                <Text style={s.sectionLabel}>As tuas seleções ({count})</Text>
                {selections.map((sel, i) => (
                  <View key={`${sel.matchId}-${sel.market}-${i}`} style={s.selectionCard}>
                    <View style={s.selectionRow}>
                      <View style={s.selectionBody}>
                        <Text style={s.selectionMatch} numberOfLines={1}>
                          {sel.matchTitle}
                        </Text>
                        <Text style={s.selectionMeta} numberOfLines={1}>
                          {(sel.date && sel.time) ? `${sel.date} • ${sel.time}` : "Data e horário indisponíveis"}
                        </Text>
                        <Text style={s.selectionPick} numberOfLines={2}>
                          {sel.label}
                        </Text>
                        <View style={s.selectionMarketBadge}>
                          <Text style={s.selectionMarketText}>
                            {MARKET_LABELS[sel.market] ?? sel.market}
                          </Text>
                        </View>
                      </View>
                      <View style={s.selectionOddsCol}>
                        <Text style={s.selectionOdds}>{sel.odds.toFixed(2)}</Text>
                        {sel.suspended && (
                          <Text style={s.selectionSusp} numberOfLines={1}>
                            {sel.suspendedReason ? sel.suspendedReason : "SUSPENSO"}
                          </Text>
                        )}
                        <Pressable
                          style={s.removeBtn}
                          onPress={() => {
                            removeSelection(sel.matchId, sel.market);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}

                {/* ── FREEBET TOGGLE ── */}
                {hasFreebet && user && (
                  <>
                    <Text style={s.sectionLabel}>Tipo de aposta</Text>
                    <Pressable
                      style={({ pressed }) => [
                        s.freebetCard,
                        useFreebet && s.freebetCardActive,
                        { opacity: pressed ? 0.85 : 1 },
                      ]}
                      onPress={() => onToggleFreebet(!useFreebet)}
                    >
                      <View style={s.freebetIcon}>
                        <Ionicons name="gift" size={18} color="#a78bfa" />
                      </View>
                      <View style={s.freebetBody}>
                        <Text style={s.freebetTitle}>Usar Freebets</Text>
                        <Text style={s.freebetAmount}>
                          €{fbBalance.toFixed(2)} disponíveis
                        </Text>
                      </View>
                      <Switch
                        value={useFreebet}
                        onValueChange={onToggleFreebet}
                        trackColor={{ false: colors.border, true: "#7c3aed" }}
                        thumbColor={Platform.OS === "android" ? (useFreebet ? "#ffffff" : colors.mutedForeground) : "#ffffff"}
                        ios_backgroundColor={colors.border}
                      />
                    </Pressable>
                  </>
                )}

                {/* ── STAKE ── */}
                <Text style={s.sectionLabel}>
                  {useFreebet ? "Valor da aposta (Freebet)" : "Valor da aposta"}
                </Text>
                <View style={s.stakeCard}>
                  <View style={s.quickRow}>
                    {QUICK_AMOUNTS.map((amt) => {
                      const isActive = stake === String(amt);
                      const isDisabled = amt > activeBalance;
                      return (
                        <Pressable
                          key={amt}
                          style={[
                            s.quickBtn,
                            isActive && s.quickBtnActive,
                            isDisabled && { opacity: 0.4 },
                          ]}
                          onPress={() => !isDisabled && onQuickAmount(amt)}
                        >
                          <Text style={[s.quickText, isActive && s.quickTextActive]}>
                            €{amt}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={[s.stakeInputWrap, isInsufficient && s.stakeInputWrapInsuff]}>
                    <Text style={s.stakeInputPrefix}>€</Text>
                    <TextInput
                      style={s.stakeInput}
                      value={stake}
                      onChangeText={(v) => {
                        const cleaned = v.replace(/[^0-9.]/g, "");
                        const parts = cleaned.split(".");
                        const normalized =
                          parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned;
                        setStake(normalized);
                      }}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.mutedForeground}
                      returnKeyType="done"
                    />
                  </View>
                  {isInsufficient && (
                    <Text style={s.insuffText}>
                      {useFreebet
                        ? `Freebets insuficientes (máx. €${fbBalance.toFixed(2)})`
                        : `Saldo insuficiente (máx. €${balance.toFixed(2)})`}
                    </Text>
                  )}
                </View>

                {/* ── SUMMARY ── */}
                <Text style={s.sectionLabel}>Resumo</Text>
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
                  <View style={s.winRow}>
                    <Text style={s.winLabel}>Ganho potencial</Text>
                    <Text style={s.winValue}>
                      €{stakeNum > 0 ? potentialWin.toFixed(2) : "0.00"}
                    </Text>
                  </View>
                  {user && (
                    <View style={s.balanceRow}>
                      <Text style={s.balanceLabel}>
                        {useFreebet ? "🎁 Freebets disponíveis" : "💶 Saldo disponível"}
                      </Text>
                      <Text style={[s.balanceValue, useFreebet && { color: "#a78bfa" }]}>
                        €{(useFreebet ? fbBalance : balance).toFixed(2)}
                      </Text>
                    </View>
                  )}
                </View>
              </ScrollView>

              {/* ── FOOTER ── */}
              <View style={s.footer}>
                <Pressable
                  style={[
                    s.placeBtn,
                    canPlace ? s.placeBtnEnabled : s.placeBtnDisabled,
                  ]}
                  onPress={handlePlaceBet}
                  disabled={!canPlace}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.primaryForeground} />
                  ) : (
                    <>
                      <Ionicons
                        name={useFreebet ? "gift" : "checkmark-circle"}
                        size={18}
                        color={canPlace ? colors.primaryForeground : colors.mutedForeground}
                      />
                      <Text style={[s.placeBtnText, !canPlace && s.placeBtnTextDisabled]}>
                        {!user
                          ? "Entrar para apostar"
                          : useFreebet
                          ? stakeNum > 0
                            ? `Apostar Freebet €${stakeNum.toFixed(2)}`
                            : "Apostar com Freebet"
                          : stakeNum > 0
                          ? `Apostar €${stakeNum.toFixed(2)}`
                          : "Introduz o valor"}
                      </Text>
                    </>
                  )}
                </Pressable>
                {!user && (
                  <Text style={s.loginNote}>É necessário fazer login para apostar.</Text>
                )}
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
