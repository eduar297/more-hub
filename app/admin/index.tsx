import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { StyleSheet } from "react-native";

export default function AdminScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">👤 Panel Administrador</ThemedText>
      <ThemedText>
        Aquí podrás escanear productos, crearlos y editarlos.
      </ThemedText>
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
