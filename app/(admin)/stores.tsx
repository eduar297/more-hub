import { EmptyState } from "@/components/ui/empty-state";
import { ICON_BTN_BG } from "@/constants/colors";
import {
    Edit3,
    Plus,
    Store as StoreIcon,
    Trash2,
    X,
} from "@tamagui/lucide-icons";
import { useCallback, useEffect, useId, useState } from "react";
import {
    Alert,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    Button,
    Card,
    Input,
    Label,
    Spinner,
    Text,
    XStack,
    YStack,
} from "tamagui";

import { useStore } from "@/contexts/store-context";
import { useColors } from "@/hooks/use-colors";
import { useStoreRepository } from "@/hooks/use-store-repository";
import type { CreateStoreInput, Store, UpdateStoreInput } from "@/models/store";

// ── StoreForm ────────────────────────────────────────────────────────────────

interface StoreFormProps {
  initial?: Store;
  onSubmit: (data: CreateStoreInput) => void;
  loading?: boolean;
  onCancel?: () => void;
}

function StoreForm({ initial, onSubmit, loading, onCancel }: StoreFormProps) {
  const uid = useId();
  const c = useColors();
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");

  useEffect(() => {
    setName(initial?.name ?? "");
    setAddress(initial?.address ?? "");
    setPhone(initial?.phone ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  const canSubmit = name.trim().length > 0;
  const hasChanges = initial
    ? name !== initial.name ||
      address !== (initial.address ?? "") ||
      phone !== (initial.phone ?? "")
    : true;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <YStack gap="$3" p="$4">
          <Text fontSize="$6" fontWeight="bold" color="$color">
            {initial ? "Editar tienda" : "Nueva tienda"}
          </Text>

          <YStack gap="$1">
            <Label htmlFor={`${uid}-name`} color="$color10" fontSize="$3">
              Nombre *
            </Label>
            <Input
              id={`${uid}-name`}
              placeholder="Nombre de la tienda"
              value={name}
              onChangeText={setName}
              returnKeyType="next"
              autoCapitalize="words"
              size="$4"
            />
          </YStack>

          <YStack gap="$1">
            <Label htmlFor={`${uid}-address`} color="$color10" fontSize="$3">
              Dirección
            </Label>
            <Input
              id={`${uid}-address`}
              placeholder="Av. Principal, Local #12..."
              value={address}
              onChangeText={setAddress}
              returnKeyType="next"
              size="$4"
            />
          </YStack>

          <YStack gap="$1">
            <Label htmlFor={`${uid}-phone`} color="$color10" fontSize="$3">
              Teléfono
            </Label>
            <Input
              id={`${uid}-phone`}
              placeholder="+58 412..."
              value={phone}
              onChangeText={setPhone}
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
        <XStack gap="$2.5">
          {onCancel && (
            <Button flex={1} variant="outlined" onPress={onCancel} size="$4">
              Cancelar
            </Button>
          )}
          <Button
            flex={1}
            theme="blue"
            size="$4"
            icon={loading ? <Spinner /> : undefined}
            disabled={!canSubmit || loading || (!!initial && !hasChanges)}
            opacity={
              !canSubmit || loading || (!!initial && !hasChanges) ? 0.5 : 1
            }
            onPress={() =>
              onSubmit({
                name: name.trim(),
                address: address.trim() || null,
                phone: phone.trim() || null,
                logoUri: null,
                color: "#3b82f6",
              })
            }
          >
            {initial ? "Guardar cambios" : "Crear tienda"}
          </Button>
        </XStack>
      </View>
    </View>
  );
}

// ── InfoRow ──────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <YStack gap="$0.5">
      <Text
        fontSize="$2"
        color="$color8"
        fontWeight="600"
        style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
      >
        {label}
      </Text>
      <Text fontSize="$4" color="$color">
        {value}
      </Text>
    </YStack>
  );
}

// ── StoresScreen ─────────────────────────────────────────────────────────────

