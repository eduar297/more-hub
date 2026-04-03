import {
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
    RefreshCw,
    Settings,
    Store,
    UserCog,
    Users,
} from "@tamagui/lucide-icons";
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";

type SettingTab = "workers" | "profile" | "stores" | "prefs" | "sync";

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

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <ScreenTabs tabs={TABS} active={activeTab} onSelect={setActiveTab} />

      {activeTab === "workers" && <WorkersSection />}
      {activeTab === "profile" && <ProfileSection />}
      {activeTab === "stores" && <StoresSection />}
      {activeTab === "sync" && <SyncSection />}
      {activeTab === "prefs" && <PreferencesSection />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
