import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { TamaguiProvider, Theme } from "tamagui";

import { migrateDbIfNeeded } from "@/database/migrate";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { config } from "@/tamagui.config";

// Separate component so useTheme() runs inside TamaguiProvider
function AppStack() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen
          name="index"
          options={{ headerShown: false, title: "El More Hub" }}
        />
        <Stack.Screen
          name="(admin)"
          options={{
            title: "Panel Administrador",
          }}
        />
        <Stack.Screen name="(worker)" options={{ title: "Panel Trabajador" }} />
        <Stack.Screen
          name="(display)"
          options={{ title: "Panel Visualización" }}
        />
        <Stack.Screen name="(test)" options={{ title: "Panel Test" }} />
        <Stack.Screen
          name="modal"
          options={{
            presentation: "modal",
            title: "Modal",
          }}
        />
      </Stack>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <TamaguiProvider config={config} defaultTheme="light">
      <Theme name={colorScheme === "dark" ? "dark" : "light"}>
        <SQLiteProvider databaseName="elmore.db" onInit={migrateDbIfNeeded}>
          <AppStack />
        </SQLiteProvider>
      </Theme>
    </TamaguiProvider>
  );
}