export default function StoresScreen() {
  const storeRepo = useStoreRepository();
  const { stores, refreshStores, currentStore } = useStore();
  const c = useColors();

  const [loading, setLoading] = useState(true);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadStores = useCallback(async () => {
    try {
      await refreshStores();
    } finally {
      setLoading(false);
    }
  }, [refreshStores]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  const handleCreate = async (data: CreateStoreInput) => {
    setSaving(true);
    try {
      await storeRepo.create(data);
      await refreshStores();
      setShowCreateSheet(false);
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (data: UpdateStoreInput) => {
    if (!selectedStore) return;
    setSaving(true);
    try {
      await storeRepo.update(selectedStore.id, data);
      await refreshStores();
      setShowEditSheet(false);
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!selectedStore) return;
    if (stores.length <= 1) {
      Alert.alert("Error", "No puedes eliminar la única tienda.");
      return;
    }
    Alert.alert(
      "Eliminar tienda",
      `¿Eliminar "${selectedStore.name}"? Los datos asociados (productos, ventas, etc.) permanecerán en la base de datos.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await storeRepo.delete(selectedStore.id);
              await refreshStores();
              setShowDetailSheet(false);
            } catch (e) {
              Alert.alert("Error", (e as Error).message);
            }
          },
        },
      ],
    );
  };

  return (
    <YStack flex={1} bg="$background">
      {/* Action bar */}
      <XStack
        px="$4"
        pt="$2"
        pb="$3"
        style={{ alignItems: "center", justifyContent: "flex-end" }}
      >
        <Button
          theme="blue"
          size="$3"
          icon={<Plus />}
          onPress={() => setShowCreateSheet(true)}
        >
          Nueva
        </Button>
      </XStack>

      {/* List */}
      {loading ? (
        <YStack
          flex={1}
          style={{ alignItems: "center", justifyContent: "center" }}
        >
          <Spinner size="large" />
        </YStack>
      ) : stores.length === 0 ? (
        <EmptyState
          icon={<StoreIcon size={48} color="$color8" />}
          title="No hay tiendas registradas."
          description='Toca "Nueva" para agregar una.'
        />
      ) : (
        <FlatList
          data={stores}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => (
            <Card
              pressStyle={{ opacity: 0.9, scale: 0.98 }}
              onPress={() => {
                setSelectedStore(item);
                setShowDetailSheet(true);
              }}
              bg="$color1"
              borderWidth={1}
              borderColor={currentStore?.id === item.id ? "$blue8" : "$color4"}
              p="$3"
            >
              <XStack style={{ alignItems: "center" }} gap="$3">
                <YStack
                  width={44}
                  height={44}
                  bg="$blue4"
                  style={{
                    borderRadius: 22,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <StoreIcon size={22} color="$blue10" />
                </YStack>
                <YStack flex={1} gap="$0.5">
                  <XStack style={{ alignItems: "center" }} gap="$2">
                    <Text fontSize="$5" fontWeight="600" color="$color">
                      {item.name}
                    </Text>
                    {currentStore?.id === item.id && (
                      <Text fontSize="$2" color="$blue10" fontWeight="600">
                        (activa)
                      </Text>
                    )}
                  </XStack>
                  {item.address ? (
                    <Text fontSize="$3" color="$color10">
                      {item.address}
                    </Text>
                  ) : null}
                  {item.phone ? (
                    <Text fontSize="$3" color="$color8">
                      {item.phone}
                    </Text>
                  ) : null}
                </YStack>
              </XStack>
            </Card>
          )}
        />
      )}

      {/* ── Create Modal ───────────────────────────────────────────── */}
      <Modal
        visible={showCreateSheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateSheet(false)}
      >
        <SafeAreaView
          edges={["top"]}
          style={[storeStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack
            px="$4"
            py="$3"
            alignItems="center"
            justifyContent="space-between"
          >
            <XStack alignItems="center" gap="$2">
              <StoreIcon size={20} color="$blue10" />
              <Text fontSize="$5" fontWeight="bold" color="$color">
                Nueva tienda
              </Text>
            </XStack>
            <TouchableOpacity
              onPress={() => setShowCreateSheet(false)}
              style={storeStyles.closeBtn}
            >
              <X size={18} color="$color10" />
            </TouchableOpacity>
          </XStack>
          <StoreForm
            onSubmit={handleCreate}
            loading={saving}
            onCancel={() => setShowCreateSheet(false)}
          />
        </SafeAreaView>
      </Modal>

      {/* ── Detail Modal ───────────────────────────────────────────── */}
      <Modal
        visible={showDetailSheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDetailSheet(false)}
      >
        <SafeAreaView
          edges={["top"]}
          style={[storeStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack
            px="$4"
            py="$3"
            alignItems="center"
            justifyContent="space-between"
          >
            <XStack alignItems="center" gap="$2">
              <StoreIcon size={20} color="$blue10" />
              <Text fontSize="$5" fontWeight="bold" color="$color">
                Tienda
              </Text>
            </XStack>
            <TouchableOpacity
              onPress={() => setShowDetailSheet(false)}
              style={storeStyles.closeBtn}
            >
              <X size={18} color="$color10" />
            </TouchableOpacity>
          </XStack>
          {selectedStore && (
            <YStack gap="$4" p="$4">
              <XStack style={{ alignItems: "center" }} gap="$3">
                <YStack
                  width={52}
                  height={52}
                  bg="$blue4"
                  style={{
                    borderRadius: 26,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <StoreIcon size={26} color="$blue10" />
                </YStack>
                <YStack flex={1}>
                  <Text fontSize="$6" fontWeight="bold" color="$color">
                    {selectedStore.name}
                  </Text>
                  <Text fontSize="$3" color="$color10">
                    Creada{" "}
                    {new Date(selectedStore.createdAt).toLocaleDateString(
                      "es-VE",
                      { year: "numeric", month: "long", day: "numeric" },
                    )}
                  </Text>
                </YStack>
              </XStack>

              {selectedStore.address ? (
                <InfoRow label="Dirección" value={selectedStore.address} />
              ) : null}
              {selectedStore.phone ? (
                <InfoRow label="Teléfono" value={selectedStore.phone} />
              ) : null}

              <XStack gap="$3" mt="$2">
                <Button
                  flex={1}
                  theme="blue"
                  size="$4"
                  icon={<Edit3 />}
                  onPress={() => {
                    setShowDetailSheet(false);
                    setTimeout(() => setShowEditSheet(true), 300);
                  }}
                >
                  Editar
                </Button>
                <Button
                  flex={1}
                  theme="red"
                  size="$4"
                  icon={<Trash2 />}
                  onPress={handleDelete}
                >
                  Eliminar
                </Button>
              </XStack>
            </YStack>
          )}
        </SafeAreaView>
      </Modal>

      {/* ── Edit Modal ───────────────────────────────────────────────────── */}
      <Modal
        visible={showEditSheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditSheet(false)}
      >
        <SafeAreaView
          edges={["top"]}
          style={[storeStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack
            px="$4"
            py="$3"
            alignItems="center"
            justifyContent="space-between"
          >
            <XStack alignItems="center" gap="$2">
              <Edit3 size={20} color="$blue10" />
              <Text fontSize="$5" fontWeight="bold" color="$color">
                Editar tienda
              </Text>
            </XStack>
            <TouchableOpacity
              onPress={() => setShowEditSheet(false)}
              style={storeStyles.closeBtn}
            >
              <X size={18} color="$color10" />
            </TouchableOpacity>
          </XStack>
          <StoreForm
            initial={selectedStore ?? undefined}
            onSubmit={handleEdit}
            loading={saving}
            onCancel={() => setShowEditSheet(false)}
          />
        </SafeAreaView>
      </Modal>
    </YStack>
  );
}

const storeStyles = StyleSheet.create({
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
