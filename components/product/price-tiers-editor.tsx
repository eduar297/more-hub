import type { PriceTierInput } from "@/models/product";
import { Plus, Trash2 } from "@tamagui/lucide-icons";
import React from "react";
import { Button, Input, Label, Text, XStack, YStack } from "tamagui";

export interface PriceTierEditorRow {
  id?: number;
  minQty: string;
  maxQty: string;
  price: string;
}

export function normalizePriceTierRows(
  rows: PriceTierEditorRow[],
): PriceTierInput[] {
  return rows
    .map((row) => ({
      minQty: Number(row.minQty),
      maxQty: row.maxQty.trim() === "" ? null : Number(row.maxQty),
      price: Number(row.price),
    }))
    .filter((tier) => !Number.isNaN(tier.minQty) && !Number.isNaN(tier.price));
}

export function validatePriceTierRows(
  rows: PriceTierEditorRow[],
): string | null {
  const parsed = rows.map((row, index) => {
    const minQty = Number(row.minQty);
    const maxQty = row.maxQty.trim() === "" ? null : Number(row.maxQty);
    const price = Number(row.price);
    return { minQty, maxQty, price, index };
  });

  for (const row of parsed) {
    if (Number.isNaN(row.minQty) || row.minQty <= 0) {
      return "Cada rango debe tener una cantidad mínima válida mayor que 0.";
    }
    if (
      row.maxQty !== null &&
      (Number.isNaN(row.maxQty) || row.maxQty < row.minQty)
    ) {
      return "El máximo debe ser nulo o mayor o igual al mínimo.";
    }
    if (Number.isNaN(row.price) || row.price <= 0) {
      return "Cada rango debe tener un precio válido mayor que 0.";
    }
  }

  const sorted = [...parsed].sort((a, b) => a.minQty - b.minQty);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const current = sorted[i];
    if (prev.maxQty === null) {
      return "Hay un rango con precio abierto que no debe preceder a otros rangos.";
    }
    if (current.minQty <= prev.maxQty) {
      return "Los rangos no deben solaparse.";
    }
  }

  return null;
}

interface PriceTiersEditorProps {
  rows: PriceTierEditorRow[];
  onChange: (rows: PriceTierEditorRow[]) => void;
  error?: string | null;
}

export function PriceTiersEditor({
  rows,
  onChange,
  error,
}: PriceTiersEditorProps) {
  const getNextMinQty = (currentRows = rows): string => {
    if (currentRows.length === 0) return "1";

    // Find the highest maxQty or minQty + 1 if no maxQty
    let maxEnd = 0;
    for (const row of currentRows) {
      const minQty = Number(row.minQty) || 0;
      const maxQty = row.maxQty.trim() === "" ? null : Number(row.maxQty);

      if (maxQty === null) {
        // Open-ended range, add 1 to minQty
        maxEnd = Math.max(maxEnd, minQty + 1);
      } else {
        // Closed range, next starts at maxQty + 1
        maxEnd = Math.max(maxEnd, maxQty + 1);
      }
    }

    return String(maxEnd);
  };

  const handleAddRow = () => {
    const nextMinQty = getNextMinQty();
    onChange([...rows, { minQty: nextMinQty, maxQty: "", price: "0.00" }]);
  };

  const handleUpdateRow = (
    index: number,
    field: keyof PriceTierEditorRow,
    value: string,
  ) => {
    const next = [...rows];
    next[index] = { ...next[index], [field]: value };

    // Auto-add new row when maxQty is set on the last row
    if (
      field === "maxQty" &&
      value.trim() !== "" &&
      !Number.isNaN(Number(value))
    ) {
      const isLastRow = index === rows.length - 1;
      const hasValidMaxQty =
        value.trim() !== "" && !Number.isNaN(Number(value));

      if (isLastRow && hasValidMaxQty) {
        const nextMinQty = getNextMinQty(next);
        next.push({ minQty: nextMinQty, maxQty: "", price: "0.00" });
      }
    }

    onChange(next);
  };

  const handleRemoveRow = (index: number) => {
    const next = [...rows];
    next.splice(index, 1);
    onChange(next);
  };

  return (
    <YStack gap="$3">
      <XStack justify="space-between" style={{ alignItems: "center" }}>
        <Label color="$color10" fontSize="$3">
          Precios por cantidad
        </Label>
        <Button size="$3" theme="blue" icon={Plus} onPress={handleAddRow}>
          Agregar rango
        </Button>
      </XStack>

      <Text color="$color8" fontSize="$2">
        Deja el máximo vacío para crear un rango abierto. Las filas se mantienen
        en el orden que escribes.
      </Text>

      {rows.length === 0 ? (
        <Text color="$color8">
          Define rangos para ajustar el precio según la cantidad.
        </Text>
      ) : null}

      {rows.map((row, index) => (
        <YStack
          key={row.id != null ? `tier-${row.id}` : `tier-new-${index}`}
          gap="$2"
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#d1d5db",
            padding: 12,
          }}
        >
          <XStack gap="$2" style={{ alignItems: "flex-end" }}>
            <YStack flex={1} gap="$1" style={{ minWidth: 0 }}>
              <Label color="$color10" fontSize="$2">
                Mínima
              </Label>
              <Input
                value={row.minQty}
                onChangeText={(value) =>
                  handleUpdateRow(index, "minQty", value)
                }
                keyboardType="numeric"
                placeholder="1"
                size="$3"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </YStack>
            <YStack flex={1} gap="$1" style={{ minWidth: 0 }}>
              <Label color="$color10" fontSize="$2">
                Máxima
              </Label>
              <Input
                value={row.maxQty}
                onChangeText={(value) =>
                  handleUpdateRow(index, "maxQty", value)
                }
                keyboardType="numeric"
                placeholder="∞"
                size="$3"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </YStack>
            <YStack flex={1} gap="$1" style={{ minWidth: 0 }}>
              <Label color="$color10" fontSize="$2">
                Precio
              </Label>
              <Input
                value={row.price}
                onChangeText={(value) => handleUpdateRow(index, "price", value)}
                keyboardType="decimal-pad"
                placeholder="0.00"
                size="$3"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </YStack>
            <YStack style={{ width: 80, alignItems: "center" }}>
              <Button
                size="$3"
                theme="red"
                icon={Trash2}
                onPress={() => handleRemoveRow(index)}
              />
            </YStack>
          </XStack>
        </YStack>
      ))}

      {error ? (
        <Text color="$red10" fontSize="$3">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}
