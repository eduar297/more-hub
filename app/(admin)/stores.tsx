import { EmptyState } from "@/components/ui/empty-state";
import { OVERLAY } from "@/constants/colors";
import { Edit3, Plus, Store as StoreIcon, Trash2 } from "@tamagui/lucide-icons";
import { useCallback, useEffect, useId, useState } from "react";
import { Alert, FlatList } from "react-native";
import {
    Button,
    Card,
    Input,
    Label,
    Sheet,
    Spinner,
    Text,
    XStack,
    YStack,
} from "tamagui";

import { useStore } from "@/contexts/store-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useStoreRepository } from "@/hooks/use-store-repository";
import type { CreateStoreInput, Store, UpdateStoreInput } from "@/models/store";

// ── StoreForm ────────────────────────────────────────────────────────────────

interface StoreFormProps {
  initial?: Store;
  onSubmit: (data: CreateStoreInput) => void;
  loading?: boolean;
}

function StoreForm({ initial, onSubmit, loading }: StoreFormProps) {
  const uid = useId();
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

  return (
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

      <Button
        theme="blue"
        size="$4"
        icon={loading ? <Spinner /> : undefined}
        disabled={!canSubmit || loading}
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
    </YStack>
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
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";

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

      {/* ── Create Sheet ─────────────────────────────────────────────────── */}
      <Sheet
        open={showCreateSheet}
        onOpenChange={setShowCreateSheet}
        modal
        dismissOnSnapToBottom
        snapPoints={[75]}
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor={OVERLAY}
        />
        <Sheet.Frame theme={themeName as any} bg="$background">
          <Sheet.Handle />
          <Sheet.ScrollView keyboardShouldPersistTaps="handled">
            <StoreForm onSubmit={handleCreate} loading={saving} />
          </Sheet.ScrollView>
        </Sheet.Frame>
      </Sheet>

      {/* ── Detail Sheet ─────────────────────────────────────────────────── */}
      <Sheet
        open={showDetailSheet}
        onOpenChange={setShowDetailSheet}
        modal
        dismissOnSnapToBottom
        snapPoints={[45]}
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor={OVERLAY}
        />
        <Sheet.Frame theme={themeName as any} bg="$background">
          <Sheet.Handle />
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
        </Sheet.Frame>
      </Sheet>

      {/* ── Edit Sheet ───────────────────────────────────────────────────── */}
      <Sheet
        open={showEditSheet}
        onOpenChange={setShowEditSheet}
        modal
        dismissOnSnapToBottom
        snapPoints={[75]}
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor={OVERLAY}
        />
        <Sheet.Frame theme={themeName as any} bg="$background">
          <Sheet.Handle />
          <Sheet.ScrollView keyboardShouldPersistTaps="handled">
            <StoreForm
              initial={selectedStore ?? undefined}
              onSubmit={handleEdit}
              loading={saving}
            />
          </Sheet.ScrollView>
        </Sheet.Frame>
      </Sheet>
    </YStack>
  );
}
