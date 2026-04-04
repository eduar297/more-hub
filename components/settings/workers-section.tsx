import { PhotoPicker } from "@/components/ui/photo-picker";
import { OVERLAY } from "@/constants/colors";
import { useLan } from "@/contexts/lan-context";
import { useColors } from "@/hooks/use-colors";
import { useUserRepository } from "@/hooks/use-user-repository";
import type { User } from "@/models/user";
import { hashPin } from "@/utils/auth";
import { AlertCircle, Edit3, Plus, Trash2, Users } from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Button,
  Input,
  Sheet,
  Text as TText,
  useThemeName,
  XStack,
  YStack,
} from "tamagui";
import { settingStyles as styles } from "./shared";

export function WorkersSection() {
  const c = useColors();
  const themeName = useThemeName();

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

  const { catalogVersion } = useLan();

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Reload when sync finishes (e.g. worker changed photo/PIN)
  useEffect(() => {
    if (catalogVersion > 0) load();
  }, [catalogVersion, load]);

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
  }, [name, pin, pinConfirm, photoUri, editing, userRepo, load]);

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
          accessibilityRole="button"
          accessibilityLabel="Agregar vendedor"
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
                      hitSlop={4}
                      accessibilityRole="button"
                      accessibilityLabel={`Editar ${w.name}`}
                    >
                      <Edit3 size={17} color={c.muted as any} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.iconBtn, { backgroundColor: c.dangerBg }]}
                      onPress={() => handleDelete(w)}
                      activeOpacity={0.7}
                      hitSlop={4}
                      accessibilityRole="button"
                      accessibilityLabel={`Eliminar ${w.name}`}
                    >
                      <Trash2 size={17} color={c.danger as any} />
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
          backgroundColor={OVERLAY}
        />
        <Sheet.Frame bg="$background" theme={themeName as any}>
          <Sheet.Handle />
          <Sheet.ScrollView
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <YStack gap="$3" p="$4">
              <TText fontSize="$6" fontWeight="bold" color="$color">
                {editing ? "Editar vendedor" : "Nuevo vendedor"}
              </TText>

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
