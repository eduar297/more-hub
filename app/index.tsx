import {
  ChevronRight,
  FlaskConical,
  Monitor,
  Receipt,
  ShieldCheck,
} from "@tamagui/lucide-icons";
import { useRouter } from "expo-router";
import { Card, H1, Text, XStack, YStack } from "tamagui";

const ROLES = [
  {
    icon: ShieldCheck,
    label: "Administrador",
    desc: "Gestión de productos e inventario",
    path: "/(admin)" as const,
    color: "$blue10",
    bg: "$blue2",
  },
  {
    icon: Receipt,
    label: "Vendedor",
    desc: "Panel de ventas y cobros",
    path: "/(worker)" as const,
    color: "$green10",
    bg: "$green2",
  },
  {
    icon: Monitor,
    label: "Display",
    desc: "Pantalla de mostrador en landscape",
    path: "/(display)" as const,
    color: "$purple10",
    bg: "$purple2",
  },
  {
    icon: FlaskConical,
    label: "Test",
    desc: "Pantalla de pruebas",
    path: "/(test)" as const,
    color: "$orange10",
    bg: "$orange2",
  },
];

export default function HomeScreen() {
  const router = useRouter();

  return (
    <YStack
      flex={1}
      bg="$background"
      px="$5"
      py="$8"
      gap="$3"
      style={{ justifyContent: "center" }}
    >
      <YStack mb="$6" style={{ alignItems: "center" }}>
        <H1 color="$color" fontSize="$10" letterSpacing={-1}>
          ElMore
        </H1>
      </YStack>

      {ROLES.map(({ icon: Icon, label, desc, path, color, bg }) => (
        <Card
          key={path}
          borderWidth={1}
          borderColor="$borderColor"
          pressStyle={{ scale: 0.97, opacity: 0.9 }}
          onPress={() => router.push(path)}
          p="$4"
          borderRadius="$6"
          bg="$background"
        >
          <XStack gap="$4" style={{ alignItems: "center" }}>
            <YStack
              bg={bg as any}
              p="$3"
              style={{
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
              }}
            >
              <Icon size={26} color={color as any} />
            </YStack>

            <YStack flex={1} gap="$1">
              <Text fontSize="$5" fontWeight="700" color="$color">
                {label}
              </Text>
              <Text fontSize="$3" color="$color10">
                {desc}
              </Text>
            </YStack>

            <ChevronRight size={18} color="$color10" />
          </XStack>
        </Card>
      ))}
    </YStack>
  );
}
