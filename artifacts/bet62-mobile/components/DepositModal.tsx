import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth, API_BASE } from "@/context/AuthContext";

type Method = "multibanco" | "mbway" | "card";

interface MultiBancoResult { entity: string; reference: string; orderId: string; amount: string }
interface MBWayResult { orderId: string; requestId?: string; message?: string }
interface CardResult { orderId: string; paymentUrl: string }

interface Props {
  visible: boolean;
  onClose: () => void;
}

const PRESETS = [10, 20, 50, 100, 200, 500];

export function DepositModal({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token, refreshUser } = useAuth();

  const [method, setMethod] = useState<Method>("multibanco");
  const [amount, setAmount] = useState("20");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mbResult, setMbResult] = useState<MultiBancoResult | null>(null);
  const [mbwayResult, setMbwayResult] = useState<MBWayResult | null>(null);
  const [cardResult, setCardResult] = useState<CardResult | null>(null);

  const isDone = mbResult !== null || mbwayResult !== null || cardResult !== null;

  function reset() {
    setLoading(false);
    setError(null);
    setMbResult(null);
    setMbwayResult(null);
    setCardResult(null);
    setAmount("20");
    setPhone("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError(null);
    const amountNum = parseFloat(amount.replace(",", "."));
    if (!amountNum || isNaN(amountNum) || amountNum < 10 || amountNum > 5000) {
      setError("Montante deve ser entre €10 e €5 000");
      return;
    }
    if (method === "mbway") {
      const ph = phone.replace(/\s|-/g, "");
      if (!ph || ph.length < 9) {
        setError("Número de telemóvel inválido (mín. 9 dígitos)");
        return;
      }
    }
    if (!token) {
      setError("Inicia sessão para depositar");
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = { amount: amountNum };
      if (method === "mbway") body.phone = phone.replace(/\s|-/g, "");

      const res = await fetch(`${API_BASE}/payments/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao processar pagamento. Tenta novamente.");
        return;
      }

      if (method === "multibanco") {
        setMbResult(data as MultiBancoResult);
      } else if (method === "mbway") {
        setMbwayResult(data as MBWayResult);
      } else {
        const cr = data as CardResult;
        setCardResult(cr);
        if (cr.paymentUrl) {
          await Linking.openURL(cr.paymentUrl);
        }
      }
      await refreshUser().catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError("Erro de ligação. Verifica a tua internet e tenta novamente.");
    } finally {
      setLoading(false);
    }
  }

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "#00000090", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingBottom: Math.max(insets.bottom, 20) + 8,
      maxHeight: "90%",
    },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 12, marginBottom: 4 },
    titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    title: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
    methodRow: { flexDirection: "row", marginHorizontal: 20, marginBottom: 20, gap: 8 },
    methodBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", borderWidth: 1.5 },
    methodLabel: { fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 4 },
    presetsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginHorizontal: 20, marginBottom: 16 },
    presetBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1 },
    presetText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
    inputWrapper: { marginHorizontal: 20, marginBottom: 16, borderRadius: 12, borderWidth: 1.5, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, height: 52 },
    inputPrefix: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground, marginRight: 4 },
    input: { flex: 1, fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground },
    errorBox: { marginHorizontal: 20, marginBottom: 12, backgroundColor: "#ef444418", borderRadius: 10, borderWidth: 1, borderColor: "#ef444444", paddingHorizontal: 14, paddingVertical: 10 },
    errorText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#ef4444" },
    submitBtn: { marginHorizontal: 20, borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
    submitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
    sectionLabel: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.8, marginHorizontal: 20, marginBottom: 10 },
    resultCard: { marginHorizontal: 20, borderRadius: 14, borderWidth: 1, padding: 16 },
    refRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1 },
    refLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    refValue: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
    successIcon: { alignItems: "center", paddingVertical: 20, gap: 10 },
    newDepositBtn: { marginHorizontal: 20, marginTop: 12, borderRadius: 14, paddingVertical: 13, alignItems: "center", borderWidth: 1.5 },
  });

  const METHODS: Array<{ key: Method; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = [
    { key: "multibanco", label: "Multibanco", icon: "card-outline", color: "#3b82f6" },
    { key: "mbway", label: "MB Way", icon: "phone-portrait-outline", color: "#ef4444" },
    { key: "card", label: "Cartão", icon: "card", color: "#22c55e" },
  ];

  function renderResult() {
    if (mbResult) {
      return (
        <View>
          <View style={{ alignItems: "center", paddingVertical: 16, gap: 6 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#3b82f618", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#3b82f644" }}>
              <Ionicons name="checkmark-circle" size={32} color="#3b82f6" />
            </View>
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>Referência Multibanco</Text>
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>Paga num ATM ou em homebanking</Text>
          </View>
          <View style={[s.resultCard, { backgroundColor: "#1c1c26", borderColor: "#3b82f644" }]}>
            <View style={[s.refRow, { borderBottomColor: colors.border }]}>
              <Text style={s.refLabel}>Entidade</Text>
              <Text style={[s.refValue, { color: "#3b82f6", fontSize: 22 }]}>{mbResult.entity}</Text>
            </View>
            <View style={[s.refRow, { borderBottomColor: colors.border }]}>
              <Text style={s.refLabel}>Referência</Text>
              <Text style={[s.refValue, { color: colors.foreground }]}>{
                (mbResult.reference ?? "").replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")
              }</Text>
            </View>
            <View style={[s.refRow, { borderBottomWidth: 0 }]}>
              <Text style={s.refLabel}>Montante</Text>
              <Text style={[s.refValue, { color: "#22c55e" }]}>€{mbResult.amount}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginTop: 10, marginHorizontal: 20 }}>
            O saldo será creditado automaticamente após confirmação do pagamento
          </Text>
        </View>
      );
    }
    if (mbwayResult) {
      return (
        <View style={s.successIcon}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#ef444418", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#ef444444" }}>
            <Ionicons name="phone-portrait" size={34} color="#ef4444" />
          </View>
          <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }}>Pedido Enviado!</Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginHorizontal: 20 }}>
            Aceita o pagamento na app MB WAY.{"\n"}O saldo será creditado após confirmação.
          </Text>
          <View style={{ backgroundColor: "#ef444412", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginHorizontal: 20, borderWidth: 1, borderColor: "#ef444430", marginTop: 4 }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#ef4444", textAlign: "center" }}>
              📱 Abre a app MB WAY para confirmar
            </Text>
          </View>
        </View>
      );
    }
    if (cardResult) {
      return (
        <View style={s.successIcon}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#22c55e18", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#22c55e44" }}>
            <Ionicons name="open-outline" size={32} color="#22c55e" />
          </View>
          <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }}>Redireccionado</Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginHorizontal: 20 }}>
            Foste redirecionado para a página de pagamento seguro com cartão.
          </Text>
          <Pressable
            style={({ pressed }) => [s.submitBtn, { backgroundColor: "#22c55e", marginTop: 8, opacity: pressed ? 0.85 : 1 }]}
            onPress={() => cardResult.paymentUrl && Linking.openURL(cardResult.paymentUrl)}
          >
            <Ionicons name="open-outline" size={18} color="#fff" />
            <Text style={s.submitText}>Abrir Pagamento</Text>
          </Pressable>
        </View>
      );
    }
    return null;
  }

  const methodColor = METHODS.find((m) => m.key === method)?.color ?? colors.primary;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <View style={s.titleRow}>
              <Text style={s.title}>Depósito</Text>
              <Pressable style={s.closeBtn} onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={18} color={colors.foreground} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {!isDone ? (
                <>
                  <Text style={s.sectionLabel}>Método de Pagamento</Text>
                  <View style={s.methodRow}>
                    {METHODS.map((m) => {
                      const active = method === m.key;
                      return (
                        <Pressable
                          key={m.key}
                          style={[s.methodBtn, {
                            backgroundColor: active ? m.color + "20" : colors.muted,
                            borderColor: active ? m.color : colors.border,
                          }]}
                          onPress={() => { setMethod(m.key); setError(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                        >
                          <Ionicons name={m.icon} size={22} color={active ? m.color : colors.mutedForeground} />
                          <Text style={[s.methodLabel, { color: active ? m.color : colors.mutedForeground }]}>{m.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={s.sectionLabel}>Montante</Text>
                  <View style={s.presetsRow}>
                    {PRESETS.map((p) => {
                      const active = amount === String(p);
                      return (
                        <Pressable
                          key={p}
                          style={[s.presetBtn, { backgroundColor: active ? methodColor + "20" : colors.muted, borderColor: active ? methodColor : colors.border }]}
                          onPress={() => { setAmount(String(p)); setError(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                        >
                          <Text style={[s.presetText, { color: active ? methodColor : colors.foreground }]}>€{p}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={[s.inputWrapper, { borderColor: error ? "#ef4444" : colors.border, backgroundColor: colors.background }]}>
                    <Text style={s.inputPrefix}>€</Text>
                    <TextInput
                      style={s.input}
                      value={amount}
                      onChangeText={(t) => { setAmount(t); setError(null); }}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.mutedForeground}
                      maxLength={7}
                    />
                  </View>

                  {method === "mbway" && (
                    <>
                      <Text style={[s.sectionLabel, { marginTop: 4 }]}>Número de Telemóvel</Text>
                      <View style={[s.inputWrapper, { borderColor: error ? "#ef4444" : colors.border, backgroundColor: colors.background, marginBottom: 16 }]}>
                        <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginRight: 6 }}>🇵🇹 +351</Text>
                        <TextInput
                          style={[s.input, { fontSize: 18 }]}
                          value={phone}
                          onChangeText={(t) => { setPhone(t); setError(null); }}
                          keyboardType="phone-pad"
                          placeholder="9XX XXX XXX"
                          placeholderTextColor={colors.mutedForeground}
                          maxLength={15}
                        />
                      </View>
                    </>
                  )}

                  {method === "card" && (
                    <View style={{ marginHorizontal: 20, marginBottom: 12, backgroundColor: "#22c55e12", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#22c55e30" }}>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#22c55e" }}>
                        🔒 Serás redirecionado para uma página de pagamento segura com cartão de crédito/débito
                      </Text>
                    </View>
                  )}

                  {error && (
                    <View style={s.errorBox}>
                      <Text style={s.errorText}>⚠️ {error}</Text>
                    </View>
                  )}

                  <Pressable
                    style={({ pressed }) => [s.submitBtn, { backgroundColor: loading ? colors.muted : methodColor, opacity: pressed ? 0.88 : 1 }]}
                    onPress={handleSubmit}
                    disabled={loading}
                  >
                    {loading
                      ? <ActivityIndicator size="small" color="#fff" />
                      : (
                        <>
                          <Ionicons name={method === "mbway" ? "phone-portrait" : method === "card" ? "card" : "cash-outline"} size={18} color="#fff" />
                          <Text style={s.submitText}>
                            {method === "multibanco" ? "Gerar Referência" : method === "mbway" ? "Enviar Pedido MB Way" : "Pagar com Cartão"}
                          </Text>
                        </>
                      )}
                  </Pressable>

                  <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginTop: 12, marginHorizontal: 20, marginBottom: 8 }}>
                    Pagamentos processados de forma segura por Ifthenpay • Mín. €10
                  </Text>
                </>
              ) : (
                <>
                  {renderResult()}
                  <Pressable
                    style={({ pressed }) => [s.newDepositBtn, { borderColor: colors.border, opacity: pressed ? 0.8 : 1, marginBottom: 4 }]}
                    onPress={reset}
                  >
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Novo Depósito</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [s.submitBtn, { backgroundColor: colors.primary, marginTop: 4, opacity: pressed ? 0.88 : 1 }]}
                    onPress={handleClose}
                  >
                    <Text style={s.submitText}>Fechar</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
