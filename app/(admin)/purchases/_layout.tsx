import { HeaderActions } from "@/components/admin/header-actions";
import { useColors } from "@/hooks/use-colors";
import { Stack } from "expo-router";

export default function PurchasesLayout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.headerBg },
        headerTintColor: c.headerText,
        headerShadowVisible: false,
        headerRight: () => <HeaderActions />,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Comercio" }} />
    </Stack>
  );
}
