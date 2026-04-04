import { useAuth } from "@/contexts/auth-context";
import { usePreferences } from "@/contexts/preferences-context";
import { useStore } from "@/contexts/store-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Store, Store as StoreIcon } from "@tamagui/lucide-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Animated,
    Dimensions,
    Image,
    PanResponder,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView, Sheet, Text as TText, YStack, useTheme } from "tamagui";

const BUBBLE_SIZE = 44;
const EDGE_MARGIN = 8;
const FADE_DELAY = 4000;
const IDLE_OPACITY = 0.3;

export function StoreBubble() {
  const { showStoreBubble } = usePreferences();
  const { currentStore, stores, setCurrentStore } = useStore();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";
  const theme = useTheme();

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const opacity = useRef(new Animated.Value(1)).current;
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pan = useRef(new Animated.ValueXY({ x: EDGE_MARGIN, y: 120 })).current;
  const lastPos = useRef({ x: EDGE_MARGIN, y: 120 });
  const resetRef = useRef<() => void>(() => {});

  const resetFadeTimer = useCallback(() => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: false,
    }).start();
    fadeTimer.current = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: IDLE_OPACITY,
        duration: 900,
        useNativeDriver: false,
      }).start();
    }, FADE_DELAY);
  }, [opacity]);

  resetRef.current = resetFadeTimer;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        resetRef.current();
        pan.setOffset({ x: lastPos.current.x, y: lastPos.current.y });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, g) => {
        pan.flattenOffset();
        const { width: sw, height: sh } = Dimensions.get("window");
        const cx = lastPos.current.x + g.dx + BUBBLE_SIZE / 2;
        const rawY = lastPos.current.y + g.dy;

        const minY = insets.top + EDGE_MARGIN;
        const maxY = sh - insets.bottom - BUBBLE_SIZE - EDGE_MARGIN;

        const snapX =
          cx < sw / 2 ? EDGE_MARGIN : sw - BUBBLE_SIZE - EDGE_MARGIN;
        const snapY = Math.max(minY, Math.min(rawY, maxY));

        lastPos.current = { x: snapX, y: snapY };

        Animated.spring(pan, {
          toValue: { x: snapX, y: snapY },
          useNativeDriver: false,
          tension: 60,
          friction: 8,
        }).start();
      },
    }),
  ).current;

  useEffect(() => {
    if (!user || !showStoreBubble || !currentStore) {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
      opacity.setValue(1);
      return;
    }
    resetFadeTimer();
    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [user, showStoreBubble, currentStore, resetFadeTimer, opacity]);

  if (!user || !showStoreBubble || !currentStore) return null;

  const storeColor = currentStore.color ?? "#3b82f6";
  const isDark = colorScheme === "dark";
  const borderColor = isDark ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.15)";

  return (
    <>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.bubble,
          {
            backgroundColor: storeColor,
            borderColor,
            shadowColor: storeColor,
            opacity,
            transform: pan.getTranslateTransform(),
          },
        ]}
      >
        <Pressable
          style={styles.pressableArea}
          onPress={resetFadeTimer}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setIsMenuOpen(true);
          }}
          delayLongPress={400}
        >
          {currentStore.logoUri ? (
            <Image
              source={{ uri: currentStore.logoUri }}
              style={styles.bubbleLogo}
            />
          ) : (
            <StoreIcon size={18} color="white" />
          )}
          <View style={styles.nameTag}>
            <Text style={styles.nameText} numberOfLines={1}>
              {currentStore.name}
            </Text>
          </View>
        </Pressable>
      </Animated.View>

      <Sheet
        open={isMenuOpen}
        onOpenChange={setIsMenuOpen}
        modal
        snapPoints={[40]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="rgba(0,0,0,0.5)"
        />
        <Sheet.Frame p="$4" bg="$background" theme={themeName as any}>
          <Sheet.Handle />
          <ScrollView>
            <YStack gap="$3" pt="$2">
              <TText fontSize="$5" fontWeight="bold" color="$color">
                Cambiar tienda
              </TText>

              {stores.map((s, idx) => {
                const isActive = currentStore?.id === s.id;
                return (
                  <View key={s.id}>
                    {idx > 0 && (
                      <View
                        style={[
                          styles.divider,
                          { backgroundColor: theme.color3?.val },
                        ]}
                      />
                    )}
                    <TouchableOpacity
                      style={styles.workerRow}
                      onPress={() => {
                        setCurrentStore(s);
                        setIsMenuOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.avatar,
                          {
                            backgroundColor: s.color
                              ? `${s.color}22`
                              : isActive
                              ? (theme.blue3?.val as string)
                              : (theme.color3?.val as string),
                            overflow: "hidden",
                            borderWidth: isActive ? 2 : 0,
                            borderColor:
                              s.color ?? (theme.blue10?.val as string),
                          },
                        ]}
                      >
                        {s.logoUri ? (
                          <Image
                            source={{ uri: s.logoUri }}
                            style={{ width: 38, height: 38, borderRadius: 19 }}
                          />
                        ) : (
                          <Store
                            size={18}
                            color={
                              (s.color ??
                                (isActive
                                  ? theme.blue10?.val
                                  : theme.color8?.val)) as any
                            }
                          />
                        )}
                      </View>
                      <View style={styles.workerInfo}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <View
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor:
                                s.color ?? (theme.blue10?.val as string),
                            }}
                          />
                          <Text
                            style={[
                              styles.workerName,
                              { color: theme.color?.val as string },
                            ]}
                          >
                            {s.name}
                          </Text>
                          {isActive && (
                            <Text
                              style={{
                                fontSize: 10,
                                color: s.color ?? (theme.blue10?.val as string),
                                fontWeight: "700",
                              }}
                            >
                              ACTIVA
                            </Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </YStack>
          </ScrollView>
        </Sheet.Frame>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: "absolute",
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 9999,
  },
  pressableArea: {
    flex: 1,
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleLogo: {
    width: BUBBLE_SIZE - 6,
    height: BUBBLE_SIZE - 6,
    borderRadius: (BUBBLE_SIZE - 6) / 2,
  },
  nameTag: {
    position: "absolute",
    top: BUBBLE_SIZE + 4,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRadius: 7,
    maxWidth: 140,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  nameText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  workerMeta: { fontSize: 12 },
  workerInfo: { flex: 1, gap: 2 },
  workerName: { fontSize: 15, fontWeight: "600" },
  workerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
    gap: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
});
