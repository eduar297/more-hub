import { ICON_BTN_BG } from "@/constants/colors";
import { useLan } from "@/contexts/lan-context";
import { useColors } from "@/hooks/use-colors";
import { LAN_PORT } from "@/services/lan/protocol";
import {
  Copy,
  Monitor,
  MonitorOff,
  Wifi,
  WifiOff,
  X,
} from "@tamagui/lucide-icons";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Button, Text, XStack, YStack } from "tamagui";

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
            ? `${connectedDisplays} display${
                connectedDisplays !== 1 ? "s" : ""
              }`
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
  const c = useColors();
  const insets = useSafeAreaInsets();

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
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => onOpenChange(false)}
    >
      <SafeAreaView
        edges={["top", "bottom"]}
        style={[ssStyles.modalRoot, { backgroundColor: c.modalBg }]}
      >
        {/* Header */}
        <XStack
          p="$3"
          px="$4"
          style={{ alignItems: "center", justifyContent: "space-between" }}
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
        >
          <XStack style={{ alignItems: "center" }} gap="$2">
            <Wifi size={18} color="$blue10" />
            <Text fontSize={16} fontWeight="700" color="$color">
              Conexión LAN
            </Text>
          </XStack>
          <TouchableOpacity
            onPress={() => onOpenChange(false)}
            hitSlop={8}
            style={ssStyles.closeBtn}
          >
            <X size={18} color="$color" />
          </TouchableOpacity>
        </XStack>

        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: Math.max(20, insets.bottom + 20),
            gap: 16,
          }}
        >
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

          {/* Pairing QR + Code */}
          {serverRunning && (
            <YStack bg="$blue2" p="$4" rounded="$4" items="center" gap="$3">
              <Text fontSize="$3" color="$blue10" fontWeight="600">
                Código de emparejamiento
              </Text>

              {/* QR Code */}
              <YStack bg="white" p="$3" rounded="$3">
                <QRCode
                  value={`morehub://${serverIp}:${LAN_PORT}/${pairingCode}`}
                  size={160}
                  backgroundColor="white"
                  color="black"
                />
              </YStack>

              <Text fontSize="$2" color="$color10" text="center">
                Escanea el QR desde
              </Text>

              {/* Manual code fallback */}
              <YStack
                bg="$blue3"
                px="$4"
                py="$2"
                rounded="$3"
                items="center"
                gap="$1"
              >
                <Text fontSize="$1" color="$color10">
                  O ingresa el código manualmente
                </Text>
                <XStack items="center" gap="$3">
                  <Text
                    fontSize={32}
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
              </YStack>
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
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const ssStyles = StyleSheet.create({
  modalRoot: { flex: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ICON_BTN_BG,
    alignItems: "center",
    justifyContent: "center",
  },
});
