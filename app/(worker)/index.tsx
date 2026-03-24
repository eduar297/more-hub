import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import type { Product } from "@/models/product";
import type { PaymentMethod } from "@/models/ticket";
import {
  AlertCircle,
  Banknote,
  CreditCard,
  Minus,
  Package,
  Plus,
  Receipt,
  ScanLine,
  ShoppingCart,
  Trash2,
  TrendingUp,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Image, Keyboard, ScrollView, StyleSheet } from "react-native";
import {
  Button,
  Card,
  H2,
  Input,
  Sheet,
  Spinner,
  Text,
  XStack,
  YStack,
} from "tamagui";

// ── Cart item type ───────────────────────────────────────────────────────────

interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
}

// ── Cart item row (used in both the main list and checkout sheet) ────────────

function CartItemRow({
  item,
  onChangeQty,
  onChangePrice,
  onRemove,
  editable,
}: {
  item: CartItem;
  onChangeQty: (qty: number) => void;
  onChangePrice: (price: number) => void;
  onRemove: () => void;
  editable: boolean;
}) {
  const subtotal = item.quantity * item.unitPrice;

  return (
    <YStack
      px="$3"
      py="$3"
      gap="$2"
      borderBottomWidth={1}
      borderColor="$borderColor"
    >
      <XStack style={{ alignItems: "center" }} gap="$3">
        {item.product.photoUri ? (
          <Image
            source={{ uri: item.product.photoUri }}
            style={rowStyles.thumb}
            resizeMode="cover"
          />
        ) : (
          <YStack style={rowStyles.thumbPlaceholder}>
            <Package size={18} color="$color8" />
          </YStack>
        )}
        <YStack flex={1} gap="$0.5">
          <Text
            fontSize="$3"
            fontWeight="bold"
            color="$color"
            numberOfLines={1}
          >
            {item.product.name}
          </Text>
          <Text fontSize="$2" color="$color10">
            Stock: {item.product.stockBaseQty}
          </Text>
        </YStack>
        {editable && (
          <Button
            size="$2"
            theme="red"
            chromeless
            icon={Trash2}
            onPress={onRemove}
          />
        )}
      </XStack>

      {/* Qty + price row */}
      <XStack style={{ alignItems: "center" }} gap="$2">
        {editable ? (
          <>
            <Button
              size="$2"
              theme="red"
              icon={Minus}
              circular
              disabled={item.quantity <= 1}
              onPress={() => onChangeQty(item.quantity - 1)}
            />
            <Input
              size="$3"
              width={60}
              textAlign="center"
              value={String(item.quantity)}
              keyboardType="numeric"
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              onChangeText={(t) => {
                const n = parseFloat(t);
                if (!isNaN(n) && n > 0) onChangeQty(n);
              }}
            />
            <Button
              size="$2"
              theme="green"
              icon={Plus}
              circular
              onPress={() => onChangeQty(item.quantity + 1)}
            />
          </>
        ) : (
          <Text
            fontSize="$3"
            color="$color"
            width={60}
            style={{ textAlign: "center" }}
          >
            x{item.quantity}
          </Text>
        )}

        <Text fontSize="$2" color="$color10" mx="$1">
          ×
        </Text>

        {editable ? (
          <XStack style={{ alignItems: "center" }} gap="$1" flex={1}>
            <Text fontSize="$3" color="$color10">
              $
            </Text>
            <Input
              size="$3"
              flex={1}
              value={String(item.unitPrice)}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              onChangeText={(t) => {
                const n = parseFloat(t);
                if (!isNaN(n) && n >= 0) onChangePrice(n);
              }}
            />
          </XStack>
        ) : (
          <Text fontSize="$3" color="$color10" flex={1}>
            ${item.unitPrice.toFixed(2)}
          </Text>
        )}

        <Text
          fontSize="$4"
          fontWeight="bold"
          color="$green10"
          width={80}
          style={{ textAlign: "right" }}
        >
          ${subtotal.toFixed(2)}
        </Text>
      </XStack>
    </YStack>
  );
}

const rowStyles = StyleSheet.create({
  thumb: { width: 40, height: 40, borderRadius: 8 },
  thumbPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "rgba(128,128,128,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
});

// ── Main screen ──────────────────────────────────────────────────────────────

