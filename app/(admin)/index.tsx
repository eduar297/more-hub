import { ProductDetail } from "@/components/product/product-detail";
import { ProductForm } from "@/components/product/product-form";
import { BarcodeScannerView } from "@/components/ui/barcode-scanner-view";
import { ScanLine, ShieldCheck } from "@tamagui/lucide-icons";
import { useCameraPermissions } from "expo-camera";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { Button, Sheet, Text, XStack, YStack } from "tamagui";

export default function AdminScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const db = useSQLiteContext();
  const [scanned, setScanned] = useState(false);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [product, setProduct] = useState<any | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleBarcodeScanned = useCallback(
    async (barcode: string) => {
      if (scanned) return;
      setScanned(true);
      setBarcode(barcode);
      setShowScanner(false);
      setProduct(null);
      setLookupError(null);
      try {
        const found = await db.getFirstAsync<any>(
          "SELECT * FROM products WHERE barcode = ?",
          [barcode],
        );
        if (found) {
          setProduct(found);
        } else {
          setProduct(null);
          setShowCreateSheet(true);
        }
      } catch (e) {
        setProduct(null);
        setLookupError("Error buscando producto: " + (e as Error).message);
      }
    },
    [db, scanned],
  );

  const handleCreate = async (data: any) => {
    setCreating(true);
    try {
      await db.runAsync(
        `INSERT INTO products (name, barcode, pricePerBaseUnit, baseUnitId, stockBaseQty, saleMode) VALUES (?, ?, ?, ?, ?, ?)`,
        data.name,
        data.barcode,
        data.pricePerBaseUnit,
        data.baseUnitId,
        data.stockBaseQty,
        data.saleMode,
      );
      const created = await db.getFirstAsync<any>(
        "SELECT * FROM products WHERE barcode = ?",
        [data.barcode],
      );
      setProduct(created);
      setShowCreateSheet(false);
      setLookupError(null);
    } catch (e) {
      setLookupError("Error creando producto: " + (e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <YStack
        flex={1}
        p="$5"
        gap="$4"
        bg="$background"
        style={{ justifyContent: "center", alignItems: "center" }}
      >
        <ShieldCheck size={56} color="$blue10" />
        <Text
          fontSize="$6"
          fontWeight="bold"
          color="$color"
          style={{ textAlign: "center" }}
        >
          Permiso de cámara requerido
        </Text>
        <Text color="$color10" style={{ textAlign: "center" }} fontSize="$4">
          Necesitamos acceso a tu cámara para escanear productos.
        </Text>
        <Button theme="blue" size="$5" onPress={requestPermission}>
          Conceder permiso
        </Button>
      </YStack>
    );
  }

  return (
    <YStack flex={1} bg="$background" p="$5" gap="$4">
      {/* Header */}
      <XStack gap="$3" mb="$2" style={{ alignItems: "center" }}>
        <ShieldCheck size={28} color="$blue10" />
        <YStack>
          <Text fontSize="$6" fontWeight="bold" color="$color">
            Panel Administrador
          </Text>
          <Text fontSize="$3" color="$color10">
            Gestión de productos e inventario
          </Text>
        </YStack>
      </XStack>

      {/* Scanner toggle button */}
      <Button
        theme="blue"
        size="$5"
        icon={ScanLine}
        onPress={() => {
          setShowScanner((prev) => !prev);
          setScanned(false);
          setBarcode(null);
        }}
      >
        {showScanner ? "Cerrar escáner" : "Escanear código de barras"}
      </Button>

      {/* Scanner view */}
      {showScanner && (
        <YStack
          flex={1}
          style={{ minHeight: 300, borderRadius: 12 }}
          overflow="hidden"
        >
          <BarcodeScannerView
            onScanned={handleBarcodeScanned}
            onCancel={() => setShowScanner(false)}
          />
        </YStack>
      )}

      {/* Product result */}
      {barcode && product && (
        <YStack gap="$3">
          <Text fontSize="$3" color="$color10">
            Código escaneado: {barcode}
          </Text>
          <ProductDetail product={product} />
        </YStack>
      )}

      {/* Lookup error */}
      {lookupError && (
        <Text color="$red10" fontSize="$4">
          {lookupError}
        </Text>
      )}

      {/* Create product Sheet */}
      <Sheet
        modal
        open={showCreateSheet}
        onOpenChange={(open) => {
          if (!open) setShowCreateSheet(false);
        }}
        snapPoints={[90]}
        dismissOnSnapToBottom
        zIndex={100_000}
      >
        <Sheet.Overlay />
        <Sheet.Frame bg="$background">
          <Sheet.Handle />
          <ProductForm
            barcode={barcode || ""}
            loading={creating}
            onSubmit={handleCreate}
          />
          {lookupError && (
            <Text color="$red10" mx="$4" mb="$4" fontSize="$4">
              {lookupError}
            </Text>
          )}
        </Sheet.Frame>
      </Sheet>
    </YStack>
  );
}
