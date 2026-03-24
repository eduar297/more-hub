import { useState } from "react";
import { Button, Input, Label, Spinner, Text, XStack, YStack } from "tamagui";

export interface ProductFormProps {
  barcode: string;
  onSubmit: (data: Omit<ProductFormData, "id">) => void;
  loading?: boolean;
}

export interface ProductFormData {
  id?: number;
  name: string;
  barcode: string;
  pricePerBaseUnit: number;
  stockBaseQty: number;
  saleMode: string;
  baseUnitId: number;
}

export function ProductForm({ barcode, onSubmit, loading }: ProductFormProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [saleMode] = useState("UNIT");
  const [baseUnitId, setBaseUnitId] = useState("");

  return (
    <YStack gap="$3" p="$4">
      <Text fontSize="$7" fontWeight="bold" color="$color">
        Crear producto
      </Text>

      <Text fontSize="$3" color="$color10">
        Código: {barcode}
      </Text>

      <YStack gap="$1">
        <Label htmlFor="name" color="$color10" fontSize="$3">
          Nombre
        </Label>
        <Input
          id="name"
          placeholder="Nombre del producto"
          value={name}
          onChangeText={setName}
          size="$4"
        />
      </YStack>

      <YStack gap="$1">
        <Label htmlFor="price" color="$color10" fontSize="$3">
          Precio por unidad base
        </Label>
        <Input
          id="price"
          placeholder="0.00"
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          size="$4"
        />
      </YStack>

      <XStack gap="$3">
        <YStack flex={1} gap="$1">
          <Label htmlFor="stock" color="$color10" fontSize="$3">
            Stock inicial
          </Label>
          <Input
            id="stock"
            placeholder="0"
            value={stock}
            onChangeText={setStock}
            keyboardType="numeric"
            size="$4"
          />
        </YStack>

        <YStack flex={1} gap="$1">
          <Label htmlFor="unitId" color="$color10" fontSize="$3">
            ID unidad base
          </Label>
          <Input
            id="unitId"
            placeholder="1"
            value={baseUnitId}
            onChangeText={setBaseUnitId}
            keyboardType="numeric"
            size="$4"
          />
        </YStack>
      </XStack>

      <Button
        size="$5"
        theme="blue"
        mt="$2"
        disabled={loading}
        onPress={() =>
          onSubmit({
            name,
            barcode,
            pricePerBaseUnit: parseFloat(price),
            stockBaseQty: parseFloat(stock),
            saleMode,
            baseUnitId: parseInt(baseUnitId, 10),
          })
        }
        icon={loading ? <Spinner /> : undefined}
      >
        {loading ? "Guardando..." : "Crear producto"}
      </Button>
    </YStack>
  );
}
