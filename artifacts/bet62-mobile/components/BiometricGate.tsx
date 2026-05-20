import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import React, { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, Modal, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";

export function BiometricGate() {
  const { isBiometricLocked, unlockBiometric, failBiometric } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;
  const pulse3 = useRef(new Animated.Value(1)).current;
  const opacity1 = useRef(new Animated.Value(0.7)).current;
  const opacity2 = useRef(new Animated.Value(0.5)).current;
  const opacity3 = useRef(new Animated.Value(0.3)).current;
  const scanLine = useRef(new Animated.Value(0)).current;

  const triggerBiometric = useCallback(async () => {
    try {
      const hasHW = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHW || !enrolled) {
        failBiometric();
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Desbloquear Bet62",
        disableDeviceFallback: true,
        cancelLabel: "Cancelar",
      });
      if (result.success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await unlockBiometric();
        queryClient.refetchQueries({ type: "active", stale: true });
      } else {
        failBiometric();
      }
    } catch {
      failBiometric();
    }
  }, [unlockBiometric, failBiometric, queryClient]);

  useEffect(() => {
    if (!isBiometricLocked) return;

    const ring = (scale: Animated.Value, opacity: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scale, { toValue: 1.6, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: delay === 0 ? 0.7 : delay === 400 ? 0.5 : 0.3, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );

    const scanAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scanLine, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );

    const a1 = ring(pulse1, opacity1, 0);
    const a2 = ring(pulse2, opacity2, 400);
    const a3 = ring(pulse3, opacity3, 800);

    a1.start(); a2.start(); a3.start(); scanAnim.start();

    const timer = setTimeout(triggerBiometric, 700);
    return () => {
      clearTimeout(timer);
      a1.stop(); a2.stop(); a3.stop(); scanAnim.stop();
    };
  }, [isBiometricLocked, triggerBiometric, pulse1, pulse2, pulse3, opacity1, opacity2, opacity3, scanLine]);

  if (!isBiometricLocked) return null;

  const scanTranslate = scanLine.interpolate({ inputRange: [0, 1], outputRange: [-52, 52] });

  return (
    <Modal visible={isBiometricLocked} transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        <View style={styles.logoRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>62</Text>
          </View>
          <Text style={styles.logoLabel}>Bet62</Text>
        </View>

        <View style={styles.centerContent}>
          <View style={styles.iconWrap}>
            <Animated.View style={[styles.ring, styles.ring1, { transform: [{ scale: pulse1 }], opacity: opacity1 }]} />
            <Animated.View style={[styles.ring, styles.ring2, { transform: [{ scale: pulse2 }], opacity: opacity2 }]} />
            <Animated.View style={[styles.ring, styles.ring3, { transform: [{ scale: pulse3 }], opacity: opacity3 }]} />

            <View style={styles.faceFrame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              <Ionicons name="scan-outline" size={80} color="#d42020" style={{ opacity: 0.15 }} />
              <View style={styles.faceIconWrap}>
                <Ionicons name="person-outline" size={44} color="#ffffff" />
              </View>
              <Animated.View style={[styles.scanBar, { transform: [{ translateY: scanTranslate }] }]} />
            </View>
          </View>

          <Text style={styles.title}>Desbloquear Bet62</Text>
          <Text style={styles.subtitle}>Aproxima o rosto para desbloquear automaticamente</Text>

          <View style={styles.dotsRow}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.dot, i === 1 && styles.dotActive]} />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const RED = "#d42020";

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#070710",
    alignItems: "center",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 32,
    marginBottom: 0,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
  },
  logoLabel: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 60,
  },
  iconWrap: {
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
  },
  ring: {
    position: "absolute",
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: RED,
  },
  ring1: { width: 130, height: 130 },
  ring2: { width: 155, height: 155 },
  ring3: { width: 180, height: 180 },
  faceFrame: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  corner: {
    position: "absolute",
    width: 20,
    height: 20,
    borderColor: RED,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 2.5, borderLeftWidth: 2.5, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 2.5, borderRightWidth: 2.5, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 2.5, borderLeftWidth: 2.5, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 2.5, borderRightWidth: 2.5, borderBottomRightRadius: 6 },
  faceIconWrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  scanBar: {
    position: "absolute",
    left: 8,
    right: 8,
    height: 1.5,
    backgroundColor: RED,
    opacity: 0.7,
    borderRadius: 1,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#a5a5b5",
    textAlign: "center",
    maxWidth: 260,
    lineHeight: 20,
    marginBottom: 32,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#262633",
  },
  dotActive: {
    backgroundColor: RED,
    width: 20,
    borderRadius: 3,
  },
});
