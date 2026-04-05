import {
    CloudSyncSection,
    PreferencesSection,
    ProfileSection,
    StoresSection,
    SyncSection,
    WorkersSection,
} from "@/components/settings";
import type { TabDef } from "@/components/ui/screen-tabs";
import { ScreenTabs } from "@/components/ui/screen-tabs";
import { useColors } from "@/hooks/use-colors";
import {
    Cloud,
    RefreshCw,
    Settings,
    Store,
    UserCog,
    Users,
    Wifi,
} from "@tamagui/lucide-icons";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type SettingTab = "workers" | "profile" | "stores" | "prefs" | "sync";
type SyncMode = "lan" | "cloud";

const TABS: TabDef<SettingTab>[] = [
  { key: "profile", label: "Mi Perfil", Icon: UserCog },
  { key: "workers", label: "Vendedores", Icon: Users },
  { key: "stores", label: "Tiendas", Icon: Store },
  { key: "sync", label: "Sincronizar", Icon: RefreshCw },
  { key: "prefs", label: "Preferencias", Icon: Settings },
];

export default function SettingsScreen() {
  const c = useColors();
  const [activeTab, setActiveTab] = useState<SettingTab>("profile");
  const [syncMode, setSyncMode] = useState<SyncMode>("lan");

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <ScreenTabs tabs={TABS} active={activeTab} onSelect={setActiveTab} />

      <View style={activeTab === "profile" ? styles.visible : styles.hidden}>
        <ProfileSection />
      </View>
      <View style={activeTab === "workers" ? styles.visible : styles.hidden}>
        <WorkersSection />
      </View>
      <View style={activeTab === "stores" ? styles.visible : styles.hidden}>
        <StoresSection />
      </View>
      <View style={activeTab === "sync" ? styles.visible : styles.hidden}>
        {/* Sync mode toggle */}
        <View style={[styles.syncToggleRow, { borderBottomColor: c.border }]}>
          <TouchableOpacity
            style={[
              styles.syncToggleBtn,
              syncMode === "lan" && { backgroundColor: c.blue },
            ]}
            onPress={() => setSyncMode("lan")}
            activeOpacity={0.7}
          >
            <Wifi
              size={14}
              color={syncMode === "lan" ? "#fff" : (c.muted as any)}
            />
            <Text
              style={[
                styles.syncToggleText,
                { color: syncMode === "lan" ? "#fff" : c.muted },
              ]}
            >
              Vendedores
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.syncToggleBtn,
              syncMode === "cloud" && { backgroundColor: c.blue },
            ]}
            onPress={() => setSyncMode("cloud")}
            activeOpacity={0.7}
          >
            <Cloud
              size={14}
              color={syncMode === "cloud" ? "#fff" : (c.muted as any)}
            />
            <Text
              style={[
                styles.syncToggleText,
                { color: syncMode === "cloud" ? "#fff" : c.muted },
              ]}
            >
              Nube
            </Text>
          </TouchableOpacity>
        </View>
        {syncMode === "lan" ? <SyncSection /> : <CloudSyncSection />}
      </View>
      <View style={activeTab === "prefs" ? styles.visible : styles.hidden}>
        <PreferencesSection />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  visible: { flex: 1 },
  hidden: { display: "none" },
  syncToggleRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  syncToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  syncToggleText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
