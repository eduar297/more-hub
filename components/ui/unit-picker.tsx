import { useColors } from "@/hooks/use-colors";
import type { Unit } from "@/models/unit";
import { Picker } from "@react-native-picker/picker";
import { YStack } from "tamagui";

export function UnitPicker({
  units,
  value,
  onChange,
}: {
  units: Unit[];
  value: string;
  onChange: (id: string) => void;
}) {
  const c = useColors();

  return (
    <YStack
      bg="$color2"
      borderWidth={1}
      borderColor="$borderColor"
      style={{ borderRadius: 12, overflow: "hidden" }}
    >
      <Picker
        selectedValue={value}
        onValueChange={(v: string) => onChange(v)}
        itemStyle={{ color: c.text, fontSize: 18 }}
      >
        <Picker.Item label="Seleccionar unidad" value="" />
        {units.map((unit) => (
          <Picker.Item
            key={unit.id}
            label={`${unit.name} (${unit.symbol})`}
            value={String(unit.id)}
          />
        ))}
      </Picker>
    </YStack>
  );
}
