import { OVERLAY } from "@/constants/colors";
import { useColors } from "@/hooks/use-colors";
import { useEffect, useState } from "react";
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface PinPromptDialogProps {
  open: boolean;
  title: string;
  description: string;
  onConfirm: (pin: string) => void;
  onCancel: () => void;
}

export function PinPromptDialog({
  open,
  title,
  description,
  onConfirm,
  onCancel,
}: PinPromptDialogProps) {
  const [pin, setPin] = useState("");
  const c = useColors();

  useEffect(() => {
    if (open) setPin("");
  }, [open]);

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.overlay}>
          <View
            style={[
              styles.card,
              { backgroundColor: c.card, borderColor: c.border },
            ]}
          >
            <Text
              style={[styles.title, { color: c.text }]}
              accessibilityRole="header"
            >
              {title}
            </Text>
            <Text style={[styles.desc, { color: c.muted }]}>{description}</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: c.input,
                  color: c.text,
                  borderColor: c.border,
                },
              ]}
              placeholder="••••"
              placeholderTextColor={c.muted}
              value={pin}
              onChangeText={setPin}
              secureTextEntry
              keyboardType="numeric"
              maxLength={8}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                if (pin) onConfirm(pin);
              }}
              accessibilityLabel="PIN de administrador"
            />
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, { borderWidth: 1, borderColor: c.border }]}
                onPress={onCancel}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Cancelar"
              >
                <Text style={[styles.btnText, { color: c.text }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btn,
                  { backgroundColor: c.blue, opacity: pin ? 1 : 0.5 },
                ]}
                onPress={() => {
                  if (pin) onConfirm(pin);
                }}
                disabled={!pin}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Confirmar PIN"
              >
                <Text style={[styles.btnText, { color: "#fff" }]}>
                  Confirmar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: OVERLAY,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
  },
  desc: {
    fontSize: 14,
    lineHeight: 19,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
