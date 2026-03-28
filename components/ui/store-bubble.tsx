import { useAuth } from "@/contexts/auth-context";
import { usePreferences } from "@/contexts/preferences-context";
import { useStore } from "@/contexts/store-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Store as StoreIcon } from "@tamagui/lucide-icons";
import React, { useCallback, useEffect, useRef } from "react";
import {
    Animated,
    Dimensions,
    Image,
    PanResponder,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BUBBLE_SIZE = 44;
const EDGE_MARGIN = 8;
const FADE_DELAY = 4000;
const IDLE_OPACITY = 0.3;

export function StoreBubble() {
  // All hooks BEFORE any conditional return (Rules of Hooks)
  const { showStoreBubble } = usePreferences();
  const { currentStore } = useStore();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();

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

  // Bubble only lives inside admin & worker (user is null on role-select page)
  if (!user || !showStoreBubble || !currentStore) return null;

  const storeColor = currentStore.color ?? "#3b82f6";
  const isDark = colorScheme === "dark";
  const borderColor = isDark ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.15)";

  return (
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: "absolute",
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 9999,
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
});
