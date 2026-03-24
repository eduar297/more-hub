import { useColorScheme } from "@/hooks/use-color-scheme";
import type { Unit } from "@/models/unit";
import { ChevronDown } from "@tamagui/lucide-icons";
import { useState } from "react";
import { ScrollView } from "react-native";
import { Button, Sheet, Text, YStack } from "tamagui";

export function UnitPicker({
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
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="rgba(0,0,0,0.5)"
        />
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
