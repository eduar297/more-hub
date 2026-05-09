import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Keyboard,
  StyleSheet,
  type NativeSyntheticEvent,
  type TextInputSubmitEditingEventData,
  type TextInput,
} from "react-native";

/** Seconds without a scan before the gun is considered "disconnected". */
const GUN_DISCONNECT_MS = 30_000;

/**
 * If the scanner sends the barcode twice in one burst (no terminator between
 * them, common with some HID modes) the raw string is exactly doubled.
 * Detect and return only the first half.
 */
function deduplicateIfDoubled(raw: string): string {
  if (raw.length > 0 && raw.length % 2 === 0) {
    const half = raw.length / 2;
    if (raw.slice(0, half) === raw.slice(half)) return raw.slice(0, half);
  }
  return raw;
}

/**
 * Bluetooth HID barcode-scanner gun support.
 *
 * The gun pairs with the device as a keyboard and types the barcode followed
 * by Enter.  Render a hidden `<TextInput ref={inputRef} {...inputProps} />`
 * anywhere in the component tree to capture that input.
 *
 * Connection status is inferred from activity: after a successful scan the gun
 * is marked "connected"; after 30 s of inactivity it goes back to
 * "disconnected".
 */
export function useScannerGun({
  onScan,
}: {
  /** Called with the raw barcode string whenever the gun fires. */
  onScan: (code: string) => void;
}) {
  const [isConnected, setIsConnected] = useState(false);
  // Controlled value — setting it to "" after each scan synchronously clears
  // the native input, preventing the next scan from appending to stale text.
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<TextInput>(null);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while the user has a visible text input focused (typing).
  const userTypingRef = useRef(false);
  // Debounce: prevents double-fire from CR+LF and duplicate physical scans.
  const lastScanAtRef = useRef(0);
  const lastCodeRef = useRef("");

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const resetDisconnectTimer = useCallback(() => {
    setIsConnected(true);
    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    disconnectTimerRef.current = setTimeout(
      () => setIsConnected(false),
      GUN_DISCONNECT_MS,
    );
  }, []);

  const handleSubmitEditing = useCallback(
    (e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
      // Read text from the event (atomic, no buffer race conditions).
      // Strip terminators (CR, LF, TAB) then deduplicate if scanner doubled.
      const raw = e.nativeEvent.text.replace(/[\r\n\t]/g, "").trim();
      const code = deduplicateIfDoubled(raw);

      // Clear synchronously via controlled value.
      setInputValue("");

      if (code.length > 0) {
        const now = Date.now();
        const isDuplicate =
          // CR+LF fires two submit events within ~120 ms
          now - lastScanAtRef.current < 120 ||
          // Same physical scan fired twice (trigger held, auto-sense, etc.)
          (code === lastCodeRef.current && now - lastScanAtRef.current < 800);

        if (!isDuplicate) {
          lastScanAtRef.current = now;
          lastCodeRef.current = code;
          resetDisconnectTimer();
          onScanRef.current(code);
        }
      }

      if (!userTypingRef.current) {
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [resetDisconnectTimer],
  );

  /** Re-focus the hidden input (call after dismissing modals / sheets). */
  const refocus = useCallback(() => {
    if (!userTypingRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, []);

  // Track software keyboard visibility to avoid stealing focus while typing.
  useEffect(() => {
    const onShow = Keyboard.addListener("keyboardDidShow", () => {
      userTypingRef.current = true;
    });
    const onHide = Keyboard.addListener("keyboardDidHide", () => {
      userTypingRef.current = false;
      setTimeout(() => inputRef.current?.focus(), 250);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  // Re-focus when the app returns to foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && !userTypingRef.current) {
        setTimeout(() => inputRef.current?.focus(), 200);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    return () => {
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    };
  }, []);

  return {
    isConnected,
    inputRef,
    refocus,
    inputProps: {
      value: inputValue,
      onChangeText: setInputValue,
      onSubmitEditing: handleSubmitEditing,
      autoFocus: true,
      blurOnSubmit: false,
      caretHidden: true,
      showSoftInputOnFocus: false,
      // secureTextEntry disables iOS autocorrect/spell-check which can
      // duplicate characters when a BLE keyboard is connected.
      secureTextEntry: true,
      autoCapitalize: "none" as const,
      autoCorrect: false,
      autoComplete: "off" as const,
      importantForAccessibility: "no" as const,
      accessibilityElementsHidden: true,
      style: styles.hiddenInput,
    },
  };
}

const styles = StyleSheet.create({
  hiddenInput: {
    position: "absolute",
    left: -9999,
    top: -9999,
    width: 1,
    height: 1,
    opacity: 0,
  },
});
