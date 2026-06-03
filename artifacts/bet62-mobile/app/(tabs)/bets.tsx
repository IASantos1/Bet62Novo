import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { API_BASE } from "@/context/AuthContext";

interface StoredSelection {
  matchTitle: string;
  selection: string;
  odd: number;
  market?: string;
  label?: string;
  finalScore?: { home: number; away: number };
  htScore?: { htHome: number; htAway: number };
  outcome?: "won" | "lost" | "void" | null;
}

interface Bet {
  id: number;
  matchId: string;
  matchTitle: string;
  selections: StoredSelection[] | unknown;
  stake: string;
  potentialWin: string;
  totalOdds: string;
  status: "pending" | "won" | "lost" | "cashed_out" | "voided";
  cashoutValue?: string | null;
  createdAt: string;
}

function getBetSelections(bet: Bet): StoredSelection[] {
  if (Array.isArray(bet.selections)) return bet.selections as StoredSelection[];
  return [{ matchTitle: bet.matchTitle, selection: "home", odd: parseFloat(bet.totalOdds), market: "result" }];
}

function getSelLabel(sel: StoredSelection): string {
  if (sel.label && sel.label !== sel.selection) return sel.label;
  const [home = "", away = ""] = sel.matchTitle.split(" vs ");
  const map: Record<string, string> = {
    home, away, draw: "Empate",
    homeOrDraw: `${home} ou X`, awayOrDraw: `${away} ou X`, homeOrAway: "1 ou 2",
    "bts-yes": "Ambas Marcam — Sim", "bts-no": "Ambas Marcam — Não",
    o05: "Mais de 0.5", u05: "Menos de 0.5",
    o15: "Mais de 1.5", u15: "Menos de 1.5",
    o25: "Mais de 2.5", u25: "Menos de 2.5",
    o35: "Mais de 3.5", u35: "Menos de 3.5",
    o45: "Mais de 4.5", u45: "Menos de 4.5",
  };
  return map[sel.selection] ?? sel.selection;
}

// ─── BOLETIM CARD ────────────────────────────────────────────────────────────

