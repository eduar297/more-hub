import { useColors } from "@/hooks/use-colors";
import { Cloud, Wifi } from "@tamagui/lucide-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type SyncMode = "lan" | "cloud";

interface SyncModeSelectorProps {
  value: SyncMode;
  onChange: (mode: SyncMode) => void;
}

export function SyncModeSelector({ value, onChange }: SyncModeSelectorProps) {
  const c = useColors();

  const handlePress = (mode: SyncMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(mode);
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[
          styles.tab,
          {
            borderColor: value === "lan" ? c.blue : c.border,
            backgroundColor: value === "lan" ? c.blueLight : c.input,
          },
        ]}
        onPress={() => handlePress("lan")}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.iconCircle,
            {
              backgroundColor: value === "lan" ? c.blue : c.divider,
            },
          ]}
        >
          <Wifi size={18} color={value === "lan" ? "#fff" : (c.muted as any)} />
        </View>
        <Text
          style={[styles.title, { color: value === "lan" ? c.blue : c.text }]}
        >
          Vendedores
        </Text>
        <Text style={[styles.desc, { color: c.muted }]}>Red local (LAN)</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.tab,
          {
            borderColor: value === "cloud" ? c.blue : c.border,
            backgroundColor: value === "cloud" ? c.blueLight : c.input,
          },
        ]}
        onPress={() => handlePress("cloud")}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.iconCircle,
            {
              backgroundColor: value === "cloud" ? c.blue : c.divider,
            },
          ]}
        >
          <Cloud
            size={18}
            color={value === "cloud" ? "#fff" : (c.muted as any)}
          />
        </View>
        <Text
          style={[styles.title, { color: value === "cloud" ? c.blue : c.text }]}
        >
          Nube
        </Text>
        <Text style={[styles.desc, { color: c.muted }]}>
          Requiere conexión a internet
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
  },
  desc: {
    fontSize: 12,
    fontWeight: "400",
  },
});
