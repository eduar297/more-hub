import { NotificationProvider } from "@/components/ui/notification-provider";
import { StoreBubble } from "@/components/ui/store-bubble";
import { AuthProvider } from "@/contexts/auth-context";
import { DeviceProvider, useDevice } from "@/contexts/device-context";
import { LanProvider } from "@/contexts/lan-context";
import { PreferencesProvider } from "@/contexts/preferences-context";
import { StoreProvider } from "@/contexts/store-context";
import { migrateDbIfNeeded } from "@/database/migrate";
import { migrateWorkerDb } from "@/database/migrate-worker";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { config } from "@/tamagui.config";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect } from "react";
import { ActivityIndicator, LogBox } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import "react-native-reanimated";
import { TamaguiProvider, Text, Theme, YStack } from "tamagui";

LogBox.ignoreLogs([
  "Sending `onAnimatedValueUpdate` with no listeners registered",
]);

// ── Stack navigator (same screens for all roles) ────────────────────────────

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
          options={{ headerShown: false, title: "More Hub" }}
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
        <Stack.Screen name="+not-found" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
    </ThemeProvider>
  );
}

// ── DB error handler (prevents crash on hot-reload / teardown race) ─────────

function useDbErrorHandler() {
  return useCallback((error: Error) => {
    if (error.message?.includes("closed resource")) {
      // Benign: DB was closed while a statement was still finalizing (hot-reload / remount)
      console.warn("[SQLite] Ignored closed-resource error during teardown");
      return;
    }
    // Re-throw unexpected errors so they surface properly
    throw error;
  }, []);
}

// ── Admin providers: full DB + all contexts ─────────────────────────────────

function AdminProviders({ children }: { children: React.ReactNode }) {
  const onError = useDbErrorHandler();
  return (
    <SQLiteProvider
      databaseName={process.env.EXPO_PUBLIC_ADMIN_DB_NAME!}
      onInit={migrateDbIfNeeded}
      onError={onError}
    >
      <StoreProvider>
        <PreferencesProvider>
          <AuthProvider>
            <LanProvider>
              <NotificationProvider>
                {children}
                <StoreBubble />
              </NotificationProvider>
            </LanProvider>
          </AuthProvider>
        </PreferencesProvider>
      </StoreProvider>
    </SQLiteProvider>
  );
}

// ── Worker providers: light DB + minimal contexts ───────────────────────────

function WorkerProviders({ children }: { children: React.ReactNode }) {
  const onError = useDbErrorHandler();
  return (
    <SQLiteProvider
      databaseName={process.env.EXPO_PUBLIC_WORKER_DB_NAME!}
      onInit={migrateWorkerDb}
      onError={onError}
    >
      <StoreProvider>
        <AuthProvider>
          <LanProvider>
            <NotificationProvider>{children}</NotificationProvider>
          </LanProvider>
        </AuthProvider>
      </StoreProvider>
    </SQLiteProvider>
  );
}

// ── Display providers: no DB, only LAN ──────────────────────────────────────

function DisplayProviders({ children }: { children: React.ReactNode }) {
  return <LanProvider>{children}</LanProvider>;
}

// ── Role-aware shell: wraps providers based on device role ──────────────────

function RoleShell() {
  const { deviceRole, isLoading, isResetting, completeReset } = useDevice();
  const router = useRouter();
  const segments = useSegments();

  // When isResetting becomes true, navigate to "/" then finalize the reset.
  // During this window deviceRole still holds the OLD value, so providers
  // remain mounted and useSQLiteContext() won't crash.
  useEffect(() => {
    if (isResetting) {
      router.replace("/");
      const timer = setTimeout(() => completeReset(), 600);
      return () => clearTimeout(timer);
    }
  }, [isResetting, router, completeReset]);

  useEffect(() => {
    if (isResetting && segments.length === 0) {
      completeReset();
    }
  }, [isResetting, segments, completeReset]);

  if (isLoading) {
    return (
      <YStack flex={1} items="center" justify="center" bg="$background">
        <ActivityIndicator size="large" />
        <Text mt="$3" color="$color8" fontSize={14}>
          Cargando...
        </Text>
      </YStack>
    );
  }

  if (!deviceRole) {
    return <AppStack />;
  }

  switch (deviceRole) {
    case "ADMIN":
      return (
        <AdminProviders>
          <AppStack />
        </AdminProviders>
      );
    case "WORKER":
      return (
        <WorkerProviders>
          <AppStack />
        </WorkerProviders>
      );
    case "DISPLAY":
      return (
        <DisplayProviders>
          <AppStack />
        </DisplayProviders>
      );
  }
}

// ── Root layout ─────────────────────────────────────────────────────────────

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <TamaguiProvider config={config} defaultTheme="light">
      <Theme name={colorScheme === "dark" ? "dark" : "light"}>
        <KeyboardProvider>
          <DeviceProvider>
            <RoleShell />
          </DeviceProvider>
        </KeyboardProvider>
      </Theme>
    </TamaguiProvider>
  );
}
