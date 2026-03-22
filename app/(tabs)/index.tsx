import { useRouter } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        El More
      </ThemedText>

      <Pressable
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
        onPress={() => router.push("/admin")}
      >
        <ThemedText type="subtitle" style={styles.buttonText}>
          👤 Administrador
        </ThemedText>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
        onPress={() => router.push("/worker")}
      >
        <ThemedText type="subtitle" style={styles.buttonText}>
          🧾 Trabajador / Vendedor
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 24,
  },
  title: {
    textAlign: "center",
    marginBottom: 24,
  },
  button: {
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2f95dc",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: "white",
  },
});
