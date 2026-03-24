import { Building2, Edit3, Plus, Trash2 } from "@tamagui/lucide-icons";
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
    TextArea,
    XStack,
    YStack,
} from "tamagui";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { useSupplierRepository } from "@/hooks/use-supplier-repository";
import type {
    CreateSupplierInput,
    Supplier,
    UpdateSupplierInput,
} from "@/models/supplier";

// ── SupplierForm ─────────────────────────────────────────────────────────────

interface SupplierFormProps {
  initial?: Supplier;
  onSubmit: (data: CreateSupplierInput) => void;
  loading?: boolean;
}

function SupplierForm({ initial, onSubmit, loading }: SupplierFormProps) {
  const uid = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [contactName, setContactName] = useState(initial?.contactName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  // Reset when switching between different suppliers
  useEffect(() => {
    setName(initial?.name ?? "");
    setContactName(initial?.contactName ?? "");
    setPhone(initial?.phone ?? "");
    setEmail(initial?.email ?? "");
    setAddress(initial?.address ?? "");
    setNotes(initial?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  const canSubmit = name.trim().length > 0;

  return (
    <YStack gap="$3" p="$4">
      <Text fontSize="$6" fontWeight="bold" color="$color">
        {initial ? "Editar proveedor" : "Nuevo proveedor"}
      </Text>

      <YStack gap="$1">
        <Label htmlFor={`${uid}-name`} color="$color10" fontSize="$3">
          Nombre *
        </Label>
        <Input
          id={`${uid}-name`}
          placeholder="Nombre del proveedor"
          value={name}
          onChangeText={setName}
          returnKeyType="next"
          size="$4"
        />
      </YStack>

      <YStack gap="$1">
        <Label htmlFor={`${uid}-contact`} color="$color10" fontSize="$3">
          Persona de contacto
        </Label>
        <Input
          id={`${uid}-contact`}
          placeholder="Nombre completo"
          value={contactName}
          onChangeText={setContactName}
          returnKeyType="next"
          size="$4"
        />
      </YStack>

      <XStack gap="$3">
        <YStack flex={1} gap="$1">
          <Label htmlFor={`${uid}-phone`} color="$color10" fontSize="$3">
            Teléfono
          </Label>
          <Input
            id={`${uid}-phone`}
            placeholder="+58 412..."
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            returnKeyType="next"
            size="$4"
          />
        </YStack>
        <YStack flex={1} gap="$1">
          <Label htmlFor={`${uid}-email`} color="$color10" fontSize="$3">
            Email
          </Label>
          <Input
            id={`${uid}-email`}
            placeholder="correo@mail.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="next"
            size="$4"
          />
        </YStack>
      </XStack>

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
        <Label htmlFor={`${uid}-notes`} color="$color10" fontSize="$3">
          Notas
        </Label>
        <TextArea
          id={`${uid}-notes`}
          placeholder="Condiciones de pago, horarios, observaciones..."
          value={notes}
          onChangeText={setNotes}
          numberOfLines={3}
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
            contactName: contactName.trim() || null,
            phone: phone.trim() || null,
            email: email.trim() || null,
            address: address.trim() || null,
            notes: notes.trim() || null,
          })
        }
      >
        {initial ? "Guardar cambios" : "Crear proveedor"}
      </Button>
    </YStack>
  );
}

// ── InfoRow ───────────────────────────────────────────────────────────────────

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

// ── SuppliersScreen ───────────────────────────────────────────────────────────

export default function SuppliersScreen() {
  const supplierRepo = useSupplierRepository();
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(
    null,
  );
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadSuppliers = useCallback(async () => {
    try {
      setSuppliers(await supplierRepo.findAll());
    } finally {
      setLoading(false);
    }
  }, [supplierRepo]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const handleCreate = async (data: CreateSupplierInput) => {
    setSaving(true);
    try {
      await supplierRepo.create(data);
      await loadSuppliers();
      setShowCreateSheet(false);
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (data: UpdateSupplierInput) => {
    if (!selectedSupplier) return;
    setSaving(true);
    try {
      await supplierRepo.update(selectedSupplier.id, data);
      await loadSuppliers();
      setShowEditSheet(false);
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!selectedSupplier) return;
    Alert.alert(
      "Eliminar proveedor",
      `¿Eliminar a "${selectedSupplier.name}"? Las compras registradas no se verán afectadas.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await supplierRepo.delete(selectedSupplier.id);
              await loadSuppliers();
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
      {/* Header */}
      <XStack
        px="$4"
        pt="$6"
        pb="$3"
        style={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <Text fontSize="$7" fontWeight="bold" color="$color">
          Proveedores
        </Text>
        <Button
          theme="blue"
          size="$3"
          icon={<Plus />}
          onPress={() => setShowCreateSheet(true)}
        >
          Nuevo
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
      ) : suppliers.length === 0 ? (
        <YStack
          flex={1}
          style={{ alignItems: "center", justifyContent: "center" }}
          gap="$3"
          px="$6"
        >
          <Building2 size={48} color="$color8" />
          <Text fontSize="$5" color="$color8" style={{ textAlign: "center" }}>
            No hay proveedores registrados.{"\n"}Toca &quot;Nuevo&quot; para
            agregar uno.
          </Text>
        </YStack>
      ) : (
        <FlatList
          data={suppliers}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => (
            <Card
              pressStyle={{ opacity: 0.8 }}
              onPress={() => {
                setSelectedSupplier(item);
                setShowDetailSheet(true);
              }}
              bg="$color1"
              borderWidth={1}
              borderColor="$color4"
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
                  <Building2 size={22} color="$blue10" />
                </YStack>
                <YStack flex={1} gap="$0.5">
                  <Text fontSize="$5" fontWeight="600" color="$color">
                    {item.name}
                  </Text>
                  {item.contactName ? (
                    <Text fontSize="$3" color="$color10">
                      {item.contactName}
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
        snapPoints={[92]}
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="rgba(0,0,0,0.5)"
        />
        <Sheet.Frame theme={themeName as any} bg="$background">
          <Sheet.Handle />
          <Sheet.ScrollView keyboardShouldPersistTaps="handled">
            <SupplierForm onSubmit={handleCreate} loading={saving} />
          </Sheet.ScrollView>
        </Sheet.Frame>
      </Sheet>

      {/* ── Detail Sheet ─────────────────────────────────────────────────── */}
      <Sheet
        open={showDetailSheet}
        onOpenChange={setShowDetailSheet}
        modal
        dismissOnSnapToBottom
        snapPoints={[55]}
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="rgba(0,0,0,0.5)"
        />
        <Sheet.Frame theme={themeName as any} bg="$background">
          <Sheet.Handle />
          {selectedSupplier && (
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
                  <Building2 size={26} color="$blue10" />
                </YStack>
                <YStack flex={1}>
                  <Text fontSize="$6" fontWeight="bold" color="$color">
                    {selectedSupplier.name}
                  </Text>
                  <Text fontSize="$3" color="$color10">
                    Desde{" "}
                    {new Date(selectedSupplier.createdAt).toLocaleDateString(
                      "es-VE",
                      { year: "numeric", month: "long", day: "numeric" },
                    )}
                  </Text>
                </YStack>
              </XStack>

              {selectedSupplier.contactName ? (
                <InfoRow
                  label="Contacto"
                  value={selectedSupplier.contactName}
                />
              ) : null}
              {selectedSupplier.phone ? (
                <InfoRow label="Teléfono" value={selectedSupplier.phone} />
              ) : null}
              {selectedSupplier.email ? (
                <InfoRow label="Email" value={selectedSupplier.email} />
              ) : null}
              {selectedSupplier.address ? (
                <InfoRow label="Dirección" value={selectedSupplier.address} />
              ) : null}
              {selectedSupplier.notes ? (
                <InfoRow label="Notas" value={selectedSupplier.notes} />
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
        snapPoints={[92]}
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="rgba(0,0,0,0.5)"
        />
        <Sheet.Frame theme={themeName as any} bg="$background">
          <Sheet.Handle />
          <Sheet.ScrollView keyboardShouldPersistTaps="handled">
            <SupplierForm
              initial={selectedSupplier ?? undefined}
              onSubmit={handleEdit}
              loading={saving}
            />
          </Sheet.ScrollView>
        </Sheet.Frame>
      </Sheet>
    </YStack>
  );
}
