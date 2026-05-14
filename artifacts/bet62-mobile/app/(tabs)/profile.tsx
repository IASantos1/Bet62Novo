import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { type ComponentProps, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useAuth } from "@/context/AuthContext";
import { API_BASE } from "@/context/AuthContext";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: IoniconsName; color?: string }) {
  const colors = useColors();
  return (
    <View style={[statCardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name={icon} size={20} color={color ?? colors.primary} />
      <Text style={[statCardStyles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[statCardStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const statCardStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
  },
  value: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
});

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token, logout, refreshUser } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 100 : 80 + insets.bottom;

  const [depositAmount, setDepositAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);

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
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { fontSize: 28, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    userRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
    userInfo: { flex: 1 },
    userName: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    userEmail: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    statsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
    card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
    cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 12 },
    amountRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
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
    input: {
      backgroundColor: colors.input,
      borderRadius: 10,
      padding: 14,
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 12,
      textAlign: "center",
    },
    depositBtn: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      padding: 14,
      alignItems: "center",
    },
    depositBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    menuItemText: { fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground, flex: 1 },
    logoutBtn: {
      backgroundColor: colors.destructive + "15",
      borderRadius: 12,
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 20,
      borderWidth: 1,
      borderColor: colors.destructive + "30",
    },
    logoutText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.destructive },
    loginContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
    loginText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    loginBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
    loginBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
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

  const quickAmounts = [10, 25, 50, 100];

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Perfil</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.userRow}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View style={s.userInfo}>
            <Text style={s.userName}>{user.name}</Text>
            <Text style={s.userEmail}>{user.email}</Text>
          </View>
        </View>

        <View style={s.statsRow}>
          <StatCard label="Saldo" value={`€${balance.toFixed(2)}`} icon="wallet-outline" />
          {freebetBalance > 0 && (
            <StatCard
              label="Freebets"
              value={`€${freebetBalance.toFixed(2)}`}
              icon="gift-outline"
              color={colors.success}
            />
          )}
        </View>

        <View style={s.card}>
          <Pressable onPress={() => setShowDeposit((v) => !v)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={s.cardTitle}>Depositar</Text>
            <Ionicons name={showDeposit ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
          </Pressable>

          {showDeposit && (
            <View style={{ marginTop: 12 }}>
              <View style={s.amountRow}>
                {quickAmounts.map((amt) => (
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
                style={({ pressed }) => [s.depositBtn, { opacity: pressed || depositLoading ? 0.8 : 1 }]}
                onPress={handleDeposit}
                disabled={depositLoading}
              >
                {depositLoading ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={s.depositBtnText}>Depositar</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Conta</Text>
          <Pressable style={s.menuItem}>
            <Ionicons name="person-outline" size={20} color={colors.mutedForeground} />
            <Text style={s.menuItemText}>Dados pessoais</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={s.menuItem}>
            <Ionicons name="card-outline" size={20} color={colors.mutedForeground} />
            <Text style={s.menuItemText}>Métodos de pagamento</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={[s.menuItem, { borderBottomWidth: 0 }]}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.mutedForeground} />
            <Text style={s.menuItemText}>Verificação KYC</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [s.logoutBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={() => {
            Alert.alert("Terminar sessão", "Tens a certeza que queres sair?", [
              { text: "Cancelar", style: "cancel" },
              {
                text: "Sair",
                style: "destructive",
                onPress: async () => {
                  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  logout();
                },
              },
            ]);
          }}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.destructive} />
          <Text style={s.logoutText}>Terminar Sessão</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