export default function WorkerScreen() {
  const tickets = useTicketRepository();
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Today's summary
  const [todaySales, setTodaySales] = useState(0);
  const [todayCount, setTodayCount] = useState(0);

  const loadSummary = useCallback(async () => {
    try {
      const s = await tickets.todaySummary();
      setTodaySales(s.totalSales);
      setTodayCount(s.ticketCount);
    } catch {
      // ignore
    }
  }, [tickets]);

  useFocusEffect(
    useCallback(() => {
      loadSummary();
    }, [loadSummary]),
  );

  // Barcode scanner — adds to cart
  const scan = useBarcodeScanner({
    onResult(result) {
      if (result.kind === "found") {
        setError(null);
        setCart((prev) => {
          const idx = prev.findIndex((c) => c.product.id === result.product.id);
          if (idx >= 0) {
            // Increment qty
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              quantity: updated[idx].quantity + 1,
            };
            return updated;
          }
          return [
            ...prev,
            {
              product: result.product,
              quantity: 1,
              unitPrice: result.product.pricePerBaseUnit,
            },
          ];
        });
      } else {
        setError("Producto no encontrado: " + result.barcode);
      }
    },
    onError(msg) {
      setError(msg);
    },
  });

  // Cart helpers
  const cartTotal = useMemo(
    () => cart.reduce((s, i) => s + i.quantity * i.unitPrice, 0),
    [cart],
  );
  const cartItemCount = useMemo(
    () => cart.reduce((s, i) => s + i.quantity, 0),
    [cart],
  );

  const updateCartItem = useCallback(
    (
      productId: number,
      patch: Partial<Pick<CartItem, "quantity" | "unitPrice">>,
    ) => {
      setCart((prev) =>
        prev.map((c) => (c.product.id === productId ? { ...c, ...patch } : c)),
      );
    },
    [],
  );

  const removeCartItem = useCallback((productId: number) => {
    setCart((prev) => prev.filter((c) => c.product.id !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setShowCheckout(false);
    setPaymentMethod("CASH");
    setError(null);
  }, []);

  // Stock validation
  const stockErrors = useMemo(() => {
    const errors: string[] = [];
    for (const item of cart) {
      if (item.quantity > item.product.stockBaseQty) {
        errors.push(
          `"${item.product.name}" solo tiene ${item.product.stockBaseQty} en stock`,
        );
      }
    }
    return errors;
  }, [cart]);

  // Confirm sale
  const handleConfirmSale = useCallback(async () => {
    if (cart.length === 0) return;

    if (stockErrors.length > 0) {
      Alert.alert("Stock insuficiente", stockErrors.join("\n"));
      return;
    }

    setConfirming(true);
    setError(null);
    try {
      await tickets.create({
        paymentMethod,
        items: cart.map((c) => ({
          productId: c.product.id,
          productName: c.product.name,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
        })),
      });
      clearCart();
      await loadSummary();
    } catch (e) {
      setError("Error registrando venta: " + (e as Error).message);
    } finally {
      setConfirming(false);
    }
  }, [cart, paymentMethod, stockErrors, tickets, clearCart, loadSummary]);

  return (
    <YStack flex={1} bg="$background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <YStack p="$4" gap="$4">
          {/* Header */}
          <XStack style={{ alignItems: "center" }} gap="$3">
            <Receipt size={28} color="$green10" />
            <YStack>
              <H2 color="$color" fontSize="$6" fontWeight="bold">
                Panel de Ventas
              </H2>
              <Text fontSize="$3" color="$color10">
                Escanea productos y registra ventas
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
              <Text fontSize="$7" fontWeight="bold" color="$green10" mt="$1">
                ${todaySales.toFixed(2)}
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
              <Text fontSize="$7" fontWeight="bold" color="$blue10" mt="$1">
                {todayCount}
              </Text>
              <Text fontSize="$2" color="$color10">
                Tickets
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

          {/* Scan button */}
          <Button size="$5" theme="green" icon={ScanLine} onPress={scan}>
            Escanear producto
          </Button>

          {/* Cart */}
          {cart.length > 0 && (
            <Card
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              overflow="hidden"
              bg="$background"
            >
              <XStack
                px="$3"
                py="$2"
                bg="$color2"
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text fontSize="$4" fontWeight="bold" color="$color">
                  Carrito ({cartItemCount})
                </Text>
                <Button
                  size="$2"
                  theme="red"
                  chromeless
                  onPress={() =>
                    Alert.alert(
                      "Vaciar carrito",
                      "¿Vaciar todos los productos?",
                      [
                        { text: "Cancelar", style: "cancel" },
                        {
                          text: "Vaciar",
                          style: "destructive",
                          onPress: clearCart,
                        },
                      ],
                    )
                  }
                >
                  Vaciar
                </Button>
              </XStack>

              {cart.map((item) => (
                <CartItemRow
                  key={item.product.id}
                  item={item}
                  editable={false}
                  onChangeQty={(q) =>
                    updateCartItem(item.product.id, { quantity: q })
                  }
                  onChangePrice={(p) =>
                    updateCartItem(item.product.id, { unitPrice: p })
                  }
                  onRemove={() => removeCartItem(item.product.id)}
                />
              ))}

              {/* Cart total + checkout */}
              <YStack px="$3" py="$3" gap="$3">
                <XStack
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text fontSize="$5" fontWeight="bold" color="$color">
                    Total
                  </Text>
                  <Text fontSize="$6" fontWeight="bold" color="$green10">
                    ${cartTotal.toFixed(2)}
                  </Text>
                </XStack>

                <Button
                  size="$5"
                  theme="blue"
                  icon={Receipt}
                  onPress={() => setShowCheckout(true)}
                >
                  Finalizar venta
                </Button>
              </YStack>
            </Card>
          )}

          {/* Empty state */}
          {cart.length === 0 && (
            <Card
              borderWidth={1}
              bg="$background"
              p="$5"
              style={{ borderRadius: 16 }}
              borderColor="$borderColor"
            >
              <YStack style={{ alignItems: "center" }} gap="$2">
                <ScanLine size={40} color="$color8" />
                <Text
                  color="$color10"
                  fontSize="$3"
                  style={{ textAlign: "center" }}
                >
                  Escanea productos para agregarlos al carrito
                </Text>
              </YStack>
            </Card>
          )}
        </YStack>
      </ScrollView>

      {/* ── Checkout sheet ────────────────────────────────────────────────── */}
      <Sheet
        open={showCheckout}
        onOpenChange={setShowCheckout}
        modal
        snapPoints={[95]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="rgba(0,0,0,0.5)"
        />
        <Sheet.Frame theme={themeName as any}>
          <Sheet.Handle />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <YStack p="$4" gap="$4">
              <Text fontSize="$6" fontWeight="bold" color="$color">
                Resumen de venta
              </Text>

              {/* Editable item list */}
              <Card
                borderWidth={1}
                borderColor="$borderColor"
                style={{ borderRadius: 14 }}
                overflow="hidden"
                bg="$background"
              >
                {cart.map((item) => (
                  <CartItemRow
                    key={item.product.id}
                    item={item}
                    editable
                    onChangeQty={(q) =>
                      updateCartItem(item.product.id, { quantity: q })
                    }
                    onChangePrice={(p) =>
                      updateCartItem(item.product.id, { unitPrice: p })
                    }
                    onRemove={() => removeCartItem(item.product.id)}
                  />
                ))}
              </Card>

              {/* Stock warnings */}
              {stockErrors.length > 0 && (
                <YStack bg="$red2" p="$3" style={{ borderRadius: 12 }} gap="$1">
                  {stockErrors.map((err) => (
                    <XStack key={err} style={{ alignItems: "center" }} gap="$2">
                      <AlertCircle size={14} color="$red10" />
                      <Text fontSize="$2" color="$red10">
                        {err}
                      </Text>
                    </XStack>
                  ))}
                </YStack>
              )}

              {/* Payment method */}
              <YStack gap="$2">
                <Text fontSize="$4" fontWeight="bold" color="$color">
                  Método de pago
                </Text>
                <XStack gap="$3">
                  <Button
                    flex={1}
                    size="$5"
                    icon={Banknote}
                    theme={paymentMethod === "CASH" ? "green" : undefined}
                    variant={paymentMethod === "CASH" ? undefined : "outlined"}
                    onPress={() => setPaymentMethod("CASH")}
                  >
                    Efectivo
                  </Button>
                  <Button
                    flex={1}
                    size="$5"
                    icon={CreditCard}
                    theme={paymentMethod === "CARD" ? "blue" : undefined}
                    variant={paymentMethod === "CARD" ? undefined : "outlined"}
                    onPress={() => setPaymentMethod("CARD")}
                  >
                    Tarjeta
                  </Button>
                </XStack>
              </YStack>

              {/* Total */}
              <XStack
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
                py="$2"
              >
                <Text fontSize="$6" fontWeight="bold" color="$color">
                  Total
                </Text>
                <Text fontSize="$8" fontWeight="bold" color="$green10">
                  ${cartTotal.toFixed(2)}
                </Text>
              </XStack>

              {/* Confirm */}
              <Button
                size="$5"
                theme="green"
                icon={confirming ? <Spinner /> : ShoppingCart}
                disabled={
                  confirming || cart.length === 0 || stockErrors.length > 0
                }
                onPress={handleConfirmSale}
              >
                {confirming ? "Registrando..." : "Confirmar venta"}
              </Button>
            </YStack>
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
