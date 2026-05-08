import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { useDevice } from "@/contexts/device-context";
import { useColors } from "@/hooks/use-colors";
import {
    BarChart3,
    PackageSearch,
    ShoppingBag,
    Store,
} from "@tamagui/lucide-icons";
import { useTheme } from "tamagui";

export default function AdminLayout() {
  const { isResetting, deviceRole } = useDevice();

  // Same guard as WorkerLayout: prevent rendering (and any useSQLiteContext
  // calls in child screens) while providers are being swapped out.
  if (isResetting || deviceRole !== "ADMIN") {
    return null;
  }

  return <AdminLayoutInner />;
}

function AdminLayoutInner() {
  const c = useColors();
  const theme = useTheme();
  const tint = theme.blue10?.val;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
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
      }}
    >
      <Tabs.Screen
        name="dashboard"
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
          title: "Inventario",
          tabBarIcon: ({ color }) => (
            <PackageSearch size={26} color={color as any} />
          ),
        }}
      />
      <Tabs.Screen
        name="purchases"
        options={{
          title: "Comercio",
          tabBarIcon: ({ color }) => (
            <ShoppingBag size={26} color={color as any} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Mi Tienda",
          headerRight: () => undefined,
          tabBarIcon: ({ color }) => <Store size={26} color={color as any} />,
        }}
      />
    </Tabs>
  );
}
