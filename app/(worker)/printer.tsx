import { PrinterSettingsCard } from "@/components/settings/printer-card";
import { useColors } from "@/hooks/use-colors";
import { View } from "react-native";

export default function WorkerPrinterScreen() {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <PrinterSettingsCard />
    </View>
  );
}
