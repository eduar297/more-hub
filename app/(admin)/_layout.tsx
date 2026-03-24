import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { LayoutDashboard, PackageSearch } from "@tamagui/lucide-icons";
import { useTheme } from "tamagui";

export default function AdminLayout() {
  const colorScheme = useColorScheme();
  const theme = useTheme();
  const tint = theme.blue10?.val ?? "#0a7ea4";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: tint,
        headerShown: false,
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
          title: "Productos",
          tabBarIcon: ({ color }) => (
            <PackageSearch size={26} color={color as any} />
          ),
        }}
      />
      <Tabs.Screen
        name="a1"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => (
            <LayoutDashboard size={26} color={color as any} />
          ),
        }}
      />
    </Tabs>
  );
}
