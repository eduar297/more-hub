import { LoginSheet } from "@/components/auth/login-sheet";
import { HapticTab } from "@/components/haptic-tab";
import { useAuth } from "@/contexts/auth-context";
import { useDevice } from "@/contexts/device-context";
import { useColors } from "@/hooks/use-colors";
import {
    BarChart3,
    PackageSearch,
    ShoppingBag,
    Store,
} from "@tamagui/lucide-icons";
import { Tabs, useRouter } from "expo-router";
import React, { useCallback, useEffect } from "react";
import { Alert } from "react-native";
import { useTheme } from "tamagui";

export default function AdminLayout() {
  const { isResetting, deviceRole, completeReset } = useDevice();
  const router = useRouter();

  // Mirror WorkerLayout: navigate to "/" when reset starts so providers can
  // safely unmount. Without this, AdminLayout returns null with no navigation
  // context, completeReset() is never called, and SecureStore is left wiped —
  // forcing re-activation on the next app launch.
  useEffect(() => {
    if (!isResetting) return;
    router.replace("/");
    const id = setTimeout(() => {
      completeReset();
    }, 600);
    return () => clearTimeout(id);
  }, [isResetting, router, completeReset]);

  if (deviceRole !== "ADMIN") {
    return null;
  }

  return <AdminLayoutInner />;
}

function AdminLayoutInner() {
  const c = useColors();
  const theme = useTheme();
  const tint = theme.blue10?.val;
  const { user } = useAuth();
  const { resetDevice } = useDevice();

  const handleChangeRole = useCallback(() => {
    Alert.alert(
      "Cambiar rol del dispositivo",
      "Esto borrará el rol y la activación. ¿Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cambiar rol",
          style: "destructive",
          onPress: () => resetDevice(),
        },
      ],
    );
  }, [resetDevice]);

  if (!user) {
    return (
      <LoginSheet
        open
        role="ADMIN"
        onClose={handleChangeRole}
        onSuccess={() => {}}
      />
    );
  }

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
