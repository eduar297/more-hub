import { useAuth } from "@/contexts/auth-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useUserRepository } from "@/hooks/use-user-repository";
import type { User, UserRole } from "@/models/user";
import { hashPin } from "@/utils/auth";
import {
    AlertCircle,
    Lock,
    User as UserIcon,
    Users,
} from "@tamagui/lucide-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface LoginSheetProps {
  open: boolean;
  role: UserRole;
  onClose: () => void;
  onSuccess: () => void;
}

export function LoginSheet({
  open,
  role,
  onClose,
  onSuccess,
}: LoginSheetProps) {
  const colorScheme = useColorScheme();
  const userRepo = useUserRepository();
  const { setUser } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const isDark = colorScheme === "dark";
  const c = {
    bg: isDark ? "#1c1c1e" : "#ffffff",
    overlay: "rgba(0,0,0,0.55)",
    text: isDark ? "#f2f2f7" : "#18181b",
    muted: isDark ? "#8e8e93" : "#6b7280",
    border: isDark ? "#38383a" : "#e5e7eb",
    input: isDark ? "#2c2c2e" : "#f3f4f6",
    accent: role === "ADMIN" ? "#3b82f6" : "#22c55e",
    accentLight: role === "ADMIN" ? "#dbeafe" : "#dcfce7",
    error: "#ef4444",
    errorBg: isDark ? "#2d1515" : "#fef2f2",
    userRow: isDark ? "#2c2c2e" : "#f9fafb",
    userRowSelected:
      role === "ADMIN"
        ? isDark
          ? "#1e3a5f"
          : "#dbeafe"
        : isDark
          ? "#14532d"
          : "#dcfce7",
    userRowBorder: isDark ? "#38383a" : "#e5e7eb",
  };

  const roleLabel = role === "ADMIN" ? "Administrador" : "Vendedor";

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const list = await userRepo.findByRole(role);
      setUsers(list);
      // Auto-select if only one user
      if (list.length === 1) setSelectedUser(list[0]);
    } catch {
      // ignore
    } finally {
      setLoadingUsers(false);
    }
  }, [userRepo, role]);

  useEffect(() => {
    if (open) {
      setPin("");
      setError("");
      setSelectedUser(null);
      loadUsers();
    }
  }, [open, loadUsers]);

  const handleLogin = useCallback(async () => {
    if (!selectedUser) {
      setError("Selecciona un usuario");
      return;
    }
    if (!pin.trim()) {
      setError("Ingresa tu PIN");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const pinH = await hashPin(pin);
      const ok = await userRepo.verifyPin(selectedUser.id, pinH);
      if (ok) {
        setUser({
          id: selectedUser.id,
          name: selectedUser.name,
          role: selectedUser.role,
        });
        onSuccess();
      } else {
        setError("PIN incorrecto");
      }
    } catch {
      setError("Error al verificar. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [selectedUser, pin, userRepo, setUser, onSuccess]);

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
              styles.card,
              { backgroundColor: c.bg, borderColor: c.border },
            ]}
          >
            {/* Header */}
            <View style={styles.headerRow}>
              <View
                style={[styles.iconCircle, { backgroundColor: c.accentLight }]}
              >
                {role === "ADMIN" ? (
                  <Lock size={22} color={c.accent as any} />
                ) : (
                  <UserIcon size={22} color={c.accent as any} />
                )}
              </View>
              <Text style={[styles.title, { color: c.text }]}>{roleLabel}</Text>
              <Text style={[styles.subtitle, { color: c.muted }]}>
                Ingresa tus credenciales para continuar
              </Text>
            </View>

            {/* User picker (hidden if only 1 user and auto-selected) */}
            {loadingUsers ? (
              <View style={styles.loaderRow}>
                <ActivityIndicator color={c.accent} />
              </View>
            ) : users.length === 0 ? (
              <View
                style={[
                  styles.emptyBox,
                  { backgroundColor: c.errorBg, borderColor: c.error },
                ]}
              >
                <Users size={20} color={c.error as any} />
                <Text style={[styles.emptyText, { color: c.error }]}>
                  {role === "ADMIN"
                    ? "No hay administradores"
                    : "No hay vendedores"}
                </Text>
              </View>
            ) : users.length > 1 ? (
              <View style={styles.section}>
                <Text style={[styles.label, { color: c.muted }]}>Usuario</Text>
                <View style={[styles.userList, { borderColor: c.border }]}>
                  {users.map((u) => {
                    const selected = selectedUser?.id === u.id;
                    return (
                      <TouchableOpacity
                        key={u.id}
                        style={[
                          styles.userRow,
                          {
                            backgroundColor: selected
                              ? c.userRowSelected
                              : c.userRow,
                            borderBottomColor: c.userRowBorder,
                          },
                        ]}
                        onPress={() => setSelectedUser(u)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.avatar,
                            { backgroundColor: c.accentLight },
                          ]}
                        >
                          <Text
                            style={[styles.avatarText, { color: c.accent }]}
                          >
                            {u.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.userName, { color: c.text }]}>
                          {u.name}
                        </Text>
                        {selected && (
                          <View
                            style={[styles.dot, { backgroundColor: c.accent }]}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : (
              // Single user — show name badge
              <View style={styles.section}>
                <Text style={[styles.label, { color: c.muted }]}>Usuario</Text>
                <View
                  style={[
                    styles.singleUser,
                    {
                      backgroundColor: c.userRowSelected,
                      borderColor: c.border,
                    },
                  ]}
                >
                  <View
                    style={[styles.avatar, { backgroundColor: c.accentLight }]}
                  >
                    <Text style={[styles.avatarText, { color: c.accent }]}>
                      {selectedUser?.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.userName, { color: c.text }]}>
                    {selectedUser?.name}
                  </Text>
                  <View style={[styles.dot, { backgroundColor: c.accent }]} />
                </View>
              </View>
            )}

            {/* PIN input */}
            {users.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.label, { color: c.muted }]}>PIN</Text>
                <TextInput
                  style={[
                    styles.pinInput,
                    {
                      backgroundColor: c.input,
                      color: c.text,
                      borderColor: error ? c.error : c.border,
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
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  autoFocus={users.length === 1}
                />
              </View>
            )}

            {/* Error message */}
            {!!error && (
              <View style={[styles.errorRow, { backgroundColor: c.errorBg }]}>
                <AlertCircle size={16} color={c.error as any} />
                <Text style={[styles.errorText, { color: c.error }]}>
                  {error}
                </Text>
              </View>
            )}

            {/* Buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.btnCancel, { borderColor: c.border }]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnCancelText, { color: c.muted }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              {users.length > 0 && (
                <TouchableOpacity
                  style={[
                    styles.btnLogin,
                    { backgroundColor: c.accent, opacity: loading ? 0.7 : 1 },
                  ]}
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.btnLoginText}>Entrar</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 16,
  },
  headerRow: {
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
    textAlign: "center",
  },
  loaderRow: {
    alignItems: "center",
    paddingVertical: 16,
  },
  emptyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  emptyText: {
    fontSize: 13,
    flex: 1,
  },
  section: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  userList: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  singleUser: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "700",
  },
  userName: {
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pinInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    letterSpacing: 6,
    textAlign: "center",
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
  buttonRow: {
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
  btnLogin: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  btnLoginText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
