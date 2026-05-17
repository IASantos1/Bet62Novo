import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { type ComponentProps, useEffect, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { API_BASE } from "@/context/AuthContext";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

function SectionCard({ children, style }: { children: React.ReactNode; style?: object }) {
  const colors = useColors();
  return (
    <View style={[{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden" }, style]}>
      {children}
    </View>
  );
}

function MenuItem({ icon, label, subtitle, onPress, rightEl, last }: {
  icon: IoniconsName;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  rightEl?: React.ReactNode;
  last?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [{
        flexDirection: "row" as const,
        alignItems: "center" as const,
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
        opacity: pressed ? 0.7 : 1,
      }]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color={colors.mutedForeground} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground }}>{label}</Text>
        {subtitle ? <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 }}>{subtitle}</Text> : null}
      </View>
      {rightEl ?? <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token, logout, refreshUser, isBiometricEnabled, enableBiometric, disableBiometric } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 100 : 80 + insets.bottom;

  const [depositAmount, setDepositAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawIban, setWithdrawIban] = useState("");
  const [withdrawName, setWithdrawName] = useState("");
  const [withdrawNif, setWithdrawNif] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  const [modalKyc, setModalKyc] = useState(false);
  const [modalDados, setModalDados] = useState(false);
  const [modalPagamentos, setModalPagamentos] = useState(false);

  useEffect(() => {
    (async () => {
      const hasHW = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHW && enrolled);
    })();
  }, []);

  useEffect(() => {
    if (user) {
      if (user.withdrawalIban) setWithdrawIban(user.withdrawalIban);
      if (user.withdrawalName) setWithdrawName(user.withdrawalName);
      if (user.nif) setWithdrawNif(user.nif);
    }
  }, [user]);

  async function handleDeposit() {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount < 10 || amount > 5000) {
      Alert.alert("Erro", "Valor inválido. Mínimo €10, máximo €5000.");
      return;
    }
    if (!token) { router.push("/(auth)/login"); return; }
    try {
      setDepositLoading(true);
      const res = await fetch(`${API_BASE}/auth/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshUser();
      setDepositAmount("");
      setShowDeposit(false);
      Alert.alert("Depósito efetuado", `€${amount.toFixed(2)} adicionados ao saldo`);
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha no depósito.");
    } finally {
      setDepositLoading(false);
    }
  }

  async function handleWithdraw() {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount < 20) {
      Alert.alert("Erro", "Valor mínimo de levantamento: €20.");
      return;
    }
    const cleanIban = withdrawIban.replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(cleanIban)) {
      Alert.alert("IBAN inválido", "Introduz um IBAN válido (ex: PT50 0002 0123...).");
      return;
    }
    if (!withdrawName || withdrawName.trim().length < 3) {
      Alert.alert("Erro", "Introduz o nome do titular da conta.");
      return;
    }
    if (!withdrawNif || !/^\d{9}$/.test(withdrawNif)) {
      Alert.alert("NIF inválido", "O NIF deve ter 9 dígitos.");
      return;
    }
    if (!token) { router.push("/(auth)/login"); return; }
    try {
      setWithdrawLoading(true);
      const res = await fetch(`${API_BASE}/withdrawals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount, iban: cleanIban, holderName: withdrawName.trim(), nif: withdrawNif }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "KYC_REQUIRED") {
          Alert.alert(
            "Verificação necessária",
            "É necessário completar a verificação KYC antes de levantar fundos.",
            [
              { text: "Cancelar", style: "cancel" },
              { text: "Verificar agora", onPress: () => { setShowWithdraw(false); setModalKyc(true); } },
            ]
          );
        } else {
          throw new Error(data.error);
        }
        return;
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshUser();
      setWithdrawAmount("");
      setShowWithdraw(false);
      Alert.alert(
        "Pedido enviado",
        `O teu pedido de levantamento de €${amount.toFixed(2)} foi registado e será processado em 1-3 dias úteis.`
      );
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha no pedido de levantamento.");
    } finally {
      setWithdrawLoading(false);
    }
  }

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
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: bottomPad },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    userRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
    userName: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    userEmail: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    balanceCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    balanceLeft: { gap: 2 },
    balanceLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    balanceValue: { fontSize: 28, fontFamily: "Inter_700Bold", color: colors.foreground },
    freebetBadge: { backgroundColor: "#7c3aed22", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "#7c3aed44" },
    freebetLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#a78bfa" },
    freebetValue: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#a78bfa", textAlign: "center" },
    actionRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    actionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 10,
      paddingVertical: 13,
      borderWidth: 1,
    },
    actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    accordionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    accordionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    accordionHeaderText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    accordionBody: { padding: 16, gap: 12 },
    amountRow: { flexDirection: "row", gap: 8, marginBottom: 2 },
    amountBtn: {
      flex: 1,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.muted,
      padding: 10,
      alignItems: "center",
    },
    amountBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    inputLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 4 },
    input: {
      backgroundColor: colors.input ?? colors.muted,
      borderRadius: 10,
      padding: 14,
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      borderWidth: 1,
      borderColor: colors.border,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      padding: 14,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    primaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    logoutBtn: {
      backgroundColor: colors.destructive + "15",
      borderRadius: 12,
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.destructive + "30",
    },
    logoutText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.destructive },
    loginContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
    loginText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    loginBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
    loginBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    modalOverlay: { flex: 1, backgroundColor: "#00000080", justifyContent: "flex-end" },
    modalSheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 16 },
    modalHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 6 },
    modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground, paddingHorizontal: 16, paddingVertical: 12 },
    modalBody: { paddingHorizontal: 16, gap: 12 },
    modalRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalRowLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground, width: 80 },
    modalRowValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1 },
    kycStep: { flexDirection: "row", gap: 10, paddingVertical: 6 },
    kycStepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    kycStepNumText: { fontSize: 12, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    kycStepText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, flex: 1, lineHeight: 20 },
    mailBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
    mailBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    kycStatusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  });

  if (!user) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.title}>Perfil</Text>
        </View>
        <View style={s.loginContainer}>
          <Ionicons name="person-circle-outline" size={64} color={colors.border} />
          <Text style={s.loginText}>Inicia sessão para ver o teu perfil</Text>
          <Pressable style={({ pressed }) => [s.loginBtn, { opacity: pressed ? 0.8 : 1 }]} onPress={() => router.push("/(auth)/login")}>
            <Text style={s.loginBtnText}>Entrar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const initials = user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  const balance = parseFloat(user.balance);
  const freebetBalance = parseFloat(user.freebetBalance ?? "0");
  const memberId = `BET${String(user.id).padStart(6, "0")}`;
  const kycStatus = user.kycStatus ?? "not_submitted";

  const kycBadgeColor =
    kycStatus === "approved" ? "#22c55e" :
    kycStatus === "pending" ? "#f59e0b" :
    kycStatus === "rejected" ? "#ef4444" : colors.mutedForeground;
  const kycBadgeLabel =
    kycStatus === "approved" ? "✓ Verificado" :
    kycStatus === "pending" ? "⏳ Em análise" :
    kycStatus === "rejected" ? "✗ Rejeitado" : "Não submetido";

  const depositQuickAmounts = [10, 25, 50, 100];
  const withdrawQuickAmounts = [20, 50, 100, 200];

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Perfil</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Avatar + user info ── */}
        <View style={s.userRow}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.userName}>{user.name}</Text>
            <Text style={s.userEmail}>{user.email}</Text>
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>ID: {memberId}</Text>
          </View>
        </View>

        {/* ── Saldo ── */}
        <View style={s.balanceCard}>
          <View style={s.balanceLeft}>
            <Text style={s.balanceLabel}>Saldo disponível</Text>
            <Text style={s.balanceValue}>€{balance.toFixed(2)}</Text>
          </View>
          {freebetBalance > 0 && (
            <View style={s.freebetBadge}>
              <Text style={s.freebetLabel}>FREEBET</Text>
              <Text style={s.freebetValue}>€{freebetBalance.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* ── Depositar / Levantar action row ── */}
        <View style={s.actionRow}>
          <Pressable
            style={({ pressed }) => [s.actionBtn, {
              backgroundColor: showDeposit ? colors.primary : colors.primary + "15",
              borderColor: colors.primary,
              opacity: pressed ? 0.85 : 1,
            }]}
            onPress={() => { setShowDeposit((v) => !v); setShowWithdraw(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="add-circle-outline" size={18} color={showDeposit ? colors.primaryForeground : colors.primary} />
            <Text style={[s.actionBtnText, { color: showDeposit ? colors.primaryForeground : colors.primary }]}>Depositar</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.actionBtn, {
              backgroundColor: showWithdraw ? "#7c3aed" : "#7c3aed15",
              borderColor: "#7c3aed",
              opacity: pressed ? 0.85 : 1,
            }]}
            onPress={() => { setShowWithdraw((v) => !v); setShowDeposit(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="arrow-up-circle-outline" size={18} color={showWithdraw ? "#ffffff" : "#a78bfa"} />
            <Text style={[s.actionBtnText, { color: showWithdraw ? "#ffffff" : "#a78bfa" }]}>Levantar</Text>
          </Pressable>
        </View>

        {/* ── Depositar accordion ── */}
        {showDeposit && (
          <SectionCard>
            <View style={s.accordionBody}>
              <View style={s.amountRow}>
                {depositQuickAmounts.map((amt) => (
                  <Pressable
                    key={amt}
                    style={({ pressed }) => [
                      s.amountBtn,
                      depositAmount === String(amt) && { backgroundColor: colors.primary, borderColor: colors.primary },
                      { opacity: pressed ? 0.8 : 1 },
                    ]}
                    onPress={() => { setDepositAmount(String(amt)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Text style={[s.amountBtnText, depositAmount === String(amt) && { color: colors.primaryForeground }]}>
                      €{amt}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={s.input}
                value={depositAmount}
                onChangeText={setDepositAmount}
                keyboardType="numeric"
                placeholder="€ Outro valor"
                placeholderTextColor={colors.mutedForeground}
              />
              <Pressable
                style={({ pressed }) => [s.primaryBtn, { opacity: pressed || depositLoading ? 0.8 : 1 }]}
                onPress={handleDeposit}
                disabled={depositLoading}
              >
                {depositLoading ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={s.primaryBtnText}>Confirmar depósito</Text>
                )}
              </Pressable>
            </View>
          </SectionCard>
        )}

        {/* ── Levantar accordion ── */}
        {showWithdraw && (
          <SectionCard>
            <View style={s.accordionBody}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 18 }}>
                Mínimo €20 • Processado em 1–3 dias úteis • Requer KYC aprovado
              </Text>
              <View style={s.amountRow}>
                {withdrawQuickAmounts.map((amt) => (
                  <Pressable
                    key={amt}
                    style={({ pressed }) => [
                      s.amountBtn,
                      withdrawAmount === String(amt) && { backgroundColor: "#7c3aed", borderColor: "#7c3aed" },
                      amt > balance && { opacity: 0.35 },
                      { opacity: pressed ? 0.8 : 1 },
                    ]}
                    onPress={() => {
                      if (amt > balance) { Alert.alert("Saldo insuficiente", `O teu saldo é €${balance.toFixed(2)}`); return; }
                      setWithdrawAmount(String(amt));
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={[s.amountBtnText, withdrawAmount === String(amt) && { color: "#ffffff" }]}>€{amt}</Text>
                  </Pressable>
                ))}
              </View>

              <View>
                <Text style={s.inputLabel}>Valor a levantar</Text>
                <TextInput style={s.input} value={withdrawAmount} onChangeText={setWithdrawAmount} keyboardType="numeric" placeholder="€ Valor" placeholderTextColor={colors.mutedForeground} />
              </View>
              <View>
                <Text style={s.inputLabel}>IBAN</Text>
                <TextInput style={s.input} value={withdrawIban} onChangeText={setWithdrawIban} placeholder="PT50 0002 0123 4567 8901 2345 6" placeholderTextColor={colors.mutedForeground} autoCapitalize="characters" />
              </View>
              <View>
                <Text style={s.inputLabel}>Nome do titular</Text>
                <TextInput style={s.input} value={withdrawName} onChangeText={setWithdrawName} placeholder="Nome completo" placeholderTextColor={colors.mutedForeground} />
              </View>
              <View>
                <Text style={s.inputLabel}>NIF</Text>
                <TextInput style={s.input} value={withdrawNif} onChangeText={setWithdrawNif} placeholder="123456789" placeholderTextColor={colors.mutedForeground} keyboardType="numeric" maxLength={9} />
              </View>
              <Pressable
                style={({ pressed }) => [s.primaryBtn, { backgroundColor: "#7c3aed", opacity: pressed || withdrawLoading ? 0.8 : 1 }]}
                onPress={handleWithdraw}
                disabled={withdrawLoading}
              >
                {withdrawLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="arrow-up-circle-outline" size={18} color="#ffffff" />
                    <Text style={[s.primaryBtnText, { color: "#ffffff" }]}>Solicitar levantamento</Text>
                  </>
                )}
              </Pressable>
            </View>
          </SectionCard>
        )}

        {/* ── Conta ── */}
        <SectionCard>
          <MenuItem
            icon="person-outline"
            label="Dados pessoais"
            subtitle={`${user.name} • ${user.email}`}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setModalDados(true); }}
          />
          <MenuItem
            icon="card-outline"
            label="Métodos de pagamento"
            subtitle="Multibanco, MB WAY, Cartão"
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setModalPagamentos(true); }}
          />
          <MenuItem
            icon="shield-checkmark-outline"
            label="Verificação KYC"
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setModalKyc(true); }}
            rightEl={
              <View style={[s.kycStatusBadge, { backgroundColor: kycBadgeColor + "22" }]}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: kycBadgeColor }}>{kycBadgeLabel}</Text>
              </View>
            }
          />
          {biometricAvailable && (
            <MenuItem
              icon="scan-outline"
              label="Desbloqueio por Face"
              subtitle={isBiometricEnabled ? "Ativo — abre automaticamente" : "Desativado"}
              last
              rightEl={
                <Switch
                  value={isBiometricEnabled}
                  onValueChange={async (val) => {
                    if (val) {
                      const result = await LocalAuthentication.authenticateAsync({
                        promptMessage: "Confirma a tua face para ativar",
                        fallbackLabel: "Cancelar",
                      });
                      if (result.success) {
                        await enableBiometric();
                        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        Alert.alert("Face ativada", "O desbloqueio por face está ativo.");
                      }
                    } else {
                      await disableBiometric();
                      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }}
                  trackColor={{ false: colors.border, true: colors.primary + "60" }}
                  thumbColor={isBiometricEnabled ? colors.primary : colors.mutedForeground}
                />
              }
            />
          )}
        </SectionCard>

        {/* ── Logout ── */}
        <Pressable
          style={({ pressed }) => [s.logoutBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={() => {
            Alert.alert("Terminar sessão", "Tens a certeza que queres sair?", [
              { text: "Cancelar", style: "cancel" },
              { text: "Sair", style: "destructive", onPress: async () => { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); logout(); } },
            ]);
          }}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.destructive} />
          <Text style={s.logoutText}>Terminar Sessão</Text>
        </Pressable>
      </ScrollView>

      {/* ── Modal: Dados pessoais ── */}
      <Modal visible={modalDados} transparent animationType="slide" onRequestClose={() => setModalDados(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setModalDados(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <Pressable>
              <View style={s.modalSheet}>
                <View style={s.modalHandle} />
                <Text style={s.modalTitle}>Dados pessoais</Text>
                <View style={[s.modalBody, { paddingBottom: 20 }]}>
                  {[
                    { label: "Nome", value: user.name },
                    { label: "Email", value: user.email },
                    { label: "ID", value: memberId },
                    { label: "NIF", value: user.nif ?? "Não definido" },
                    { label: "IBAN", value: user.withdrawalIban ? user.withdrawalIban.slice(0, 8) + "..." : "Não definido" },
                  ].map((row) => (
                    <View key={row.label} style={s.modalRow}>
                      <Text style={s.modalRowLabel}>{row.label}</Text>
                      <Text style={s.modalRowValue} numberOfLines={1}>{row.value}</Text>
                    </View>
                  ))}
                  <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 8, lineHeight: 16 }}>
                    Para alterar dados pessoais (nome, email, password), utiliza a versão web em bet62.pt ou contacta o suporte.
                  </Text>
                  <Pressable
                    style={({ pressed }) => [s.primaryBtn, { marginTop: 8, opacity: pressed ? 0.8 : 1 }]}
                    onPress={() => setModalDados(false)}
                  >
                    <Text style={s.primaryBtnText}>Fechar</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ── Modal: Métodos de pagamento ── */}
      <Modal visible={modalPagamentos} transparent animationType="slide" onRequestClose={() => setModalPagamentos(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setModalPagamentos(false)}>
          <Pressable>
            <View style={s.modalSheet}>
              <View style={s.modalHandle} />
              <Text style={s.modalTitle}>Métodos de pagamento</Text>
              <View style={[s.modalBody, { paddingBottom: 20 }]}>
                {[
                  { icon: "business-outline" as IoniconsName, label: "Multibanco", desc: "Referência gerada instantaneamente. ATM e homebanking." },
                  { icon: "phone-portrait-outline" as IoniconsName, label: "MB WAY", desc: "Confirmação na app MB WAY. Saldo disponível em segundos." },
                  { icon: "card-outline" as IoniconsName, label: "Cartão de crédito/débito", desc: "Visa e Mastercard com autenticação 3D Secure." },
                ].map((m) => (
                  <View key={m.label} style={{ flexDirection: "row", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={m.icon} size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{m.label}</Text>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>{m.desc}</Text>
                    </View>
                  </View>
                ))}
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 8, lineHeight: 16 }}>
                  Depósito mínimo: €10 • Máximo: €5.000 por operação
                </Text>
                <Pressable style={({ pressed }) => [s.primaryBtn, { opacity: pressed ? 0.8 : 1 }]} onPress={() => setModalPagamentos(false)}>
                  <Text style={s.primaryBtnText}>Fechar</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal: KYC ── */}
      <Modal visible={modalKyc} transparent animationType="slide" onRequestClose={() => setModalKyc(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setModalKyc(false)}>
          <Pressable>
            <View style={s.modalSheet}>
              <View style={s.modalHandle} />
              <Text style={s.modalTitle}>Verificação KYC</Text>
              <View style={[s.modalBody, { paddingBottom: 20 }]}>
                <View style={[s.kycStatusBadge, { backgroundColor: kycBadgeColor + "22", marginBottom: 8 }]}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: kycBadgeColor }}>Estado: {kycBadgeLabel}</Text>
                </View>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 20, marginBottom: 12 }}>
                  A verificação de identidade é obrigatória para levantar fundos e aumentar limites. O processo demora até 48h úteis.
                </Text>
                {[
                  "Prepara o teu Cartão de Cidadão ou Passaporte (frente e verso)",
                  "Prepara um comprovativo de morada recente (fatura, extrato bancário)",
                  `Envia os documentos para o email com o teu ID de membro: ${memberId}`,
                  "Aguarda a confirmação por email (até 48h úteis)",
                ].map((step, i) => (
                  <View key={i} style={s.kycStep}>
                    <View style={s.kycStepNum}>
                      <Text style={s.kycStepNumText}>{i + 1}</Text>
                    </View>
                    <Text style={s.kycStepText}>{step}</Text>
                  </View>
                ))}
                <Pressable
                  style={({ pressed }) => [s.mailBtn, { opacity: pressed ? 0.8 : 1 }]}
                  onPress={() => {
                    const subject = encodeURIComponent(`KYC Verificação — ${memberId}`);
                    const body = encodeURIComponent(
                      `Olá,\n\nEnvio os meus documentos para verificação de identidade.\n\nID de Membro: ${memberId}\n\nDocumentos em anexo:\n- Cartão de Cidadão ou Passaporte (frente e verso)\n- Comprovativo de morada recente\n\nCom os melhores cumprimentos`
                    );
                    Linking.openURL(`mailto:kyc@bet62.pt?subject=${subject}&body=${body}`);
                  }}
                >
                  <Ionicons name="mail-outline" size={18} color="#ffffff" />
                  <Text style={s.mailBtnText}>Enviar documentos por email</Text>
                </Pressable>
                <Pressable style={({ pressed }) => [s.primaryBtn, { backgroundColor: colors.muted, marginTop: 4, opacity: pressed ? 0.8 : 1 }]} onPress={() => setModalKyc(false)}>
                  <Text style={[s.primaryBtnText, { color: colors.foreground }]}>Fechar</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
