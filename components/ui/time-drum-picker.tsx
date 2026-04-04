import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef } from "react";
import {
    FlatList,
    type NativeScrollEvent,
    type NativeSyntheticEvent
} from "react-native";
import { Text, View, XStack, useTheme } from "tamagui";

// ── Helpers ─────────────────────────────────────────────────────────────────

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

function generateHours(): number[] {
  return Array.from({ length: 24 }, (_, i) => i);
}

function generateMinutes(step: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < 60; i += step) result.push(i);
  return result;
}

// ── Single drum column ──────────────────────────────────────────────────────

interface DrumColumnProps {
  data: number[];
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}

function DrumColumn({ data, value, onChange, format }: DrumColumnProps) {
  const theme = useTheme();
  const listRef = useRef<FlatList>(null);
  const isScrollingRef = useRef(false);
  const lastSnappedRef = useRef(value);

  const textColor = theme.color?.val as string;
  const mutedColor = theme.color6?.val as string;
  const highlightBg = theme.color3?.val as string;

  const currentIndex = data.indexOf(value);

  // Scroll to initial value on mount
  useEffect(() => {
    if (currentIndex >= 0) {
      setTimeout(() => {
        listRef.current?.scrollToOffset({
          offset: currentIndex * ITEM_HEIGHT,
          animated: false,
        });
      }, 50);
    }
  }, []);

  // Sync when value changes externally (but not during user scroll)
  useEffect(() => {
    if (!isScrollingRef.current && currentIndex >= 0) {
      listRef.current?.scrollToOffset({
        offset: currentIndex * ITEM_HEIGHT,
        animated: true,
      });
    }
  }, [value, currentIndex]);

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      isScrollingRef.current = false;
      const y = event.nativeEvent.contentOffset.y;
      const index = Math.round(y / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(index, data.length - 1));
      const newVal = data[clamped];
      if (newVal !== lastSnappedRef.current) {
        lastSnappedRef.current = newVal;
        Haptics.selectionAsync();
        onChange(newVal);
      }
    },
    [data, onChange],
  );

  const handleScrollBegin = useCallback(() => {
    isScrollingRef.current = true;
  }, []);

  const fmt = format ?? ((v: number) => String(v).padStart(2, "0"));

  const renderItem = useCallback(
    ({ item, index }: { item: number; index: number }) => {
      const isSelected = item === value;
      return (
        <View height={ITEM_HEIGHT} items="center" justify="center">
          <Text
            fontSize={isSelected ? 28 : 18}
            fontWeight={isSelected ? "700" : "400"}
            color={isSelected ? (textColor as any) : (mutedColor as any)}
            opacity={isSelected ? 1 : 0.5}
            fontVariant={["tabular-nums"]}
          >
            {fmt(item)}
          </Text>
        </View>
      );
    },
    [value, textColor, mutedColor, fmt],
  );

  return (
    <View height={PICKER_HEIGHT} overflow="hidden" width={80}>
      {/* Selection highlight */}
      <View
        position="absolute"
        t={ITEM_HEIGHT * 2}
        l={0}
        r={0}
        height={ITEM_HEIGHT}
        bg={highlightBg as any}
        rounded={10}
        pointerEvents="none"
        z={0}
      />
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item) => String(item)}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: ITEM_HEIGHT * 2,
          paddingBottom: ITEM_HEIGHT * 2,
        }}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollBeginDrag={handleScrollBegin}
        bounces={false}
      />
    </View>
  );
}

// ── Public component ────────────────────────────────────────────────────────

interface TimeDrumPickerProps {
  hour: number;
  minute: number;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
  minuteStep?: number;
}

const HOURS = generateHours();

export function TimeDrumPicker({
  hour,
  minute,
  onHourChange,
  onMinuteChange,
  minuteStep = 5,
}: TimeDrumPickerProps) {
  const theme = useTheme();
  const textColor = theme.color?.val as string;
  const minutes = React.useMemo(
    () => generateMinutes(minuteStep),
    [minuteStep],
  );

  // Snap to nearest valid minute if current minute isn't in the step list
  useEffect(() => {
    if (!minutes.includes(minute)) {
      const nearest = minutes.reduce((prev, curr) =>
        Math.abs(curr - minute) < Math.abs(prev - minute) ? curr : prev,
      );
      onMinuteChange(nearest);
    }
  }, [minute, minutes, onMinuteChange]);

  return (
    <XStack items="center" justify="center" gap="$2">
      <DrumColumn data={HOURS} value={hour} onChange={onHourChange} />
      <Text fontSize={32} fontWeight="700" color={textColor as any} mt={-2}>
        :
      </Text>
      <DrumColumn data={minutes} value={minute} onChange={onMinuteChange} />
    </XStack>
  );
}
