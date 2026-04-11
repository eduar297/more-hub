import { EmptyState } from "@/components/ui/empty-state";
import { ICON_BTN_BG } from "@/constants/colors";
import { Building2, Edit3, Plus, Trash2, X } from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
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
    TextArea,
    XStack,
    YStack,
} from "tamagui";

import { useColors } from "@/hooks/use-colors";
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
  onCancel?: () => void;
}

function SupplierForm({
  initial,
  onSubmit,
  loading,
  onCancel,
}: SupplierFormProps) {
  const uid = useId();
  const c = useColors();
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
  const hasChanges = initial
    ? name !== initial.name ||
      contactName !== (initial.contactName ?? "") ||
      phone !== (initial.phone ?? "") ||
      email !== (initial.email ?? "") ||
      address !== (initial.address ?? "") ||
      notes !== (initial.notes ?? "")
    : true;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
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
              autoCapitalize="words"
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
              autoCapitalize="words"
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
        </XStack>
      </View>
    </View>
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
  const c = useColors();

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

  useFocusEffect(
    useCallback(() => {
      loadSuppliers();
    }, [loadSuppliers]),
  );

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
        <EmptyState
          icon={<Building2 size={48} color="$color8" />}
          title="No hay proveedores registrados."
          description='Toca "Nuevo" para agregar uno.'
        />
      ) : (
        <FlatList
          data={suppliers}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => (
            <Card
              pressStyle={{ opacity: 0.9, scale: 0.98 }}
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

      {/* ── Create Modal ────────────────────────────────────────────────── */}
      <Modal
        visible={showCreateSheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateSheet(false)}
      >
        <SafeAreaView
          edges={["top"]}
          style={[sStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack
            p="$3"
            px="$4"
            style={{ alignItems: "center", justifyContent: "space-between" }}
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <XStack style={{ alignItems: "center" }} gap="$2">
              <Building2 size={18} color="$blue10" />
              <Text fontSize={16} fontWeight="700" color="$color">
                Nuevo proveedor
              </Text>
            </XStack>
            <TouchableOpacity
              onPress={() => setShowCreateSheet(false)}
              hitSlop={8}
              style={sStyles.closeBtn}
            >
              <X size={18} color="$color" />
            </TouchableOpacity>
          </XStack>
          <SupplierForm
            onSubmit={handleCreate}
            loading={saving}
            onCancel={() => setShowCreateSheet(false)}
          />
        </SafeAreaView>
      </Modal>

      {/* ── Detail Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={showDetailSheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDetailSheet(false)}
      >
        <SafeAreaView
          edges={["top"]}
          style={[sStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack
            p="$3"
            px="$4"
            style={{ alignItems: "center", justifyContent: "space-between" }}
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <XStack style={{ alignItems: "center" }} gap="$2">
              <Building2 size={18} color="$blue10" />
              <Text fontSize={16} fontWeight="700" color="$color">
                Proveedor
              </Text>
            </XStack>
            <TouchableOpacity
              onPress={() => setShowDetailSheet(false)}
              hitSlop={8}
              style={sStyles.closeBtn}
            >
              <X size={18} color="$color" />
            </TouchableOpacity>
          </XStack>

          {selectedSupplier && (
            <ScrollView
              contentContainerStyle={{
                padding: 16,
                paddingBottom: 40,
                gap: 16,
              }}
            >
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
            </ScrollView>
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
          style={[sStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack
            p="$3"
            px="$4"
            style={{ alignItems: "center", justifyContent: "space-between" }}
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <XStack style={{ alignItems: "center" }} gap="$2">
              <Edit3 size={18} color="$blue10" />
              <Text fontSize={16} fontWeight="700" color="$color">
                Editar proveedor
              </Text>
            </XStack>
            <TouchableOpacity
              onPress={() => setShowEditSheet(false)}
              hitSlop={8}
              style={sStyles.closeBtn}
            >
              <X size={18} color="$color" />
            </TouchableOpacity>
          </XStack>
          <SupplierForm
            initial={selectedSupplier ?? undefined}
            onSubmit={handleEdit}
            loading={saving}
            onCancel={() => setShowEditSheet(false)}
          />
        </SafeAreaView>
      </Modal>
    </YStack>
  );
}

const sStyles = StyleSheet.create({
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
