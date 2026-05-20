import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useContext, useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BiometricGate } from "@/components/BiometricGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import { BetSlipProvider } from "@/context/BetSlipContext";
import { InactivityProvider, useResetInactivity } from "@/context/InactivityContext";
import { useColors } from "@/hooks/useColors";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 2 * 60_000,        // 2 min — data considered fresh
      gcTime:    60 * 60_000,        // 1 hour — never evict from memory during a session
      refetchOnWindowFocus: false,   // no surprise refetch on focus
      refetchOnReconnect: true,      // reconnect → refresh
      placeholderData: (prev: unknown) => prev, // always show last cached data instantly
    },
  },
});

function AppShell() {
  const colors = useColors();
  const resetInactivity = useResetInactivity();

  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponder={() => { resetInactivity(); return false; }}
    >
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.foreground,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="(auth)"
          options={{
            presentation: "modal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="bet-slip"
          options={{
            presentation: "fullScreenModal",
            headerShown: false,
            gestureEnabled: false,
            animation: "slide_from_bottom",
          }}
        />
      </Stack>
      <BiometricGate />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <AuthProvider>
              <InactivityProvider>
                <BetSlipProvider>
                  <AppShell />
                </BetSlipProvider>
              </InactivityProvider>
            </AuthProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
