import { useAuth } from "@/contexts/auth-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useUserRepository } from "@/hooks/use-user-repository";
import type { User, UserRole } from "@/models/user";
import { hashPin } from "@/utils/auth";
import {
  AlertCircle,
  ChevronDown,
  Lock,
  User as UserIcon,
  Users,
} from "@tamagui/lucide-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
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
  const [verifying, setVerifying] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const pinRef = useRef<TextInput>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

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

  // Focus PIN when a user is selected
  useEffect(() => {
    if (selectedUser) {
      setTimeout(() => pinRef.current?.focus(), 100);
    }
  }, [selectedUser]);

  useEffect(() => {
    if (open) {
      setPin("");
      setError("");
      setSelectedUser(null);
      loadUsers();
    }
  }, [open, loadUsers]);

  const triggerShake = useCallback(() => {
    Vibration.vibrate(300);
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeAnim]);

  const tryAutoLogin = useCallback(
    async (currentPin: string, user: User) => {
      if (currentPin.length < 4) return;
      setVerifying(true);
      setError("");
      try {
        const pinH = await hashPin(currentPin);
        const ok = await userRepo.verifyPin(user.id, pinH);
        if (ok) {
          setUser({
            id: user.id,
            name: user.name,
            role: user.role,
            photoUri: user.photoUri,
          });
          onSuccess();
        } else {
          triggerShake();
          setPin("");
          setError("PIN incorrecto");
        }
      } catch {
        triggerShake();
        setPin("");
        setError("Error al verificar. Intenta de nuevo.");
      } finally {
        setVerifying(false);
      }
    },
    [userRepo, setUser, onSuccess, triggerShake],
  );

  const handlePinChange = useCallback(
    (value: string) => {
      if (value.length > 4) return;
      setPin(value);
      setError("");
      if (value.length === 4 && selectedUser) {
        tryAutoLogin(value, selectedUser);
      }
    },
    [selectedUser, tryAutoLogin],
  );

  if (!open) return null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.overlay,
            { backgroundColor: c.overlay },
          ]}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <Pressable style={{ width: "100%", maxWidth: 380 }} onPress={onClose}>
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
                    style={[
                      styles.iconCircle,
                      { backgroundColor: c.accentLight },
                    ]}
                  >
                    {role === "ADMIN" ? (
                      <Lock size={22} color={c.accent as any} />
                    ) : (
                      <UserIcon size={22} color={c.accent as any} />
                    )}
                  </View>
                  <Text style={[styles.title, { color: c.text }]}>
                    {roleLabel}
                  </Text>
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
                    <Text style={[styles.label, { color: c.muted }]}>
                      Usuario
                    </Text>
                    {/* Select trigger + floating dropdown */}
                    <View style={styles.selectWrapper}>
                      <TouchableOpacity
                        style={[
                          styles.selectTrigger,
                          {
                            backgroundColor: c.input,
                            borderColor: selectedUser ? c.accent : c.border,
                          },
                        ]}
                        onPress={() => setShowUserPicker((v) => !v)}
                        activeOpacity={0.7}
                      >
                        {selectedUser ? (
                          <View style={styles.selectTriggerContent}>
                            <View
                              style={[
                                styles.avatar,
                                { backgroundColor: c.accentLight },
                              ]}
                            >
                              {selectedUser.photoUri ? (
                                <Image
                                  source={{ uri: selectedUser.photoUri }}
                                  style={styles.avatarImg}
                                />
                              ) : (
                                <Text
                                  style={[
                                    styles.avatarText,
                                    { color: c.accent },
                                  ]}
                                >
                                  {selectedUser.name.charAt(0).toUpperCase()}
                                </Text>
                              )}
                            </View>
                            <Text
                              style={[styles.userName, { color: c.text }]}
                              numberOfLines={1}
                            >
                              {selectedUser.name}
                            </Text>
                          </View>
                        ) : (
                          <Text
                            style={[
                              styles.selectPlaceholder,
                              { color: c.muted },
                            ]}
                          >
                            Seleccionar usuario…
                          </Text>
                        )}
                        <ChevronDown
                          size={16}
                          color={c.muted as any}
                          style={{
                            transform: [
                              { rotate: showUserPicker ? "180deg" : "0deg" },
                            ],
                          }}
                        />
                      </TouchableOpacity>

                      {/* Floating dropdown */}
                      {showUserPicker && (
                        <View
                          style={[
                            styles.dropdown,
                            { backgroundColor: c.bg, borderColor: c.border },
                          ]}
                        >
                          {users.map((u) => {
                            const selected = selectedUser?.id === u.id;
                            return (
                              <TouchableOpacity
                                key={u.id}
                                style={[
                                  styles.dropdownItem,
                                  {
                                    backgroundColor: selected
                                      ? c.userRowSelected
                                      : c.userRow,
                                    borderBottomColor: c.userRowBorder,
                                  },
                                ]}
                                onPress={() => {
                                  setSelectedUser(u);
                                  setShowUserPicker(false);
                                }}
                                activeOpacity={0.7}
                              >
                                <View
                                  style={[
                                    styles.avatar,
                                    { backgroundColor: c.accentLight },
                                  ]}
                                >
                                  {u.photoUri ? (
                                    <Image
                                      source={{ uri: u.photoUri }}
                                      style={styles.avatarImg}
                                    />
                                  ) : (
                                    <Text
                                      style={[
                                        styles.avatarText,
                                        { color: c.accent },
                                      ]}
                                    >
                                      {u.name.charAt(0).toUpperCase()}
                                    </Text>
                                  )}
                                </View>
                                <Text
                                  style={[styles.userName, { color: c.text }]}
                                >
                                  {u.name}
                                </Text>
                                {selected && (
                                  <View
                                    style={[
                                      styles.dot,
                                      { backgroundColor: c.accent },
                                    ]}
                                  />
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  </View>
                ) : (
                  // Single user — show name badge
                  <View style={styles.section}>
                    <Text style={[styles.label, { color: c.muted }]}>
                      Usuario
                    </Text>
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
                        style={[
                          styles.avatar,
                          { backgroundColor: c.accentLight },
                        ]}
                      >
                        {selectedUser?.photoUri ? (
                          <Image
                            source={{ uri: selectedUser.photoUri }}
                            style={styles.avatarImg}
                          />
                        ) : (
                          <Text
                            style={[styles.avatarText, { color: c.accent }]}
                          >
                            {selectedUser?.name.charAt(0).toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.userName, { color: c.text }]}>
                        {selectedUser?.name}
                      </Text>
                      <View
                        style={[styles.dot, { backgroundColor: c.accent }]}
                      />
                    </View>
                  </View>
                )}

                {/* PIN input */}
                {users.length > 0 && (
                  <View style={styles.section}>
                    <Text style={[styles.label, { color: c.muted }]}>PIN</Text>
                    <Animated.View
                      style={{ transform: [{ translateX: shakeAnim }] }}
                    >
                      <TextInput
                        ref={pinRef}
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
                        onChangeText={handlePinChange}
                        secureTextEntry
                        keyboardType="numeric"
                        maxLength={4}
                        returnKeyType="done"
                        editable={!verifying}
                        autoFocus={users.length === 1}
                      />
                      {verifying && (
                        <View style={styles.pinSpinner}>
                          <ActivityIndicator color={c.accent} size="small" />
                        </View>
                      )}
                    </Animated.View>
                  </View>
                )}

                {/* Error message */}
                {!!error && (
                  <View
                    style={[styles.errorRow, { backgroundColor: c.errorBg }]}
                  >
                    <AlertCircle size={16} color={c.error as any} />
                    <Text style={[styles.errorText, { color: c.error }]}>
                      {error}
                    </Text>
                  </View>
                )}

                {/* Cancel button */}
                <TouchableOpacity
                  style={[styles.btnCancel, { borderColor: c.border }]}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.btnCancelText, { color: c.muted }]}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flexGrow: 1,
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
    overflow: "visible",
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
  selectWrapper: {
    position: "relative",
    zIndex: 10,
  },
  selectTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  selectTriggerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  selectPlaceholder: {
    fontSize: 15,
    flex: 1,
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    zIndex: 100,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginTop: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  avatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
  pinSpinner: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
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
  btnCancel: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  btnCancelText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