function BetCard({ bet, token, onCashout }: { bet: Bet; token: string | null; onCashout: () => void }) {
  const [cashingOut, setCashingOut] = useState(false);
  const [cashoutExpanded, setCashoutExpanded] = useState(false);

  const sels = getBetSelections(bet);
  const isMultiple = sels.length > 1;
  const isPending = bet.status === "pending";
  const isWon = bet.status === "won";
  const isLost = bet.status === "lost";
  const isCashedOut = bet.status === "cashed_out";
  const isVoided = bet.status === "voided";

  const stake = parseFloat(bet.stake);
  const totalOdds = parseFloat(bet.totalOdds);
  const potentialWin = parseFloat(bet.potentialWin);
  const estimatedCashout = (stake * 0.92).toFixed(2);

  const ticketCode = `BT62-${String(bet.id).padStart(6, "0")}`;
  const betDate = new Date(bet.createdAt);
  const dateStr = betDate.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = betDate.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });

  // colours
  const cardBg = isLost ? "#7b1111" : "#ffffff";
  const selsBg = isLost ? "#8f1616" : "#ffffff";
  const txtMain = isLost ? "#ffffff" : "#111827";
  const txtSub = isLost ? "#fca5a5" : "#6b7280";
  const dividerColor = isLost ? "rgba(160,32,32,0.5)" : "#f3f4f6";
  const summBg = isLost ? "rgba(107,15,15,0.6)" : "#f9fafb";
  const summBorder = isLost ? "rgba(160,32,32,0.4)" : "#e5e7eb";
  const summTxt = isLost ? "#fecaca" : "#4b5563";

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
      setCashoutExpanded(false);
      Alert.alert("Cash Out", `Recebeste €${parseFloat(data.cashoutValue).toFixed(2)}`);
      onCashout();
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha no cash out.");
    } finally {
      setCashingOut(false);
    }
  }

  return (
    <View style={{
      marginHorizontal: 12,
      marginBottom: 16,
      borderRadius: 16,
      overflow: "hidden",
      backgroundColor: cardBg,
      shadowColor: isLost ? "#7b0000" : "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isLost ? 0.5 : 0.3,
      shadowRadius: 12,
      elevation: 8,
    }}>

      {/* ── HEADER ── */}
      <View style={{ backgroundColor: "#b91c1c", paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <View style={{ backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 10, padding: 8 }}>
            <Ionicons name="receipt-outline" size={18} color="#fff" />
          </View>
          <View>
            <Text style={{ fontFamily: "Inter_800ExtraBold", fontSize: 16, color: "#fff", fontStyle: "italic" }}>
              Boletim de Aposta
            </Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#fca5a5", marginTop: 2 }}>
              📅 {dateStr} • {timeStr}
            </Text>
          </View>
        </View>
        {isPending && (
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.25)", borderWidth: 2, borderColor: "rgba(255,255,255,0.6)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="checkmark" size={18} color="#fff" />
          </View>
        )}
        {isWon && (
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 }}>
            <Ionicons name="checkmark" size={18} color="#b91c1c" />
          </View>
        )}
        {isLost && (
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 2, borderColor: "rgba(255,255,255,0.4)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="close" size={18} color="#fff" />
          </View>
        )}
        {isCashedOut && (
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#fbbf24", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="cash-outline" size={16} color="#78350f" />
          </View>
        )}
        {isVoided && (
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 2, borderColor: "rgba(255,255,255,0.4)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="lock-closed-outline" size={18} color="#fff" />
          </View>
        )}
      </View>

      {/* ── SELEÇÕES HEADER ── */}
      <View style={{ backgroundColor: isLost ? "#8f1616" : "#f9fafb", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, flexDirection: "row", alignItems: "center", gap: 6, borderBottomWidth: 1, borderBottomColor: dividerColor }}>
        <Ionicons name="list-outline" size={13} color={txtSub} />
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: txtSub, letterSpacing: 1.5, textTransform: "uppercase" }}>
          Seleções
        </Text>
      </View>

      {/* ── SELEÇÕES LIST ── */}
      <View style={{ backgroundColor: selsBg }}>
        {sels.map((sel, i) => {
          // Per-selection icon
          let iconName: string = "football-outline";
          let iconColor = txtSub;
          let iconBg = "transparent";
          let showCircle = false;

          const selOutcome = sel.outcome ?? null;
          if (isCashedOut) { iconName = "cash-outline"; iconColor = "#fff"; iconBg = "rgba(251,191,36,0.7)"; showCircle = true; }
          else if (isVoided) { iconName = "lock-closed-outline"; iconColor = "#fff"; iconBg = "rgba(59,130,246,0.6)"; showCircle = true; }
          else if (selOutcome === "won") { iconName = "checkmark"; iconColor = "#fff"; iconBg = "#22c55e"; showCircle = true; }
          else if (selOutcome === "lost") { iconName = "close"; iconColor = "#fff"; iconBg = "rgba(0,0,0,0.3)"; showCircle = true; }
          else if (selOutcome === "void") { iconName = "remove"; iconColor = "#fff"; iconBg = "rgba(156,163,175,0.55)"; showCircle = true; }
          else if (isWon || isLost) { iconName = "time-outline"; iconColor = "#fff"; iconBg = "rgba(156,163,175,0.35)"; showCircle = true; }

          return (
            <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: dividerColor, gap: 10 }}>
              {/* Left icon */}
              {showCircle ? (
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: iconBg, alignItems: "center", justifyContent: "center", marginTop: 2, flexShrink: 0 }}>
                  <Ionicons name={iconName as never} size={14} color={iconColor} />
                </View>
              ) : (
                <Text style={{ fontSize: 20, lineHeight: 26, marginTop: 1, flexShrink: 0 }}>⚽</Text>
              )}

              {/* Middle */}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: txtMain, lineHeight: 18 }} numberOfLines={2}>
                  {i + 1}. {sel.matchTitle}
                </Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: txtSub, marginTop: 2 }}>
                  {getSelLabel(sel)}
                </Text>
                {(isWon || isLost || isCashedOut || isVoided) && sel.finalScore != null && (
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: txtSub, marginTop: 3 }}>
                    Resultado: {sel.finalScore.home} – {sel.finalScore.away}
                  </Text>
                )}
              </View>

              {/* Right: odds pill + VENCIDO */}
              <View style={{ alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                <View style={{ backgroundColor: "#dc2626", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontFamily: "Inter_800ExtraBold", fontSize: 13, color: "#fff" }}>
                    {Number(sel.odd).toFixed(2)}
                  </Text>
                </View>
                {isWon && (
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#16a34a" }}>⚽ VENCIDO</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* ── SUMMARY BOX ── */}
      <View style={{ marginHorizontal: 12, marginTop: 12, marginBottom: 12, backgroundColor: summBg, borderRadius: 12, borderWidth: 1, borderColor: summBorder, overflow: "hidden" }}>
        {[
          { label: "Tipo de aposta:", value: isMultiple ? "Múltipla" : "Simples", valueColor: "#dc2626", valueBold: true },
          { label: "Total de odds:", value: totalOdds.toFixed(2), valueColor: txtMain, valueBold: false },
          { label: "Valor apostado:", value: `€${stake.toFixed(2)}`, valueColor: txtMain, valueBold: false },
          {
            label: isWon ? "Retorno recebido:" : isLost ? "Retorno:" : isVoided ? "Reembolso:" : "Retorno estimado:",
            value: isLost ? "€0,00" : isVoided ? `€${stake.toFixed(2)}` : `€${potentialWin.toFixed(2)}`,
            valueColor: isWon ? "#16a34a" : isLost ? "#fca5a5" : isVoided ? "#93c5fd" : txtMain,
            valueBold: true,
          },
        ].map(({ label, value, valueColor, valueBold }, ri, arr) => (
          <View key={ri} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: ri < arr.length - 1 ? 1 : 0, borderBottomColor: summBorder }}>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: summTxt }}>{label}</Text>
            <Text style={{ fontFamily: valueBold ? "Inter_700Bold" : "Inter_500Medium", fontSize: 13, color: valueColor }}>{value}</Text>
          </View>
        ))}
      </View>

      {/* ── CASH OUT BUTTON ── */}
      {isPending ? (
        cashoutExpanded ? (
          <View style={{ marginHorizontal: 12, marginBottom: 12, backgroundColor: "#16a34a", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name="cash-outline" size={22} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.7)", marginBottom: 2 }}>Cash Out estimado</Text>
              <Text style={{ fontFamily: "Inter_800ExtraBold", fontSize: 20, color: "#fff" }}>€ {estimatedCashout}</Text>
            </View>
            <Pressable onPress={() => setCashoutExpanded(false)} disabled={cashingOut} style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={executeCashout}
              disabled={cashingOut}
              style={({ pressed }) => ({ backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, opacity: pressed || cashingOut ? 0.75 : 1 })}
            >
              {cashingOut
                ? <ActivityIndicator size="small" color="#16a34a" />
                : <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#15803d" }}>CONFIRMAR</Text>}
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setCashoutExpanded(true); }}
            disabled={cashingOut}
            style={({ pressed }) => ({
              marginHorizontal: 12, marginBottom: 12,
              backgroundColor: pressed ? "#b91c1c" : "#dc2626",
              borderRadius: 16, paddingVertical: 16,
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
              shadowColor: "#7f1d1d", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
            })}
          >
            <Ionicons name="refresh-outline" size={20} color="#fff" />
            <Text style={{ fontFamily: "Inter_800ExtraBold", fontSize: 15, color: "#fff" }}>Cash Out disponível</Text>
          </Pressable>
        )
      ) : isCashedOut || isWon ? (
        <View style={{ marginHorizontal: 12, marginBottom: 12, backgroundColor: "#e5e7eb", borderRadius: 16, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={16} color="#9ca3af" />
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#9ca3af" }}>Cash Out encerrado</Text>
        </View>
      ) : isLost ? (
        <View style={{ marginHorizontal: 12, marginBottom: 12, backgroundColor: "rgba(107,15,15,0.6)", borderWidth: 1, borderColor: "rgba(160,32,32,0.5)", borderRadius: 16, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Ionicons name="refresh-outline" size={16} color="rgba(252,165,165,0.5)" />
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "rgba(252,165,165,0.6)" }}>Cash Out indisponível</Text>
          <Ionicons name="lock-closed-outline" size={14} color="rgba(252,165,165,0.4)" style={{ marginLeft: "auto" as never }} />
        </View>
      ) : null}

      {/* ── FOOTER ── */}
      <View style={{ backgroundColor: isLost ? "#6b0f0f" : "#b91c1c", paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="ticket-outline" size={16} color="rgba(255,255,255,0.6)" />
          <View>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>
              Código do bilhete:
            </Text>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#fff", letterSpacing: 0.5 }}>
              {ticketCode}
            </Text>
          </View>
        </View>
        <View>
          {isPending && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 }}>
              <Ionicons name="shield-checkmark-outline" size={13} color="#fff" />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#fff" }}>Aposta confirmada</Text>
            </View>
          )}
          {isWon && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.25)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 }}>
              <Ionicons name="trophy-outline" size={13} color="#fff" />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#fff" }}>Bilhete vencedor</Text>
            </View>
          )}
          {isLost && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.3)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 }}>
              <Ionicons name="close-circle-outline" size={13} color="rgba(255,255,255,0.8)" />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "rgba(255,255,255,0.8)" }}>Bilhete perdido</Text>
            </View>
          )}
          {isCashedOut && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fbbf24", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 }}>
              <Ionicons name="cash-outline" size={13} color="#78350f" />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#78350f" }}>Cash Out</Text>
            </View>
          )}
        </View>
      </View>

    </View>
  );
}

