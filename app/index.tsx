import { LoginSheet } from "@/components/auth/login-sheet";
import { useAuth } from "@/contexts/auth-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { UserRole } from "@/models/user";
import {
  ChevronRight,
  LayoutDashboard,
  Monitor,
  Package,
  Receipt,
  ScanLine,
  ShieldCheck,
  TrendingUp
} from "@tamagui/lucide-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width: SCREEN_W } = Dimensions.get("window");

// ── Carousel slides ──────────────────────────────────────────────────────────
const SLIDES = [
  {
    id: "welcome",
    icon: Receipt,
    color: "#3b82f6",
    bg: "#dbeafe",
    darkBg: "#1e3a5f",
    title: "El More Hub",
    desc: "Tu punto de venta todo en uno. Gestiona inventario, registra ventas y controla tus finanzas desde un solo lugar.",
  },
  {
    id: "admin",
    icon: LayoutDashboard,
    color: "#3b82f6",
    bg: "#dbeafe",
    darkBg: "#1e3a5f",
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
    color: "#a855f7",
    bg: "#f3e8ff",
    darkBg: "#3b0764",
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
const ROLES = [
  {
    icon: ShieldCheck,
    label: "Administrador",
    desc: "Gestión completa del negocio",
    role: "ADMIN" as UserRole,
    path: "/(admin)" as const,
    color: "#3b82f6",
    bg: "#dbeafe",
    darkBg: "#1e3a5f",
  },
  {
    icon: Receipt,
    label: "Vendedor",
    desc: "Panel de ventas y cobros",
    role: "WORKER" as UserRole,
    path: "/(worker)" as const,
    color: "#22c55e",
    bg: "#dcfce7",
    darkBg: "#14532d",
  },
  {
    icon: Monitor,
    label: "Pantalla",
    desc: "Visualización en mostrador",
    role: null as UserRole | null,
    path: "/(display)" as const,
    color: "#a855f7",
    bg: "#f3e8ff",
    darkBg: "#3b0764",
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
    <View style={[styles.slide, { width: SCREEN_W - 32 }]}>
      <View
        style={[
          styles.slideIconWrap,
          { backgroundColor: isDark ? item.darkBg : item.bg },
        ]}
      >
        <Icon size={36} color={item.color as any} />
      </View>
      <Text
        style={[styles.slideTitle, { color: isDark ? "#f2f2f7" : "#18181b" }]}
      >
        {item.title}
      </Text>
      <Text
        style={[styles.slideDesc, { color: isDark ? "#8e8e93" : "#6b7280" }]}
      >
        {item.desc}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { logout } = useAuth();
  const isDark = colorScheme === "dark";

  const [activeSlide, setActiveSlide] = useState(0);
  const [loginRole, setLoginRole] = useState<UserRole | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const flatRef = useRef<FlatList>(null);

  const c = {
    bg: isDark ? "#151718" : "#f8fafc",
    card: isDark ? "#1c1c1e" : "#ffffff",
    text: isDark ? "#f2f2f7" : "#18181b",
    muted: isDark ? "#8e8e93" : "#6b7280",
    border: isDark ? "#38383a" : "#e5e7eb",
    dotActive: isDark ? "#f2f2f7" : "#18181b",
    dotInactive: isDark ? "#38383a" : "#d1d5db",
  };

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
      if (viewableItems[0]?.index != null) {
        setActiveSlide(viewableItems[0].index);
      }
    },
    [],
  );

  const handleRolePress = useCallback(
    (role: UserRole | null, path: string) => {
      if (role === "ADMIN" || role === "WORKER") {
        logout();
        setLoginRole(role);
        setPendingPath(path);
      } else {
        router.push(path as any);
      }
    },
    [router, logout],
  );

  const handleLoginSuccess = useCallback(() => {
    setLoginRole(null);
    if (pendingPath) {
      router.push(pendingPath as any);
      setPendingPath(null);
    }
  }, [pendingPath, router]);

  const handleLoginClose = useCallback(() => {
    setLoginRole(null);
    setPendingPath(null);
    logout();
  }, [logout]);

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Feature carousel ── */}
        <View style={styles.carouselSection}>
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
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <TouchableOpacity
                key={i}
                onPress={() =>
                  flatRef.current?.scrollToIndex({ index: i, animated: true })
                }
              >
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        i === activeSlide ? c.dotActive : c.dotInactive,
                      width: i === activeSlide ? 20 : 6,
                    },
                  ]}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Roles ── */}
        <View style={styles.rolesSection}>
          <Text style={[styles.rolesTitle, { color: c.muted }]}>
            Selecciona tu modo
          </Text>
          <View style={styles.rolesGrid}>
            {ROLES.map(
              ({ icon: Icon, label, desc, role, path, color, bg, darkBg }) => (
                <TouchableOpacity
                  key={path}
                  style={[
                    styles.roleCard,
                    { backgroundColor: c.card, borderColor: c.border },
                  ]}
                  activeOpacity={0.75}
                  onPress={() => handleRolePress(role, path)}
                >
                  <View
                    style={[
                      styles.roleIconWrap,
                      { backgroundColor: isDark ? darkBg : bg },
                    ]}
                  >
                    <Icon size={24} color={color as any} />
                  </View>
                  <View style={styles.roleText}>
                    <Text style={[styles.roleLabel, { color: c.text }]}>
                      {label}
                    </Text>
                    <Text style={[styles.roleDesc, { color: c.muted }]}>
                      {desc}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={c.muted as any} />
                </TouchableOpacity>
              ),
            )}
          </View>
        </View>
      </ScrollView>

      {/* ── Login modal ── */}
      {loginRole && (
        <LoginSheet
          open
          role={loginRole}
          onClose={handleLoginClose}
          onSuccess={handleLoginSuccess}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 64,
    paddingBottom: 40,
    gap: 28,
  },
  logoSection: {
    alignItems: "center",
    gap: 6,
  },
  logoIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  appName: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -1,
  },
  appTagline: {
    fontSize: 15,
  },
  carouselSection: {
    gap: 12,
  },
  slide: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 24,
    borderRadius: 20,
  },
  slideIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  slideTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  slideDesc: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    alignItems: "center",
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  rolesSection: {
    gap: 10,
  },
  rolesTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 2,
  },
  rolesGrid: {
    gap: 10,
  },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  roleIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  roleText: {
    flex: 1,
    gap: 2,
  },
  roleLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  roleDesc: {
    fontSize: 13,
  },
});
