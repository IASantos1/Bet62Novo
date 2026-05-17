import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { type ComponentProps, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth, API_BASE } from "@/context/AuthContext";
import { DepositModal } from "@/components/DepositModal";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

function AccordionSection({
  icon, label, children, defaultOpen,
}: {
  icon: IoniconsName; label: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10, overflow: "hidden" }}>
      <Pressable
        style={({ pressed }) => ({
          flexDirection: "row" as const, alignItems: "center" as const,
          paddingHorizontal: 16, paddingVertical: 15, gap: 12, opacity: pressed ? 0.75 : 1,
        })}
        onPress={() => { setOpen(v => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <Ionicons name={icon} size={20} color={colors.mutedForeground} />
        <Text style={{ flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground }}>{label}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
      </Pressable>
      {open && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: 16, gap: 12 }}>
          {children}
        </View>
      )}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row" as const, alignItems: "center" as const, paddingVertical: 6 }}>
      <Text style={{ width: 110, fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token, logout, refreshUser, isBiometricEnabled, enableBiometric, disableBiometric } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 100 : 80 + insets.bottom;

  const [depositModalVisible, setDepositModalVisible] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [modalKyc, setModalKyc] = useState(false);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawIban, setWithdrawIban] = useState("");
  const [withdrawName, setWithdrawName] = useState("");
  const [withdrawNif, setWithdrawNif] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);

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
      Alert.alert("Pedido enviado", `O teu pedido de levantamento de €${amount.toFixed(2)} foi registado e será processado em 1-3 dias úteis.`);
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha no pedido de levantamento.");
    } finally {
      setWithdrawLoading(false);
    }
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 8, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: bottomPad },
    balanceCard: { backgroundColor: colors.card, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
    balanceLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 4 },
    balanceValue: { fontSize: 32, fontFamily: "Inter_700Bold", color: colors.foreground },
    freebetBadge: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, backgroundColor: "#7c3aed22", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#7c3aed44", marginTop: 8, alignSelf: "flex-start" as const },
    actionRow: { flexDirection: "row" as const, gap: 10, marginBottom: 12 },
    depositBtn: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 6, borderRadius: 10, paddingVertical: 14, backgroundColor: colors.primary },
    withdrawBtn: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 6, borderRadius: 10, paddingVertical: 14, borderWidth: 1.5, borderColor: "#7c3aed80", backgroundColor: "#7c3aed10" },
    actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    withdrawBody: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12, padding: 16, gap: 12 },
    amountRow: { flexDirection: "row" as const, gap: 8 },
    amountBtn: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted, padding: 10, alignItems: "center" as const },
    amountBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    inputLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 4 },
    input: { backgroundColor: colors.muted, borderRadius: 10, padding: 13, fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground, borderWidth: 1, borderColor: colors.border },
    primaryBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: "center" as const, flexDirection: "row" as const, justifyContent: "center" as const, gap: 8 },
    primaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    logoutBtn: { backgroundColor: colors.destructive + "15", borderRadius: 12, padding: 14, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 8, marginTop: 8, borderWidth: 1, borderColor: colors.destructive + "30" },
    logoutText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.destructive },
    loginContainer: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, gap: 12, paddingTop: 80 },
    loginText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    loginBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
    loginBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    kycBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" as const },
    kycStep: { flexDirection: "row" as const, gap: 10, paddingVertical: 4 },
    kycStepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: "center" as const, justifyContent: "center" as const },
    kycStepNumText: { fontSize: 12, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    kycStepText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, flex: 1, lineHeight: 20 },
    modalOverlay: { flex: 1, backgroundColor: "#00000080", justifyContent: "flex-end" as const },
    modalSheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 16 },
    modalHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center" as const, marginTop: 10, marginBottom: 6 },
    modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground, paddingHorizontal: 16, paddingVertical: 12 },
    modalBody: { paddingHorizontal: 16, gap: 12 },
    mailBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 13, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 8, marginTop: 4 },
    mailBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
    infoText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 20 },
  });

  if (!user) {
    return (
      <View style={s.container}>
        <View style={s.header}><Text style={s.title}>Perfil</Text></View>
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

  const balance = parseFloat(user.balance);
  const freebetBalance = parseFloat(user.freebetBalance ?? "0");
  const memberId = `BET${String(user.id).padStart(6, "0")}`;
  const kycStatus = user.kycStatus ?? "not_submitted";
  const kycBadgeColor = kycStatus === "approved" ? "#22c55e" : kycStatus === "pending" ? "#f59e0b" : kycStatus === "rejected" ? "#ef4444" : colors.mutedForeground;
  const kycBadgeLabel = kycStatus === "approved" ? "✓ Verificado" : kycStatus === "pending" ? "⏳ Em análise" : kycStatus === "rejected" ? "✗ Rejeitado" : "Não submetido";
  const withdrawAmounts = [20, 50, 100, 200];

  return (
    <View style={s.container}>
      <View style={s.header}><Text style={s.title}>Perfil</Text></View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Saldo ── */}
        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>Saldo disponível</Text>
          <Text style={s.balanceValue}>€{balance.toFixed(2)}</Text>
          {freebetBalance > 0 && (
            <View style={s.freebetBadge}>
              <Ionicons name="gift-outline" size={14} color="#a78bfa" />
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#a78bfa" }}>Freebet €{freebetBalance.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* ── Depositar / Levantar ── */}
        <View style={s.actionRow}>
          <Pressable
            style={({ pressed }) => [s.depositBtn, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDepositModalVisible(true); setShowWithdraw(false); }}
          >
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={[s.actionBtnText, { color: "#fff" }]}>Depositar</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.withdrawBtn, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowWithdraw(v => !v); }}
          >
            <Ionicons name="arrow-up-circle-outline" size={18} color="#a78bfa" />
            <Text style={[s.actionBtnText, { color: "#a78bfa" }]}>Levantar</Text>
          </Pressable>
        </View>

        {/* ── Levantar form ── */}
        {showWithdraw && (
          <View style={s.withdrawBody}>
            <Text style={s.infoText}>Mínimo €20 • Processado em 1–3 dias úteis • Requer KYC aprovado</Text>
            <View style={s.amountRow}>
              {withdrawAmounts.map((amt) => (
                <Pressable
                  key={amt}
                  style={({ pressed }) => [s.amountBtn, withdrawAmount === String(amt) && { backgroundColor: "#7c3aed", borderColor: "#7c3aed" }, amt > balance && { opacity: 0.35 }, { opacity: pressed ? 0.8 : 1 }]}
                  onPress={() => { if (amt > balance) { Alert.alert("Saldo insuficiente", `O teu saldo é €${balance.toFixed(2)}`); return; } setWithdrawAmount(String(amt)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Text style={[s.amountBtnText, withdrawAmount === String(amt) && { color: "#fff" }]}>€{amt}</Text>
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
              {withdrawLoading ? <ActivityIndicator color="#fff" /> : <><Ionicons name="arrow-up-circle-outline" size={18} color="#fff" /><Text style={[s.primaryBtnText, { color: "#fff" }]}>Solicitar levantamento</Text></>}
            </Pressable>
          </View>
        )}

        {/* ── Informações Pessoais ── */}
        <AccordionSection icon="person-outline" label="Informações Pessoais">
          <InfoRow label="Nome" value={user.name} />
          <View style={s.divider} />
          <InfoRow label="Email" value={user.email} />
          <View style={s.divider} />
          <InfoRow label="ID de Membro" value={memberId} />
          <View style={s.divider} />
          <InfoRow label="NIF" value={user.nif ?? "Não definido"} />
          <View style={s.divider} />
          <InfoRow label="Saldo" value={`€${balance.toFixed(2)}`} />
          <Text style={[s.infoText, { marginTop: 4 }]}>Para alterar dados pessoais, utiliza a versão web em bet62.pt ou contacta o suporte.</Text>
        </AccordionSection>

        {/* ── Verificação de Identidade ── */}
        <AccordionSection icon="shield-checkmark-outline" label="Verificação de Identidade">
          <View style={[s.kycBadge, { backgroundColor: kycBadgeColor + "22" }]}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: kycBadgeColor }}>Estado: {kycBadgeLabel}</Text>
          </View>
          <Text style={s.infoText}>A verificação KYC é obrigatória para levantamentos e para aumentar limites. Processo em até 48h úteis.</Text>
          {[
            "Prepara o teu Cartão de Cidadão ou Passaporte (frente e verso)",
            "Prepara um comprovativo de morada recente (fatura ou extrato bancário)",
            `Envia para o email com o teu ID: ${memberId}`,
            "Aguarda confirmação por email (até 48h úteis)",
          ].map((step, i) => (
            <View key={i} style={s.kycStep}>
              <View style={s.kycStepNum}><Text style={s.kycStepNumText}>{i + 1}</Text></View>
              <Text style={s.kycStepText}>{step}</Text>
            </View>
          ))}
          <Pressable
            style={({ pressed }) => [s.mailBtn, { opacity: pressed ? 0.8 : 1 }]}
            onPress={() => {
              const subject = encodeURIComponent(`KYC Verificação — ${memberId}`);
              const body = encodeURIComponent(`Olá,\n\nEnvio os meus documentos para verificação.\n\nID de Membro: ${memberId}\n\nDocumentos em anexo.\n\nCom os melhores cumprimentos`);
              Linking.openURL(`mailto:kyc@bet62.pt?subject=${subject}&body=${body}`);
            }}
          >
            <Ionicons name="mail-outline" size={18} color="#fff" />
            <Text style={s.mailBtnText}>Enviar documentos por email</Text>
          </Pressable>
        </AccordionSection>

        {/* ── Definições de Segurança ── */}
        <AccordionSection icon="key-outline" label="Definições de Segurança">
          {biometricAvailable && (
            <View style={{ flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Desbloqueio por Face/Digital</Text>
                <Text style={[s.infoText, { fontSize: 11 }]}>{isBiometricEnabled ? "Ativo — abre automaticamente" : "Desativado"}</Text>
              </View>
              <Switch
                value={isBiometricEnabled}
                onValueChange={async (val) => {
                  if (val) {
                    const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Confirma para ativar", fallbackLabel: "Cancelar" });
                    if (result.success) { await enableBiometric(); await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Alert.alert("Ativado", "Desbloqueio biométrico ativo."); }
                  } else { await disableBiometric(); await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
                }}
                trackColor={{ false: colors.border, true: colors.primary + "60" }}
                thumbColor={isBiometricEnabled ? colors.primary : colors.mutedForeground}
              />
            </View>
          )}
          <View style={s.divider} />
          <Text style={s.infoText}>Para alterar a palavra-passe acede à versão web em bet62.pt → Perfil → Definições de Segurança.</Text>
          <Pressable
            style={({ pressed }) => [s.primaryBtn, { backgroundColor: colors.muted, opacity: pressed ? 0.8 : 1 }]}
            onPress={() => Linking.openURL("https://bet62.pt")}
          >
            <Ionicons name="open-outline" size={16} color={colors.foreground} />
            <Text style={[s.primaryBtnText, { color: colors.foreground }]}>Ir para bet62.pt</Text>
          </Pressable>
        </AccordionSection>

        {/* ── Preferências de Conta ── */}
        <AccordionSection icon="settings-outline" label="Preferências de Conta">
          <InfoRow label="Odds" value="Decimal (ex: 2.50)" />
          <View style={s.divider} />
          <InfoRow label="Idioma" value="Português (PT)" />
          <View style={s.divider} />
          <InfoRow label="Moeda" value="Euro (€)" />
          <View style={s.divider} />
          <InfoRow label="Timezone" value="Europe/Lisbon" />
          <Text style={[s.infoText, { marginTop: 4 }]}>Preferências adicionais disponíveis na versão web.</Text>
        </AccordionSection>

        {/* ── Limites e Autoexclusão ── */}
        <AccordionSection icon="warning-outline" label="Limites e Autoexclusão">
          <Text style={s.infoText}>Define limites de depósito para jogar de forma responsável. A autoexclusão é permanente por um período mínimo de 6 meses.</Text>
          {[
            { label: "Limite diário", value: "Sem limite" },
            { label: "Limite semanal", value: "Sem limite" },
            { label: "Limite mensal", value: "Sem limite" },
          ].map((row) => (
            <InfoRow key={row.label} label={row.label} value={row.value} />
          ))}
          <Pressable
            style={({ pressed }) => [s.primaryBtn, { backgroundColor: "#ef444415", borderWidth: 1, borderColor: "#ef444430", opacity: pressed ? 0.8 : 1 }]}
            onPress={() => Alert.alert("Autoexclusão", "Para solicitar autoexclusão, envia um email para suporte@bet62.pt com o assunto 'Autoexclusão'.", [{ text: "OK" }, { text: "Enviar email", onPress: () => Linking.openURL("mailto:suporte@bet62.pt?subject=Autoexclus%C3%A3o") }])}
          >
            <Ionicons name="ban-outline" size={16} color="#ef4444" />
            <Text style={[s.primaryBtnText, { color: "#ef4444" }]}>Solicitar Autoexclusão</Text>
          </Pressable>
        </AccordionSection>

        {/* ── Histórico de Atividade ── */}
        <AccordionSection icon="pulse-outline" label="Histórico de Atividade">
          <InfoRow label="ID de Membro" value={memberId} />
          <View style={s.divider} />
          <InfoRow label="Total apostado" value="Ver em Apostas" />
          <Text style={[s.infoText, { marginTop: 4 }]}>Histórico completo disponível no separador Boletim.</Text>
        </AccordionSection>

        {/* ── Dados Bancários ── */}
        <AccordionSection icon="card-outline" label="Dados Bancários">
          <InfoRow label="IBAN" value={user.withdrawalIban ? user.withdrawalIban.slice(0, 8) + " ****" : "Não definido"} />
          <View style={s.divider} />
          <InfoRow label="Titular" value={user.withdrawalName ?? "Não definido"} />
          <View style={s.divider} />
          <InfoRow label="NIF" value={user.nif ?? "Não definido"} />
          <Text style={[s.infoText, { marginTop: 4 }]}>O IBAN é utilizado exclusivamente para levantamentos. Atualiza através do formulário de Levantar acima.</Text>
        </AccordionSection>

        {/* ── Métodos de Pagamento ── */}
        <AccordionSection icon="business-outline" label="Métodos de Pagamento">
          {[
            { icon: "business-outline" as IoniconsName, label: "Multibanco", desc: "Referência gerada instantaneamente. Paga em qualquer ATM ou homebanking." },
            { icon: "phone-portrait-outline" as IoniconsName, label: "MB WAY", desc: "Aprovação via app MB WAY. Saldo disponível em segundos." },
            { icon: "card-outline" as IoniconsName, label: "Cartão de crédito/débito", desc: "Visa e Mastercard com autenticação 3D Secure." },
          ].map((m) => (
            <View key={m.label} style={{ flexDirection: "row" as const, gap: 12, paddingVertical: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: colors.primary + "18", alignItems: "center" as const, justifyContent: "center" as const }}>
                <Ionicons name={m.icon} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{m.label}</Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 }}>{m.desc}</Text>
              </View>
            </View>
          ))}
          <Pressable style={({ pressed }) => [s.primaryBtn, { opacity: pressed ? 0.8 : 1 }]} onPress={() => { setDepositModalVisible(true); }}>
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={s.primaryBtnText}>Efetuar Depósito</Text>
          </Pressable>
        </AccordionSection>

        {/* ── Notificações ── */}
        <AccordionSection icon="notifications-outline" label="Notificações">
          {[
            { label: "Apostas liquidadas", desc: "Notificação quando uma aposta for liquidada" },
            { label: "Promoções", desc: "Ofertas especiais e freebets" },
            { label: "Resultados ao vivo", desc: "Golos e eventos ao vivo dos teus jogos" },
          ].map((n) => (
            <View key={n.label} style={{ flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, paddingVertical: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>{n.label}</Text>
                <Text style={[s.infoText, { fontSize: 11 }]}>{n.desc}</Text>
              </View>
              <Switch value={true} trackColor={{ false: colors.border, true: colors.primary + "60" }} thumbColor={colors.primary} />
            </View>
          ))}
        </AccordionSection>

        {/* ── Sessões Ativas ── */}
        <AccordionSection icon="phone-portrait-outline" label="Sessões Ativas">
          <View style={{ flexDirection: "row" as const, gap: 12, alignItems: "center" as const }}>
            <View style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: colors.primary + "18", alignItems: "center" as const, justifyContent: "center" as const }}>
              <Ionicons name="phone-portrait-outline" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Dispositivo atual</Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>App móvel • Sessão ativa agora</Text>
            </View>
            <View style={{ backgroundColor: "#22c55e22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#22c55e" }}>ATIVA</Text>
            </View>
          </View>
          <Text style={[s.infoText, { marginTop: 4 }]}>Para terminar sessões noutros dispositivos, acede à versão web.</Text>
        </AccordionSection>

        {/* ── Suporte e Assistência ── */}
        <AccordionSection icon="help-circle-outline" label="Suporte e Assistência">
          <Text style={s.infoText}>A nossa equipa está disponível 24/7 para te ajudar.</Text>
          <Pressable style={({ pressed }) => [s.primaryBtn, { opacity: pressed ? 0.8 : 1 }]} onPress={() => Linking.openURL("mailto:suporte@bet62.pt")}>
            <Ionicons name="mail-outline" size={18} color="#fff" />
            <Text style={s.primaryBtnText}>Email: suporte@bet62.pt</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [s.primaryBtn, { backgroundColor: "#25D36615", borderWidth: 1, borderColor: "#25D36630", opacity: pressed ? 0.8 : 1 }]} onPress={() => Linking.openURL("https://wa.me/351910000000")}>
            <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            <Text style={[s.primaryBtnText, { color: "#25D366" }]}>WhatsApp / Chat</Text>
          </Pressable>
        </AccordionSection>

        {/* ── Configurações de Privacidade ── */}
        <AccordionSection icon="eye-outline" label="Configurações de Privacidade">
          <Text style={s.infoText}>Os teus dados são protegidos de acordo com o RGPD e a legislação portuguesa de jogos online.</Text>
          {[
            { label: "Política de Privacidade", url: "https://bet62.pt/privacidade" },
            { label: "Termos e Condições", url: "https://bet62.pt/termos" },
            { label: "Política de Cookies", url: "https://bet62.pt/cookies" },
            { label: "Jogo Responsável", url: "https://bet62.pt/jogo-responsavel" },
          ].map((link) => (
            <Pressable
              key={link.label}
              style={({ pressed }) => ({ flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}
              onPress={() => Linking.openURL(link.url)}
            >
              <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>{link.label}</Text>
              <Ionicons name="open-outline" size={14} color={colors.mutedForeground} />
            </Pressable>
          ))}
          <Pressable
            style={({ pressed }) => [s.primaryBtn, { backgroundColor: "#ef444415", borderWidth: 1, borderColor: "#ef444430", opacity: pressed ? 0.8 : 1 }]}
            onPress={() => Alert.alert("Eliminação de conta", "Para solicitar a eliminação dos teus dados, envia um email para privacidade@bet62.pt.", [{ text: "OK" }, { text: "Enviar email", onPress: () => Linking.openURL("mailto:privacidade@bet62.pt?subject=Elimina%C3%A7%C3%A3o%20de%20dados") }])}
          >
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
            <Text style={[s.primaryBtnText, { color: "#ef4444" }]}>Solicitar eliminação de dados</Text>
          </Pressable>
        </AccordionSection>

        {/* ── Terminar Sessão ── */}
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

      {/* ── Deposit Modal (MBWay / Multibanco / Cartão) ── */}
      <DepositModal visible={depositModalVisible} onClose={() => setDepositModalVisible(false)} />

      {/* ── KYC Modal ── */}
      <Modal visible={modalKyc} transparent animationType="slide" onRequestClose={() => setModalKyc(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setModalKyc(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <Pressable>
              <View style={s.modalSheet}>
                <View style={s.modalHandle} />
                <Text style={s.modalTitle}>Verificação KYC</Text>
                <View style={[s.modalBody, { paddingBottom: 20 }]}>
                  <View style={[s.kycBadge, { backgroundColor: kycBadgeColor + "22", marginBottom: 4 }]}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: kycBadgeColor }}>Estado: {kycBadgeLabel}</Text>
                  </View>
                  <Pressable style={({ pressed }) => [s.mailBtn, { opacity: pressed ? 0.8 : 1 }]} onPress={() => {
                    const subject = encodeURIComponent(`KYC Verificação — ${memberId}`);
                    const body = encodeURIComponent(`Olá,\n\nEnvio os meus documentos para verificação.\n\nID de Membro: ${memberId}\n\nCom os melhores cumprimentos`);
                    Linking.openURL(`mailto:kyc@bet62.pt?subject=${subject}&body=${body}`);
                  }}>
                    <Ionicons name="mail-outline" size={18} color="#fff" />
                    <Text style={s.mailBtnText}>Enviar documentos por email</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [s.primaryBtn, { backgroundColor: colors.muted, marginTop: 4, opacity: pressed ? 0.8 : 1 }]} onPress={() => setModalKyc(false)}>
                    <Text style={[s.primaryBtnText, { color: colors.foreground }]}>Fechar</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}