// ─── SCREEN ──────────────────────────────────────────────────────────────────

export default function BetsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [tab, setTab] = useState<"abertas" | "resolvidas">("abertas");

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
    refetchInterval: 10000,
  });

  // Refetch immediately when the tab comes into focus — mirrors web behaviour
  useFocusEffect(
    useCallback(() => {
      if (token) void refetch();
    }, [token, refetch]),
  );

  const bets = data ?? [];
  const filtered = tab === "abertas"
    ? bets.filter(b => b.status === "pending")
    : bets.filter(b => b.status !== "pending");

  const pending = bets.filter(b => b.status === "pending").length;
  const won = bets.filter(b => b.status === "won").length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* Header */}
      <View style={{ paddingTop: topPad + 8, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground }}>Minhas Apostas</Text>
        </View>
        {user && <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>{bets.length} apostas registadas</Text>}
        {user && bets.length > 0 && (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            {pending > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name="time-outline" size={13} color={colors.primary} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{pending} pendente{pending !== 1 ? "s" : ""}</Text>
              </View>
            )}
            {won > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name="trophy-outline" size={13} color="#22c55e" />
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#22c55e" }}>{won} ganha{won !== 1 ? "s" : ""}</Text>
              </View>
            )}
          </View>
        )}

        {/* Tab switcher */}
        {user && bets.length > 0 && (
          <View style={{ flexDirection: "row", marginTop: 12, backgroundColor: colors.muted, borderRadius: 10, padding: 3 }}>
            {(["abertas", "resolvidas"] as const).map(t => (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: tab === t ? colors.card : "transparent" }}
              >
                <Text style={{ fontFamily: tab === t ? "Inter_700Bold" : "Inter_500Medium", fontSize: 13, color: tab === t ? colors.primary : colors.mutedForeground }}>
                  {t === "abertas" ? "Abertas" : "Resolvidas"}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {!user ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 }}>
          <Ionicons name="receipt-outline" size={48} color={colors.border} />
          <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>Inicia sessão para ver as tuas apostas</Text>
          <Pressable
            style={({ pressed }) => ({ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, opacity: pressed ? 0.8 : 1 })}
            onPress={() => router.push("/(auth)/login")}
          >
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground }}>Entrar</Text>
          </Pressable>
        </View>
      ) : isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(b) => String(b.id)}
          contentContainerStyle={{ paddingTop: 14, paddingBottom: Platform.OS === "web" ? 100 : 120 }}
          scrollEnabled={filtered.length > 0}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={() => refetch()} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 80 }}>
              <Ionicons name="receipt-outline" size={48} color={colors.border} />
              <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>
                {tab === "abertas" ? "Sem apostas abertas" : "Sem apostas resolvidas"}
              </Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                {tab === "abertas" ? "As tuas apostas activas aparecerão aqui" : "Apostas ganhas, perdidas e cash out aparecem aqui"}
              </Text>
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
