import type { Product } from "@/models/product";
import { useCameraPermissions } from "expo-camera";
import CameraViewClass from "expo-camera/build/CameraView";
import { useCallback, useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useProductRepository } from "./use-product-repository";

export type ScanResult =
  | { kind: "found"; product: Product }
  | { kind: "not-found"; barcode: string };

/**
 * Reusable barcode-scanner hook.
 *
 * Launches the native iOS `DataScannerViewController`, looks up the barcode in
 * the DB and calls `onResult` with either `{ kind: "found", product }` or
 * `{ kind: "not-found", barcode }`.
 *
 * Usage:
 * ```ts
 * const scan = useBarcodeScanner({ onResult, onError });
 * <Button onPress={scan}>Escanear</Button>
 * ```
 */
export function useBarcodeScanner({
  onResult,
  onError,
}: {
  onResult: (result: ScanResult) => void;
  onError?: (msg: string) => void;
}) {
  const products = useProductRepository();
  const [permission, requestPermission] = useCameraPermissions();
  const processedRef = useRef(false);

  // Stable refs so the listener doesn't re-subscribe on every render
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const productsRef = useRef(products);
  productsRef.current = products;

  const handleBarcode = useCallback(async (barcode: string) => {
    if (processedRef.current) return;
    processedRef.current = true;
    try {
      await CameraViewClass.dismissScanner().catch(() => {});
      const found = await productsRef.current.findByBarcode(barcode);
      if (found) {
        onResultRef.current({ kind: "found", product: found });
      } else {
        onResultRef.current({ kind: "not-found", barcode });
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
    try {
      await CameraViewClass.launchScanner({
        barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
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
