import { useNotifications } from "@/components/ui/notification-provider";
import { ICON_BTN_BG, OVERLAY_HEAVY } from "@/constants/colors";
import { useColors } from "@/hooks/use-colors";
import type {
    NotificationPrefKey,
    ScheduledReminder,
} from "@/services/notifications/types";
import { Picker } from "@react-native-picker/picker";
import {
    Bell,
    BellOff,
    Clock,
    Package,
    Plus,
    RefreshCw,
    Trash2,
    X,
} from "@tamagui/lucide-icons";
import * as Crypto from "expo-crypto";
import React, { useCallback, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import {
    Button,
    Input,
    Text as TText,
    TextArea,
    XStack,
    YStack,
} from "tamagui";
import { settingStyles as styles } from "./shared";

// ── Pref display config ─────────────────────────────────────────────────────

const PREF_ITEMS: {
  key: NotificationPrefKey;
  label: string;
  description: string;
  Icon: typeof Bell;
  colorKey: "blue" | "green" | "orange" | "danger";
}[] = [
  {
    key: "notif_sync_reminder",
    label: "Recordatorios de sincronización",
    description:
      "Notificaciones programadas para recordarte sincronizar con los vendedores",
    Icon: RefreshCw,
    colorKey: "blue",
  },
  {
    key: "notif_sync_result",
    label: "Resultados de sincronización",
    description:
      "Notificación al completar una sincronización con los cambios realizados",
    Icon: RefreshCw,
    colorKey: "green",
  },
  {
    key: "notif_stock_alert",
    label: "Alertas de inventario",
    description: "Avisos cuando un producto tiene stock bajo o se agota",
    Icon: Package,
    colorKey: "orange",
  },
  {
    key: "notif_general",
    label: "Notificaciones generales",
    description: "Información general y avisos del sistema",
    Icon: Bell,
    colorKey: "blue",
  },
];

// ── Embeddable notification cards (used inside PreferencesSection) ───────────

export function NotificationCards() {
  const c = useColors();
  const {
    prefs,
    togglePref,
    reminders,
    updateReminder,
    addReminder,
    deleteReminder,
    hasPermission,
    notify,
  } = useNotifications();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingReminder, setEditingReminder] =
    useState<ScheduledReminder | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formHour, setFormHour] = useState(8);
  const [formMinute, setFormMinute] = useState(0);

  const openEditSheet = useCallback((reminder: ScheduledReminder) => {
    setEditingReminder(reminder);
    setFormLabel(reminder.label);
    setFormBody(reminder.body);
    setFormHour(reminder.hour);
    setFormMinute(reminder.minute);
    setSheetOpen(true);
  }, []);

  const openCreateSheet = useCallback(() => {
    setEditingReminder(null);
    setFormLabel("");
    setFormBody("");
    setFormHour(9);
    setFormMinute(0);
    setSheetOpen(true);
  }, []);

  const handleSaveReminder = useCallback(async () => {
    const label = formLabel.trim();
    if (!label) return;
    const body = formBody.trim() || label;

    if (editingReminder) {
      await updateReminder({
        ...editingReminder,
        label,
        body,
        hour: formHour,
        minute: formMinute,
      });
    } else {
      await addReminder({
        id: `custom_${Crypto.randomUUID()}`,
        label,
        body,
        hour: formHour,
        minute: formMinute,
        enabled: true,
        category: "general",
        deletable: true,
      });
    }
    setSheetOpen(false);
  }, [
    editingReminder,
    formLabel,
    formBody,
    formHour,
    formMinute,
    updateReminder,
    addReminder,
  ]);

  const handleDeleteReminder = useCallback(
    (reminder: ScheduledReminder) => {
      Alert.alert("Eliminar recordatorio", `¿Eliminar "${reminder.label}"?`, [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => deleteReminder(reminder.id),
        },
      ]);
    },
    [deleteReminder],
  );

  const handleTestNotification = useCallback(() => {
    notify({
      category: "general",
      severity: "success",
      title: "Notificación de prueba",
      body: "¡Las notificaciones están funcionando correctamente!",
    });
  }, [notify]);

  return (
    <>
      {/* ── Permission warning ───────────────────────────────────── */}
      {!hasPermission && (
        <View
          style={[
            styles.profileCard,
            {
              backgroundColor: c.card,
              borderColor: c.danger,
              borderWidth: 1.5,
            },
          ]}
        >
          <View style={styles.cardTitleRow}>
            <BellOff size={15} color={c.danger as any} />
            <Text style={[styles.cardTitle, { color: c.danger }]}>
              Permisos requeridos
            </Text>
          </View>
          <Text
            style={[
              styles.workerMeta,
              { color: c.muted, paddingHorizontal: 14, paddingBottom: 12 },
            ]}
          >
            Las notificaciones del sistema están desactivadas. Actívalas en
            Ajustes del dispositivo para recibir recordatorios.
          </Text>
        </View>
      )}

      {/* ── Notification types ───────────────────────────────────── */}
      <View
        style={[
          styles.profileCard,
          { backgroundColor: c.card, borderColor: c.border },
        ]}
      >
        <View style={styles.cardTitleRow}>
          <Bell size={14} color={c.blue as any} />
          <Text style={[styles.cardTitle, { color: c.text }]}>
            Notificaciones
          </Text>
        </View>

        {PREF_ITEMS.map((item) => (
          <View key={item.key} style={styles.prefRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <item.Icon size={14} color={c[item.colorKey] as any} />
                <Text style={[styles.workerName, { color: c.text }]}>
                  {item.label}
                </Text>
              </View>
              <Text style={[styles.workerMeta, { color: c.muted }]}>
                {item.description}
              </Text>
            </View>
            <Switch
              value={prefs[item.key]}
              onValueChange={(v) => togglePref(item.key, v)}
              trackColor={{ false: c.border, true: c.blue }}
            />
          </View>
        ))}

        {/* Test button inline */}
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          <TouchableOpacity
            style={[
              styles.addBtn,
              { backgroundColor: c.blue, alignSelf: "flex-start" },
            ]}
            onPress={handleTestNotification}
          >
            <Bell size={14} color="#fff" />
            <Text style={styles.addBtnText}>Probar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Scheduled reminders ──────────────────────────────────── */}
      <View
        style={[
          styles.profileCard,
          { backgroundColor: c.card, borderColor: c.border },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={styles.cardTitleRow}>
            <Clock size={14} color={c.blue as any} />
            <Text style={[styles.cardTitle, { color: c.text }]}>
              Recordatorios programados
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.addBtn,
              { backgroundColor: c.blue, paddingVertical: 6 },
            ]}
            onPress={openCreateSheet}
          >
            <Plus size={14} color="#fff" />
            <Text style={[styles.addBtnText, { fontSize: 12 }]}>Nuevo</Text>
          </TouchableOpacity>
        </View>
        <Text
          style={[
            styles.workerMeta,
            { color: c.muted, paddingHorizontal: 14, marginTop: -4 },
          ]}
        >
          Toca un recordatorio para ajustar su horario y mensaje
        </Text>

        {reminders.map((reminder) => (
          <View key={reminder.id} style={styles.prefRow}>
            <TouchableOpacity
              style={{ flex: 1, gap: 4 }}
              onPress={() => openEditSheet(reminder)}
              activeOpacity={0.7}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                {reminder.deletable !== false ? (
                  <Bell size={12} color={c.muted as any} />
                ) : (
                  <RefreshCw size={12} color={c.blue as any} />
                )}
                <Text style={[styles.workerName, { color: c.text }]}>
                  {reminder.label}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  opacity: reminder.enabled ? 1 : 0.4,
                }}
              >
                <Clock size={12} color={c.blue as any} />
                <Text
                  style={{
                    fontSize: 15,
                    color: c.blue,
                    fontWeight: "600",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {String(reminder.hour).padStart(2, "0")}:
                  {String(reminder.minute).padStart(2, "0")}
                </Text>
                <Text style={{ fontSize: 11, color: c.muted, marginLeft: 4 }}>
                  toca para ajustar
                </Text>
              </View>
            </TouchableOpacity>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              {reminder.deletable !== false && (
                <TouchableOpacity
                  onPress={() => handleDeleteReminder(reminder)}
                  hitSlop={8}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    backgroundColor: c.dangerBg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Trash2 size={14} color={c.danger as any} />
                </TouchableOpacity>
              )}
              <Switch
                value={reminder.enabled}
                onValueChange={(v) =>
                  updateReminder({ ...reminder, enabled: v })
                }
                trackColor={{ false: c.border, true: c.blue }}
              />
            </View>
          </View>
        ))}
      </View>

      {/* ── Reminder edit/create Modal ────────────────────────────── */}
      <Modal
        visible={sheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setSheetOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: OVERLAY_HEAVY,
              justifyContent: "center",
              paddingHorizontal: 20,
            }}
          >
            <View
              style={{
                backgroundColor: c.card,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: c.border,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.35,
                shadowRadius: 24,
                elevation: 16,
              }}
            >
              <YStack gap="$3" p="$4">
                <XStack items="center" justify="space-between">
                  <XStack items="center" gap="$2" flex={1}>
                    <Clock size={18} color={c.blue as any} />
                    <TText fontSize="$6" fontWeight="bold" color="$color">
                      {editingReminder
                        ? "Editar recordatorio"
                        : "Nuevo recordatorio"}
                    </TText>
                  </XStack>
                  <TouchableOpacity
                    onPress={() => setSheetOpen(false)}
                    hitSlop={8}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: ICON_BTN_BG,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <X size={18} color={c.text as any} />
                  </TouchableOpacity>
                </XStack>

                {/* Label */}
                <YStack gap="$1">
                  <TText
                    fontSize="$2"
                    fontWeight="600"
                    color="$color10"
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    Nombre *
                  </TText>
                  <Input
                    placeholder="Ej: Revisar inventario"
                    value={formLabel}
                    onChangeText={(v: string) => setFormLabel(v)}
                    autoCapitalize="sentences"
                    returnKeyType="next"
                    size="$4"
                  />
                </YStack>

                {/* Body */}
                <YStack gap="$1">
                  <TText
                    fontSize="$2"
                    fontWeight="600"
                    color="$color10"
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    Mensaje
                  </TText>
                  <TextArea
                    placeholder="Texto que aparecerá en la notificación"
                    value={formBody}
                    onChangeText={(v: string) => setFormBody(v)}
                    autoCapitalize="sentences"
                    size="$4"
                    numberOfLines={3}
                    verticalAlign="top"
                  />
                </YStack>

                {/* Time picker */}
                <YStack gap="$1">
                  <TText
                    fontSize="$2"
                    fontWeight="600"
                    color="$color10"
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    Hora
                  </TText>
                  <XStack items="center" justify="center">
                    <View style={{ width: 100 }}>
                      <Picker
                        selectedValue={formHour}
                        onValueChange={(v: number) => setFormHour(v)}
                        itemStyle={{ color: c.text, fontSize: 22 }}
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <Picker.Item
                            key={i}
                            label={String(i).padStart(2, "0")}
                            value={i}
                          />
                        ))}
                      </Picker>
                    </View>
                    <TText fontSize={24} fontWeight="700" color="$color10">
                      :
                    </TText>
                    <View style={{ width: 100 }}>
                      <Picker
                        selectedValue={formMinute}
                        onValueChange={(v: number) => setFormMinute(v)}
                        itemStyle={{ color: c.text, fontSize: 22 }}
                      >
                        {Array.from({ length: 60 }, (_, i) => (
                          <Picker.Item
                            key={i}
                            label={String(i).padStart(2, "0")}
                            value={i}
                          />
                        ))}
                      </Picker>
                    </View>
                  </XStack>
                </YStack>

                <XStack gap="$2.5" mt="$1">
                  <Button
                    flex={1}
                    variant="outlined"
                    onPress={() => setSheetOpen(false)}
                    size="$4"
                  >
                    Cancelar
                  </Button>
                  <Button
                    flex={1}
                    theme="blue"
                    onPress={handleSaveReminder}
                    disabled={!formLabel.trim()}
                    opacity={!formLabel.trim() ? 0.5 : 1}
                    size="$4"
                  >
                    Guardar
                  </Button>
                </XStack>
              </YStack>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
