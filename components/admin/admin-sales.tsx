import { CheckoutSheet } from "@/components/worker/checkout-sheet";
import { EnhancedCartItemRow } from "@/components/worker/enhanced-cart-item-row";
import { EnhancedProductSearchModal } from "@/components/worker/enhanced-product-search-modal";
import type { CartItem } from "@/components/worker/types";
import { useAuth } from "@/contexts/auth-context";
import { useStore } from "@/contexts/store-context";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useProductRepository } from "@/hooks/use-product-repository";
import { useScannerGun } from "@/hooks/use-scanner-gun";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import type { CardType } from "@/models/card-type";
import type { Product } from "@/models/product";
import type { PaymentMethod } from "@/models/ticket";
import { getTieredPrice } from "@/utils/pricing";
import {
  AlertCircle,
  Bluetooth,
  Receipt,
  ScanLine,
  Search,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Modal, TextInput } from "react-native";
import { Button, Text, XStack, YStack } from "tamagui";

export function AdminSales() {
  const tickets = useTicketRepository();
  const productRepo = useProductRepository();
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";
  const { user } = useAuth();
  const { syncVersion } = useStore();

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showSearchSheet, setShowSearchSheet] = useState(false);
  const [visibleProducts, setVisibleProducts] = useState<Product[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [selectedCardType, setSelectedCardType] = useState<CardType | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      productRepo.findAllVisible().then(setVisibleProducts);
    }, [productRepo, syncVersion]),
  );

  // ── Add to cart ────────────────────────────────────────────────────────────

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.product.id === product.id);
      if (idx >= 0) {
        const current = prev[idx];
        if (current.quantity >= product.stockBaseQty) return prev;
        const nextQty = current.quantity + 1;
        const updated = [...prev];
        updated[idx] = {
          ...current,
          quantity: nextQty,
          unitPrice: getTieredPrice(product, nextQty),
        };
        return updated;
      }
      if (product.stockBaseQty <= 0) return prev;
      return [
        ...prev,
        {
          product,
          quantity: 1,
          unitPrice: getTieredPrice(product, 1),
        },
      ];
    });
  }, []);

  const toggleCartItem = useCallback((product: Product) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.product.id === product.id);
      if (idx >= 0) return prev.filter((c) => c.product.id !== product.id);
      return [
        ...prev,
        { product, quantity: 1, unitPrice: getTieredPrice(product, 1) },
      ];
    });
  }, []);

  // ── Scanner ────────────────────────────────────────────────────────────────

  const scan = useBarcodeScanner({
    visibleOnly: true,
    onResult(result) {
      if (result.kind === "found") {
        setError(null);
        addToCart(result.product);
      } else {
        setError("Producto no encontrado: " + result.code);
      }
    },
    onError(msg) {
      setError(msg);
    },
  });

  const gun = useScannerGun({
    onScan: useCallback(
      async (code: string) => {
        const product = await productRepo.findVisibleByCode(code);
        if (product) {
          setError(null);
          addToCart(product);
        } else {
          setError("Producto no encontrado: " + code);
        }
      },
      [productRepo, addToCart],
    ),
  });

  // ── Cart helpers ───────────────────────────────────────────────────────────

  const cartProductIds = useMemo(
    () => new Set(cart.map((c) => c.product.id)),
    [cart],
  );

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
        prev.map((c) => {
          if (c.product.id !== productId) return c;
          const updated = { ...c, ...patch };
          if (patch.quantity !== undefined) {
            updated.unitPrice = getTieredPrice(c.product, patch.quantity);
          }
          return updated;
        }),
      );
    },
    [],
  );

  const removeCartItem = useCallback((productId: number) => {
    setCart((prev) => prev.filter((c) => c.product.id !== productId));
  }, []);

  // Handle price updates from enhanced cart items
  const updateCartItemPrice = useCallback(
    (productId: number, newPrice: number) => {
      setCart((prev) =>
        prev.map((c) => {
          if (c.product.id !== productId) return c;
          return { ...c, unitPrice: newPrice };
        }),
      );
    },
    [],
  );

  const clearCart = useCallback(() => {
    setCart([]);
    setShowCheckout(false);
    setPaymentMethod("CASH");
    setError(null);
  }, []);

  // ── Stock validation ───────────────────────────────────────────────────────

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

  // ── Confirm sale ───────────────────────────────────────────────────────────

  const handleConfirmSale = useCallback(async () => {
    if (cart.length === 0) return;

    if (stockErrors.length > 0) {
      Alert.alert("Stock insuficiente", stockErrors.join("\n"));
      return;
    }

    setConfirming(true);
    setError(null);
    try {
      const saleItems = cart.map((c) => ({
        productId: c.product.id,
        productName: c.product.name,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
      }));
      await tickets.create({
        paymentMethod,
        cardTypeId: selectedCardType?.id ?? null,
        cardTypeName: selectedCardType?.name ?? null,
        workerId: user?.id ?? null,
        workerName: user?.name ? `${user.name}` : "Admin",
        items: saleItems,
      });
      clearCart();
      setSelectedCardType(null);
      productRepo.findAllVisible().then(setVisibleProducts);
    } catch (e) {
      setError("Error registrando venta: " + (e as Error).message);
    } finally {
      setConfirming(false);
    }
  }, [
    cart,
    paymentMethod,
    selectedCardType,
    stockErrors,
    tickets,
    clearCart,
    user,
    productRepo,
  ]);

  // ── FlatList helpers ───────────────────────────────────────────────────────

  const cartKeyExtractor = useCallback(
    (item: CartItem) => String(item.product.id),
    [],
  );

  const renderCartItem = useCallback(
    ({ item }: { item: CartItem }) => (
      <EnhancedCartItemRow
        item={item}
        onChangeQty={(q) => updateCartItem(item.product.id, { quantity: q })}
        onRemove={() => removeCartItem(item.product.id)}
        onPriceUpdate={(newPrice) =>
          updateCartItemPrice(item.product.id, newPrice)
        }
      />
    ),
    [updateCartItem, removeCartItem, updateCartItemPrice],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <YStack flex={1} bg="$background">
      {/* Top section */}
      <YStack px="$4" pt="$3" pb="$2" gap="$3">
        {gun.isConnected && (
          <XStack
            bg="$blue2"
            px="$3"
            py="$2"
            style={{ borderRadius: 12, alignItems: "center" }}
            gap="$2"
          >
            <Bluetooth size={16} color="$blue10" />
            <Text fontSize="$3" color="$blue10" fontWeight="600">
              Pistola escaneadora conectada
            </Text>
          </XStack>
        )}

        {error && (
          <XStack
            bg="$red2"
            p="$3"
            style={{ borderRadius: 12, alignItems: "center" }}
            gap="$2"
          >
            <AlertCircle size={20} color="$red10" />
            <Text fontSize="$4" color="$red10" flex={1}>
              {error}
            </Text>
          </XStack>
        )}

        <XStack gap="$3">
          <Button flex={1} size="$5" icon={ScanLine} onPress={scan}>
            Escanear
          </Button>
          <Button
            flex={1}
            size="$5"
            theme="blue"
            icon={Search}
            onPress={() => setShowSearchSheet(true)}
          >
            Buscar
          </Button>
        </XStack>
      </YStack>

      {/* Cart area */}
      {cart.length > 0 ? (
        <>
          <XStack
            px="$4"
            py="$2"
            bg="$color2"
            borderTopWidth={1}
            borderBottomWidth={1}
            borderColor="$borderColor"
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <Text fontSize="$4" fontWeight="bold" color="$color">
              Carrito ({cartItemCount})
            </Text>
            <Button
              size="$3"
              theme="red"
              chromeless
              onPress={() =>
                Alert.alert("Vaciar carrito", "¿Vaciar todos los productos?", [
                  { text: "Cancelar", style: "cancel" },
                  { text: "Vaciar", style: "destructive", onPress: clearCart },
                ])
              }
            >
              Vaciar
            </Button>
          </XStack>

          <FlatList
            data={cart}
            keyExtractor={cartKeyExtractor}
            renderItem={renderCartItem}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            style={{ flex: 1 }}
            ListFooterComponent={
              stockErrors.length > 0 ? (
                <YStack px="$3" py="$2" gap="$1">
                  {stockErrors.map((err) => (
                    <XStack key={err} style={{ alignItems: "center" }} gap="$2">
                      <AlertCircle size={14} color="$red10" />
                      <Text fontSize="$2" color="$red10">
                        {err}
                      </Text>
                    </XStack>
                  ))}
                </YStack>
              ) : null
            }
          />
        </>
      ) : (
        <YStack
          flex={1}
          style={{ alignItems: "center", justifyContent: "center" }}
          gap="$3"
          p="$6"
        >
          <ScanLine size={64} color="$color8" />
          <Text color="$color10" fontSize="$4" style={{ textAlign: "center" }}>
            Escanea o busca productos para vender directamente
          </Text>
        </YStack>
      )}

      {/* Sticky bottom bar */}
      {cart.length > 0 && (
        <YStack
          px="$4"
          py="$3"
          gap="$3"
          borderTopWidth={1}
          borderColor="$borderColor"
          bg="$background"
        >
          <XStack
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <Text fontSize="$6" fontWeight="bold" color="$color">
              Total
            </Text>
            <Text fontSize="$8" fontWeight="bold" color="$green10">
              ${cartTotal.toFixed(2)}
            </Text>
          </XStack>
          <Button
            size="$6"
            theme="green"
            icon={Receipt}
            disabled={stockErrors.length > 0}
            onPress={() => setShowCheckout(true)}
          >
            Finalizar venta
          </Button>
        </YStack>
      )}

      {/* Product search modal */}
      <Modal
        visible={showSearchSheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSearchSheet(false)}
      >
        <YStack flex={1} bg="$background" theme={themeName as any}>
          <EnhancedProductSearchModal
            visible={showSearchSheet}
            onClose={() => {
              setShowSearchSheet(false);
              gun.refocus();
            }}
            themeName={themeName}
            products={visibleProducts}
            cartProductIds={cartProductIds}
            cartCount={cart.length}
            onToggleCartItem={toggleCartItem}
          />
        </YStack>
      </Modal>

      {/* Checkout sheet */}
      <CheckoutSheet
        open={showCheckout}
        onOpenChange={(open) => {
          setShowCheckout(open);
          if (!open) gun.refocus();
        }}
        cart={cart}
        cartTotal={cartTotal}
        paymentMethod={paymentMethod}
        onPaymentMethodChange={setPaymentMethod}
        selectedCardType={selectedCardType}
        onCardTypeChange={setSelectedCardType}
        confirming={confirming}
        onConfirm={handleConfirmSale}
      />

      {/* Hidden input for scanner gun */}
      <TextInput ref={gun.inputRef} {...gun.inputProps} />
    </YStack>
  );
}
