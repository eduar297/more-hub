import { useLan } from "@/contexts/lan-context";
import type { DiscoveredServer } from "@/services/lan/lan-client";
import {
  AlertCircle,
  Camera,
  Monitor,
  RefreshCw,
  Store,
  Wifi,
  WifiOff,
} from "@tamagui/lucide-icons";
import { useCameraPermissions } from "expo-camera";
import CameraViewClass from "expo-camera/build/CameraView";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  Pressable,
  TouchableWithoutFeedback,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Button, Input, Spinner, Text, XStack, YStack } from "tamagui";

export function DisplayConnect() {
  const {
    startDiscovery,
    stopDiscovery,
    connectToServer,
    discoveredServers,
    connectionStatus,
  } = useLan();

  const [step, setStep] = useState<"discover" | "code">("discover");
  const [selectedServer, setSelectedServer] = useState<DiscoveredServer | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const discoveryStarted = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const qrProcessed = useRef(false);

  // QR scanner — parse morehub://{host}:{port}/{code} and auto-connect
  const handleScanQR = async () => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert(
          "Permiso requerido",
          "Se necesita acceso a la cámara para escanear el código QR.",
        );
        return;
      }
    }
    qrProcessed.current = false;
    try {
      await CameraViewClass.launchScanner({
        barcodeTypes: ["qr"],
        isGuidanceEnabled: true,
        isHighlightingEnabled: true,
        isPinchToZoomEnabled: true,
      });
    } catch {
      // Scanner unavailable
    }
  };

  // Listen for QR scan results
  useEffect(() => {
    const sub = CameraViewClass.onModernBarcodeScanned(async (event) => {
      if (qrProcessed.current) return;
      const data = event.data;
      // Expected format: morehub://{host}:{port}/{code}
      const match = data.match(/^morehub:\/\/([^:]+):(\d+)\/(\d{6})$/);
      if (!match) return;
      qrProcessed.current = true;
      await CameraViewClass.dismissScanner().catch(() => {});
      const [, host, portStr, scannedCode] = match;
      const port = parseInt(portStr, 10);
      connectToServer(host, port, scannedCode);
    });
    return () => sub.remove();
  }, [connectToServer]);

  // Start discovery on mount
  useEffect(() => {
    if (!discoveryStarted.current) {
      discoveryStarted.current = true;
      startDiscovery();
    }
    return () => stopDiscovery();
  }, [startDiscovery, stopDiscovery]);

  // Watch for rejection → show error
  useEffect(() => {
    if (connectionStatus === "error") {
      setCodeError("Código incorrecto o conexión rechazada");
      setStep("code");
    }
  }, [connectionStatus]);

  const handleSelectServer = (server: DiscoveredServer) => {
    setSelectedServer(server);
    setCode("");
    setCodeError("");
    setStep("code");
  };

  const handleConnect = () => {
    if (!selectedServer) return;
    if (code.length !== 6) {
      setCodeError("El código debe tener 6 dígitos");
      return;
    }
    setCodeError("");
    connectToServer(selectedServer.host, selectedServer.port, code);
  };

  const handleAutoConnect = (server: DiscoveredServer) => {
    // Try connecting without code (auto-pair for known devices)
    connectToServer(server.host, server.port);
  };

  const handleRefresh = () => {
    stopDiscovery();
    setTimeout(() => startDiscovery(), 300);
  };

  // ── Connecting / Pairing state ─────────────────────────────────────────────

  if (connectionStatus === "connecting" || connectionStatus === "pairing") {
    return (
      <YStack
        flex={1}
        bg="$background"
        items="center"
        justify="center"
        gap="$4"
      >
        <Spinner size="large" color="$purple10" />
        <Text fontSize="$5" color="$color" fontWeight="600">
          {connectionStatus === "connecting"
            ? "Conectando..."
            : "Verificando código..."}
        </Text>
        <Text fontSize="$3" color="$color10">
          {selectedServer?.storeName ?? "Servidor"}
        </Text>
      </YStack>
    );
  }

  // ── Disconnected with retry ────────────────────────────────────────────────

  if (connectionStatus === "disconnected") {
    return (
      <YStack
        flex={1}
        bg="$background"
        items="center"
        justify="center"
        gap="$4"
        p="$4"
      >
        <WifiOff size={48} color="$orange10" />
        <Text fontSize="$5" color="$color" fontWeight="600" text="center">
          Conexión perdida
        </Text>
        <Text fontSize="$3" color="$color10" text="center">
          Intentando reconectar automáticamente...
        </Text>
        <Spinner size="small" color="$orange10" />
      </YStack>
    );
  }

  // ── Code entry step ────────────────────────────────────────────────────────

  if (step === "code" && selectedServer) {
    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior="padding"
          style={{ flex: 1 }}
          keyboardVerticalOffset={100}
        >
          <YStack
            flex={1}
            bg="$background"
            items="center"
            justify="center"
            gap="$5"
            p="$6"
          >
            <Monitor size={48} color="$purple10" />

            <YStack items="center" gap="$2">
              <Text
                fontSize="$6"
                fontWeight="bold"
                color="$color"
                text="center"
              >
                Conectar a {selectedServer.storeName}
              </Text>
              <Text fontSize="$3" color="$color10" text="center">
                Escanea el QR o ingresa el código de 6 dígitos
              </Text>
            </YStack>

            {/* QR scan button */}
            <Button
              size="$5"
              theme="purple"
              icon={Camera}
              onPress={handleScanQR}
            >
              Escanear QR
            </Button>

            {/* Divider */}
            <XStack items="center" gap="$3" width="100%" maxW={260}>
              <YStack flex={1} height={1} bg="$borderColor" />
              <Text fontSize="$2" color="$color10">
                o ingresa el código
              </Text>
              <YStack flex={1} height={1} bg="$borderColor" />
            </XStack>

            {/* Code input */}
            <Input
              value={code}
              onChangeText={(t) => {
                setCode(t.replace(/\D/g, "").slice(0, 6));
                setCodeError("");
              }}
              placeholder="000000"
              keyboardType="number-pad"
              returnKeyType="done"
              autoFocus
              maxLength={6}
              fontSize={32}
              fontWeight="bold"
              letterSpacing={12}
              textAlign="center"
              width={260}
              size="$6"
              borderColor={codeError ? "$red8" : "$borderColor"}
              onSubmitEditing={() => {
                if (code.length === 6) handleConnect();
              }}
            />

            {codeError ? (
              <XStack items="center" gap="$2">
                <AlertCircle size={16} color="$red10" />
                <Text fontSize="$3" color="$red10">
                  {codeError}
                </Text>
              </XStack>
            ) : null}

            <XStack gap="$3">
              <Button
                size="$4"
                variant="outlined"
                onPress={() => {
                  setStep("discover");
                  setSelectedServer(null);
                }}
              >
                Volver
              </Button>
              <Button
                size="$4"
                theme="purple"
                icon={Wifi}
                onPress={handleConnect}
                disabled={code.length !== 6}
              >
                Conectar
              </Button>
            </XStack>
          </YStack>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    );
  }

  // ── Server discovery step ──────────────────────────────────────────────────

  return (
    <YStack flex={1} bg="$background" p="$4" gap="$4">
      {/* Header */}
      <YStack items="center" gap="$2" pt="$6">
        <Monitor size={48} color="$purple10" />
        <Text fontSize="$7" fontWeight="bold" color="$color" text="center">
          Modo Display
        </Text>
        <Text fontSize="$3" color="$color10" text="center">
          Buscando servidores en la red local...
        </Text>
      </YStack>

      {/* Server list */}
      <YStack flex={1}>
        {discoveredServers.length === 0 ? (
          <YStack flex={1} items="center" justify="center" gap="$4">
            <Spinner size="large" color="$purple10" />
            <Text fontSize="$4" color="$color10" text="center">
              Buscando servidores MoreHub...
            </Text>
            <Text fontSize="$2" color="$color10" text="center">
              Asegúrate de estar en la misma red WiFi que el vendedor
            </Text>
          </YStack>
        ) : (
          <FlatList
            data={discoveredServers}
            keyExtractor={(item) => `${item.host}:${item.port}`}
            contentContainerStyle={{ gap: 10 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleSelectServer(item)}
                onLongPress={() => handleAutoConnect(item)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <XStack
                  bg="$color2"
                  borderWidth={1}
                  borderColor="$borderColor"
                  p="$4"
                  rounded="$4"
                  items="center"
                  gap="$3"
                >
                  <YStack
                    width={46}
                    height={46}
                    rounded="$4"
                    bg="$purple3"
                    items="center"
                    justify="center"
                  >
                    <Store size={24} color="$purple10" />
                  </YStack>
                  <YStack flex={1} gap="$0.5">
                    <Text fontSize="$4" fontWeight="600" color="$color">
                      {item.storeName}
                    </Text>
                    <Text fontSize="$2" color="$color10">
                      {item.host}:{item.port}
                    </Text>
                  </YStack>
                  <Wifi size={20} color="$green10" />
                </XStack>
              </Pressable>
            )}
          />
        )}
      </YStack>

      {/* Action buttons */}
      <YStack gap="$2">
        <Button size="$4" theme="purple" icon={Camera} onPress={handleScanQR}>
          Escanear QR del vendedor
        </Button>
        <Button
          size="$4"
          variant="outlined"
          icon={RefreshCw}
          onPress={handleRefresh}
        >
          Buscar de nuevo
        </Button>
      </YStack>
    </YStack>
  );
}
