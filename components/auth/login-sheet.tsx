import { OVERLAY_HEAVY, WHITE_FADED, WHITE_SOFT } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { useStore } from "@/contexts/store-context";
import type { Store } from "@/models/store";
import type { User, UserRole } from "@/models/user";
import { UserRepository } from "@/repositories/user.repository";
import { hashPin } from "@/utils/auth";
import {
    AlertCircle,
    ChevronLeft,
    Lock,
    Store as StoreIcon,
    User as UserIcon,
    Users,
} from "@tamagui/lucide-icons";
import { useSQLiteContext } from "expo-sqlite";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Image,
    Keyboard,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Vibration,
    View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useTheme } from "tamagui";

/* ── Carousel constants ── */
const STORE_PALETTE = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#a855f7",
];
const STORE_CARD_W = 130;
const STORE_CARD_H = 160;
const STORE_CARD_GAP = 12;
const SNAP_INTERVAL = STORE_CARD_W + STORE_CARD_GAP;
const SCREEN_W = Dimensions.get("window").width;
const CARD_W = Math.min(380, SCREEN_W - 48);
const CAROUSEL_PAD_H = (CARD_W - STORE_CARD_W) / 2 - STORE_CARD_GAP / 2;

/* ── Shared constants ── */
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

interface LoginSheetProps {
  open: boolean;
  role: UserRole;
  onClose: () => void;
  onSuccess: () => void;
}

