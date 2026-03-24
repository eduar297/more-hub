import { BarcodeDisplay } from "@/components/product/barcode-display";
import { PhotoPicker } from "@/components/ui/photo-picker";
import { UnitPicker } from "@/components/ui/unit-picker";
import type { CreateProductInput, SaleMode } from "@/models/product";
import type { Unit } from "@/models/unit";
import { useState } from "react";
import { Button, Input, Label, Spinner, Text, XStack, YStack } from "tamagui";

// ── ProductForm ──────────────────────────────────────────────────────────────

export interface ProductFormProps {
  /** Barcode for the new product — always provided by the parent, fresh each time. */
  barcode: string;
  /** Units loaded from the parent (must be fetched outside Sheet portals to keep SQLiteContext). */
  units: Unit[];
  onSubmit: (data: CreateProductInput) => void;
  loading?: boolean;
}

export function ProductForm({
  barcode,
  units,
  onSubmit,
  loading,
}: ProductFormProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [unitId, setUnitId] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const canSubmit =
    name.trim().length > 0 &&
    price.trim().length > 0 &&
    stock.trim().length > 0 &&
    unitId.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      barcode,
      pricePerBaseUnit: parseFloat(price),
      stockBaseQty: parseFloat(stock),
      saleMode: "UNIT" as SaleMode,
      baseUnitId: parseInt(unitId, 10),
      photoUri,
    });
  };

  return (
    <YStack gap="$3" p="$4">
      <Text fontSize="$6" fontWeight="bold" color="$color">
        Nuevo producto
      </Text>

      {/* Photo picker */}
      <YStack gap="$1">
        <Label color="$color10" fontSize="$3">
          Foto del producto
        </Label>
        <PhotoPicker uri={photoUri} onChange={setPhotoUri} />
      </YStack>

      {/* Barcode visual */}
      <YStack
        bg="$color1"
        style={{ borderRadius: 12, alignItems: "center" }}
        p="$3"
        gap="$2"
      >
        <BarcodeDisplay barcode={barcode} width={260} />
        <Text fontSize="$2" color="$color10" letterSpacing={2}>
          {barcode}
        </Text>
        <Text fontSize="$1" color="$color8">
          Código generado automáticamente
        </Text>
      </YStack>

      {/* Name */}
      <YStack gap="$1">
        <Label htmlFor="pf-name" color="$color10" fontSize="$3">
          Nombre
        </Label>
        <Input
          id="pf-name"
          placeholder="Nombre del producto"
          value={name}
          onChangeText={setName}
          returnKeyType="done"
          keyboardType="default"
          size="$4"
        />
      </YStack>

      {/* Price + Stock */}
      <XStack gap="$3">
        <YStack flex={1} gap="$1">
          <Label htmlFor="pf-price" color="$color10" fontSize="$3">
            Precio
          </Label>
          <Input
            id="pf-price"
            placeholder="0.00"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            returnKeyType="done"
            size="$4"
          />
        </YStack>

        <YStack flex={1} gap="$1">
          <Label htmlFor="pf-stock" color="$color10" fontSize="$3">
            Stock inicial
          </Label>
          <Input
            id="pf-stock"
            placeholder="0"
            value={stock}
            onChangeText={setStock}
            keyboardType="numeric"
            returnKeyType="done"
            size="$4"
          />
        </YStack>
      </XStack>

      {/* Unit picker */}
      <YStack gap="$1">
        <Label color="$color10" fontSize="$3">
          Unidad base
        </Label>
        <UnitPicker units={units} value={unitId} onChange={setUnitId} />
      </YStack>

      <Button
        size="$5"
        theme="blue"
        mt="$2"
        disabled={loading || !canSubmit}
        onPress={handleSubmit}
        icon={loading ? <Spinner /> : undefined}
      >
        {loading ? "Guardando..." : "Crear producto"}
      </Button>
    </YStack>
  );
}
