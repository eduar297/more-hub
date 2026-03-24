import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useProductRepository } from "@/hooks/use-product-repository";
import type { Product } from "@/models/product";
import {
  AlertCircle,
  Package,
  Receipt,
  ScanLine,
  ShoppingCart,
  TrendingUp,
} from "@tamagui/lucide-icons";
import { useCallback, useState } from "react";
import { Alert, Image, Keyboard, ScrollView, StyleSheet } from "react-native";
import {
  Button,
  Card,
  H2,
  Input,
  Label,
  Sheet,
  Spinner,
  Text,
  XStack,
  YStack,
} from "tamagui";

export default function WorkerScreen() {
  const products = useProductRepository();
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";

  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [showSaleSheet, setShowSaleSheet] = useState(false);
  const [saleQty, setSaleQty] = useState("");
  const [selling, setSelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Barcode scanner
  const scan = useBarcodeScanner({
    onResult(result) {
      if (result.kind === "found") {
        setScannedProduct(result.product);
        setShowSaleSheet(true);
        setError(null);
      } else {
        setError("Producto no encontrado para el código: " + result.barcode);
      }
    },
    onError(msg) {
      setError(msg);
    },
  });

  const handleConfirmSale = useCallback(async () => {
    if (!scannedProduct) return;
    const qty = parseFloat(saleQty);
    if (isNaN(qty) || qty <= 0) return;

    if (qty > scannedProduct.stockBaseQty) {
      Alert.alert(
        "Stock insuficiente",
        `Solo hay ${scannedProduct.stockBaseQty} unidades disponibles.`,
      );
      return;
    }

    setSelling(true);
    setError(null);
    try {
      await products.update(scannedProduct.id, {
        stockBaseQty: scannedProduct.stockBaseQty - qty,
      });
      setSaleQty("");
      setShowSaleSheet(false);
      setScannedProduct(null);
    } catch (e) {
      setError("Error registrando venta: " + (e as Error).message);
    } finally {
      setSelling(false);
    }
  }, [scannedProduct, saleQty, products]);

  return (
    <YStack flex={1} bg="$background">
      <YStack p="$5" gap="$4">
        {/* Header */}
        <XStack style={{ alignItems: "center" }} gap="$3" mb="$2">
          <Receipt size={28} color="$green10" />
          <YStack>
            <H2 color="$color" fontSize="$6" fontWeight="bold">
              Panel de Ventas
            </H2>
            <Text fontSize="$3" color="$color10">
              Registra ventas y consulta productos
            </Text>
          </YStack>
        </XStack>

        {/* Stats row */}
        <XStack gap="$3">
          <Card
            flex={1}
            borderWidth={1}
            bg="$green2"
            p="$4"
            style={{ borderRadius: 16 }}
            borderColor="$green5"
          >
            <TrendingUp size={20} color="$green10" />
            <Text fontSize="$8" fontWeight="bold" color="$green10" mt="$1">
              $0
            </Text>
            <Text fontSize="$2" color="$color10">
              Total hoy
            </Text>
          </Card>

          <Card
            flex={1}
            borderWidth={1}
            bg="$blue2"
            p="$4"
            style={{ borderRadius: 16 }}
            borderColor="$blue5"
          >
            <ShoppingCart size={20} color="$blue10" />
            <Text fontSize="$8" fontWeight="bold" color="$blue10" mt="$1">
              0
            </Text>
            <Text fontSize="$2" color="$color10">
              Ventas
            </Text>
          </Card>
        </XStack>

        {/* Error banner */}
        {error && (
          <XStack
            bg="$red2"
            p="$3"
            style={{ borderRadius: 12, alignItems: "center" }}
            gap="$2"
          >
            <AlertCircle size={18} color="$red10" />
            <Text fontSize="$3" color="$red10" flex={1}>
              {error}
            </Text>
          </XStack>
        )}

        {/* Main action */}
        <Button size="$6" theme="green" icon={ScanLine} mt="$2" onPress={scan}>
          Escanear producto
        </Button>

        <Card
          borderWidth={1}
          bg="$background"
          p="$4"
          style={{ borderRadius: 16 }}
          borderColor="$borderColor"
        >
          <Text color="$color10" fontSize="$3" style={{ textAlign: "center" }}>
            Las ventas registradas aparecerán aquí
          </Text>
        </Card>
      </YStack>

      {/* Sale sheet */}
      <Sheet
        open={showSaleSheet}
        onOpenChange={setShowSaleSheet}
        modal
        snapPoints={[65]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="rgba(0,0,0,0.5)"
        />
        <Sheet.Frame p="$4" theme={themeName as any}>
          <Sheet.Handle />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            {scannedProduct && (
              <YStack gap="$4">
                {/* Product info */}
                <XStack gap="$3" style={{ alignItems: "center" }}>
                  {scannedProduct.photoUri ? (
                    <Image
                      source={{ uri: scannedProduct.photoUri }}
                      style={styles.productImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <YStack style={styles.imagePlaceholder}>
                      <Package size={32} color="$color8" />
                    </YStack>
                  )}
                  <YStack flex={1} gap="$1">
                    <Text
                      fontSize="$5"
                      fontWeight="bold"
                      color="$color"
                      numberOfLines={2}
                    >
                      {scannedProduct.name}
                    </Text>
                    <Text fontSize="$3" color="$color10">
                      {scannedProduct.barcode}
                    </Text>
                    <Text fontSize="$5" color="$green10" fontWeight="600">
                      ${scannedProduct.pricePerBaseUnit.toFixed(2)}
                    </Text>
                  </YStack>
                </XStack>

                <Text fontSize="$3" color="$color10">
                  Stock disponible: {scannedProduct.stockBaseQty}
                </Text>

                {/* Quantity input */}
                <YStack gap="$1">
                  <Label
                    htmlFor="sale-qty-input"
                    color="$color10"
                    fontSize="$3"
                  >
                    Cantidad a vender
                  </Label>
                  <Input
                    id="sale-qty-input"
                    placeholder="0"
                    value={saleQty}
                    onChangeText={setSaleQty}
                    keyboardType="numeric"
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                    size="$4"
                  />
                </YStack>

                {/* Total */}
                {saleQty && !isNaN(parseFloat(saleQty)) && (
                  <XStack
                    style={{
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text fontSize="$4" color="$color10">
                      Total:
                    </Text>
                    <Text fontSize="$6" fontWeight="bold" color="$green10">
                      $
                      {(
                        scannedProduct.pricePerBaseUnit * parseFloat(saleQty)
                      ).toFixed(2)}
                    </Text>
                  </XStack>
                )}

                <Button
                  theme="green"
                  size="$4"
                  icon={selling ? <Spinner /> : ShoppingCart}
                  disabled={
                    selling ||
                    !saleQty ||
                    isNaN(parseFloat(saleQty)) ||
                    parseFloat(saleQty) <= 0
                  }
                  onPress={handleConfirmSale}
                >
                  {selling ? "Registrando..." : "Confirmar venta"}
                </Button>
              </YStack>
            )}
          </ScrollView>
        </Sheet.Frame>
      </Sheet>
    </YStack>
  );
}

const styles = StyleSheet.create({
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  imagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: "rgba(128,128,128,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
});
