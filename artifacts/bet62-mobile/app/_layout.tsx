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
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BiometricGate } from "@/components/BiometricGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IntroSplash } from "@/components/IntroSplash";
import { AuthProvider } from "@/context/AuthContext";
import { BetSlipProvider } from "@/context/BetSlipContext";
import { InactivityProvider, useResetInactivity } from "@/context/InactivityContext";
import { useColors } from "@/hooks/useColors";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 2 * 60_000,
      gcTime:    60 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      placeholderData: (prev: unknown) => prev,
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
  const [introDone, setIntroDone] = useState(false);

  // Hide native splash immediately — IntroSplash takes over visually
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const appReady = (fontsLoaded || !!fontError) && introDone;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
            {appReady ? (
              <AuthProvider>
                <InactivityProvider>
                  <BetSlipProvider>
                    <AppShell />
                  </BetSlipProvider>
                </InactivityProvider>
              </AuthProvider>
            ) : (
              <View style={{ flex: 1, backgroundColor: "#000" }} />
            )}
            {!introDone && (
              <IntroSplash onDone={() => setIntroDone(true)} />
            )}
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
