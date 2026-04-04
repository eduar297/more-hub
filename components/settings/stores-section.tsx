import { PhotoPicker } from "@/components/ui/photo-picker";
import { PinPromptDialog } from "@/components/ui/pin-prompt-dialog";
import { useAuth } from "@/contexts/auth-context";
import { useStore } from "@/contexts/store-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useColors } from "@/hooks/use-colors";
import { useStoreRepository } from "@/hooks/use-store-repository";
import { useUserRepository } from "@/hooks/use-user-repository";
import type { CreateStoreInput, Store as StoreModel } from "@/models/store";
import { hashPin } from "@/utils/auth";
import {
    AlertCircle,
    Check,
    Edit3,
    Plus,
    Store,
    Trash2,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { Button, Input, Sheet, Text as TText, XStack, YStack } from "tamagui";
import { STORE_COLORS, settingStyles as styles } from "./shared";

export function StoresSection() {
  const c = useColors();
  const isDark = useColorScheme() === "dark";
  const storeRepo = useStoreRepository();
  const { stores, refreshStores, currentStore, setCurrentStore } = useStore();
  const { user } = useAuth();
  const userRepo = useUserRepository();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<StoreModel | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [color, setColor] = useState("#3b82f6");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState<StoreModel | null>(null);

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
    setColor("#3b82f6");
    setFormError("");
    setSheetOpen(true);
  }, []);

  const openEdit = useCallback((s: StoreModel) => {
    setEditing(s);
    setName(s.name);
    setAddress(s.address ?? "");
    setPhone(s.phone ?? "");
    setLogoUri(s.logoUri ?? null);
    setColor(s.color ?? "#3b82f6");
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
        color,
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
  }, [name, address, phone, logoUri, color, editing, storeRepo, refreshStores]);

  const verifyAdminPin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!user) return false;
      const valid = await userRepo.verifyPin(user.id, await hashPin(pin));
      return valid;
    },
    [user, userRepo],
  );

  const handleDelete = useCallback(
    (s: StoreModel) => {
      if (stores.length <= 1) {
        Alert.alert("Error", "No puedes eliminar la única tienda.");
        return;
      }
      setStoreToDelete(s);
      setPinDialogOpen(true);
    },
    [stores.length],
  );

  const handlePinConfirm = useCallback(
    async (pin: string) => {
      setPinDialogOpen(false);
      if (!storeToDelete) return;
      const valid = await verifyAdminPin(pin);
      if (!valid) {
        Alert.alert("Error", "PIN incorrecto");
        return;
      }
      await storeRepo.delete(storeToDelete.id);
      await refreshStores();
      setStoreToDelete(null);
    },
    [storeToDelete, verifyAdminPin, storeRepo, refreshStores],
  );

  const handleSwitchStore = useCallback(
    (s: StoreModel) => {
      setCurrentStore(s);
    },
    [setCurrentStore],
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
          accessibilityRole="button"
          accessibilityLabel="Agregar tienda"
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
                  <TouchableOpacity
                    style={styles.workerRow}
                    onPress={() => handleSwitchStore(s)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Seleccionar tienda ${s.name}${
                      isActive ? ", activa" : ""
                    }`}
                  >
                    <View
                      style={[
                        styles.avatar,
                        {
                          backgroundColor: s.color
                            ? `${s.color}22`
                            : isActive
                            ? c.blueLight
                            : c.editBg,
                          overflow: "hidden",
                          borderWidth: isActive ? 2 : 0,
                          borderColor: s.color ?? c.blue,
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
                          color={
                            (s.color ?? (isActive ? c.blue : c.muted)) as any
                          }
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
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: s.color ?? c.blue,
                          }}
                        />
                        <Text style={[styles.workerName, { color: c.text }]}>
                          {s.name}
                        </Text>
                        {isActive && (
                          <Text
                            style={{
                              fontSize: 10,
                              color: s.color ?? c.blue,
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
                        accessibilityRole="button"
                        accessibilityLabel={`Editar ${s.name}`}
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
                        accessibilityRole="button"
                        accessibilityLabel={`Eliminar ${s.name}`}
                      >
                        <Trash2 size={15} color={c.danger as any} />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <PinPromptDialog
        open={pinDialogOpen}
        title="🔐 Confirmar identidad"
        description={`Ingresa tu PIN de administrador para eliminar "${
          storeToDelete?.name ?? ""
        }"`}
        onConfirm={handlePinConfirm}
        onCancel={() => {
          setPinDialogOpen(false);
          setStoreToDelete(null);
        }}
      />

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

              <PhotoPicker uri={logoUri} onChange={setLogoUri} />

              {/* Color picker */}
              <YStack gap="$1">
                <TText
                  fontSize="$2"
                  fontWeight="600"
                  color="$color10"
                  textTransform="uppercase"
                  letterSpacing={0.5}
                >
                  Color
                </TText>
                <XStack flexWrap="wrap" gap="$2">
                  {STORE_COLORS.map((clr) => (
                    <TouchableOpacity
                      key={clr}
                      onPress={() => setColor(clr)}
                      activeOpacity={0.7}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: color === clr }}
                      accessibilityLabel={`Color ${clr}`}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: clr,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: color === clr ? 3 : 0,
                        borderColor: isDark ? "#fff" : "#18181b",
                      }}
                    >
                      {color === clr && <Check size={16} color="white" />}
                    </TouchableOpacity>
                  ))}
                </XStack>
              </YStack>

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
