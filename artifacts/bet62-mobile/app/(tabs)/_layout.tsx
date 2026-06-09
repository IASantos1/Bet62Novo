import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useBetSlip } from "@/context/BetSlipContext";
import { useLiveMatches } from "@/hooks/useLiveMatches";

export default function TabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const { count } = useBetSlip();
  const { matches: liveMatches } = useLiveMatches();
  const liveCount = liveMatches.length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : { height: 60 }),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ) : null,
        tabBarLabelStyle: { fontSize: 10, fontFamily: "Inter_500Medium", marginBottom: isIOS ? 0 : 4 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Pré-Jogos",
          tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Pesquisa",
          tabBarIcon: ({ color }) => <Ionicons name="search-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: "Ao Vivo",
          tabBarIcon: ({ color, focused }) => (
            <View style={{ position: "relative" }}>
              <MaterialCommunityIcons name="heart-pulse" size={24} color={focused ? colors.primary : color} />
              {liveCount > 0 && (
                <View style={{
                  position: "absolute",
                  top: -4,
                  right: -6,
                  backgroundColor: colors.primary,
                  borderRadius: 8,
                  minWidth: 14,
                  height: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 2,
                }}>
                  <Feather name="circle" size={0} />
                  {/* use Text directly */}
                </View>
              )}
            </View>
          ),
          tabBarBadge: liveCount > 0 ? liveCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary, fontSize: 9, minWidth: 16, height: 16 },
        }}
      />
      <Tabs.Screen
        name="bets"
        options={{
          title: "Boletim",
          tabBarIcon: ({ color }) => <Ionicons name="receipt-outline" size={22} color={color} />,
          tabBarBadge: count > 0 ? count : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary, fontSize: 9, minWidth: 16, height: 16 },
        }}
      />
      <Tabs.Screen
        name="promos"
        options={{
          title: "Promoções",
          tabBarIcon: ({ color }) => <Ionicons name="gift-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
