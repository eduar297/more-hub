import { useColorScheme } from "@/hooks/use-color-scheme";
import { useUserRepository } from "@/hooks/use-user-repository";
import type { User } from "@/models/user";
import { hashPin } from "@/utils/auth";
import {
    AlertCircle,
    Edit3,
    Plus,
    Trash2,
    User as UserIcon,
    Users,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

// ── Worker form modal ─────────────────────────────────────────────────────────

interface WorkerFormProps {
  open: boolean;
  editing: User | null;
  onClose: () => void;
  onSave: (name: string, pin: string) => Promise<void>;
}

function WorkerForm({ open, editing, onClose, onSave }: WorkerFormProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const c = {
    bg: isDark ? "#1c1c1e" : "#ffffff",
    overlay: "rgba(0,0,0,0.55)",
    text: isDark ? "#f2f2f7" : "#18181b",
    muted: isDark ? "#8e8e93" : "#6b7280",
    border: isDark ? "#38383a" : "#e5e7eb",
    input: isDark ? "#2c2c2e" : "#f3f4f6",
    accent: "#22c55e",
    accentLight: isDark ? "#14532d" : "#dcfce7",
    error: "#ef4444",
    errorBg: isDark ? "#2d1515" : "#fef2f2",
  };

  useFocusEffect(
    useCallback(() => {
      if (open) {
        setName(editing?.name ?? "");
        setPin("");
        setPinConfirm("");
        setError("");
      }
    }, [open, editing]),
  );

  // Also reset when open changes
  React.useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setPin("");
      setPinConfirm("");
      setError("");
    }
  }, [open, editing]);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("El nombre es obligatorio");
      return;
    }
    if (!editing) {
      // creating — PIN required
      if (!pin) {
        setError("El PIN es obligatorio");
        return;
      }
    }
    if (pin && pin !== pinConfirm) {
      setError("Los PIN no coinciden");
      return;
    }
    if (pin && pin.length < 4) {
      setError("El PIN debe tener al menos 4 dígitos");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(trimmedName, pin);
    } catch (e) {
      setError((e as Error).message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [name, pin, pinConfirm, editing, onSave]);

  if (!open) return null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={[styles.overlay, { backgroundColor: c.overlay }]}
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View
            style={[
              styles.formCard,
              { backgroundColor: c.bg, borderColor: c.border },
            ]}
          >
            <Text style={[styles.formTitle, { color: c.text }]}>
              {editing ? "Editar vendedor" : "Nuevo vendedor"}
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: c.muted }]}>
                Nombre
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: c.input,
                    color: c.text,
                    borderColor: c.border,
                  },
                ]}
                placeholder="Nombre del vendedor"
                placeholderTextColor={c.muted}
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  setError("");
                }}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: c.muted }]}>
                {editing ? "Nuevo PIN (dejar vacío para no cambiar)" : "PIN"}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: c.input,
                    color: c.text,
                    borderColor: c.border,
                  },
                ]}
                placeholder="••••"
                placeholderTextColor={c.muted}
                value={pin}
                onChangeText={(v) => {
                  setPin(v);
                  setError("");
                }}
                secureTextEntry
                keyboardType="numeric"
                maxLength={8}
                returnKeyType="next"
              />
            </View>

            {pin.length > 0 && (
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: c.muted }]}>
                  Confirmar PIN
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: c.input,
                      color: c.text,
                      borderColor: c.border,
                    },
                  ]}
                  placeholder="••••"
                  placeholderTextColor={c.muted}
                  value={pinConfirm}
                  onChangeText={(v) => {
                    setPinConfirm(v);
                    setError("");
                  }}
                  secureTextEntry
                  keyboardType="numeric"
                  maxLength={8}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
              </View>
            )}

            {!!error && (
              <View style={[styles.errorRow, { backgroundColor: c.errorBg }]}>
                <AlertCircle size={16} color={c.error as any} />
                <Text style={[styles.errorText, { color: c.error }]}>
                  {error}
                </Text>
              </View>
            )}

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.btnCancel, { borderColor: c.border }]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnCancelText, { color: c.muted }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btnSave,
                  { backgroundColor: c.accent, opacity: saving ? 0.7 : 1 },
                ]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnSaveText}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function WorkersScreen() {
  const colorScheme = useColorScheme();
  const userRepo = useUserRepository();
  const isDark = colorScheme === "dark";

  const [workers, setWorkers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const c = {
    bg: isDark ? "#151718" : "#f8fafc",
    card: isDark ? "#1c1c1e" : "#ffffff",
    text: isDark ? "#f2f2f7" : "#18181b",
    muted: isDark ? "#8e8e93" : "#6b7280",
    border: isDark ? "#38383a" : "#e5e7eb",
    accent: "#22c55e",
    accentLight: isDark ? "#14532d" : "#dcfce7",
    danger: "#ef4444",
    dangerLight: isDark ? "#2d1515" : "#fef2f2",
    rowBg: isDark ? "#1c1c1e" : "#ffffff",
    rowBorder: isDark ? "#2c2c2e" : "#f1f5f9",
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await userRepo.findByRole("WORKER");
      setWorkers(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [userRepo]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((w: User) => {
    setEditing(w);
    setFormOpen(true);
  }, []);

  const handleSave = useCallback(
    async (name: string, pin: string) => {
      if (editing) {
        const updates: { name: string; pinHash?: string } = { name };
        if (pin) {
          updates.pinHash = await hashPin(pin);
        }
        await userRepo.update(editing.id, updates);
      } else {
        const pinHash = await hashPin(pin);
        await userRepo.create({ name, role: "WORKER", pinHash });
      }
      setFormOpen(false);
      load();
    },
    [editing, userRepo, load],
  );

  const handleDelete = useCallback(
    (w: User) => {
      Alert.alert(
        "Eliminar vendedor",
        `¿Eliminar a "${w.name}"? Esta acción no se puede deshacer.`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Eliminar",
            style: "destructive",
            onPress: async () => {
              await userRepo.delete(w.id);
              load();
            },
          },
        ],
      );
    },
    [userRepo, load],
  );

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      {/* Action bar */}
      <View style={[styles.actionBar, { borderBottomColor: c.border }]}>
        <Text style={[styles.statsText, { color: c.muted }]}>
          {workers.length} vendedor{workers.length !== 1 ? "es" : ""} registrado
          {workers.length !== 1 ? "s" : ""}
        </Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: c.accent }]}
          onPress={openCreate}
          activeOpacity={0.8}
        >
          <Plus size={18} color="#fff" />
          <Text style={styles.addBtnText}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={c.accent} size="large" />
          </View>
        ) : workers.length === 0 ? (
          <View style={styles.centerBox}>
            <View
              style={[styles.emptyIcon, { backgroundColor: c.accentLight }]}
            >
              <Users size={36} color={c.accent as any} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.text }]}>
              Sin vendedores
            </Text>
            <Text style={[styles.emptyDesc, { color: c.muted }]}>
              Añade tu primer vendedor para que pueda acceder al panel de
              ventas.
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.listCard,
              { backgroundColor: c.rowBg, borderColor: c.border },
            ]}
          >
            {workers.map((w, idx) => (
              <View key={w.id}>
                {idx > 0 && (
                  <View
                    style={[styles.divider, { backgroundColor: c.rowBorder }]}
                  />
                )}
                <View style={styles.workerRow}>
                  <View
                    style={[styles.avatar, { backgroundColor: c.accentLight }]}
                  >
                    <Text style={[styles.avatarText, { color: c.accent }]}>
                      {w.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.workerInfo}>
                    <Text style={[styles.workerName, { color: c.text }]}>
                      {w.name}
                    </Text>
                    <Text style={[styles.workerMeta, { color: c.muted }]}>
                      Vendedor · PIN configurado
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      style={[
                        styles.iconBtn,
                        { backgroundColor: isDark ? "#2c2c2e" : "#f1f5f9" },
                      ]}
                      onPress={() => openEdit(w)}
                      activeOpacity={0.7}
                    >
                      <Edit3 size={16} color={c.muted as any} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.iconBtn,
                        { backgroundColor: c.dangerLight },
                      ]}
                      onPress={() => handleDelete(w)}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={16} color={c.danger as any} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <WorkerForm
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statsText: {
    fontSize: 13,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  listContent: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  emptyDesc: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 260,
  },
  listCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 60,
  },
  workerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "700",
  },
  workerInfo: {
    flex: 1,
    gap: 2,
  },
  workerName: {
    fontSize: 15,
    fontWeight: "600",
  },
  workerMeta: {
    fontSize: 12,
  },
  rowActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  // Form modal
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  formCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 16,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  btnCancel: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  btnCancelText: {
    fontSize: 15,
    fontWeight: "600",
  },
  btnSave: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSaveText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  // suppress TS warning for unused UserIcon
  _unused: { display: "none" } as any,
});

// Suppress unused import warning
void (UserIcon as unknown);
