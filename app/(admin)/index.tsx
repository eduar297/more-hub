import { FinanceSection } from "@/components/admin/finance-section";
import { InventorySection } from "@/components/admin/inventory-section";
import { OverviewSection } from "@/components/admin/overview-section";
import { SalesSection } from "@/components/admin/sales-section";
import { WorkersSection } from "@/components/admin/workers-section";
import type { TabDef } from "@/components/ui/screen-tabs";
import { ScreenTabs } from "@/components/ui/screen-tabs";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  TrendingUp,
  Users,
} from "@tamagui/lucide-icons";
import { useState } from "react";
import { YStack } from "tamagui";

type Section = "overview" | "sales" | "inventory" | "finance" | "workers";

const SECTIONS: TabDef<Section>[] = [
  { key: "overview", label: "Resumen", Icon: LayoutDashboard },
  { key: "sales", label: "Ventas", Icon: ShoppingCart },
  { key: "inventory", label: "Inventario", Icon: Package },
  { key: "finance", label: "Finanzas", Icon: TrendingUp },
  { key: "workers", label: "Equipo", Icon: Users },
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
      {section === "workers" && <WorkersSection />}
    </YStack>
  );
}
