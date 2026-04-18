import { ActivationGate } from "@/components/auth/activation-gate";
import { useDevice } from "@/contexts/device-context";
import type { UserRole } from "@/models/user";
import type { DeviceRole } from "@/utils/device";
import {
    ChevronRight,
    LayoutDashboard,
    Monitor,
    Package,
    Receipt,
    ScanLine,
    ShieldCheck,
    TrendingUp,
} from "@tamagui/lucide-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, FlatList } from "react-native";
import { ScrollView, Text, useTheme, View, XStack, YStack } from "tamagui";

const { width: SCREEN_W } = Dimensions.get("window");

// ── Carousel slides ──────────────────────────────────────────────────────────
const SLIDES = [
  {
    id: "welcome",
    icon: Receipt,
    color: "#3b82f6",
    bg: "#dbeafe",
    darkBg: "#1e3a5f",
    title: "More Hub",
    desc: "Tu punto de venta todo en uno. Gestiona inventario, registra ventas y controla tus finanzas desde un solo lugar.",
  },
  {
    id: "admin",
    icon: LayoutDashboard,
    color: "#a855f7", // purple
    bg: "#f3e8ff", // light purple
    darkBg: "#3b0764", // dark purple
    title: "Panel de Administración",
    desc: "Gestiona productos, proveedores y compras. Analiza ventas por período, controla el inventario y revisa el estado financiero.",
  },
  {
    id: "worker",
    icon: ScanLine,
    color: "#22c55e",
    bg: "#dcfce7",
    darkBg: "#14532d",
    title: "Ventas Rápidas",
    desc: "Escanea productos con la cámara, arma el carrito y cierra cobros en efectivo o tarjeta. Rápido y sin complicaciones.",
  },
  {
    id: "inventory",
    icon: Package,
    color: "#06b6d4", // cyan
    bg: "#cffafe", // light cyan
    darkBg: "#164e63", // dark cyan
    title: "Control de Inventario",
    desc: "Mantén el stock actualizado automáticamente. Recibe alertas de productos bajos y registra entradas de mercancía.",
  },
  {
    id: "finance",
    icon: TrendingUp,
    color: "#f59e0b",
    bg: "#fef3c7",
    darkBg: "#451a03",
    title: "Análisis Financiero",
    desc: "Revisa ventas diarias, semanales y mensuales. Controla gastos operativos y conoce la ganancia real de tu negocio.",
  },
];

// ── Role definitions ─────────────────────────────────────────────────────────
interface RoleDef {
  icon: typeof ShieldCheck;
  label: string;
  desc: string;
  deviceRole: DeviceRole;
  path: string;
  color: string;
  bg: string;
  darkBg: string;
  requiresActivation: boolean;
}

const ROLES: RoleDef[] = [
  {
    icon: ShieldCheck,
    label: "Administrador",
    desc: "Gestión completa del negocio",
    deviceRole: "ADMIN",
    path: "/(admin)",
    color: "#3b82f6",
    bg: "#dbeafe",
    darkBg: "#1e3a5f",
    requiresActivation: true,
  },
  {
    icon: Receipt,
    label: "Vendedor",
    desc: "Panel de ventas y cobros",
    deviceRole: "WORKER",
    path: "/(worker)",
    color: "#22c55e",
    bg: "#dcfce7",
    darkBg: "#14532d",
    requiresActivation: false,
  },
  {
    icon: Monitor,
    label: "Pantalla",
    desc: "Visualización en mostrador",
    deviceRole: "DISPLAY",
    path: "/(display)",
    color: "#a855f7",
    bg: "#f3e8ff",
    darkBg: "#3b0764",
    requiresActivation: false,
  },
];

