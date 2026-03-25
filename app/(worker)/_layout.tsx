import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { LayoutList, ScanLine, User } from "@tamagui/lucide-icons";
import { useTheme } from "tamagui";

export default function WorkerLayout() {
  const colorScheme = useColorScheme();
  const theme = useTheme();
  const tint = theme.green10?.val ?? "#22c55e";

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: colorScheme === "dark" ? "#151718" : "#ffffff",
        },
        headerTintColor: colorScheme === "dark" ? "#f2f2f7" : "#18181b",
        headerShadowVisible: false,
        tabBarActiveTintColor: tint,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: colorScheme === "dark" ? "#151718" : "#ffffff",
          borderTopColor: colorScheme === "dark" ? "#2a2a2a" : "#e5e5e5",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Ventas",
          tabBarIcon: ({ color }) => (
            <ScanLine size={26} color={color as any} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Registro",
          tabBarIcon: ({ color }) => (
            <LayoutList size={26} color={color as any} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color }) => <User size={26} color={color as any} />,
        }}
      />
    </Tabs>
  );
}
