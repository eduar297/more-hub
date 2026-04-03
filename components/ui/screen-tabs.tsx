import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable } from "react-native";
import { Text, useTheme, XStack } from "tamagui";

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

export function ScreenTabs<T extends string>({
  tabs,
  active,
  onSelect,
  accentColor,
}: ScreenTabsProps<T>) {
  const theme = useTheme();
  const isCompact = tabs.length > 4;

  const accent = accentColor ?? theme.blue10?.val;
  const railBg = theme.color2?.val;
  const railBorder = theme.borderColor?.val;
  const activePillBg = theme.background?.val;
  const inactiveText = theme.color8?.val;
  const shadowColor = theme.shadowColor?.val;

  return (
    <XStack
      mx="$4"
      mt="$2"
      mb="$3"
      style={{
        borderRadius: 14,
        backgroundColor: railBg,
        borderWidth: 1,
        borderColor: railBorder,
        padding: 3,
        gap: 3,
      }}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(tab.key);
            }}
            style={{
              flex: 1,
              paddingVertical: isCompact ? 7 : 9,
              paddingHorizontal: isCompact ? 2 : 4,
              alignItems: "center",
              gap: isCompact ? 2 : 4,
              borderRadius: 11,
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
            <tab.Icon
              size={isCompact ? 15 : 17}
              color={isActive ? accent : inactiveText}
            />
            <Text
              fontSize={isCompact ? 9 : 11}
              fontWeight={isActive ? "700" : "400"}
              numberOfLines={1}
              style={{
                color: isActive ? accent : inactiveText,
                letterSpacing: isActive ? 0.1 : 0,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </XStack>
  );
}
