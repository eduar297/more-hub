import { useDevice } from "@/contexts/device-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useColors } from "@/hooks/use-colors";
import { validateActivationCode } from "@/services/supabase/activation";
import { getDeviceInfo } from "@/utils/device";
import {
    AlertCircle,
    CheckCircle2,
    Key,
    Wifi,
    WifiOff,
} from "@tamagui/lucide-icons";
import React, { useCallback, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    TextInput,
    Vibration,
} from "react-native";
import { Text, View, XStack, YStack } from "tamagui";

const SCREEN_W = Dimensions.get("window").width;
const CARD_W = Math.min(380, SCREEN_W - 48);
const CODE_LENGTH = 8;

const ERROR_MESSAGES: Record<string, string> = {
  invalid_code: "Código inválido. Verifica e intenta de nuevo.",
  already_used: "Este código ya fue utilizado en otro dispositivo.",
  expired: "Este código ha expirado. Solicita uno nuevo.",
  network_error: "Sin conexión. Verifica tu internet e intenta de nuevo.",
};

interface ActivationGateProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ActivationGate({
  open,
  onClose,
  onSuccess,
}: ActivationGateProps) {
  const c = useColors();
  const isDark = useColorScheme() === "dark";
  const { deviceId, activateAdmin } = useDevice();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const triggerShake = useCallback(() => {
    Vibration.vibrate(200);
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 12,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -12,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeAnim]);

  const handleCodeChange = useCallback(
    (text: string) => {
      // Only allow alphanumeric, uppercase
      const clean = text
        .toUpperCase()
        .replace(/[^A-Z2-9]/g, "")
        .slice(0, CODE_LENGTH);
      setCode(clean);
      if (error) setError("");
    },
    [error],
  );

  const handleActivate = useCallback(async () => {
    if (code.length !== CODE_LENGTH) {
      setError("El código debe tener 8 caracteres.");
      triggerShake();
      return;
    }

    setError("");
    setLoading(true);

    try {
      const deviceInfo = await getDeviceInfo();
      const result = await validateActivationCode(code, deviceId, deviceInfo);

      if (result.success && result.businessId) {
        await activateAdmin(result.businessId);
        setSuccess(true);
        // Brief delay to show success animation
        setTimeout(() => {
          onSuccess();
        }, 800);
      } else {
        setError(ERROR_MESSAGES[result.error ?? "invalid_code"]);
        triggerShake();
      }
    } finally {
      setLoading(false);
    }
  }, [code, deviceId, activateAdmin, onSuccess, triggerShake]);

  const bgColor = c.bg;
  const cardBg = c.card;
  const inputBg = c.input;
  const borderColor = c.border;

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View
          flex={1}
          items="center"
          justify="center"
          bg={`${bgColor}ee` as any}
        >
          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: cardBg,
                borderColor,
                transform: [{ translateX: shakeAnim }],
              },
            ]}
          >
            {success ? (
              <YStack items="center" gap="$4" py="$6">
                <View
                  width={72}
                  height={72}
                  rounded="$10"
                  items="center"
                  justify="center"
                  bg={c.successBg as any}
                >
                  <CheckCircle2 size={36} color={c.green as any} />
                </View>
                <Text
                  fontSize={20}
                  fontWeight="700"
                  text="center"
                  color="$color"
                >
                  ¡Activación exitosa!
                </Text>
                <Text fontSize={14} color="$color8" text="center">
                  Configurando tu panel de administración...
                </Text>
              </YStack>
            ) : (
              <YStack gap="$4" py="$2">
                {/* Header */}
                <YStack items="center" gap="$3">
                  <View
                    width={64}
                    height={64}
                    rounded="$10"
                    items="center"
                    justify="center"
                    bg={c.blueLight as any}
                  >
                    <Key size={32} color={c.blue as any} />
                  </View>
                  <Text
                    fontSize={20}
                    fontWeight="700"
                    text="center"
                    color="$color"
                  >
                    Activar Administrador
                  </Text>
                  <Text
                    fontSize={13}
                    color="$color8"
                    text="center"
                    px="$2"
                    style={{ lineHeight: 18 }}
                  >
                    Ingresa el código de activación de 8 caracteres que
                    recibiste. Se requiere conexión a internet.
                  </Text>
                </YStack>

                {/* Code input */}
                <YStack gap="$2">
                  <TextInput
                    ref={inputRef}
                    value={code}
                    onChangeText={handleCodeChange}
                    placeholder="Ej: K7M3X9PH"
                    placeholderTextColor={isDark ? "#666" : "#aaa"}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={CODE_LENGTH}
                    editable={!loading}
                    style={[
                      styles.input,
                      {
                        backgroundColor: inputBg,
                        borderColor: error ? c.danger : borderColor,
                        color: c.text,
                      },
                    ]}
                  />
                  {code.length > 0 && code.length < CODE_LENGTH && (
                    <Text fontSize={11} color="$color8" text="right" pr="$1">
                      {code.length}/{CODE_LENGTH}
                    </Text>
                  )}
                </YStack>

                {/* Error */}
                {error !== "" && (
                  <XStack
                    items="center"
                    gap="$2"
                    bg={c.dangerBg as any}
                    p="$2.5"
                    rounded="$3"
                  >
                    {error.includes("conexión") ? (
                      <WifiOff size={16} color={c.danger as any} />
                    ) : (
                      <AlertCircle size={16} color={c.danger as any} />
                    )}
                    <Text
                      fontSize={12}
                      color={c.danger as any}
                      grow={1}
                      style={{ lineHeight: 16 }}
                    >
                      {error}
                    </Text>
                  </XStack>
                )}

                {/* Activate button */}
                <XStack
                  bg={
                    loading || code.length < CODE_LENGTH
                      ? "$color5"
                      : (c.blue as any)
                  }
                  rounded="$4"
                  height={48}
                  items="center"
                  justify="center"
                  gap="$2"
                  pressStyle={{ opacity: 0.8 }}
                  disabled={loading || code.length < CODE_LENGTH}
                  onPress={handleActivate}
                >
                  {loading ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text fontSize={15} fontWeight="600" color="#fff">
                        Validando...
                      </Text>
                    </>
                  ) : (
                    <>
                      <Wifi size={18} color="#fff" />
                      <Text fontSize={15} fontWeight="600" color="#fff">
                        Activar
                      </Text>
                    </>
                  )}
                </XStack>

                {/* Cancel */}
                <XStack
                  rounded="$4"
                  height={44}
                  items="center"
                  justify="center"
                  pressStyle={{ opacity: 0.6 }}
                  onPress={onClose}
                >
                  <Text fontSize={14} color="$color8">
                    Cancelar
                  </Text>
                </XStack>
              </YStack>
            )}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    width: CARD_W,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 6,
    textAlign: "center",
  },
});
