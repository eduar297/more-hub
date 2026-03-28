import { PhotoPicker } from "@/components/ui/photo-picker";
import type { TabDef } from "@/components/ui/screen-tabs";
import { ScreenTabs } from "@/components/ui/screen-tabs";
import { useAuth } from "@/contexts/auth-context";
import { useStore } from "@/contexts/store-context";
import { resetDatabase, seedSimulation } from "@/database/seed-simulation";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useStoreRepository } from "@/hooks/use-store-repository";
import { useUserRepository } from "@/hooks/use-user-repository";
import type { CreateStoreInput, Store as StoreModel } from "@/models/store";
import type { User } from "@/models/user";
import { hashPin } from "@/utils/auth";
import {
  AlertCircle,
  Camera,
  CheckCircle,
  Database,
  Edit3,
  Lock,
  Play,
  Plus,
  Store,
  Trash2,
  TriangleAlert,
  UserCog,
  Users,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import React, { useCallback, useEffect, useState } from "react";
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
import { Button, Input, Sheet, Text as TText, XStack, YStack } from "tamagui";

// ── Colors ────────────────────────────────────────────────────────────────────

function useColors(isDark: boolean) {
  return {
    bg: isDark ? "#151718" : "#f8fafc",
    card: isDark ? "#1c1c1e" : "#ffffff",
    text: isDark ? "#f2f2f7" : "#18181b",
    muted: isDark ? "#8e8e93" : "#6b7280",
    border: isDark ? "#38383a" : "#e5e7eb",
    input: isDark ? "#2c2c2e" : "#f3f4f6",
    blue: "#3b82f6",
    blueLight: isDark ? "#1e3a5f" : "#dbeafe",
    green: "#22c55e",
    greenLight: isDark ? "#14532d" : "#dcfce7",
    danger: "#ef4444",
    dangerBg: isDark ? "#2d1515" : "#fef2f2",
    successBg: isDark ? "#14290f" : "#f0fdf4",
    rowBg: isDark ? "#1c1c1e" : "#ffffff",
    divider: isDark ? "#2c2c2e" : "#f1f5f9",
    editBg: isDark ? "#2c2c2e" : "#f1f5f9",
  };
}

type Colors = ReturnType<typeof useColors>;
type SettingTab = "workers" | "profile" | "stores";

// ── Workers section ───────────────────────────────────────────────────────────

function WorkersSection({ isDark, c }: { isDark: boolean; c: Colors }) {
  const userRepo = useUserRepository();
  const [workers, setWorkers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const themeName = isDark ? "dark" : "light";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setWorkers(await userRepo.findByRole("WORKER"));
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
    setName("");
    setPin("");
    setPinConfirm("");
    setPhotoUri(null);
    setFormError("");
    setSheetOpen(true);
  }, []);
  const openEdit = useCallback((w: User) => {
    setEditing(w);
    setName(w.name);
    setPin("");
    setPinConfirm("");
    setPhotoUri(w.photoUri ?? null);
    setFormError("");
    setSheetOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    const trimName = name.trim();
    if (!trimName) {
      setFormError("El nombre es obligatorio");
      return;
    }
    if (!editing && !pin) {
      setFormError("El PIN es obligatorio");
      return;
    }
    if (pin && pin.length < 4) {
      setFormError("El PIN debe tener al menos 4 dígitos");
      return;
    }
    if (pin && pin !== pinConfirm) {
      setFormError("Los PIN no coinciden");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      if (editing) {
        const updates: {
          name: string;
          pinHash?: string;
          photoUri?: string | null;
        } = { name: trimName, photoUri };
        if (pin) updates.pinHash = await hashPin(pin);
        await userRepo.update(editing.id, updates);
      } else {
        const created = await userRepo.create({
          name: trimName,
          role: "WORKER",
          pinHash: await hashPin(pin),
        });
        if (photoUri) await userRepo.update(created.id, { photoUri });
      }
      setSheetOpen(false);
      load();
    } catch (e) {
      setFormError((e as Error).message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, pin, pinConfirm, editing, userRepo, load]);

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
    <View style={styles.sectionRoot}>
      {/* Action bar */}
      <View style={[styles.actionBar, { borderBottomColor: c.border }]}>
        <Text style={[styles.statsText, { color: c.muted }]}>
          {workers.length} vendedor{workers.length !== 1 ? "es" : ""}
        </Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: c.green }]}
          onPress={openCreate}
          activeOpacity={0.8}
        >
          <Plus size={16} color="#fff" />
          <Text style={styles.addBtnText}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={c.green} size="large" />
          </View>
        ) : workers.length === 0 ? (
          <View style={styles.centerBox}>
            <View style={[styles.emptyIcon, { backgroundColor: c.greenLight }]}>
              <Users size={34} color={c.green as any} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.text }]}>
              Sin vendedores
            </Text>
            <Text style={[styles.emptyDesc, { color: c.muted }]}>
              Añade vendedores para que puedan acceder al panel de ventas.
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
                    style={[styles.divider, { backgroundColor: c.divider }]}
                  />
                )}
                <View style={styles.workerRow}>
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: c.greenLight, overflow: "hidden" },
                    ]}
                  >
                    {w.photoUri ? (
                      <Image
                        source={{ uri: w.photoUri }}
                        style={{ width: 38, height: 38, borderRadius: 19 }}
                      />
                    ) : (
                      <Text style={[styles.avatarText, { color: c.green }]}>
                        {w.name.charAt(0).toUpperCase()}
                      </Text>
                    )}
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
                      style={[styles.iconBtn, { backgroundColor: c.editBg }]}
                      onPress={() => openEdit(w)}
                      activeOpacity={0.7}
                    >
                      <Edit3 size={15} color={c.muted as any} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.iconBtn, { backgroundColor: c.dangerBg }]}
                      onPress={() => handleDelete(w)}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={15} color={c.danger as any} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Worker form Sheet ──────────────────────────────────────────── */}
      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        modal
        snapPoints={[85]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="rgba(0,0,0,0.5)"
        />
        <Sheet.Frame theme={themeName as any} bg="$background">
          <Sheet.Handle />
          <Sheet.ScrollView
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <YStack gap="$3" p="$4">
              <TText fontSize="$6" fontWeight="bold" color="$color">
                {editing ? "Editar vendedor" : "Nuevo vendedor"}
              </TText>

              {/* Photo picker */}
              <PhotoPicker uri={photoUri} onChange={setPhotoUri} />

              <YStack gap="$1">
                <TText
                  fontSize="$2"
                  fontWeight="600"
                  color="$color10"
                  textTransform="uppercase"
                  letterSpacing={0.5}
                >
                  Nombre
                </TText>
                <Input
                  placeholder="Nombre del vendedor"
                  value={name}
                  onChangeText={(v: string) => {
                    setName(v);
                    setFormError("");
                  }}
                  autoCapitalize="words"
                  returnKeyType="next"
                  autoFocus={!editing}
                  size="$4"
                />
              </YStack>

              <YStack gap="$1">
                <TText
                  fontSize="$2"
                  fontWeight="600"
                  color="$color10"
                  textTransform="uppercase"
                  letterSpacing={0.5}
                >
                  {editing ? "Nuevo PIN (dejar vacío para no cambiar)" : "PIN"}
                </TText>
                <Input
                  placeholder="••••"
                  value={pin}
                  onChangeText={(v: string) => {
                    setPin(v);
                    setFormError("");
                  }}
                  secureTextEntry
                  keyboardType="numeric"
                  maxLength={8}
                  returnKeyType={pin.length > 0 ? "next" : "done"}
                  size="$4"
                />
              </YStack>

              {pin.length > 0 && (
                <YStack gap="$1">
                  <TText
                    fontSize="$2"
                    fontWeight="600"
                    color="$color10"
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    Confirmar PIN
                  </TText>
                  <Input
                    placeholder="••••"
                    value={pinConfirm}
                    onChangeText={(v: string) => {
                      setPinConfirm(v);
                      setFormError("");
                    }}
                    secureTextEntry
                    keyboardType="numeric"
                    maxLength={8}
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                    size="$4"
                  />
                </YStack>
              )}

              {!!formError && (
                <View
                  style={[styles.feedbackRow, { backgroundColor: c.dangerBg }]}
                >
                  <AlertCircle size={15} color={c.danger as any} />
                  <Text style={[styles.feedbackText, { color: c.danger }]}>
                    {formError}
                  </Text>
                </View>
              )}

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
                  theme="green"
                  onPress={handleSave}
                  disabled={saving}
                  opacity={saving ? 0.7 : 1}
                  size="$4"
                  icon={
                    saving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : undefined
                  }
                >
                  Guardar
                </Button>
              </XStack>
            </YStack>
          </Sheet.ScrollView>
        </Sheet.Frame>
      </Sheet>
    </View>
  );
}

