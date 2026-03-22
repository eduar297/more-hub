import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { StyleSheet } from "react-native";

export default function WorkerScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">🧾 Panel de Ventas</ThemedText>
      <ThemedText>Aquí podrás crear ventas y escanear productos.</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
});
