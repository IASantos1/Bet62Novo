import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import {
  Animated,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { DepositModal } from "@/components/DepositModal";

type PromoNotifType = "freebets10" | "freebets20";

const NOTIF_DATA: Record<PromoNotifType, { title: string; msg: string; color: string }> = {
  freebets10: { title: "🎁 FREE BET Desbloqueada!", msg: "€5 em free bets foram adicionados à tua conta.", color: "#8b5cf6" },
  freebets20: { title: "🎁 FREE BET Desbloqueada!", msg: "€10 em free bets foram adicionados à tua conta.", color: "#10b981" },
};

const PROMOS = [
  {
    id: "bonus100",
    badge: "SPORTSBOOK",
    title: "100% BÓNUS\nDE BOAS‑VINDAS",
    subtitle: "ATÉ €500 · ROLLOVER 5×",
    description: "Receba 100% no primeiro depósito e desbloqueie o saldo com rollover progressivo de 5× em apostas qualificadas.",
    image: "https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=800&auto=format&fit=crop",
    highlight: "+100%",
    highlightLabel: "no 1.º depósito",
    badgeColor: "#f59e0b",
    terms: ["Apenas no 1.º depósito", "Rollover 5× sobre depósito + bónus", "Odds mín. 1.5", "Prazo: 30 dias"],
    cta: "ATIVAR BÓNUS",
    openDeposit: true,
  },
  {
    id: "freebets10",
    badge: "FREE BET",
    title: "DEPOSITE €10\nE GANHE €5",
    subtitle: "FREE BETS PARA COMEÇAR",
    description: "Deposite apenas €10 e receba €5 em free bets para explorar as melhores apostas da plataforma.",
    image: "https://images.unsplash.com/photo-1553481187-be93c21490a9?q=80&w=800&auto=format&fit=crop",
    highlight: "€5",
    highlightLabel: "em free bets",
    badgeColor: "#8b5cf6",
    terms: ["Depósito mínimo €10", "Free bets creditadas automaticamente", "Odds mín. 2.50", "Válidas 7 dias"],
    cta: "DEPOSITAR €10",
    openDeposit: true,
  },
  {
    id: "freebets20",
    badge: "FREE BET",
    title: "DEPOSITE €20\nE GANHE €10",
    subtitle: "FREE BETS EXCLUSIVAS",
    description: "Faça o primeiro depósito de €20 e conclua 4 apostas qualificadas para receber €10 em free bets.",
    image: "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?q=80&w=800&auto=format&fit=crop",
    highlight: "€10",
    highlightLabel: "em free bets",
    badgeColor: "#10b981",
    terms: ["Depósito mínimo €20", "4 apostas qualificadas obrigatórias", "Odds mín. 2.00", "Stake mín. €2", "Válidas 7 dias"],
    cta: "DEPOSITAR €20",
    openDeposit: true,
  },
  {
    id: "cashback",
    badge: "HOT",
    title: "CASHBACK\nSEMANAL",
    subtitle: "10% EM FREE BETS",
    description: "Recupere parte das perdas líquidas em apostas esportivas toda semana. Máximo de €100 por utilizador.",
    image: "https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=800&auto=format&fit=crop",
    highlight: "10%",
    highlightLabel: "das perdas",
    badgeColor: "#06b6d4",
    terms: ["Calculado semanalmente", "Máximo €100 por utilizador", "Pago em saldo bónus", "1× rollover para saque"],
    cta: "VER DETALHES",
    openDeposit: false,
  },
  {
    id: "superodds",
    badge: "BOOST",
    title: "SUPER ODDS",
    subtitle: "BOOSTS ESPORTIVOS DIÁRIOS",
    description: "Odds turbinadas diariamente nos principais jogos. Maximize os ganhos nos eventos em destaque.",
    image: "https://images.unsplash.com/photo-1505250469679-203ad9ced0cb?q=80&w=800&auto=format&fit=crop",
    highlight: "+25%",
    highlightLabel: "nas odds",
    badgeColor: "#ef4444",
    terms: ["Apenas em eventos selecionados", "Stake máx. promocional: €50", "Boosts atualizam às 10h diariamente"],
    cta: "VER JOGOS COM BOOST",
    openDeposit: false,
  },
];

export default function PromosScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [depositVisible, setDepositVisible] = useState(false);
  const [notif, setNotif] = useState<PromoNotifType | null>(null);
  const notifAnim = useRef(new Animated.Value(0)).current;

  const topPad = insets.top;
  const bottomPad = 80 + insets.bottom;

  function showNotif(type: PromoNotifType) {
    setNotif(type);
    Animated.sequence([
      Animated.timing(notifAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(3500),
      Animated.timing(notifAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start(() => setNotif(null));
  }

  function handlePromoNotif(type: PromoNotifType) {
    setDepositVisible(false);
    setTimeout(() => showNotif(type), 400);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 12, paddingBottom: bottomPad, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground }}>Promoções</Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 }}>
            Bónus e ofertas exclusivas para apostadores Bet62
          </Text>
        </View>

        {PROMOS.map((promo) => (
          <View key={promo.id} style={[s.card, { borderColor: promo.badgeColor + "40" }]}>
            <ImageBackground
              source={{ uri: promo.image }}
              style={{ minHeight: 230 }}
              imageStyle={{ borderRadius: 18, resizeMode: "cover" }}
            >
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(5,8,22,0.72)", borderRadius: 18 }]} />
              <View style={s.cardInner}>
                <View style={s.badgeRow}>
                  <View style={[s.badge, { backgroundColor: promo.badgeColor + "30", borderColor: promo.badgeColor + "70" }]}>
                    <Text style={[s.badgeText, { color: promo.badgeColor }]}>{promo.badge}</Text>
                  </View>
                </View>

                <View style={s.titleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>{promo.title}</Text>
                    <Text style={s.subtitle}>{promo.subtitle}</Text>
                  </View>
                  <View style={[s.highlightBox, { borderColor: promo.badgeColor + "50" }]}>
                    <Text style={s.highlightValue}>{promo.highlight}</Text>
                    <Text style={[s.highlightLabel, { color: promo.badgeColor }]}>{promo.highlightLabel}</Text>
                  </View>
                </View>

                <Text style={s.description}>{promo.description}</Text>

                <View style={s.termsRow}>
                  {promo.terms.map((term, i) => (
                    <View key={i} style={s.termChip}>
                      <Text style={s.termText}>{term}</Text>
                    </View>
                  ))}
                </View>

                <Pressable
                  style={({ pressed }) => [s.ctaBtn, { opacity: pressed ? 0.87 : 1 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    if (promo.openDeposit) setDepositVisible(true);
                  }}
                >
                  <Text style={s.ctaText}>
                    {!user && promo.openDeposit ? "ENTRAR PARA ATIVAR" : promo.cta}
                  </Text>
                </Pressable>
              </View>
            </ImageBackground>
          </View>
        ))}

        <View style={[s.tcCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.tcTitle, { color: colors.foreground }]}>TERMOS & CONDIÇÕES</Text>
          <Text style={[s.tcText, { color: colors.mutedForeground }]}>
            {"• Promoções válidas apenas para utilizadores registados na plataforma.\n"}
            {"• Apenas apostas esportivas qualificadas contam para rollover e missões.\n"}
            {"• Free bets não possuem valor de stake retornável.\n"}
            {"• A plataforma reserva-se o direito de alterar ou cancelar promoções em caso de abuso.\n"}
            {"• Todas as promoções estão sujeitas à política de jogo responsável.\n"}
            {"• Última atualização: 07 Maio 2026."}
          </Text>
        </View>
      </ScrollView>

      {notif !== null && (
        <Animated.View style={[
          s.notifBanner,
          { bottom: bottomPad, backgroundColor: NOTIF_DATA[notif].color },
          {
            opacity: notifAnim,
            transform: [{ translateY: notifAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
          },
        ]}>
          <View style={{ flex: 1 }}>
            <Text style={s.notifTitle}>{NOTIF_DATA[notif].title}</Text>
            <Text style={s.notifMsg}>{NOTIF_DATA[notif].msg}</Text>
          </View>
          <Ionicons name="checkmark-circle" size={30} color="rgba(255,255,255,0.9)" />
        </Animated.View>
      )}

      <DepositModal
        visible={depositVisible}
        onClose={() => setDepositVisible(false)}
        onPromoNotif={handlePromoNotif}
      />
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  cardInner: { padding: 20 },
  badgeRow: { flexDirection: "row", marginBottom: 12 },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 8 },
  title: { fontSize: 21, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 27 },
  subtitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.78)", marginTop: 3 },
  highlightBox: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    alignItems: "center",
    minWidth: 72,
  },
  highlightValue: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 30 },
  highlightLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", marginTop: 2, textAlign: "center" },
  description: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.70)", lineHeight: 19, marginBottom: 12 },
  termsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  termChip: { backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  termText: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.68)" },
  ctaBtn: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: 0.6 },
  tcCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 8 },
  tcTitle: { fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 10, letterSpacing: 0.5 },
  tcText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 19 },
  notifBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  notifTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  notifMsg: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.85)", marginTop: 2 },
});
