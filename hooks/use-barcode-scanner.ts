import type { Product } from "@/models/product";
import { useCameraPermissions } from "expo-camera";
import CameraViewClass from "expo-camera/build/CameraView";
import { useCallback, useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useProductRepository } from "./use-product-repository";

export type ScanResult =
  | { kind: "found"; product: Product }
  | { kind: "not-found"; code: string };

// Module-level gate: only the hook instance that launched the scanner should
// handle the result. This prevents other mounted instances (e.g. a sibling tab)
// from also firing their callbacks.
let activeInstanceId: symbol | null = null;

export function useBarcodeScanner({
  onResult,
  onError,
  visibleOnly,
}: {
  onResult: (result: ScanResult) => void;
  onError?: (msg: string) => void;
  /** When true, only finds products with visible = 1 (for worker scanner). */
  visibleOnly?: boolean;
}) {
  const products = useProductRepository();
  const [permission, requestPermission] = useCameraPermissions();
  const processedRef = useRef(false);
  const instanceId = useRef(Symbol());

  // Stable refs so the listener doesn't re-subscribe on every render
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const productsRef = useRef(products);
  productsRef.current = products;
  const visibleOnlyRef = useRef(visibleOnly);
  visibleOnlyRef.current = visibleOnly;

  const handleBarcode = useCallback(async (barcode: string) => {
    // Only the instance that called scan() should process the result
    if (activeInstanceId !== instanceId.current) return;
    if (processedRef.current) return;
    processedRef.current = true;
    activeInstanceId = null;
    try {
      await CameraViewClass.dismissScanner().catch(() => {});
      const found = visibleOnlyRef.current
        ? await productsRef.current.findVisibleByCode(barcode)
        : await productsRef.current.findByCode(barcode);
      if (found) {
        onResultRef.current({ kind: "found", product: found });
      } else {
        onResultRef.current({ kind: "not-found", code: barcode });
      }
    } catch (e) {
      onErrorRef.current?.("Error buscando producto: " + (e as Error).message);
    }
  }, []);

  // Global listener for native scanner events
  useEffect(() => {
    const sub = CameraViewClass.onModernBarcodeScanned((event) => {
      handleBarcode(event.data);
    });
    return () => sub.remove();
  }, [handleBarcode]);

  /** Call this to open the scanner. */
  const scan = useCallback(async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert(
          "Permiso requerido",
          "Se necesita acceso a la cámara para escanear códigos de barras.",
        );
        return;
      }
    }
    processedRef.current = false;
    activeInstanceId = instanceId.current;
    try {
      await CameraViewClass.launchScanner({
        barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "qr"],
        isGuidanceEnabled: true,
        isHighlightingEnabled: true,
        isPinchToZoomEnabled: true,
      });
    } catch {
      onErrorRef.current?.("No se pudo abrir el escáner.");
    }
  }, [permission, requestPermission]);

  return scan;
}
