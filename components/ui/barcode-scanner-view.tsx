import {
  BarcodeScanningResult,
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import { useState } from "react";
import { Button, StyleSheet, View } from "react-native";

export interface BarcodeScannerViewProps {
  onScanned: (barcode: string) => void;
  onCancel: () => void;
  autoCloseOnScan?: boolean;
}

export function BarcodeScannerView({
  onScanned,
  onCancel,
  autoCloseOnScan = true,
}: BarcodeScannerViewProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (scanned) return;
    setScanned(true);
    onScanned(result.data);
    if (autoCloseOnScan) {
      onCancel();
    }
  }

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Button
          onPress={requestPermission}
          title="Conceder permiso de cámara"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={{ flex: 1, width: "100%" }}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: [
            "ean13",
            "ean8",
            "upc_a",
            "upc_e",
            // "code128"
          ],
        }}
        autofocus="on"
        ratio="16:9"
        zoom={0}
        onBarcodeScanned={handleBarcodeScanned}
      />
      <Button title="Cancelar" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 300,
    marginVertical: 16,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
});
