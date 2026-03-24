import { BarcodeDisplay } from "@/components/product/barcode-display";
import { PhotoPicker } from "@/components/ui/photo-picker";
import { UnitPicker } from "@/components/ui/unit-picker";
import type { Product, SaleMode, UpdateProductInput } from "@/models/product";
import type { Unit } from "@/models/unit";
import { useState } from "react";
import { Button, Input, Label, Spinner, Text, XStack, YStack } from "tamagui";

export interface ProductEditFormProps {
  product: Product;
  /** Units loaded by the parent — safe to pass into Sheet portals. */
  units: Unit[];
  onSubmit: (data: UpdateProductInput) => void;
  loading?: boolean;
}

export function ProductEditForm({
  product,
  units,
  onSubmit,
  loading,
}: ProductEditFormProps) {
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.pricePerBaseUnit));
  const [unitId, setUnitId] = useState(String(product.baseUnitId));
  const [saleMode, setSaleMode] = useState<SaleMode>(product.saleMode);
  const [photoUri, setPhotoUri] = useState<string | null>(
    product.photoUri ?? null,
  );

  const parsedPrice = parseFloat(price);
  const canSubmit =
    name.trim().length > 0 &&
    price.trim().length > 0 &&
    !isNaN(parsedPrice) &&
    parsedPrice > 0 &&
    unitId.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      pricePerBaseUnit: parsedPrice,
      baseUnitId: parseInt(unitId, 10),
      saleMode,
      photoUri,
    });
  };

  return (
    <YStack gap="$3" p="$4">
      <Text fontSize="$6" fontWeight="bold" color="$color">
        Editar producto
      </Text>

      {/* Photo picker */}
      <YStack gap="$1">
        <Label color="$color10" fontSize="$3">
          Foto del producto
        </Label>
        <PhotoPicker uri={photoUri} onChange={setPhotoUri} />
      </YStack>

      {/* Barcode (read-only) */}
      {/^\d{13}$/.test(product.barcode) && (
        <YStack
          bg="$color1"
          style={{ borderRadius: 12, alignItems: "center" }}
          p="$3"
          gap="$2"
        >
          <BarcodeDisplay
            barcode={product.barcode}
            width={260}
            barHeight={50}
          />
          <Text fontSize="$2" color="$color10" letterSpacing={2}>
            {product.barcode}
          </Text>
          <Text fontSize="$1" color="$color8">
            El código de barras no puede modificarse
          </Text>
        </YStack>
      )}

      {/* Name */}
      <YStack gap="$1">
        <Label htmlFor="ef-name" color="$color10" fontSize="$3">
          Nombre
        </Label>
        <Input id="ef-name" value={name} onChangeText={setName} size="$4" />
      </YStack>

      {/* Price */}
      <YStack gap="$1">
        <Label htmlFor="ef-price" color="$color10" fontSize="$3">
          Precio por unidad
        </Label>
        <Input
          id="ef-price"
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          size="$4"
        />
      </YStack>

      {/* Unit selection */}
      <YStack gap="$1">
        <Label color="$color10" fontSize="$3">
          Unidad base
        </Label>
        <UnitPicker units={units} value={unitId} onChange={setUnitId} />
      </YStack>

      {/* Sale mode toggle */}
      <YStack gap="$1">
        <Label color="$color10" fontSize="$3">
          Modo de venta
        </Label>
        <XStack gap="$2">
          <Button
            flex={1}
            theme={saleMode === "UNIT" ? "blue" : undefined}
            onPress={() => setSaleMode("UNIT")}
            size="$4"
          >
            Por unidad
          </Button>
          <Button
            flex={1}
            theme={saleMode === "VARIABLE" ? "blue" : undefined}
            onPress={() => setSaleMode("VARIABLE")}
            size="$4"
          >
            Variable
          </Button>
        </XStack>
      </YStack>

      <Button
        size="$5"
        theme="blue"
        mt="$2"
        disabled={loading || !canSubmit}
        onPress={handleSubmit}
        icon={loading ? <Spinner /> : undefined}
      >
        {loading ? "Guardando..." : "Guardar cambios"}
      </Button>
    </YStack>
  );
}
