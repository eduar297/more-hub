import { Monitor, Play } from "@tamagui/lucide-icons";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect, useState } from "react";
import { Button, Text, YStack } from "tamagui";

export default function DisplayScreen() {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    return () => {
      ScreenOrientation.unlockAsync();
    };
  }, []);

  const handleStart = async () => {
    await ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE,
    );
    setStarted(true);
  };

  if (!started) {
    return (
      <YStack
        flex={1}
        bg="$background"
        justifyContent="center"
        alignItems="center"
        gap="$6"
        p="$6"
      >
        <Monitor size={64} color="$purple10" />
        <YStack alignItems="center" gap="$2">
          <Text
            fontSize="$7"
            fontWeight="bold"
            color="$color"
            style={{ textAlign: "center" }}
          >
            Modo Display
          </Text>
          <Text color="$color10" style={{ textAlign: "center" }} fontSize="$4">
            Activa la pantalla horizontal para el mostrador
          </Text>
        </YStack>
        <Button size="$6" theme="purple" icon={Play} onPress={handleStart}>
          Iniciar display
        </Button>
      </YStack>
    );
  }

  return (
    <YStack
      flex={1}
      bg="$color12"
      justifyContent="center"
      alignItems="center"
      gap="$4"
    >
      <Monitor size={48} color="$color1" />
      <Text
        fontSize="$12"
        fontWeight="900"
        color="$color1"
        letterSpacing={4}
        textTransform="uppercase"
      >
        Display
      </Text>
      <Text color="$color3" fontSize="$6" letterSpacing={1}>
        Pantalla de mostrador
      </Text>
    </YStack>
  );
}
