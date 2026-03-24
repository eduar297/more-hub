import {
    Receipt,
    ScanLine,
    ShoppingCart,
    TrendingUp,
} from "@tamagui/lucide-icons";
import { Button, Card, H2, Text, XStack, YStack } from "tamagui";

export default function WorkerScreen() {
  return (
    <YStack flex={1} bg="$background" p="$5" gap="$4">
      {/* Header */}
      <XStack alignItems="center" gap="$3" mb="$2">
        <Receipt size={28} color="$green10" />
        <YStack>
          <H2 color="$color" fontSize="$6" fontWeight="bold">
            Panel de Ventas
          </H2>
          <Text fontSize="$3" color="$color10">
            Registra ventas y consulta productos
          </Text>
        </YStack>
      </XStack>

      {/* Stats row */}
      <XStack gap="$3">
        <Card
          flex={1}
          borderWidth={1}
          bg="$green2"
          p="$4"
          br="$5"
          borderColor="$green5"
        >
          <TrendingUp size={20} color="$green10" />
          <Text fontSize="$8" fontWeight="bold" color="$green10" mt="$1">
            $0
          </Text>
          <Text fontSize="$2" color="$color10">
            Total hoy
          </Text>
        </Card>

        <Card
          flex={1}
          borderWidth={1}
          bg="$blue2"
          p="$4"
          br="$5"
          borderColor="$blue5"
        >
          <ShoppingCart size={20} color="$blue10" />
          <Text fontSize="$8" fontWeight="bold" color="$blue10" mt="$1">
            0
          </Text>
          <Text fontSize="$2" color="$color10">
            Ventas
          </Text>
        </Card>
      </XStack>

      {/* Main action */}
      <Button
        size="$6"
        theme="green"
        icon={ScanLine}
        mt="$2"
        onPress={() => {
          // TODO: implementar escaneo de venta
        }}
      >
        Escanear producto
      </Button>

      <Card
        borderWidth={1}
        bg="$background"
        p="$4"
        br="$5"
        borderColor="$borderColor"
      >
        <Text color="$color10" fontSize="$3" style={{ textAlign: "center" }}>
          Las ventas registradas aparecerán aquí
        </Text>
      </Card>
    </YStack>
  );
}
