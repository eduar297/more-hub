import { PhotoPicker } from "@/components/ui/photo-picker";
import { useAuth } from "@/contexts/auth-context";
import { useColors } from "@/hooks/use-colors";
import { useUserRepository } from "@/hooks/use-user-repository";
import { hashPin } from "@/utils/auth";
import {
  AlertCircle,
  Camera,
  CheckCircle,
  Lock,
  UserCog,
} from "@tamagui/lucide-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { settingStyles as styles } from "./shared";

export function ProfileSection() {
  const c = useColors();
  const { user, setUser } = useAuth();
  const userRepo = useUserRepository();

  const [name, setName] = useState(user?.name ?? "");
  const [photoUri, setPhotoUri] = useState<string | null>(
    user?.photoUri ?? null,
  );
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [curPin, setCurPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confPin, setConfPin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  // Auto-load admin user if not logged in (admin devices skip login screen)
  useEffect(() => {
    if (user) return;
    (async () => {
      try {
        const admins = await userRepo.findByRole("ADMIN");
        if (admins.length > 0) {
          const a = admins[0];
          setUser({
            id: a.id,
            name: a.name,
            role: a.role,
            photoUri: a.photoUri,
          });
        }
      } catch {
        /* ignore */
      }
    })();
  }, [user, userRepo, setUser]);

  useEffect(() => {
    setName(user?.name ?? "");
    setPhotoUri(user?.photoUri ?? null);
  }, [user]);

  const clearFeedback = useCallback(() => {
    setError("");
    setSuccess("");
  }, []);

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

  const handleSave = useCallback(async () => {
    if (!user) return;
    const trimName = name.trim();
    if (!trimName) {
      setError("El nombre es obligatorio");
      return;
    }
    if (curPin || newPin) {
      if (!curPin) {
        setError("Ingresa tu PIN actual para cambiarlo");
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
      if (newPin !== confPin) {
        setError("Los PIN nuevos no coinciden");
        return;
      }
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updates: { name: string; pinHash?: string } = { name: trimName };
      if (curPin && newPin) {
        const valid = await userRepo.verifyPin(user.id, await hashPin(curPin));
        if (!valid) {
          setError("PIN actual incorrecto");
          setSaving(false);
          return;
        }
        updates.pinHash = await hashPin(newPin);
      }
      await userRepo.update(user.id, updates);
      setUser({ ...user, name: trimName });
      setSuccess("Perfil actualizado correctamente");
      setCurPin("");
      setNewPin("");
      setConfPin("");
    } catch (e) {
      setError((e as Error).message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, name, curPin, newPin, confPin, userRepo]);

  const hasChanges =
    name !== (user?.name ?? "") ||
    curPin.length > 0 ||
    newPin.length > 0 ||
    confPin.length > 0;
  const canSave = name.trim().length > 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={styles.profileContent}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* Avatar */}
        <View style={styles.profileAvatarRow}>
          <TouchableOpacity
            onPress={() => setShowPhotoPicker((v) => !v)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Cambiar foto de perfil"
          >
            <View style={styles.avatarWrapper}>
              <View
                style={[styles.avatarLarge, { backgroundColor: c.blueLight }]}
              >
                {photoUri ? (
                  <Image
                    source={{ uri: photoUri }}
                    style={styles.avatarLargeImage}
                  />
                ) : (
                  <UserCog size={34} color={c.blue as any} />
                )}
              </View>
              <View
                style={[styles.avatarEditBadge, { backgroundColor: c.blue }]}
              >
                <Camera size={12} color="#fff" />
              </View>
            </View>
          </TouchableOpacity>
          <Text style={[styles.profileName, { color: c.text }]}>
            {user?.name ?? "—"}
          </Text>
          <View style={[styles.roleBadge, { backgroundColor: c.blueLight }]}>
            <Text style={[styles.roleText, { color: c.blue }]}>
              Administrador
            </Text>
          </View>
        </View>

        {/* Photo picker (inline) */}
        {showPhotoPicker && (
          <View
            style={[
              styles.profileCard,
              { backgroundColor: c.card, borderColor: c.border },
            ]}
          >
            <PhotoPicker uri={photoUri} onChange={handlePhotoChange} />
          </View>
        )}

        {/* Name */}
        <View
          style={[
            styles.profileCard,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: c.text }]}>
            Información personal
          </Text>
          <View style={styles.formField}>
            <Text style={[styles.fieldLabel, { color: c.muted }]}>Nombre</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: c.input,
                  color: c.text,
                  borderColor: c.border,
                },
              ]}
              value={name}
              onChangeText={(v) => {
                setName(v);
                clearFeedback();
              }}
              placeholder="Nombre del administrador"
              placeholderTextColor={c.muted}
              autoCapitalize="words"
              returnKeyType="done"
              accessibilityLabel="Nombre de administrador"
            />
          </View>
        </View>

        {/* PIN change */}
        <View
          style={[
            styles.profileCard,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
        >
          <View style={styles.cardTitleRow}>
            <Lock size={14} color={c.blue as any} />
            <Text style={[styles.cardTitle, { color: c.text }]}>
              Cambiar PIN
            </Text>
          </View>

          <View style={styles.formField}>
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
              value={curPin}
              onChangeText={(v) => {
                setCurPin(v);
                clearFeedback();
              }}
              secureTextEntry
              keyboardType="numeric"
              maxLength={8}
              returnKeyType="next"
              accessibilityLabel="PIN actual"
            />
          </View>

          <View style={styles.formField}>
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
                clearFeedback();
              }}
              secureTextEntry
              keyboardType="numeric"
              maxLength={8}
              returnKeyType="next"
              accessibilityLabel="Nuevo PIN"
            />
          </View>

          {newPin.length > 0 && (
            <View style={styles.formField}>
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
                value={confPin}
                onChangeText={(v) => {
                  setConfPin(v);
                  clearFeedback();
                }}
                secureTextEntry
                keyboardType="numeric"
                maxLength={8}
                returnKeyType="done"
                onSubmitEditing={handleSave}
                accessibilityLabel="Confirmar nuevo PIN"
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Fixed footer ───────────────────────────────────── */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: c.border,
          backgroundColor: c.card,
        }}
      >
        {!!error && (
          <View
            style={[
              styles.feedbackRow,
              { backgroundColor: c.dangerBg, marginBottom: 10 },
            ]}
          >
            <AlertCircle size={15} color={c.danger as any} />
            <Text style={[styles.feedbackText, { color: c.danger }]}>
              {error}
            </Text>
          </View>
        )}
        {!!success && (
          <View
            style={[
              styles.feedbackRow,
              { backgroundColor: c.successBg, marginBottom: 10 },
            ]}
          >
            <CheckCircle size={15} color={c.green as any} />
            <Text style={[styles.feedbackText, { color: c.green }]}>
              {success}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[
            styles.btnSolidFull,
            {
              backgroundColor: c.blue,
              opacity: !canSave || !hasChanges || saving ? 0.5 : 1,
            },
          ]}
          onPress={handleSave}
          disabled={!canSave || !hasChanges || saving}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Guardar cambios de perfil"
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.btnSolidText}>Guardar cambios</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
