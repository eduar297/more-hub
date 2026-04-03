import { CartMirror } from "@/components/lan/cart-mirror";
import { DisplayConnect } from "@/components/lan/display-connect";
import { useDevice } from "@/contexts/device-context";
import { useLan } from "@/contexts/lan-context";
import { Monitor, Play } from "@tamagui/lucide-icons";
import { useCallback, useState } from "react";
import { Alert, StatusBar } from "react-native";
import { Button, Text, YStack } from "tamagui";

export default function DisplayScreen() {
  const [started, setStarted] = useState(false);
  const { connectionStatus, cartMirror } = useLan();
  const { resetDevice } = useDevice();

  const handleStart = () => {
    setStarted(true);
  };

  const handleReset = useCallback(() => {
    Alert.alert(
      "Cambiar rol",
      "Esto borrará el rol de este dispositivo y volverás a la pantalla de selección. ¿Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Cambiar", style: "destructive", onPress: () => resetDevice() },
      ],
    );
  }, [resetDevice]);

  // Pre-start: show activation button
  if (!started) {
    return (
      <YStack
        flex={1}
        bg="$background"
        gap="$6"
        p="$6"
        items="center"
        justify="center"
      >
        <Monitor size={64} color="$purple10" />
        <YStack gap="$2" items="center">
          <Text fontSize="$7" fontWeight="bold" color="$color" text="center">
            Modo Display
          </Text>
          <Text color="$color10" text="center" fontSize="$4">
            Activa la pantalla para conectar con un vendedor
          </Text>
        </YStack>
        <Button size="$6" theme="purple" icon={Play} onPress={handleStart}>
          Iniciar display
        </Button>
        <Text
          fontSize="$3"
          color="$color8"
          mt="$4"
          onPress={handleReset}
          pressStyle={{ opacity: 0.6 }}
        >
          Cambiar rol del dispositivo
        </Text>
      </YStack>
    );
  }

  // Hide status bar for kiosk experience
  const isConnected = connectionStatus === "paired";

  return (
    <YStack flex={1} bg="$background">
      <StatusBar hidden />
      {isConnected ? (
        <CartMirror state={cartMirror} storeName="Tienda" />
      ) : (
        <DisplayConnect />
      )}
    </YStack>
  );
}
