import type { Unit } from "@/models/unit";
import { ChevronDown, ChevronUp } from "@tamagui/lucide-icons";
import { useState } from "react";
import { Button, Text, XStack, YStack } from "tamagui";

export function UnitPicker({
  units,
  value,
  onChange,
}: {
  units: Unit[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = units.find((u) => String(u.id) === value);

  return (
    <YStack>
      <Button
        size="$4"
        iconAfter={open ? ChevronUp : ChevronDown}
        onPress={() => setOpen((v) => !v)}
        theme={selected ? "blue" : undefined}
      >
        {selected
          ? `${selected.name} (${selected.symbol})`
          : "Seleccionar unidad"}
      </Button>

      {open && (
        <YStack
          mt="$1"
          bg="$background"
          borderWidth={1}
          borderColor="$borderColor"
          style={{ borderRadius: 12, overflow: "hidden" }}
        >
          {units.map((unit, i) => (
            <XStack
              key={unit.id}
              py="$3"
              px="$4"
              pressStyle={{ bg: "$color3" }}
              onPress={() => {
                onChange(String(unit.id));
                setOpen(false);
              }}
              borderTopWidth={i === 0 ? 0 : 1}
              borderColor="$borderColor"
              style={{
                alignItems: "center",
                justifyContent: "space-between",
                flexDirection: "row",
              }}
            >
              <Text color="$color" fontSize="$4">
                {unit.name} ({unit.symbol})
              </Text>
              {String(unit.id) === value && (
                <Text color="$blue10" fontSize="$3" fontWeight="bold">
                  ✓
                </Text>
              )}
            </XStack>
          ))}
        </YStack>
      )}
    </YStack>
  );
}
