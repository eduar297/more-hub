import { PhotoPicker } from "@/components/ui/photo-picker";
import { PinPromptDialog } from "@/components/ui/pin-prompt-dialog";
import { ICON_BTN_BG } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { useStore } from "@/contexts/store-context";
import { useColors } from "@/hooks/use-colors";
import { useStoreRepository } from "@/hooks/use-store-repository";
import { useUserRepository } from "@/hooks/use-user-repository";
import type { Product } from "@/models/product";
import type { CreateStoreInput, Store as StoreModel } from "@/models/store";
import { ProductRepository } from "@/repositories/product.repository";
import { hashPin } from "@/utils/auth";
import {
  AlertCircle,
  Check,
  Edit3,
  MapPin,
  Plus,
  Share2,
  Store,
  Trash2,
  X,
} from "@tamagui/lucide-icons";
import * as Clipboard from "expo-clipboard";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Input, Text as TText, XStack, YStack } from "tamagui";
import { STORE_COLORS, settingStyles as styles } from "./shared";

export function StoresSection() {
  const c = useColors();

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
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState<StoreModel | null>(null);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoText, setPromoText] = useState("");
  const [promoStore, setPromoStore] = useState<StoreModel | null>(null);
  const db = useSQLiteContext();

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
    setLatitude(null);
    setLongitude(null);
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
    setLatitude(s.latitude ?? null);
    setLongitude(s.longitude ?? null);
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
        latitude,
        longitude,
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
  }, [
    name,
    address,
    latitude,
    longitude,
    phone,
    logoUri,
    color,
    editing,
    storeRepo,
    refreshStores,
  ]);

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

  const makePromoText = useCallback(
    (store: StoreModel, products: Product[]) => {
      const location = store.address || store.name || "Dirección";
      let text = `*Tus mejores ofertas ${location}*\n`;
      text += "Siempre estaremos para atenderlos\n";
      if (store.phone) {
        const phones = store.phone
          .split(",")
          .map((item) => `#${item.trim()}`)
          .join(", ");
        text += `${phones}.\n`;
      }
      if (products.length > 0) {
        text += "\n*Ofertas*\n";
        products.forEach((product) => {
          text += `•${product.name} $${product.salePrice}\n`;
          if (product.priceTiers?.length) {
            product.priceTiers.forEach((tier) => {
              if (tier.minQty > 1) {
                text += `*Más de ${tier.minQty} $${tier.price}*\n`;
              }
            });
          }
        });
      }
      text += "\n*Entre más opciones. No dude en contactarnos*";
      return text;
    },
    [],
  );

  const handleOpenPromo = useCallback(
    async (store: StoreModel) => {
      const productRepo = new ProductRepository(db, store.id);
      const products = await productRepo.findAllVisible();
      setPromoStore(store);
      setPromoText(makePromoText(store, products));
      setShowPromoModal(true);
    },
    [db, makePromoText],
  );

  const handleCopyPromo = useCallback(async () => {
    if (!promoText) return;
    await Clipboard.setStringAsync(promoText);
    Alert.alert("Copiado", "Texto copiado al portapapeles");
  }, [promoText]);

  const handleSharePromo = useCallback(async () => {
    if (!promoText) return;
    try {
      await Share.share({ message: promoText });
    } catch {
      Alert.alert("Error", "No se pudo compartir");
    }
  }, [promoText]);

  const handleSwitchStore = useCallback(
    (s: StoreModel) => {
      setCurrentStore(s);
    },
    [setCurrentStore],
  );

  const handleGetLocation = useCallback(async () => {
    setLocating(true);
    try {
      const { status: current } =
        await Location.getForegroundPermissionsAsync();
      if (current === "denied") {
        Alert.alert(
          "Permiso de ubicación",
          "Para obtener tu ubicación necesitas habilitar el permiso en Ajustes.",
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Abrir Ajustes", onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      if (current !== "granted") {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permiso denegado",
            "Necesitamos acceso a tu ubicación para obtener las coordenadas.",
          );
          return;
        }
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLatitude(loc.coords.latitude);
      setLongitude(loc.coords.longitude);
    } catch {
      Alert.alert("Error", "No se pudo obtener la ubicación.");
    } finally {
      setLocating(false);
    }
  }, []);

  const openInMaps = useCallback((lat: number, lng: number, label?: string) => {
    const encoded = encodeURIComponent(label ?? "Tienda");
    const url = Platform.select({
      ios: `maps:0,0?q=${encoded}@${lat},${lng}`,
      default: `geo:${lat},${lng}?q=${lat},${lng}(${encoded})`,
    });
    Linking.openURL(url);
  }, []);

  const canSave = name.trim().length > 0;
  const hasChanges = editing
    ? name !== editing.name ||
      address !== (editing.address ?? "") ||
      phone !== (editing.phone ?? "") ||
      logoUri !== (editing.logoUri ?? null) ||
      color !== (editing.color ?? "#3b82f6") ||
      latitude !== (editing.latitude ?? null) ||
      longitude !== (editing.longitude ?? null)
    : true;

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
                  <View style={styles.workerRow}>
                    <TouchableOpacity
                      onPress={() => handleSwitchStore(s)}
                      activeOpacity={0.7}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={`Seleccionar tienda ${s.name}`}
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
                    </TouchableOpacity>
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
                      {s.latitude != null && s.longitude != null && (
                        <TouchableOpacity
                          onPress={() =>
                            openInMaps(s.latitude!, s.longitude!, s.name)
                          }
                          activeOpacity={0.7}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            marginTop: 2,
                          }}
                        >
                          <MapPin size={12} color={c.blue as any} />
                          <Text style={{ fontSize: 12, color: c.blue }}>
                            Ver en mapa
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        style={[
                          styles.iconBtn,
                          { backgroundColor: c.blueLight },
                        ]}
                        onPress={() => handleOpenPromo(s)}
                        activeOpacity={0.7}
                        hitSlop={4}
                        accessibilityRole="button"
                        accessibilityLabel={`Compartir texto de ${s.name}`}
                      >
                        <Share2 size={17} color={c.blue as any} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.iconBtn, { backgroundColor: c.editBg }]}
                        onPress={() => openEdit(s)}
                        activeOpacity={0.7}
                        hitSlop={4}
                        accessibilityRole="button"
                        accessibilityLabel={`Editar ${s.name}`}
                      >
                        <Edit3 size={17} color={c.muted as any} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.iconBtn,
                          { backgroundColor: c.dangerBg },
                        ]}
                        onPress={() => handleDelete(s)}
                        activeOpacity={0.7}
                        hitSlop={4}
                        accessibilityRole="button"
                        accessibilityLabel={`Eliminar ${s.name}`}
                      >
                        <Trash2 size={17} color={c.danger as any} />
                      </TouchableOpacity>
                    </View>
                  </View>
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

      <Modal
        visible={showPromoModal}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setShowPromoModal(false)}
      >
        <SafeAreaView
          edges={["top"]}
          style={[stStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack px="$4" py="$3" items="center" justify="space-between">
            <XStack items="center" gap="$2">
              <Share2 size={20} color="$blue10" />
              <TText fontSize="$4" fontWeight="bold" color="$color">
                Texto para compartir
                {promoStore ? ` - ${promoStore.name}` : ""}
              </TText>
            </XStack>
            <TouchableOpacity
              onPress={() => setShowPromoModal(false)}
              style={stStyles.closeBtn}
            >
              <X size={18} color="$color10" />
            </TouchableOpacity>
          </XStack>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={{ color: c.text, lineHeight: 22 }}>
              {promoText || "Generando texto..."}
            </Text>
          </ScrollView>

          <XStack px="$4" pb="$4" pt="$2" gap="$2">
            <Button
              flex={1}
              theme="gray"
              size="$4"
              onPress={() => setShowPromoModal(false)}
            >
              Cerrar
            </Button>
            <Button
              flex={1}
              theme="blue"
              size="$4"
              icon={<Share2 />}
              onPress={handleSharePromo}
            >
              Compartir
            </Button>
            <Button flex={1} theme="green" size="$4" onPress={handleCopyPromo}>
              Copiar
            </Button>
          </XStack>
        </SafeAreaView>
      </Modal>

      {/* ── Store form Modal ──────────────────────────────────────────── */}
      <Modal
        visible={sheetOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSheetOpen(false)}
      >
        <SafeAreaView
          edges={["top"]}
          style={[stStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack px="$4" py="$3" items="center" justify="space-between">
            <XStack items="center" gap="$2">
              <Store size={20} color="$blue10" />
              <TText fontSize="$5" fontWeight="bold" color="$color">
                {editing ? "Editar tienda" : "Nueva tienda"}
              </TText>
            </XStack>
            <TouchableOpacity
              onPress={() => setSheetOpen(false)}
              style={stStyles.closeBtn}
            >
              <X size={18} color="$color10" />
            </TouchableOpacity>
          </XStack>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <YStack gap="$3" p="$4">
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
                        borderColor: c.text,
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
                  Ubicación en mapa
                </TText>

                {latitude != null && longitude != null ? (
                  <YStack gap="$2">
                    <XStack
                      items="center"
                      gap="$2"
                      bg="$green2"
                      rounded="$2"
                      px="$3"
                      py="$2"
                    >
                      <MapPin size={14} color="$green10" />
                      <TText fontSize="$2" color="$green10" flex={1}>
                        {latitude.toFixed(6)}, {longitude.toFixed(6)}
                      </TText>
                    </XStack>
                    <XStack gap="$2">
                      <Button
                        flex={1}
                        size="$3"
                        icon={
                          locating ? (
                            <ActivityIndicator size="small" />
                          ) : (
                            <MapPin size={14} />
                          )
                        }
                        disabled={locating}
                        onPress={handleGetLocation}
                      >
                        Actualizar
                      </Button>
                      <Button
                        flex={1}
                        size="$3"
                        icon={<MapPin size={14} />}
                        onPress={() =>
                          openInMaps(latitude!, longitude!, name || "Tienda")
                        }
                      >
                        Ver en mapa
                      </Button>
                      <Button
                        size="$3"
                        theme="red"
                        onPress={() => {
                          setLatitude(null);
                          setLongitude(null);
                        }}
                      >
                        Quitar
                      </Button>
                    </XStack>
                  </YStack>
                ) : (
                  <Button
                    size="$3"
                    icon={
                      locating ? (
                        <ActivityIndicator size="small" />
                      ) : (
                        <MapPin size={14} />
                      )
                    }
                    disabled={locating}
                    onPress={handleGetLocation}
                  >
                    {locating ? "Obteniendo…" : "Usar ubicación actual"}
                  </Button>
                )}
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
            </YStack>
          </ScrollView>

          {/* ── Fixed footer ───────────────────────────────────── */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderTopWidth: 1,
              borderTopColor: c.border,
              backgroundColor: c.modalBg,
            }}
          >
            {!!formError && (
              <View
                style={[
                  styles.feedbackRow,
                  { backgroundColor: c.dangerBg, marginBottom: 10 },
                ]}
              >
                <AlertCircle size={15} color={c.danger as any} />
                <Text style={[styles.feedbackText, { color: c.danger }]}>
                  {formError}
                </Text>
              </View>
            )}
            <XStack gap="$2.5">
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
                disabled={!canSave || saving || (!!editing && !hasChanges)}
                opacity={
                  !canSave || saving || (!!editing && !hasChanges) ? 0.5 : 1
                }
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
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const stStyles = StyleSheet.create({
  modalRoot: { flex: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ICON_BTN_BG,
    alignItems: "center",
    justifyContent: "center",
  },
});
