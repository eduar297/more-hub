import { useAuth } from "@/contexts/auth-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useUserRepository } from "@/hooks/use-user-repository";
import { PhotoPicker } from "@/components/ui/photo-picker";
import { hashPin } from "@/utils/auth";
import {
    AlertCircle,
    Camera,
    CheckCircle,
    Lock,
    LogOut,
    Receipt,
    User as UserIcon,
} from "@tamagui/lucide-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

export default function WorkerProfileScreen() {
  const colorScheme = useColorScheme();
  const userRepo = useUserRepository();
  const { user, setUser, logout } = useAuth();
  const router = useRouter();
  const isDark = colorScheme === "dark";

  const [photoUri, setPhotoUri] = useState<string | null>(user?.photoUri ?? null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const c = {
    bg: isDark ? "#151718" : "#f8fafc",
    card: isDark ? "#1c1c1e" : "#ffffff",
    text: isDark ? "#f2f2f7" : "#18181b",
    muted: isDark ? "#8e8e93" : "#6b7280",
    border: isDark ? "#38383a" : "#e5e7eb",
    input: isDark ? "#2c2c2e" : "#f3f4f6",
    accent: "#22c55e",
    accentLight: isDark ? "#14532d" : "#dcfce7",
    error: "#ef4444",
    errorBg: isDark ? "#2d1515" : "#fef2f2",
    successBg: isDark ? "#14290f" : "#f0fdf4",
    success: "#22c55e",
    dangerBg: isDark ? "#2d1515" : "#fef2f2",
    danger: "#ef4444",
  };

  const handleChangePin = useCallback(async () => {
    if (!user) return;
    if (!currentPin) {
      setError("Ingresa tu PIN actual");
      return;
    }
    if (!newPin) {
      setError("Ingresa el nuevo PIN");
      return;
    }
    if (newPin.length < 4) {
      setError("El nuevo PIN debe tener al menos 4 dígitos");
      return;
    }
    if (newPin !== confirmPin) {
      setError("Los PIN nuevos no coinciden");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const currentHash = await hashPin(currentPin);
      const valid = await userRepo.verifyPin(user.id, currentHash);
      if (!valid) {
        setError("PIN actual incorrecto");
        setSaving(false);
        return;
      }
      const newHash = await hashPin(newPin);
      await userRepo.update(user.id, { pinHash: newHash });
      setUser({ ...user, photoUri });
      setSuccess("PIN actualizado correctamente");
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch (e) {
      setError((e as Error).message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [user, currentPin, newPin, confirmPin, userRepo]);

  const handlePhotoChange = useCallback(
    async (uri: string | null) => {
      if (!user) return;
      setPhotoUri(uri);
      await userRepo.update(user.id, { photoUri: uri });
      setUser({ ...user, photoUri: uri });
      setShowPhotoPicker(false);
    },
    [user, userRepo, setUser],
  );

  const handleLogout = useCallback(() => {
    Alert.alert(
      "Cerrar sesión",
      "¿Cerrar sesión y volver a la pantalla de inicio?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cerrar sesión",
          style: "destructive",
          onPress: () => {
            logout();
            router.replace("/");
          },
        },
      ],
    );
  }, [logout, router]);

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            onPress={() => setShowPhotoPicker((v) => !v)}
            activeOpacity={0.85}
          >
            <View
              style={[styles.avatarCircle, { backgroundColor: c.accentLight }]}
            >
              {photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  style={styles.avatarCircle}
                />
              ) : (
                <Receipt size={36} color={c.accent as any} />
              )}
              <View style={[styles.avatarEdit, { backgroundColor: c.accent }]}>
                <Camera size={12} color="#fff" />
              </View>
            </View>
          </TouchableOpacity>
          <Text style={[styles.userName, { color: c.text }]}>
            {user?.name ?? "—"}
          </Text>
          <View style={[styles.roleBadge, { backgroundColor: c.accentLight }]}>
            <Text style={[styles.roleText, { color: c.accent }]}>Vendedor</Text>
          </View>
        </View>

        {/* Photo picker (shown inline when tapped) */}
        {showPhotoPicker && (
          <View
            style={[
              styles.section,
              { backgroundColor: c.card, borderColor: c.border },
            ]}
          >
            <PhotoPicker uri={photoUri} onChange={handlePhotoChange} />
          </View>
        )}

        {/* Info section */}
        <View
          style={[
            styles.section,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
        >
          <View style={styles.sectionHeader}>
            <UserIcon size={16} color={c.accent as any} />
            <Text style={[styles.sectionTitle, { color: c.text }]}>Cuenta</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: c.muted }]}>Nombre</Text>
            <Text style={[styles.infoValue, { color: c.text }]}>
              {user?.name ?? "—"}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: c.muted }]}>Rol</Text>
            <Text style={[styles.infoValue, { color: c.text }]}>Vendedor</Text>
          </View>
          <Text style={[styles.infoNote, { color: c.muted }]}>
            Para cambiar tu nombre, contacta al administrador.
          </Text>
        </View>

        {/* PIN section */}
        <View
          style={[
            styles.section,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Lock size={16} color={c.accent as any} />
            <Text style={[styles.sectionTitle, { color: c.text }]}>
              Cambiar PIN
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: c.muted }]}>
              PIN actual
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
              value={currentPin}
              onChangeText={(v) => {
                setCurrentPin(v);
                setError("");
                setSuccess("");
              }}
              secureTextEntry
              keyboardType="numeric"
              maxLength={8}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: c.muted }]}>
              Nuevo PIN
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
              value={newPin}
              onChangeText={(v) => {
                setNewPin(v);
                setError("");
                setSuccess("");
              }}
              secureTextEntry
              keyboardType="numeric"
              maxLength={8}
            />
          </View>

          {newPin.length > 0 && (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: c.muted }]}>
                Confirmar nuevo PIN
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
                value={confirmPin}
                onChangeText={(v) => {
                  setConfirmPin(v);
                  setError("");
                  setSuccess("");
                }}
                secureTextEntry
                keyboardType="numeric"
                maxLength={8}
                returnKeyType="done"
                onSubmitEditing={handleChangePin}
              />
            </View>
          )}

          {!!error && (
            <View style={[styles.feedbackRow, { backgroundColor: c.errorBg }]}>
              <AlertCircle size={16} color={c.error as any} />
              <Text style={[styles.feedbackText, { color: c.error }]}>
                {error}
              </Text>
            </View>
          )}
          {!!success && (
            <View
              style={[styles.feedbackRow, { backgroundColor: c.successBg }]}
            >
              <CheckCircle size={16} color={c.success as any} />
              <Text style={[styles.feedbackText, { color: c.success }]}>
                {success}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: c.accent, opacity: saving ? 0.7 : 1 },
            ]}
            onPress={handleChangePin}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Actualizar PIN</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[
            styles.logoutBtn,
            { borderColor: c.danger, backgroundColor: c.dangerBg },
          ]}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <LogOut size={18} color={c.danger as any} />
          <Text style={[styles.logoutText, { color: c.danger }]}>
            Cerrar sesión
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  avatarSection: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    overflow: "hidden",
  },
  avatarEdit: {
    position: "absolute",
    bottom: 4,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  userName: {
    fontSize: 22,
    fontWeight: "700",
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    fontSize: 13,
    fontWeight: "600",
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "500",
  },
  infoNote: {
    fontSize: 12,
    fontStyle: "italic",
    marginTop: -4,
  },
  field: {
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
  feedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  feedbackText: {
    fontSize: 13,
    flex: 1,
  },
  saveBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
