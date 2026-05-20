import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  View,
} from "react-native";

export function IntroSplash({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(true);
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.88)).current;
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 950,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 950,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // Fade in → start pulse loop
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start(() => pulse.start());
    });

    // After 2.4s: fade out and dismiss
    const t = setTimeout(() => {
      pulse.stop();
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 420,
        useNativeDriver: true,
      }).start(() => {
        setVisible(false);
        onDoneRef.current();
      });
    }, 2400);

    return () => {
      clearTimeout(t);
      pulse.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>

        {/* Center red radial glow */}
        <View style={styles.glowCenterWrap} pointerEvents="none">
          <View style={styles.glowCenter} />
        </View>

        {/* Bottom red glow */}
        <View style={styles.glowBottomWrap} pointerEvents="none">
          <View style={styles.glowBottom} />
        </View>

        {/* Pulsing BET62 brand */}
        <Animated.View
          style={{ transform: [{ scale: pulseAnim }], alignItems: "center" }}
        >
          <View style={styles.logoRow}>
            <Text style={styles.bet}>BET</Text>
            <Text style={styles.sixty}>62</Text>
          </View>
        </Animated.View>

        {/* Tagline */}
        <Text style={styles.tagline}>A melhor casa de apostas</Text>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  glowCenterWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  glowCenter: {
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: "rgba(185,28,28,0.14)",
  },
  glowBottomWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  glowBottom: {
    width: 320,
    height: 200,
    borderRadius: 160,
    backgroundColor: "rgba(185,28,28,0.08)",
    marginBottom: -80,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  bet: {
    fontSize: 72,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
    letterSpacing: -2,
    fontStyle: "italic",
    lineHeight: 78,
  },
  sixty: {
    fontSize: 96,
    fontFamily: "Inter_700Bold",
    color: "#dc2626",
    letterSpacing: -2,
    fontStyle: "italic",
    lineHeight: 96,
    marginBottom: -4,
    textShadowColor: "rgba(220,38,38,0.45)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 22,
  },
  tagline: {
    position: "absolute",
    bottom: 52,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.28)",
    letterSpacing: 3.5,
    textTransform: "uppercase",
  },
});
