import { useLan } from "@/contexts/lan-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
    Copy,
    Monitor,
    MonitorOff,
    Wifi,
    WifiOff,
} from "@tamagui/lucide-icons";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Alert } from "react-native";
import { Button, Sheet, Text, XStack, YStack } from "tamagui";

export function ServerStatusBadge() {
  const { serverRunning, connectedDisplays } = useLan();
  const [showSheet, setShowSheet] = useState(false);

  return (
    <>
      <XStack
        bg={serverRunning ? "$green3" : "$color3"}
        px="$2.5"
        py="$1.5"
        rounded="$3"
        items="center"
        gap="$1.5"
        pressStyle={{ opacity: 0.7 }}
        onPress={() => setShowSheet(true)}
      >
        {serverRunning ? (
          <Wifi size={14} color="$green10" />
        ) : (
          <WifiOff size={14} color="$color10" />
        )}
        <Text
          fontSize="$1"
          fontWeight="600"
          color={serverRunning ? "$green10" : "$color10"}
        >
          {serverRunning
            ? `${connectedDisplays} display${connectedDisplays !== 1 ? "s" : ""}`
            : "LAN off"}
        </Text>
      </XStack>

      <ServerSheet open={showSheet} onOpenChange={setShowSheet} />
    </>
  );
}

function ServerSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const {
    serverRunning,
    startServer,
    stopServer,
    pairingCode,
    serverIp,
    connectedDisplays,
  } = useLan();
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";

  const handleToggle = async () => {
    if (serverRunning) {
      Alert.alert(
        "Detener servidor",
        "Las pantallas conectadas se desconectarán.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Detener",
            style: "destructive",
            onPress: () => stopServer(),
          },
        ],
      );
    } else {
      await startServer();
    }
  };

  const handleCopyCode = async () => {
    try {
      await Clipboard.setStringAsync(pairingCode);
      Alert.alert("Copiado", "Código copiado al portapapeles");
    } catch {
      // Clipboard may not be available
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      modal
      snapPoints={[55]}
      dismissOnSnapToBottom
    >
      <Sheet.Overlay
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
        backgroundColor="rgba(0,0,0,0.5)"
      />
      <Sheet.Frame theme={themeName as any}>
        <Sheet.Handle />
        <YStack p="$4" gap="$4">
          <Text fontSize="$6" fontWeight="bold" color="$color">
            Conexión LAN
          </Text>

          {/* Status */}
          <XStack
            bg={serverRunning ? "$green2" : "$color2"}
            p="$4"
            rounded="$4"
            items="center"
            gap="$3"
          >
            {serverRunning ? (
              <Monitor size={28} color="$green10" />
            ) : (
              <MonitorOff size={28} color="$color10" />
            )}
            <YStack flex={1}>
              <Text fontSize="$4" fontWeight="600" color="$color">
                {serverRunning ? "Servidor activo" : "Servidor apagado"}
              </Text>
              {serverRunning && (
                <Text fontSize="$2" color="$color10">
                  IP: {serverIp} · {connectedDisplays} pantalla
                  {connectedDisplays !== 1 ? "s" : ""}
                </Text>
              )}
            </YStack>
          </XStack>

          {/* Pairing Code */}
          {serverRunning && (
            <YStack bg="$blue2" p="$4" rounded="$4" items="center" gap="$2">
              <Text fontSize="$3" color="$blue10" fontWeight="600">
                Código de emparejamiento
              </Text>
              <XStack items="center" gap="$3">
                <Text
                  fontSize={40}
                  fontWeight="900"
                  color="$blue10"
                  letterSpacing={8}
                >
                  {pairingCode}
                </Text>
                <Button
                  size="$3"
                  circular
                  chromeless
                  icon={<Copy size={18} />}
                  onPress={handleCopyCode}
                />
              </XStack>
              <Text fontSize="$2" color="$color10" text="center">
                Ingresa este código en la pantalla para conectarla
              </Text>
            </YStack>
          )}

          {/* Toggle button */}
          <Button
            size="$5"
            theme={serverRunning ? "red" : "green"}
            icon={serverRunning ? WifiOff : Wifi}
            onPress={handleToggle}
          >
            {serverRunning ? "Detener servidor" : "Iniciar servidor LAN"}
          </Button>
        </YStack>
      </Sheet.Frame>
    </Sheet>
  );
}