export function LoginSheet({
  open,
  role,
  onClose,
  onSuccess,
}: LoginSheetProps) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { stores, setCurrentStore } = useStore();
  const { setUser } = useAuth();

  /* ── Common state ── */
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutSecsLeft, setLockoutSecsLeft] = useState(0);
  const pinRef = useRef<TextInput>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Admin-specific ── */
  const [adminStep, setAdminStep] = useState(0); // 0=store carousel, 1=pin
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const adminScrollX = useRef(new Animated.Value(0)).current;
  const adminStepSlide = useRef(new Animated.Value(0)).current;

  /* ── Worker-specific ── */
  const [workerStep, setWorkerStep] = useState(0); // 0=store, 1=worker, 2=pin
  const [workers, setWorkers] = useState<User[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<User | null>(null);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const stepSlide = useRef(new Animated.Value(0)).current;
  const scrollX = useRef(new Animated.Value(0)).current;

  const isDark = (theme.background?.val as string)?.startsWith("#0");
  const c = {
    bg: theme.background?.val as string,
    overlay: OVERLAY_HEAVY,
    text: theme.color?.val as string,
    muted: theme.color8?.val as string,
    border: theme.borderColor?.val as string,
    input: theme.color2?.val as string,
    accent: (role === "ADMIN"
      ? theme.blue10?.val
      : theme.green10?.val) as string,
    accentLight: (role === "ADMIN"
      ? theme.blue3?.val
      : theme.green3?.val) as string,
    error: theme.red10?.val as string,
    errorBg: theme.red3?.val as string,
    cardBg: theme.color2?.val as string,
    cardBgSelected: (role === "ADMIN"
      ? theme.blue3?.val
      : theme.green3?.val) as string,
  };

  const multiStore = stores.length > 1;

  /* ── Admin: global repo (no storeId) ── */
  const adminRepo = useMemo(() => new UserRepository(db), [db]);

  const loadAdmin = useCallback(async () => {
    setLoadingAdmin(true);
    try {
      const admins = await adminRepo.findByRole("ADMIN");
      setAdminUser(admins.length > 0 ? admins[0] : null);
    } catch {
      /* ignore */
    } finally {
      setLoadingAdmin(false);
    }
  }, [adminRepo]);

  /* ── Worker: repo scoped to selected store ── */
  const workerRepo = useMemo(
    () => new UserRepository(db, selectedStore?.id),
    [db, selectedStore?.id],
  );

  const loadWorkers = useCallback(async () => {
    if (!selectedStore) return;
    setLoadingWorkers(true);
    try {
      const list = await workerRepo.findByRole("WORKER");
      setWorkers(list);
    } catch {
      /* ignore */
    } finally {
      setLoadingWorkers(false);
    }
  }, [workerRepo, selectedStore]);

  /* ── Animations ── */
  const animateStep = useCallback(
    (direction: "forward" | "back") => {
      stepSlide.setValue(direction === "forward" ? 40 : -40);
      Animated.spring(stepSlide, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    },
    [stepSlide],
  );

  const triggerShake = useCallback(() => {
    Vibration.vibrate(300);
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeAnim]);

  /* ── Lockout timer ── */
  useEffect(() => {
    if (lockoutUntil === null) return;
    const tick = () => {
      const secs = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (secs <= 0) {
        setLockoutUntil(null);
        setLockoutSecsLeft(0);
        setFailedAttempts(0);
        if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
      } else {
        setLockoutSecsLeft(secs);
      }
    };
    tick();
    lockoutTimerRef.current = setInterval(tick, 1000);
    return () => {
      if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
    };
  }, [lockoutUntil]);

  /* ── Reset on open ── */
  useEffect(() => {
    if (!open) return;
    setPin("");
    setError("");
    setSelectedStore(null);
    setFailedAttempts(0);
    setLockoutUntil(null);
    setLockoutSecsLeft(0);
    setWorkerStep(0);
    setWorkers([]);
    setSelectedWorker(null);
    setAdminUser(null);
    setAdminStep(0);
    scrollX.setValue(0);
    adminScrollX.setValue(0);
    if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);

    if (role === "ADMIN") {
      loadAdmin();
      if (stores.length === 1) {
        setSelectedStore(stores[0]);
        setAdminStep(1);
      }
    } else {
      if (stores.length === 1) {
        setSelectedStore(stores[0]);
        setWorkerStep(1);
      }
    }
  }, [open, stores, role, loadAdmin, scrollX, adminScrollX]);

  /* ── Load workers when store selected ── */
  useEffect(() => {
    if (open && role === "WORKER" && selectedStore) loadWorkers();
  }, [open, role, selectedStore, loadWorkers]);

  /* ── Focus PIN when ready ── */
  useEffect(() => {
    if (role === "ADMIN" && adminStep === 1 && adminUser) {
      setTimeout(() => pinRef.current?.focus(), 200);
    }
  }, [role, adminStep, adminUser]);

  useEffect(() => {
    if (role === "WORKER" && workerStep === 2) {
      setTimeout(() => pinRef.current?.focus(), 200);
    }
  }, [role, workerStep]);

  /* ── PIN handling ── */
  const isLocked = lockoutUntil !== null && Date.now() < lockoutUntil;

  const tryLogin = useCallback(
    async (currentPin: string, user: User) => {
      if (currentPin.length < 4) return;
      setVerifying(true);
      setError("");
      try {
        const pinH = await hashPin(currentPin);
        const repo = role === "ADMIN" ? adminRepo : workerRepo;
        const ok = await repo.verifyPin(user.id, pinH);
        if (ok) {
          setFailedAttempts(0);
          if (selectedStore) setCurrentStore(selectedStore);
          setUser({
            id: user.id,
            name: user.name,
            role: user.role,
            photoUri: user.photoUri,
          });
          onSuccess();
        } else {
          triggerShake();
          setPin("");
          setFailedAttempts((prev) => {
            const next = prev + 1;
            if (next >= MAX_ATTEMPTS) {
              setLockoutUntil(Date.now() + LOCKOUT_SECONDS * 1000);
              setError(
                `Demasiados intentos. Espera ${LOCKOUT_SECONDS} segundos.`,
              );
            } else {
              setError(
                `PIN incorrecto. Intentos restantes: ${MAX_ATTEMPTS - next}`,
              );
            }
            return next;
          });
        }
      } catch {
        triggerShake();
        setPin("");
        setError("Error al verificar. Intenta de nuevo.");
      } finally {
        setVerifying(false);
      }
    },
    [
      role,
      adminRepo,
      workerRepo,
      setUser,
      setCurrentStore,
      selectedStore,
      onSuccess,
      triggerShake,
    ],
  );

  const handlePinChange = useCallback(
    (value: string) => {
      if (value.length > 4) return;
      setPin(value);
      setError("");
      if (value.length === 4) {
        const user = role === "ADMIN" ? adminUser : selectedWorker;
        if (user) tryLogin(value, user);
      }
    },
    [role, adminUser, selectedWorker, tryLogin],
  );

  /* ── Admin-flow handlers ── */
  const handleAdminStoreSelect = useCallback(
    (store: Store) => {
      setSelectedStore(store);
      setPin("");
      setError("");
      adminStepSlide.setValue(40);
      Animated.spring(adminStepSlide, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
      setAdminStep(1);
    },
    [adminStepSlide],
  );

  const handleAdminBack = useCallback(() => {
    if (stores.length <= 1) return;
    setAdminStep(0);
    setSelectedStore(null);
    setPin("");
    setError("");
    adminStepSlide.setValue(-40);
    Animated.spring(adminStepSlide, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [stores.length, adminStepSlide]);

  /* ── Worker-flow handlers ── */
  const handleStoreSelect = useCallback(
    (store: Store) => {
      setSelectedStore(store);
      setWorkerStep(1);
      setPin("");
      setError("");
      setSelectedWorker(null);
      animateStep("forward");
    },
    [animateStep],
  );

  const handleWorkerSelect = useCallback(
    (worker: User) => {
      setSelectedWorker(worker);
      setWorkerStep(2);
      setPin("");
      setError("");
      animateStep("forward");
    },
    [animateStep],
  );

  const handleBack = useCallback(() => {
    if (workerStep === 2) {
      setWorkerStep(1);
      setSelectedWorker(null);
      setPin("");
      setError("");
      animateStep("back");
    } else if (workerStep === 1 && multiStore) {
      setWorkerStep(0);
      setSelectedStore(null);
      setWorkers([]);
      animateStep("back");
    }
  }, [workerStep, multiStore, animateStep]);

  if (!open) return null;

  /* ════════════════════════════════════════════
     ADMIN FLOW — Step 0: Store Carousel
     ════════════════════════════════════════════ */
  const renderAdminStep0 = () => (
    <View
      style={[
        styles.card,
        styles.cardWide,
        { backgroundColor: c.bg, borderColor: c.border },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconCircle, { backgroundColor: c.accentLight }]}>
          <Lock size={22} color={c.accent as any} />
        </View>
        <Text style={[styles.title, { color: c.text }]}>Administrador</Text>
        <Text style={[styles.subtitle, { color: c.muted }]}>
          Selecciona la tienda activa
        </Text>
      </View>

      <View style={styles.carouselContainer}>
        <Animated.FlatList
          data={stores}
          keyExtractor={(item: Store) => String(item.id)}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={SNAP_INTERVAL}
          decelerationRate="fast"
          contentContainerStyle={{
            paddingHorizontal: Math.max(CAROUSEL_PAD_H, 16),
            paddingVertical: 8,
          }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: adminScrollX } } }],
            { useNativeDriver: true },
          )}
          scrollEventThrottle={16}
          renderItem={({ item, index }: { item: Store; index: number }) => {
            const inputRange = [
              (index - 1) * SNAP_INTERVAL,
              index * SNAP_INTERVAL,
              (index + 1) * SNAP_INTERVAL,
            ];
            const scale = adminScrollX.interpolate({
              inputRange,
              outputRange: [0.88, 1, 0.88],
              extrapolate: "clamp",
            });
            const itemOpacity = adminScrollX.interpolate({
              inputRange,
              outputRange: [0.5, 1, 0.5],
              extrapolate: "clamp",
            });
            const cardColor =
              item.color ?? STORE_PALETTE[index % STORE_PALETTE.length];
            return (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleAdminStoreSelect(item)}
                style={{ marginHorizontal: STORE_CARD_GAP / 2 }}
              >
                <Animated.View
                  style={[
                    styles.storeCard,
                    {
                      backgroundColor: cardColor,
                      transform: [{ scale }],
                      opacity: itemOpacity,
                    },
                  ]}
                >
                  <View style={styles.storeCardIcon}>
                    {item.logoUri ? (
                      <Image
                        source={{ uri: item.logoUri }}
                        style={{ width: 48, height: 48, borderRadius: 24 }}
                      />
                    ) : (
                      <StoreIcon size={32} color="white" />
                    )}
                  </View>
                  <Text style={styles.storeCardName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {item.address && (
                    <Text style={styles.storeCardAddr} numberOfLines={1}>
                      {item.address}
                    </Text>
                  )}
                </Animated.View>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <TouchableOpacity
        style={[styles.btnCancel, { borderColor: c.border }]}
        onPress={onClose}
        activeOpacity={0.7}
      >
        <Text style={[styles.btnCancelText, { color: c.muted }]}>Cancelar</Text>
      </TouchableOpacity>
    </View>
  );

  /* ════════════════════════════════════════════
     ADMIN FLOW — Step 1: PIN
     ════════════════════════════════════════════ */
  const renderAdminStep1 = () => {
    const pinDisabled = verifying || isLocked || !adminUser;
    return (
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: c.bg, borderColor: c.border },
          { transform: [{ translateX: adminStepSlide }] },
        ]}
      >
        <View style={styles.headerRow}>
          {stores.length > 1 && (
            <TouchableOpacity
              onPress={handleAdminBack}
              style={styles.backBtn}
              activeOpacity={0.7}
            >
              <ChevronLeft size={20} color={c.muted as any} />
              <Text style={{ color: c.muted, fontSize: 14 }}>
                {selectedStore?.name ?? "Atrás"}
              </Text>
            </TouchableOpacity>
          )}
          <View
            style={[
              styles.iconCircle,
              {
                backgroundColor: selectedStore?.color
                  ? `${selectedStore.color}22`
                  : c.accentLight,
              },
            ]}
          >
            {selectedStore?.logoUri ? (
              <Image
                source={{ uri: selectedStore.logoUri }}
                style={{ width: 52, height: 52, borderRadius: 26 }}
              />
            ) : (
              <Lock
                size={22}
                color={(selectedStore?.color ?? c.accent) as any}
              />
            )}
          </View>
          <Text style={[styles.title, { color: c.text }]}>
            {selectedStore?.name ?? "Administrador"}
          </Text>
          <Text style={[styles.subtitle, { color: c.muted }]}>
            Ingresa tu PIN para continuar
          </Text>
        </View>

        {/* Admin loading / missing */}
        {loadingAdmin ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator color={c.accent} />
          </View>
        ) : !adminUser ? (
          <View
            style={[
              styles.emptyBox,
              { backgroundColor: c.errorBg, borderColor: c.error },
            ]}
          >
            <AlertCircle size={20} color={c.error as any} />
            <Text style={[styles.emptyText, { color: c.error }]}>
              No hay administrador configurado
            </Text>
          </View>
        ) : null}

        {/* PIN */}
        {adminUser && (
          <View style={styles.section}>
            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              <TextInput
                ref={pinRef}
                style={[
                  styles.pinInput,
                  {
                    backgroundColor: pinDisabled
                      ? isDark
                        ? "#1a1a1c"
                        : "#e5e7eb"
                      : c.input,
                    color: pinDisabled ? c.muted : c.text,
                    borderColor: isLocked || error ? c.error : c.border,
                    opacity: pinDisabled ? 0.6 : 1,
                    letterSpacing: pin.length > 0 ? 6 : 0,
                  },
                ]}
                placeholder={
                  isLocked ? `Bloqueado ${lockoutSecsLeft}s` : "••••"
                }
                placeholderTextColor={c.muted}
                value={pin}
                onChangeText={handlePinChange}
                secureTextEntry={!isLocked}
                keyboardType="numeric"
                maxLength={4}
                returnKeyType="done"
                editable={!pinDisabled}
              />
              {verifying && (
                <View style={styles.pinSpinner}>
                  <ActivityIndicator color={c.accent} size="small" />
                </View>
              )}
            </Animated.View>
          </View>
        )}

        {/* Error */}
        {!!error && (
          <View style={[styles.errorRow, { backgroundColor: c.errorBg }]}>
            <AlertCircle size={16} color={c.error as any} />
            <Text style={[styles.errorText, { color: c.error }]}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.btnCancel, { borderColor: c.border }]}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <Text style={[styles.btnCancelText, { color: c.muted }]}>
            Cancelar
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderAdmin = () => {
    if (adminStep === 0) return renderAdminStep0();
    return renderAdminStep1();
  };

  /* ════════════════════════════════════════════
     WORKER FLOW — Step 0: Store Carousel
     ════════════════════════════════════════════ */
  const renderWorkerStep0 = () => (
    <View
      style={[
        styles.card,
        styles.cardWide,
        { backgroundColor: c.bg, borderColor: c.border },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconCircle, { backgroundColor: c.accentLight }]}>
          <StoreIcon size={22} color={c.accent as any} />
        </View>
        <Text style={[styles.title, { color: c.text }]}>¿Dónde trabajas?</Text>
        <Text style={[styles.subtitle, { color: c.muted }]}>
          Selecciona tu tienda
        </Text>
      </View>

      <View style={styles.carouselContainer}>
        <Animated.FlatList
          data={stores}
          keyExtractor={(item: Store) => String(item.id)}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={SNAP_INTERVAL}
          decelerationRate="fast"
          contentContainerStyle={{
            paddingHorizontal: Math.max(CAROUSEL_PAD_H, 16),
            paddingVertical: 8,
          }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true },
          )}
          scrollEventThrottle={16}
          renderItem={({ item, index }: { item: Store; index: number }) => {
            const inputRange = [
              (index - 1) * SNAP_INTERVAL,
              index * SNAP_INTERVAL,
              (index + 1) * SNAP_INTERVAL,
            ];
            const scale = scrollX.interpolate({
              inputRange,
              outputRange: [0.88, 1, 0.88],
              extrapolate: "clamp",
            });
            const itemOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.5, 1, 0.5],
              extrapolate: "clamp",
            });
            const cardColor =
              item.color ?? STORE_PALETTE[index % STORE_PALETTE.length];
            return (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleStoreSelect(item)}
                style={{ marginHorizontal: STORE_CARD_GAP / 2 }}
              >
                <Animated.View
                  style={[
                    styles.storeCard,
                    {
                      backgroundColor: cardColor,
                      transform: [{ scale }],
                      opacity: itemOpacity,
                    },
                  ]}
                >
                  <View style={styles.storeCardIcon}>
                    {item.logoUri ? (
                      <Image
                        source={{ uri: item.logoUri }}
                        style={{ width: 48, height: 48, borderRadius: 24 }}
                      />
                    ) : (
                      <StoreIcon size={32} color="white" />
                    )}
                  </View>
                  <Text style={styles.storeCardName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {item.address && (
                    <Text style={styles.storeCardAddr} numberOfLines={1}>
                      {item.address}
                    </Text>
                  )}
                </Animated.View>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <TouchableOpacity
        style={[styles.btnCancel, { borderColor: c.border }]}
        onPress={onClose}
        activeOpacity={0.7}
      >
        <Text style={[styles.btnCancelText, { color: c.muted }]}>Cancelar</Text>
      </TouchableOpacity>
    </View>
  );

  /* ════════════════════════════════════════════
     WORKER FLOW — Step 1: Worker Selection
     ════════════════════════════════════════════ */
  const renderWorkerStep1 = () => (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: c.bg, borderColor: c.border },
        { transform: [{ translateX: stepSlide }] },
      ]}
    >
      <View style={styles.headerRow}>
        {multiStore && (
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <ChevronLeft size={20} color={c.muted as any} />
            <Text style={{ color: c.muted, fontSize: 14 }}>
              {selectedStore?.name ?? "Atrás"}
            </Text>
          </TouchableOpacity>
        )}
        <View style={[styles.iconCircle, { backgroundColor: c.accentLight }]}>
          <UserIcon size={22} color={c.accent as any} />
        </View>
        <Text style={[styles.title, { color: c.text }]}>¿Quién eres?</Text>
        <Text style={[styles.subtitle, { color: c.muted }]}>
          Selecciona tu perfil
        </Text>
      </View>

      {loadingWorkers ? (
        <View style={styles.loaderRow}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : workers.length === 0 ? (
        <View
          style={[
            styles.emptyBox,
            { backgroundColor: c.errorBg, borderColor: c.error },
          ]}
        >
          <Users size={20} color={c.error as any} />
          <Text style={[styles.emptyText, { color: c.error }]}>
            No hay vendedores en esta tienda
          </Text>
        </View>
      ) : (
        <View style={styles.workerGrid}>
          {workers.map((w) => {
            const initial = w.name.charAt(0).toUpperCase();
            return (
              <TouchableOpacity
                key={w.id}
                style={[
                  styles.workerCard,
                  { backgroundColor: c.cardBg, borderColor: c.border },
                ]}
                onPress={() => handleWorkerSelect(w)}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.workerAvatar,
                    { backgroundColor: c.accentLight },
                  ]}
                >
                  {w.photoUri ? (
                    <Image
                      source={{ uri: w.photoUri }}
                      style={styles.workerAvatarImg}
                    />
                  ) : (
                    <Text
                      style={[styles.workerAvatarText, { color: c.accent }]}
                    >
                      {initial}
                    </Text>
                  )}
                </View>
                <Text
                  style={[styles.workerCardName, { color: c.text }]}
                  numberOfLines={1}
                >
                  {w.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </Animated.View>
  );

  /* ════════════════════════════════════════════
     WORKER FLOW — Step 2: PIN Input
     ════════════════════════════════════════════ */
  const renderWorkerStep2 = () => {
    const pinDisabled = verifying || isLocked || !selectedWorker;
    return (
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: c.bg, borderColor: c.border },
          { transform: [{ translateX: stepSlide }] },
        ]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <ChevronLeft size={20} color={c.muted as any} />
            <Text style={{ color: c.muted, fontSize: 14 }}>Cambiar</Text>
          </TouchableOpacity>
          <View style={[styles.bigAvatar, { backgroundColor: c.accentLight }]}>
            {selectedWorker?.photoUri ? (
              <Image
                source={{ uri: selectedWorker.photoUri }}
                style={styles.bigAvatarImg}
              />
            ) : (
              <Text style={[styles.bigAvatarText, { color: c.accent }]}>
                {selectedWorker?.name.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <Text style={[styles.title, { color: c.text }]}>
            {selectedWorker?.name}
          </Text>
          <Text style={[styles.subtitle, { color: c.muted }]}>
            Ingresa tu PIN
          </Text>
        </View>

        {/* PIN */}
        <View style={styles.section}>
          <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
            <TextInput
              ref={pinRef}
              style={[
                styles.pinInput,
                {
                  backgroundColor: pinDisabled
                    ? isDark
                      ? "#1a1a1c"
                      : "#e5e7eb"
                    : c.input,
                  color: pinDisabled ? c.muted : c.text,
                  borderColor: isLocked || error ? c.error : c.border,
                  opacity: pinDisabled ? 0.6 : 1,
                  letterSpacing: pin.length > 0 ? 6 : 0,
                },
              ]}
              placeholder={isLocked ? `Bloqueado ${lockoutSecsLeft}s` : "••••"}
              placeholderTextColor={c.muted}
              value={pin}
              onChangeText={handlePinChange}
              secureTextEntry={!isLocked}
              keyboardType="numeric"
              maxLength={4}
              returnKeyType="done"
              editable={!pinDisabled}
            />
            {verifying && (
              <View style={styles.pinSpinner}>
                <ActivityIndicator color={c.accent} size="small" />
              </View>
            )}
          </Animated.View>
        </View>

        {/* Error */}
        {!!error && (
          <View style={[styles.errorRow, { backgroundColor: c.errorBg }]}>
            <AlertCircle size={16} color={c.error as any} />
            <Text style={[styles.errorText, { color: c.error }]}>{error}</Text>
          </View>
        )}
      </Animated.View>
    );
  };

  const renderWorker = () => {
    if (workerStep === 0) return renderWorkerStep0();
    if (workerStep === 1) return renderWorkerStep1();
    return renderWorkerStep2();
  };

  /* ═══════════════════════════════
     RENDER
     ═══════════════════════════════ */
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[
              styles.overlay,
              { backgroundColor: c.overlay },
            ]}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <Pressable
              style={{ width: "100%", maxWidth: 380 }}
              onPress={onClose}
            >
              <Pressable onPress={(e) => e.stopPropagation()}>
                {role === "ADMIN" ? renderAdmin() : renderWorker()}
              </Pressable>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

/* ═══════════════════════════════
   STYLES
   ═══════════════════════════════ */
const styles = StyleSheet.create({
  overlay: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 16,
    overflow: "visible",
  },
  cardWide: {
    overflow: "hidden",
  },
  headerRow: {
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
    textAlign: "center",
  },
  section: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  loaderRow: {
    alignItems: "center",
    paddingVertical: 16,
  },
  emptyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  emptyText: {
    fontSize: 13,
    flex: 1,
  },

  /* Store carousel */
  carouselContainer: {
    marginHorizontal: -24,
    paddingVertical: 4,
  },
  storeCard: {
    width: STORE_CARD_W,
    height: STORE_CARD_H,
    borderRadius: 16,
    padding: 16,
    justifyContent: "flex-end",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  storeCardIcon: {
    position: "absolute",
    top: 16,
    left: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: WHITE_FADED,
    alignItems: "center",
    justifyContent: "center",
  },
  storeCardName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  storeCardAddr: {
    fontSize: 11,
    color: WHITE_SOFT,
  },

  /* Worker grid (step 1) */
  workerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  workerCard: {
    width: 100,
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  workerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  workerAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  workerAvatarText: {
    fontSize: 20,
    fontWeight: "700",
  },
  workerCardName: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },

  /* Big avatar (worker PIN step) */
  bigAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  bigAvatarImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  bigAvatarText: {
    fontSize: 28,
    fontWeight: "700",
  },

  /* Back button */
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 2,
    marginBottom: 8,
    paddingVertical: 4,
  },

  /* PIN input */
  pinInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    textAlign: "center",
  },
  pinSpinner: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },

  /* Error */
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },

  /* Cancel */
  btnCancel: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  btnCancelText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
