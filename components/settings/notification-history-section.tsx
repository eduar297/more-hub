import { useNotifications } from "@/components/ui/notification-provider";
import type { NotificationHistoryEntry } from "@/components/ui/notification-provider";
import { useColors } from "@/hooks/use-colors";
import type { NotificationCategory } from "@/services/notifications/types";
import {
    AlertCircle,
    Bell,
    CheckCircle,
    Info,
    Package,
    RefreshCw,
    Trash2,
    TriangleAlert,
} from "@tamagui/lucide-icons";
import React, { useCallback } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { settingStyles as styles } from "./shared";

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  sync_reminder: "Sincronización",
  sync_result: "Sincronización",
  stock_alert: "Inventario",
  general: "General",
};

const CATEGORY_ICON: Record<NotificationCategory, typeof Bell> = {
  sync_reminder: RefreshCw,
  sync_result: RefreshCw,
  stock_alert: Package,
  general: Bell,
};

function SeverityIcon({
  severity,
  color,
}: {
  severity: string;
  color: string;
}) {
  const size = 14;
  switch (severity) {
    case "error":
      return <AlertCircle size={size} color={color as any} />;
    case "warning":
      return <TriangleAlert size={size} color={color as any} />;
    case "success":
      return <CheckCircle size={size} color={color as any} />;
    default:
      return <Info size={size} color={color as any} />;
  }
}

function severityColor(
  severity: string,
  c: ReturnType<typeof useColors>,
): string {
  switch (severity) {
    case "error":
      return c.danger;
    case "warning":
      return c.orange;
    case "success":
      return c.green;
    default:
      return c.blue;
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;
    if (isToday) return `Hoy ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      d.getFullYear() === yesterday.getFullYear() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getDate() === yesterday.getDate();
    if (isYesterday) return `Ayer ${time}`;
    return `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1,
    ).padStart(2, "0")} ${time}`;
  } catch {
    return iso;
  }
}

interface NotificationHistorySectionProps {
  /** Pass history from parent when rendered inside a Modal (context may be lost) */
  historyData?: NotificationHistoryEntry[];
  /** Pass clearHistory from parent when rendered inside a Modal */
  onClear?: () => Promise<void>;
}

export function NotificationHistorySection({
  historyData,
  onClear,
}: NotificationHistorySectionProps = {}) {
  const c = useColors();
  const ctx = useNotifications();
  const history = historyData ?? ctx.history;
  const clearHistory = onClear ?? ctx.clearHistory;

  const handleClear = useCallback(() => {
    Alert.alert(
      "Limpiar historial",
      "¿Eliminar todas las notificaciones del historial?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: clearHistory },
      ],
    );
  }, [clearHistory]);

  return (
    <View style={styles.sectionRoot}>
      <View style={[styles.actionBar, { borderBottomColor: c.border }]}>
        <Text style={[styles.statsText, { color: c.muted }]}>
          {history.length} notificación{history.length !== 1 ? "es" : ""}
        </Text>
        {history.length > 0 && (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: c.danger }]}
            onPress={handleClear}
            activeOpacity={0.8}
          >
            <Trash2 size={14} color="#fff" />
            <Text style={styles.addBtnText}>Limpiar</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {history.length === 0 ? (
          <View style={styles.centerBox}>
            <View style={[styles.emptyIcon, { backgroundColor: c.blueLight }]}>
              <Bell size={34} color={c.blue as any} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.text }]}>
              Sin notificaciones
            </Text>
            <Text style={[styles.emptyDesc, { color: c.muted }]}>
              Aquí verás el historial de notificaciones enviadas.
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.listCard,
              { backgroundColor: c.rowBg, borderColor: c.border },
            ]}
          >
            {history.map((entry, idx) => {
              const sColor = severityColor(entry.severity, c);
              const CatIcon =
                CATEGORY_ICON[entry.category as NotificationCategory] ?? Bell;
              return (
                <View key={entry.id}>
                  {idx > 0 && (
                    <View
                      style={[styles.divider, { backgroundColor: c.divider }]}
                    />
                  )}
                  <View style={[styles.workerRow, { paddingVertical: 12 }]}>
                    <View
                      style={[
                        styles.avatar,
                        {
                          backgroundColor: `${sColor}18`,
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                        },
                      ]}
                    >
                      <SeverityIcon severity={entry.severity} color={sColor} />
                    </View>
                    <View style={[styles.workerInfo, { gap: 3 }]}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Text
                          style={[
                            styles.workerName,
                            { color: c.text, fontSize: 14 },
                          ]}
                          numberOfLines={1}
                        >
                          {entry.title}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.workerMeta,
                          { color: c.muted, lineHeight: 16 },
                        ]}
                        numberOfLines={2}
                      >
                        {entry.body}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 2,
                        }}
                      >
                        <CatIcon size={10} color={c.muted as any} />
                        <Text
                          style={{
                            fontSize: 10,
                            color: c.muted,
                            textTransform: "uppercase",
                            fontWeight: "600",
                            letterSpacing: 0.5,
                          }}
                        >
                          {CATEGORY_LABEL[
                            entry.category as NotificationCategory
                          ] ?? entry.category}
                        </Text>
                        <Text style={{ fontSize: 10, color: c.muted }}>·</Text>
                        <Text style={{ fontSize: 10, color: c.muted }}>
                          {formatDate(entry.createdAt)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
