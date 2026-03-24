import { BarcodeDisplay } from "@/components/product/barcode-display";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { CreateProductInput, SaleMode } from "@/models/product";
import type { Unit } from "@/models/unit";
import { generateEAN13 } from "@/utils/barcode";
import { ChevronDown } from "@tamagui/lucide-icons";
import { useRef, useState } from "react";
import { ScrollView } from "react-native";
import {
  Button,
  Input,
  Label,
  Sheet,
  Spinner,
  Text,
  XStack,
  YStack
} from "tamagui";

// ── Unit picker ──────────────────────────────────────────────────────────────

function UnitPicker({
  units,
  value,
  onChange,
}: {
  units: Unit[];
  value: string;
  onChange: (id: string) => void;
}) {
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";
  const [open, setOpen] = useState(false);
  const selected = units.find((u) => String(u.id) === value);

  return (
    <>
      <Button size="$4" iconAfter={ChevronDown} onPress={() => setOpen(true)}>
        {selected
          ? `${selected.name} (${selected.symbol})`
          : "Seleccionar unidad"}
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        modal
        snapPoints={[50]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay />
        <Sheet.Frame p="$4" theme={themeName as any}>
          <Sheet.Handle />
          <Text fontWeight="bold" fontSize="$5" color="$color" mb="$3">
            Unidad base
          </Text>
          <ScrollView>
            <YStack gap="$2" pb="$6">
              {units.map((unit) => (
                <Button
                  key={unit.id}
                  theme={String(unit.id) === value ? "blue" : undefined}
                  onPress={() => {
                    onChange(String(unit.id));
                    setOpen(false);
                  }}
                >
                  {unit.name} ({unit.symbol})
                </Button>
              ))}
            </YStack>
          </ScrollView>
        </Sheet.Frame>
      </Sheet>
    </>
  );
}

// ── ProductForm ──────────────────────────────────────────────────────────────

export interface ProductFormProps {
  /** Pre-filled barcode (e.g. from scanner). If omitted, one is auto-generated. */
  barcode?: string;
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
  // Generate a stable EAN-13 when no barcode is supplied.
  const generatedRef = useRef<string>(generateEAN13());
  const effectiveBarcode = barcode ?? generatedRef.current;

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [unitId, setUnitId] = useState("");

  const canSubmit =
    name.trim().length > 0 &&
    price.trim().length > 0 &&
    stock.trim().length > 0 &&
    unitId.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      barcode: effectiveBarcode,
      pricePerBaseUnit: parseFloat(price),
      stockBaseQty: parseFloat(stock),
      saleMode: "UNIT" as SaleMode,
      baseUnitId: parseInt(unitId, 10),
    });
  };

  return (
    <YStack gap="$3" p="$4">
      <Text fontSize="$6" fontWeight="bold" color="$color">
        Nuevo producto
      </Text>

      {/* Barcode visual */}
      <YStack
        bg="$color1"
        style={{ borderRadius: 12, alignItems: "center" }}
        p="$3"
        gap="$2"
      >
        <BarcodeDisplay barcode={effectiveBarcode} width={260} />
        <Text fontSize="$2" color="$color10" letterSpacing={2}>
          {effectiveBarcode}
        </Text>
        {!barcode && (
          <Text fontSize="$1" color="$color8">
            Código generado automáticamente
          </Text>
        )}
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
