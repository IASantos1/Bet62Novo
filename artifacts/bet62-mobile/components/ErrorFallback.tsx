import { Feather } from "@expo/vector-icons";
import { reloadAppAsync } from "expo";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [showDetails, setShowDetails] = useState(false);

  const monoFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

  async function handleRestart() {
    try {
      await reloadAppAsync();
    } catch {
      resetError();
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {__DEV__ && (
        <Pressable
          onPress={() => setShowDetails(true)}
          accessibilityLabel="Ver detalhes do erro"
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.topButton,
            { top: insets.top + 16, backgroundColor: colors.card, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Feather name="alert-circle" size={20} color={colors.foreground} />
        </Pressable>
      )}

      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Ocorreu um erro
        </Text>
        <Text style={[styles.message, { color: colors.mutedForeground }]}>
          Recarrega a aplicação para continuar.
        </Text>
        <Pressable
          onPress={handleRestart}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
            Tentar novamente
          </Text>
        </Pressable>
      </View>

      {__DEV__ && (
        <Modal
          visible={showDetails}
          animationType="slide"
          transparent
          onRequestClose={() => setShowDetails(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  Detalhes do erro
                </Text>
                <Pressable
                  onPress={() => setShowDetails(false)}
                  accessibilityLabel="Fechar detalhes"
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Feather name="x" size={24} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView
                style={styles.modalScrollView}
                contentContainerStyle={[styles.modalScrollContent, { paddingBottom: insets.bottom + 16 }]}
              >
                <View style={[styles.errorContainer, { backgroundColor: colors.card }]}>
                  <Text
                    style={[styles.errorText, { color: colors.foreground, fontFamily: monoFont }]}
                    selectable
                  >
                    {error.message}
                    {error.stack ? `\n\n${error.stack}` : ""}
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%", height: "100%", justifyContent: "center", alignItems: "center", padding: 24 },
  content: { alignItems: "center", justifyContent: "center", gap: 16, width: "100%", maxWidth: 600 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center" },
  message: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  topButton: { position: "absolute", right: 16, width: 44, height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center", zIndex: 10 },
  button: { paddingVertical: 14, borderRadius: 10, paddingHorizontal: 24, minWidth: 200 },
  buttonText: { fontFamily: "Inter_600SemiBold", textAlign: "center", fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContainer: { width: "100%", height: "90%", borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  closeButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  modalScrollView: { flex: 1 },
  modalScrollContent: { padding: 16 },
  errorContainer: { width: "100%", borderRadius: 8, padding: 16 },
  errorText: { fontSize: 12, lineHeight: 18 },
});