function Slide({
  item,
  isDark,
}: {
  item: (typeof SLIDES)[0];
  isDark: boolean;
}) {
  const Icon = item.icon;
  return (
    <YStack
      items="center"
      gap="$3"
      px="$2"
      py="$5"
      rounded="$6"
      width={SCREEN_W - 32}
    >
      <View
        width={72}
        height={72}
        rounded="$10"
        items="center"
        justify="center"
        mb="$1"
        bg={(isDark ? item.darkBg : item.bg) as any}
      >
        <Icon size={36} color={item.color as any} />
      </View>
      <Text fontSize={20} fontWeight="700" text="center" color="$color">
        {item.title}
      </Text>
      <Text
        fontSize={14}
        text="center"
        style={{ lineHeight: 20 }}
        px="$2"
        color="$color8"
      >
        {item.desc}
      </Text>
    </YStack>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { deviceRole, selectRole, resetDevice } = useDevice();
  const isDark =
    (theme.background?.val ?? "").startsWith("#0") ||
    (theme.background?.val ?? "").startsWith("#1");

  // ── Secret reset: tap 5 times quickly to reset device role ────────────
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSecretTap = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      // Confirm reset
      const { Alert } = require("react-native");
      Alert.alert(
        "Resetear dispositivo",
        "Esto borrará el rol asignado y la activación. ¿Continuar?",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Resetear",
            style: "destructive",
            onPress: () => resetDevice(),
          },
        ],
      );
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 2000);
  }, [resetDevice]);

  // If device already has a role, redirect to the corresponding panel
  useEffect(() => {
    if (deviceRole === "ADMIN") router.replace("/(admin)/dashboard" as any);
    else if (deviceRole === "WORKER") router.replace("/(worker)" as any);
    else if (deviceRole === "DISPLAY") router.replace("/(display)" as any);
  }, [deviceRole, router]);

  const [activeSlide, setActiveSlide] = useState(0);
  const [showActivation, setShowActivation] = useState(false);
  // Login modal state (for Admin/Worker after role is assigned)
  const [loginRole, setLoginRole] = useState<UserRole | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const flatRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
      if (viewableItems[0]?.index != null) {
        setActiveSlide(viewableItems[0].index);
      }
    },
    [],
  );

  const handleRolePress = useCallback(
    (roleDef: RoleDef) => {
      if (roleDef.requiresActivation) {
        // Admin requires activation code first
        setShowActivation(true);
      } else {
        // Worker and Display: save role immediately and navigate
        selectRole(roleDef.deviceRole);
        // The layout will re-mount with proper providers, then redirect via useEffect
      }
    },
    [selectRole],
  );

  const handleActivationSuccess = useCallback(() => {
    // activateAdmin already saved role + businessId via device context
    setShowActivation(false);
    // The layout will re-mount with AdminProviders, then redirect
  }, []);

  const handleActivationClose = useCallback(() => {
    setShowActivation(false);
  }, []);

  // Don't render full UI if already has a role (will redirect)
  // But show a tappable area for secret reset (5 quick taps)
  if (deviceRole)
    return (
      <YStack
        flex={1}
        bg="$background"
        items="center"
        justify="center"
        onPress={handleSecretTap}
      />
    );

  return (
    <YStack flex={1} bg="$background">
      <ScrollView
        contentContainerStyle={
          {
            paddingHorizontal: 16,
            paddingTop: 64,
            paddingBottom: 40,
            gap: 28,
          } as any
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Feature carousel ── */}
        <YStack gap="$3">
          <FlatList
            ref={flatRef}
            data={SLIDES}
            keyExtractor={(s) => s.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={SCREEN_W - 32}
            decelerationRate="fast"
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
            renderItem={({ item }) => <Slide item={item} isDark={isDark} />}
          />

          {/* Dots */}
          <XStack justify="center" gap="$1.5" items="center">
            {SLIDES.map((_, i) => (
              <View
                key={i}
                onPress={() =>
                  flatRef.current?.scrollToIndex({ index: i, animated: true })
                }
                height={6}
                rounded="$10"
                bg={i === activeSlide ? "$color" : "$color5"}
                width={i === activeSlide ? 20 : 6}
              />
            ))}
          </XStack>
        </YStack>

        {/* ── Role selection (one-time) ── */}
        <YStack gap="$3">
          <Text
            fontSize={12}
            fontWeight="600"
            textTransform="uppercase"
            letterSpacing={0.5}
            px="$0.5"
            color="$color8"
          >
            Configura este dispositivo
          </Text>
          <Text
            fontSize={13}
            color="$color8"
            px="$0.5"
            style={{ lineHeight: 18 }}
          >
            Esta elección es permanente. Cada dispositivo cumple un rol fijo.
          </Text>
          <YStack gap="$2.5">
            {ROLES.map((roleDef) => {
              const Icon = roleDef.icon;
              return (
                <XStack
                  key={roleDef.deviceRole}
                  items="center"
                  rounded="$5"
                  borderWidth={1}
                  p="$3.5"
                  gap="$3"
                  bg="$color1"
                  borderColor="$borderColor"
                  pressStyle={{ opacity: 0.7, scale: 0.98 }}
                  // @ts-expect-error animation works at runtime on XStack
                  animation="fast"
                  onPress={() => handleRolePress(roleDef)}
                  enterStyle={{ opacity: 0, y: 10 }}
                >
                  <View
                    width={46}
                    height={46}
                    rounded="$4"
                    items="center"
                    justify="center"
                    bg={(isDark ? roleDef.darkBg : roleDef.bg) as any}
                  >
                    <Icon size={24} color={roleDef.color as any} />
                  </View>
                  <YStack grow={1} gap="$0.5">
                    <Text fontSize={16} fontWeight="700" color="$color">
                      {roleDef.label}
                    </Text>
                    <Text fontSize={13} color="$color8">
                      {roleDef.desc}
                    </Text>
                  </YStack>
                  <ChevronRight size={18} color={theme.color8?.val as any} />
                </XStack>
              );
            })}
          </YStack>
        </YStack>
      </ScrollView>

      {/* ── Activation modal (Admin only) ── */}
      {showActivation && (
        <ActivationGate
          open
          onClose={handleActivationClose}
          onSuccess={handleActivationSuccess}
        />
      )}
    </YStack>
  );
}
