import { CartMirror } from "@/components/lan/cart-mirror";
import { DisplayConnect } from "@/components/lan/display-connect";
import { useLan } from "@/contexts/lan-context";
import { useStore } from "@/contexts/store-context";
import { Monitor, Play } from "@tamagui/lucide-icons";
import { useState } from "react";
import { StatusBar } from "react-native";
import { Button, Text, YStack } from "tamagui";

export default function DisplayScreen() {
  const [started, setStarted] = useState(false);
  const { connectionStatus, cartMirror } = useLan();
  const { currentStore } = useStore();

  const handleStart = () => {
    setStarted(true);
  };

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
      </YStack>
    );
  }

  // Hide status bar for kiosk experience
  const isConnected = connectionStatus === "paired";

  return (
    <YStack flex={1} bg="$background">
      <StatusBar hidden />
      {isConnected ? (
        <CartMirror
          state={cartMirror}
          storeName={currentStore?.name ?? "Tienda"}
        />
      ) : (
        <DisplayConnect />
      )}
    </YStack>
  );
}