// ── Profile section ───────────────────────────────────────────────────────────

function ProfileSection({ isDark, c }: { isDark: boolean; c: Colors }) {
  const { user, setUser } = useAuth();
  const userRepo = useUserRepository();
  const db = useSQLiteContext();

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
  const [resetting, setResetting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState("");

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

  const verifyAdminPin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!user) return false;
      const valid = await userRepo.verifyPin(user.id, await hashPin(pin));
      return valid;
    },
    [user, userRepo],
  );

  const handleReset = useCallback(() => {
    Alert.prompt(
      "🔐 Confirmar identidad",
      "Ingresa tu PIN de administrador para limpiar la base de datos",
      async (pin) => {
        if (!pin) return;
        const valid = await verifyAdminPin(pin);
        if (!valid) {
          setError("PIN incorrecto");
          return;
        }
        Alert.alert(
          "⚠️ Borrar base de datos",
          "Se eliminarán TODOS los datos: productos, tickets, compras, gastos, proveedores, trabajadores y fotos. Solo se conservará tu cuenta de administrador y las unidades del sistema.\n\n¿Estás completamente seguro?",
          [
            { text: "Cancelar", style: "cancel" },
            {
              text: "Sí, borrar todo",
              style: "destructive",
              onPress: async () => {
                setResetting(true);
                setError("");
                setSuccess("");
                try {
                  await resetDatabase(db);
                  setSuccess("Base de datos limpiada correctamente");
                } catch (e) {
                  setError((e as Error).message ?? "Error al limpiar");
                } finally {
                  setResetting(false);
                }
              },
            },
          ],
        );
      },
      "secure-text",
      "",
      "numeric",
    );
  }, [verifyAdminPin, db]);

  const handleSeed = useCallback(() => {
    Alert.prompt(
      "🔐 Confirmar identidad",
      "Ingresa tu PIN de administrador para sembrar datos de prueba",
      async (pin) => {
        if (!pin) return;
        const valid = await verifyAdminPin(pin);
        if (!valid) {
          setError("PIN incorrecto");
          return;
        }
        Alert.alert(
          "Sembrar datos de prueba",
          "Se creará un año completo de datos simulados: trabajadores, productos, compras, tickets y gastos.\n\nEs recomendable limpiar la base de datos primero.\n\n¿Continuar?",
          [
            { text: "Cancelar", style: "cancel" },
            {
              text: "Sí, sembrar datos",
              onPress: async () => {
                setSeeding(true);
                setError("");
                setSuccess("");
                setSeedProgress("Iniciando...");
                try {
                  await seedSimulation(db, (msg) => setSeedProgress(msg));
                  setSuccess("Simulación completada exitosamente");
                  setSeedProgress("");
                } catch (e) {
                  setError((e as Error).message ?? "Error al sembrar datos");
                  setSeedProgress("");
                } finally {
                  setSeeding(false);
                }
              },
            },
          ],
        );
      },
      "secure-text",
      "",
      "numeric",
    );
  }, [verifyAdminPin, db]);

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
      setSuccess("Perfil actualizado correctamente");
      setCurPin("");
      setNewPin("");
      setConfPin("");
    } catch (e) {
      setError((e as Error).message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [user, name, curPin, newPin, confPin, userRepo]);

  return (
    <ScrollView
      contentContainerStyle={styles.profileContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Avatar */}
      <View style={styles.profileAvatarRow}>
        <TouchableOpacity
          onPress={() => setShowPhotoPicker((v) => !v)}
          activeOpacity={0.85}
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
            <View style={[styles.avatarEditBadge, { backgroundColor: c.blue }]}>
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
          <Text style={[styles.cardTitle, { color: c.text }]}>Cambiar PIN</Text>
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
          />
        </View>

        <View style={styles.formField}>
          <Text style={[styles.fieldLabel, { color: c.muted }]}>Nuevo PIN</Text>
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
            />
          </View>
        )}
      </View>

      {/* Feedback */}
      {!!error && (
        <View style={[styles.feedbackRow, { backgroundColor: c.dangerBg }]}>
          <AlertCircle size={15} color={c.danger as any} />
          <Text style={[styles.feedbackText, { color: c.danger }]}>
            {error}
          </Text>
        </View>
      )}
      {!!success && (
        <View style={[styles.feedbackRow, { backgroundColor: c.successBg }]}>
          <CheckCircle size={15} color={c.green as any} />
          <Text style={[styles.feedbackText, { color: c.green }]}>
            {success}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.btnSolidFull,
          { backgroundColor: c.blue, opacity: saving ? 0.7 : 1 },
        ]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.8}
      >
        {saving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.btnSolidText}>Guardar cambios</Text>
        )}
      </TouchableOpacity>

      {/* ── Danger zone ─────────────────────────────────────────────── */}
      <View
        style={[
          styles.profileCard,
          {
            backgroundColor: c.card,
            borderColor: c.danger,
            borderWidth: 1.5,
            marginTop: 10,
          },
        ]}
      >
        <View style={styles.cardTitleRow}>
          <TriangleAlert size={15} color={c.danger as any} />
          <Text style={[styles.cardTitle, { color: c.danger }]}>
            Zona peligrosa
          </Text>
        </View>

        {/* Reset DB */}
        <View style={styles.dangerBlock}>
          <View style={styles.dangerInfo}>
            <View style={styles.cardTitleRow}>
              <Database size={14} color={c.danger as any} />
              <Text style={[styles.dangerLabel, { color: c.text }]}>
                Limpiar base de datos
              </Text>
            </View>
            <Text style={[styles.dangerDesc, { color: c.muted }]}>
              Elimina todos los datos excepto tu cuenta y unidades del sistema.
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.dangerBtn,
              { borderColor: c.danger, opacity: resetting ? 0.7 : 1 },
            ]}
            onPress={handleReset}
            disabled={resetting || seeding}
            activeOpacity={0.8}
          >
            {resetting ? (
              <ActivityIndicator color={c.danger} size="small" />
            ) : (
              <>
                <Trash2 size={14} color={c.danger as any} />
                <Text style={[styles.dangerBtnText, { color: c.danger }]}>
                  Limpiar todo
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.dangerDivider, { backgroundColor: c.border }]} />

        {/* Seed simulation */}
        <View style={styles.dangerBlock}>
          <View style={styles.dangerInfo}>
            <View style={styles.cardTitleRow}>
              <Play size={14} color={c.blue as any} />
              <Text style={[styles.dangerLabel, { color: c.text }]}>
                Sembrar datos de prueba
              </Text>
            </View>
            <Text style={[styles.dangerDesc, { color: c.muted }]}>
              Genera un año de datos simulados: 4 trabajadores, 44 productos, 5
              proveedores, compras, tickets diarios y gastos.
            </Text>
          </View>
          {!!seedProgress && (
            <View
              style={[styles.feedbackRow, { backgroundColor: c.blueLight }]}
            >
              <ActivityIndicator color={c.blue} size="small" />
              <Text style={[styles.feedbackText, { color: c.blue }]}>
                {seedProgress}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[
              styles.seedBtn,
              { backgroundColor: c.blue, opacity: seeding ? 0.7 : 1 },
            ]}
            onPress={handleSeed}
            disabled={seeding || resetting}
            activeOpacity={0.8}
          >
            {seeding ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Play size={14} color="#fff" />
                <Text style={styles.btnSolidText}>Iniciar simulación</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

// ── Stores section ────────────────────────────────────────────────────────────

function StoresSection({ isDark, c }: { isDark: boolean; c: Colors }) {
  const storeRepo = useStoreRepository();
  const { stores, refreshStores, currentStore } = useStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<StoreModel | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const themeName = isDark ? "dark" : "light";

  useFocusEffect(
    useCallback(() => {
      refreshStores();
    }, [refreshStores]),
  );

  const openCreate = useCallback(() => {
    setEditing(null);
    setName("");
    setAddress("");
    setPhone("");
    setLogoUri(null);
    setFormError("");
    setSheetOpen(true);
  }, []);

  const openEdit = useCallback((s: StoreModel) => {
    setEditing(s);
    setName(s.name);
    setAddress(s.address ?? "");
    setPhone(s.phone ?? "");
    setLogoUri(s.logoUri ?? null);
    setFormError("");
    setSheetOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    const trimName = name.trim();
    if (!trimName) {
      setFormError("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const data: CreateStoreInput = {
        name: trimName,
        address: address.trim() || null,
        phone: phone.trim() || null,
        logoUri,
      };
      if (editing) {
        await storeRepo.update(editing.id, data);
      } else {
        await storeRepo.create(data);
      }
      setSheetOpen(false);
      await refreshStores();
    } catch (e) {
      setFormError((e as Error).message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [name, address, phone, logoUri, editing, storeRepo, refreshStores]);

  const handleDelete = useCallback(
    (s: StoreModel) => {
      if (stores.length <= 1) {
        Alert.alert("Error", "No puedes eliminar la única tienda.");
        return;
      }
      Alert.alert(
        "Eliminar tienda",
        `¿Eliminar "${s.name}"? Los datos asociados permanecerán en la base de datos.`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Eliminar",
            style: "destructive",
            onPress: async () => {
              await storeRepo.delete(s.id);
              await refreshStores();
            },
          },
        ],
      );
    },
    [storeRepo, refreshStores, stores.length],
  );

  return (
    <View style={styles.sectionRoot}>
      <View style={[styles.actionBar, { borderBottomColor: c.border }]}>
        <Text style={[styles.statsText, { color: c.muted }]}>
          {stores.length} tienda{stores.length !== 1 ? "s" : ""}
        </Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: c.blue }]}
          onPress={openCreate}
          activeOpacity={0.8}
        >
          <Plus size={16} color="#fff" />
          <Text style={styles.addBtnText}>Nueva</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {stores.length === 0 ? (
          <View style={styles.centerBox}>
            <View style={[styles.emptyIcon, { backgroundColor: c.blueLight }]}>
              <Store size={34} color={c.blue as any} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.text }]}>
              Sin tiendas
            </Text>
            <Text style={[styles.emptyDesc, { color: c.muted }]}>
              Añade una tienda para comenzar a operar.
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.listCard,
              { backgroundColor: c.rowBg, borderColor: c.border },
            ]}
          >
            {stores.map((s, idx) => {
              const isActive = currentStore?.id === s.id;
              return (
                <View key={s.id}>
                  {idx > 0 && (
                    <View
                      style={[styles.divider, { backgroundColor: c.divider }]}
                    />
                  )}
                  <View style={styles.workerRow}>
                    <View
                      style={[
                        styles.avatar,
                        {
                          backgroundColor: isActive ? c.blueLight : c.editBg,
                          overflow: "hidden",
                        },
                      ]}
                    >
                      {s.logoUri ? (
                        <Image
                          source={{ uri: s.logoUri }}
                          style={{ width: 38, height: 38, borderRadius: 19 }}
                        />
                      ) : (
                        <Store
                          size={18}
                          color={(isActive ? c.blue : c.muted) as any}
                        />
                      )}
                    </View>
                    <View style={styles.workerInfo}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Text style={[styles.workerName, { color: c.text }]}>
                          {s.name}
                        </Text>
                        {isActive && (
                          <Text
                            style={{
                              fontSize: 10,
                              color: c.blue,
                              fontWeight: "700",
                            }}
                          >
                            ACTIVA
                          </Text>
                        )}
                      </View>
                      {s.address ? (
                        <Text style={[styles.workerMeta, { color: c.muted }]}>
                          {s.address}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        style={[styles.iconBtn, { backgroundColor: c.editBg }]}
                        onPress={() => openEdit(s)}
                        activeOpacity={0.7}
                      >
                        <Edit3 size={15} color={c.muted as any} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.iconBtn,
                          { backgroundColor: c.dangerBg },
                        ]}
                        onPress={() => handleDelete(s)}
                        activeOpacity={0.7}
                      >
                        <Trash2 size={15} color={c.danger as any} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Store form Sheet ──────────────────────────────────────────── */}
      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        modal
        snapPoints={[85]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="rgba(0,0,0,0.5)"
        />
        <Sheet.Frame theme={themeName as any} bg="$background">
          <Sheet.Handle />
          <Sheet.ScrollView
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <YStack gap="$3" p="$4">
              <TText fontSize="$6" fontWeight="bold" color="$color">
                {editing ? "Editar tienda" : "Nueva tienda"}
              </TText>

              {/* Photo picker */}
              <PhotoPicker uri={logoUri} onChange={setLogoUri} />

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
                  placeholder="Nombre de la tienda"
                  value={name}
                  onChangeText={(v: string) => {
                    setName(v);
                    setFormError("");
                  }}
                  autoCapitalize="words"
                  returnKeyType="next"
                  autoFocus={!editing}
                  size="$4"
                />
              </YStack>

              <YStack gap="$1">
                <TText
                  fontSize="$2"
                  fontWeight="600"
                  color="$color10"
                  textTransform="uppercase"
                  letterSpacing={0.5}
                >
                  Dirección
                </TText>
                <Input
                  placeholder="Av. Principal, Local #12..."
                  value={address}
                  onChangeText={(v: string) => {
                    setAddress(v);
                    setFormError("");
                  }}
                  returnKeyType="next"
                  size="$4"
                />
              </YStack>

              <YStack gap="$1">
                <TText
                  fontSize="$2"
                  fontWeight="600"
                  color="$color10"
                  textTransform="uppercase"
                  letterSpacing={0.5}
                >
                  Teléfono
                </TText>
                <Input
                  placeholder="+58 412..."
                  value={phone}
                  onChangeText={(v: string) => {
                    setPhone(v);
                    setFormError("");
                  }}
                  keyboardType="phone-pad"
                  returnKeyType="done"
                  size="$4"
                />
              </YStack>

              {!!formError && (
                <View
                  style={[styles.feedbackRow, { backgroundColor: c.dangerBg }]}
                >
                  <AlertCircle size={15} color={c.danger as any} />
                  <Text style={[styles.feedbackText, { color: c.danger }]}>
                    {formError}
                  </Text>
                </View>
              )}

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
                  onPress={handleSave}
                  disabled={saving}
                  opacity={saving ? 0.7 : 1}
                  size="$4"
                  icon={
                    saving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : undefined
                  }
                >
                  Guardar
                </Button>
              </XStack>
            </YStack>
          </Sheet.ScrollView>
        </Sheet.Frame>
      </Sheet>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

const TABS: TabDef<SettingTab>[] = [
  { key: "profile", label: "Mi Perfil", Icon: UserCog },
  { key: "workers", label: "Vendedores", Icon: Users },
  { key: "stores", label: "Tiendas", Icon: Store },
];

export default function SettingScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const c = useColors(isDark);
  const [activeTab, setActiveTab] = useState<SettingTab>("profile");

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <ScreenTabs tabs={TABS} active={activeTab} onSelect={setActiveTab} />

      {activeTab === "workers" && <WorkersSection isDark={isDark} c={c} />}
      {activeTab === "profile" && <ProfileSection isDark={isDark} c={c} />}
      {activeTab === "stores" && <StoresSection isDark={isDark} c={c} />}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Workers
  sectionRoot: { flex: 1 },
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statsText: { fontSize: 13 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  listContent: { padding: 16, flexGrow: 1 },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyDesc: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 260,
  },
  listCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
  workerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 15, fontWeight: "700" },
  workerInfo: { flex: 1, gap: 2 },
  workerName: { fontSize: 15, fontWeight: "600" },
  workerMeta: { fontSize: 12 },
  rowActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  // Profile
  profileContent: { padding: 16, gap: 14, paddingBottom: 44 },
  profileAvatarRow: { alignItems: "center", gap: 8, paddingVertical: 12 },
  avatarLarge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarLargeImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  avatarWrapper: {
    width: 76,
    height: 76,
    marginBottom: 4,
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  profileName: { fontSize: 20, fontWeight: "700" },
  roleBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  roleText: { fontSize: 13, fontWeight: "600" },
  profileCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: "600" },

  // Shared
  formField: { gap: 6 },
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
    padding: 10,
    borderRadius: 10,
  },
  feedbackText: { fontSize: 13, flex: 1 },
  btnSolidFull: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSolidText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Danger zone
  dangerBlock: { gap: 10 },
  dangerInfo: { gap: 4 },
  dangerLabel: { fontSize: 14, fontWeight: "600" },
  dangerDesc: { fontSize: 12, lineHeight: 17 },
  dangerDivider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  dangerBtnText: { fontSize: 14, fontWeight: "600" },
  seedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
});
