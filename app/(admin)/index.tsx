import { FinanceSection } from "@/components/admin/finance-section";
import { InventorySection } from "@/components/admin/inventory-section";
import { OverviewSection } from "@/components/admin/overview-section";
import { SalesSection } from "@/components/admin/sales-section";
import type { TabDef } from "@/components/ui/screen-tabs";
import { ScreenTabs } from "@/components/ui/screen-tabs";
import {
    BarChart3,
    Package,
    ShoppingCart,
    TrendingUp,
} from "@tamagui/lucide-icons";
import { useState } from "react";
import { YStack } from "tamagui";

type Section = "overview" | "sales" | "inventory" | "finance";

const SECTIONS: TabDef<Section>[] = [
  { key: "overview", label: "Dashboard", Icon: BarChart3 },
  { key: "sales", label: "Ventas", Icon: ShoppingCart },
  { key: "inventory", label: "Inventario", Icon: Package },
  { key: "finance", label: "Finanzas", Icon: TrendingUp },
];

export default function DashboardScreen() {
  const [section, setSection] = useState<Section>("overview");

  return (
    <YStack flex={1} bg="$background">
      <ScreenTabs tabs={SECTIONS} active={section} onSelect={setSection} />

      {/* Active Section */}
      {section === "overview" && <OverviewSection />}
      {section === "sales" && <SalesSection />}
      {section === "inventory" && <InventorySection />}
      {section === "finance" && <FinanceSection />}
    </YStack>
  );
}
