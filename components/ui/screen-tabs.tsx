import * as Haptics from "expo-haptics";
import React, { Fragment, useCallback, useRef } from "react";
import { Pressable, ScrollView, useWindowDimensions } from "react-native";
import { Text, useTheme, View } from "tamagui";

export interface TabDef<T extends string = string> {
  key: T;
  label: string;
  Icon: React.ComponentType<any>;
}

interface ScreenTabsProps<T extends string> {
  tabs: TabDef<T>[];
  active: T;
  onSelect: (key: T) => void;
  accentColor?: string;
}

const TAB_WIDTH = 68;
const RAIL_H_PADDING = 16;
const RAIL_PAD = 4;
const TAB_GAP = 4;
const DIVIDER_WIDTH = 1;
const DIVIDER_TOTAL = DIVIDER_WIDTH + TAB_GAP * 2;

export function ScreenTabs<T extends string>({
  tabs,
  active,
  onSelect,
  accentColor,
}: ScreenTabsProps<T>) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);

  const accent = accentColor ?? theme.blue10?.val;
  const railBg = theme.color2?.val;
  const railBorder = theme.borderColor?.val;
  const activePillBg = theme.background?.val;
  const inactiveText = theme.color8?.val;
  const dividerColor = theme.color6?.val;
  const shadowColor = theme.shadowColor?.val;

  const availableWidth = screenWidth - RAIL_H_PADDING * 2;
  const contentWidth =
    tabs.length * TAB_WIDTH + DIVIDER_TOTAL * (tabs.length - 1) + RAIL_PAD * 2;
  const fitsInline = contentWidth <= availableWidth;

  const handleSelect = useCallback(
    (key: T, index: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelect(key);
      if (!fitsInline) {
        const x =
          index * (TAB_WIDTH + DIVIDER_TOTAL) -
          availableWidth / 2 +
          TAB_WIDTH / 2;
        scrollRef.current?.scrollTo({ x: Math.max(0, x), animated: true });
      }
    },
    [onSelect, fitsInline, availableWidth],
  );

  const rail = (
    <View
      style={{
        flexDirection: "row",
        padding: RAIL_PAD,
        alignItems: "stretch",
      }}
    >
      {tabs.map((tab, i) => {
        const isActive = active === tab.key;
        return (
          <Fragment key={tab.key}>
            <Pressable
              onPress={() => handleSelect(tab.key, i)}
              style={{
                flex: fitsInline ? 1 : undefined,
                width: fitsInline ? undefined : TAB_WIDTH,
                minHeight: 34,
                paddingVertical: 6,
                paddingHorizontal: 4,
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                borderRadius: 9,
                borderWidth: 1,
                borderColor: isActive ? accent : "transparent",
                backgroundColor: isActive ? activePillBg : "transparent",
                shadowColor: shadowColor,
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: isActive ? 1 : 0,
                shadowRadius: 3,
                elevation: isActive ? 2 : 0,
              }}
            >
              <tab.Icon size={15} color={isActive ? accent : inactiveText} />
              <Text
                fontSize={10}
                fontWeight={"400"}
                numberOfLines={1}
                style={{
                  color: isActive ? accent : inactiveText,
                  letterSpacing: 0,
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
            {i < tabs.length - 1 ? (
              <View
                style={{
                  width: 1,
                  marginHorizontal: TAB_GAP,
                  marginVertical: 6,
                  borderRadius: 999,
                  backgroundColor: dividerColor,
                  opacity: 0.6,
                }}
              />
            ) : null}
          </Fragment>
        );
      })}
    </View>
  );

  return (
    <View
      mx="$4"
      mt="$1"
      mb="$2"
      style={{
        borderRadius: 12,
        backgroundColor: railBg,
        borderWidth: 1,
        borderColor: railBorder,
        overflow: "hidden",
      }}
    >
      {fitsInline ? (
        rail
      ) : (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 0 }}
        >
          {rail}
        </ScrollView>
      )}
    </View>
  );
}
