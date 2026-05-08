import { useColors } from "@/hooks/use-colors";
import { Stack } from "expo-router";

export default function SettingsLayout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.headerBg },
        headerTintColor: c.headerText,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Mi Tienda" }} />
    </Stack>
  );
}
