import { Tabs } from "expo-router";
import React from "react";

import { HeaderActions } from "@/components/admin/header-actions";
import { HapticTab } from "@/components/haptic-tab";
import { useColors } from "@/hooks/use-colors";
import {
  BarChart3,
  PackageSearch,
  Receipt,
  Settings,
  ShoppingBag,
} from "@tamagui/lucide-icons";
import { useTheme } from "tamagui";

export default function AdminLayout() {
  const c = useColors();
  const theme = useTheme();
  const tint = theme.blue10?.val;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: c.headerBg,
        },
        headerTintColor: c.headerText,
        headerShadowVisible: false,
        tabBarActiveTintColor: tint,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: c.tabBarBg,
          borderTopColor: c.tabBarBorder,
        },
        headerRight: () => <HeaderActions />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => (
            <BarChart3 size={26} color={color as any} />
          ),
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: "Catálogo",
          tabBarIcon: ({ color }) => (
            <PackageSearch size={26} color={color as any} />
          ),
        }}
      />
      <Tabs.Screen
        name="purchases"
        options={{
          title: "Compras",
          tabBarIcon: ({ color }) => (
            <ShoppingBag size={26} color={color as any} />
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: "Gastos",
          tabBarIcon: ({ color }) => <Receipt size={26} color={color as any} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Ajustes",
          headerRight: () => undefined,
          tabBarIcon: ({ color }) => (
            <Settings size={26} color={color as any} />
          ),
        }}
      />
      {/* Hidden routes */}
      <Tabs.Screen name="suppliers" options={{ href: null }} />
      <Tabs.Screen name="stores" options={{ href: null }} />
    </Tabs>
  );
}
