import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { TamaguiProvider } from "tamagui";

import { migrateDbIfNeeded } from "@/database/migrate";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { config } from "@/tamagui.config";

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <TamaguiProvider config={config} defaultTheme={colorScheme ?? "light"}>
      <SQLiteProvider databaseName="elmore.db" onInit={migrateDbIfNeeded}>
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          <Stack>
            {/* Pantalla principal */}
            <Stack.Screen
              name="index"
              options={{ headerShown: false, title: "ElMore" }}
            />

            {/* Grupo Admin */}
            <Stack.Screen
              name="(admin)"
              options={{ headerShown: true, title: "Panel Administrador" }}
            />

            {/* Grupo Worker */}
            <Stack.Screen
              name="(worker)"
              options={{ headerShown: true, title: "Panel Trabajador" }}
            />

            {/* Grupo Display */}
            <Stack.Screen
              name="(display)"
              options={{ headerShown: true, title: "Panel Visualización" }}
            />

            {/* Grupo Test */}
            <Stack.Screen
              name="(test)"
              options={{ headerShown: true, title: "Panel Test" }}
            />

            {/* Modal global */}
            <Stack.Screen
              name="modal"
              options={{
                presentation: "modal",
                title: "Modal",
              }}
            />
          </Stack>

          <StatusBar style="auto" />
        </ThemeProvider>
      </SQLiteProvider>
    </TamaguiProvider>
  );
}
