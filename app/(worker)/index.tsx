import { ServerStatusBadge } from "@/components/lan/server-status";
import { ICON_BTN_BG, OVERLAY } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { useLan } from "@/contexts/lan-context";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useProductRepository } from "@/hooks/use-product-repository";
import { useTicketRepository } from "@/hooks/use-ticket-repository";
import type { Product } from "@/models/product";
import type { PaymentMethod } from "@/models/ticket";
import type { CartItemWire } from "@/services/lan/protocol";
import { todayISO } from "@/utils/format";
import {
  AlertCircle,
  Banknote,
  CreditCard,
  Minus,
  Package,
  Plus,
  Receipt,
  ScanLine,
  Search,
  ShoppingCart,
  Trash2,
  TrendingUp,
  X,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
} from "react-native";
import {
  Button,
  Card,
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

// ── Cart item row ────────────────────────────────────────────────────────────

const CartItemRow = memo(function CartItemRow({
  item,
  onChangeQty,
  onRemove,
}: {
  item: CartItem;
  onChangeQty: (qty: number) => void;
  onRemove: () => void;
}) {
  const subtotal = item.quantity * item.unitPrice;

  return (
    <XStack
      px="$3"
      py="$3"
      gap="$3"
      style={{ alignItems: "center" }}
      borderBottomWidth={StyleSheet.hairlineWidth}
      borderColor="$borderColor"
    >
      {/* Photo */}
      {item.product.photoUri ? (
        <Image
          source={{ uri: item.product.photoUri }}
          style={rowStyles.thumb}
          resizeMode="cover"
        />
      ) : (
        <YStack style={rowStyles.thumbPlaceholder}>
          <Package size={20} color="$color8" />
        </YStack>
      )}

      {/* Content */}
      <YStack flex={1} gap="$1.5">
        {/* Name */}
        <Text fontSize="$4" fontWeight="600" color="$color" numberOfLines={1}>
          {item.product.name}
        </Text>

        {/* Qty stepper + unit price */}
        <XStack style={{ alignItems: "center" }} gap="$3">
          {/* Stepper */}
          <XStack
            bg="$color3"
            style={{ borderRadius: 10, alignItems: "center" }}
            height={40}
          >
            <Pressable
              onPress={() =>
                item.quantity > 1 && onChangeQty(item.quantity - 1)
              }
              style={stepperStyles.btn}
              hitSlop={8}
            >
              <Minus size={18} color="$color11" />
            </Pressable>
            <Text
              fontSize="$4"
              fontWeight="bold"
              color="$color"
              width={34}
              style={{ textAlign: "center" }}
            >
              {item.quantity}
            </Text>
            <Pressable
              onPress={() => onChangeQty(item.quantity + 1)}
              style={stepperStyles.btn}
              hitSlop={8}
            >
              <Plus size={18} color="$color11" />
            </Pressable>
          </XStack>

          {/* Unit price */}
          <Text fontSize="$3" color="$color10">
            × ${item.unitPrice.toFixed(2)}
          </Text>
        </XStack>
      </YStack>

      {/* Subtotal + delete */}
      <YStack style={{ alignItems: "flex-end" }} gap="$2">
        <Text fontSize="$5" fontWeight="bold" color="$green10">
          ${subtotal.toFixed(2)}
        </Text>
        <Pressable onPress={onRemove} hitSlop={12} style={rowStyles.deleteBtn}>
          <Trash2 size={18} color="$red10" />
        </Pressable>
      </YStack>
    </XStack>
  );
});

const rowStyles = StyleSheet.create({
  thumb: { width: 44, height: 44, borderRadius: 10 },
  thumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: ICON_BTN_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtn: {
    padding: 6,
  },
});

const stepperStyles = StyleSheet.create({
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});

// ── Main screen ──────────────────────────────────────────────────────────────

export default function WorkerScreen() {
  const tickets = useTicketRepository();
  const productRepo = useProductRepository();
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";
  const { user } = useAuth();

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showSearchSheet, setShowSearchSheet] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleProducts, setVisibleProducts] = useState<Product[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // LAN broadcasting
  const {
    broadcastCart,
    broadcastClear,
    broadcastCheckout,
    startServer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    serverRunning,
    catalogVersion,
  } = useLan();
  const serverStarted = useRef(false);

  // Auto-start LAN server on first mount
  useEffect(() => {
    if (user && !serverStarted.current) {
      serverStarted.current = true;
      startServer().catch(() => {});
    }
  }, [user, startServer]);

  // Today's summary (worker-scoped)
  const [todaySales, setTodaySales] = useState(0);
  const [todayCount, setTodayCount] = useState(0);

  const loadSummary = useCallback(async () => {
    if (!user) return;
    try {
      const today = todayISO();
      const s = await tickets.workerRangeSummary(user.id, today, today);
      setTodaySales(s.totalSales);
      setTodayCount(s.ticketCount);
    } catch {
      // ignore
    }
  }, [tickets, user]);

  useFocusEffect(
    useCallback(() => {
      loadSummary();
      productRepo.findAllVisible().then(setVisibleProducts);
    }, [loadSummary, productRepo]),
  );

  // Reload products when catalog is updated via sync (more reliable than useFocusEffect alone)
  useEffect(() => {
    if (catalogVersion > 0) {
      productRepo.findAllVisible().then(setVisibleProducts);
      loadSummary();
    }
  }, [catalogVersion, productRepo, loadSummary]);

  // Barcode scanner — adds to cart
  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.product.id === product.id);
      if (idx >= 0) {
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
          product,
          quantity: 1,
          unitPrice: product.salePrice,
        },
      ];
    });
  }, []);

  // Toggle product in cart (for manual search: add 1 / remove)
  const toggleCartItem = useCallback((product: Product) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.product.id === product.id);
      if (idx >= 0) {
        return prev.filter((c) => c.product.id !== product.id);
      }
      return [...prev, { product, quantity: 1, unitPrice: product.salePrice }];
    });
  }, []);

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

  // Search filtered products
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return visibleProducts;
    const q = searchQuery.toLowerCase().trim();
    return visibleProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
    );
  }, [visibleProducts, searchQuery]);

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
    broadcastClear();
  }, [broadcastClear]);

  // Broadcast cart changes to connected displays
  useEffect(() => {
    const wireCart: CartItemWire[] = cart.map((c) => ({
      productId: c.product.id,
      name: c.product.name,
      photoUri: c.product.photoUri,
      quantity: c.quantity,
      unitPrice: c.unitPrice,
    }));
    broadcastCart(wireCart, cartTotal);
  }, [cart, cartTotal, broadcastCart]);

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
      const saleItems = cart.map((c) => ({
        productId: c.product.id,
        productName: c.product.name,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
      }));
      await tickets.create({
        paymentMethod,
        workerId: user?.id ?? null,
        workerName: user?.name ?? null,
        items: saleItems,
      });
      broadcastCheckout(cartTotal, cartItemCount, paymentMethod);
      clearCart();
      await loadSummary();
      // Reload products so stock reflects the sale just made
      productRepo.findAllVisible().then(setVisibleProducts);
    } catch (e) {
      setError("Error registrando venta: " + (e as Error).message);
    } finally {
      setConfirming(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, paymentMethod, stockErrors, tickets, clearCart, loadSummary]);

  return (
    <YStack flex={1} bg="$background">
      {/* ── Top section (fixed, doesn't scroll) ── */}
      <YStack px="$4" pt="$3" pb="$2" gap="$3">
        {/* Server status */}
        <XStack justify="flex-end" mb="$-2">
          <ServerStatusBadge />
        </XStack>

        {/* Compact stats */}
        <XStack gap="$3">
          <Card
            flex={1}
            bg="$green2"
            p="$3"
            style={{ borderRadius: 14 }}
            borderWidth={1}
            borderColor="$green5"
          >
            <XStack style={{ alignItems: "center" }} gap="$2">
              <TrendingUp size={20} color="$green10" />
              <YStack>
                <Text fontSize="$6" fontWeight="bold" color="$green10">
                  ${todaySales.toFixed(2)}
                </Text>
                <Text fontSize="$2" color="$color10">
                  Mis ventas
                </Text>
              </YStack>
            </XStack>
          </Card>
          <Card
            flex={1}
            bg="$blue2"
            p="$3"
            style={{ borderRadius: 14 }}
            borderWidth={1}
            borderColor="$blue5"
          >
            <XStack style={{ alignItems: "center" }} gap="$2">
              <ShoppingCart size={20} color="$blue10" />
              <YStack>
                <Text fontSize="$6" fontWeight="bold" color="$blue10">
                  {todayCount}
                </Text>
                <Text fontSize="$2" color="$color10">
                  Tickets
                </Text>
              </YStack>
            </XStack>
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
            <AlertCircle size={20} color="$red10" />
            <Text fontSize="$4" color="$red10" flex={1}>
              {error}
            </Text>
          </XStack>
        )}

        {/* Action buttons */}
        <XStack gap="$3">
          <Button
            flex={1}
            size="$5"
            theme="green"
            icon={ScanLine}
            onPress={scan}
          >
            Escanear
          </Button>
          <Button
            flex={1}
            size="$5"
            theme="blue"
            icon={Search}
            onPress={() => {
              setSearchQuery("");
              setShowSearchSheet(true);
            }}
          >
            Buscar
          </Button>
        </XStack>
      </YStack>

      {/* ── Cart area (scrollable, takes remaining space) ── */}
      {cart.length > 0 ? (
        <>
          {/* Cart header */}
          <XStack
            px="$4"
            py="$2"
            bg="$color2"
            borderTopWidth={1}
            borderBottomWidth={1}
            borderColor="$borderColor"
            style={{
              justifyContent: "space-between",
              alignItems: "center",
            }}
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
                  {
                    text: "Vaciar",
                    style: "destructive",
                    onPress: clearCart,
                  },
                ])
              }
            >
              Vaciar
            </Button>
          </XStack>

          <FlatList
            data={cart}
            keyExtractor={(item) => String(item.product.id)}
            renderItem={({ item }) => (
              <CartItemRow
                item={item}
                onChangeQty={(q) =>
                  updateCartItem(item.product.id, { quantity: q })
                }
                onRemove={() => removeCartItem(item.product.id)}
              />
            )}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 4 }}
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
            Escanea o busca productos para agregarlos al carrito
          </Text>
        </YStack>
      )}

      {/* ── Sticky bottom bar ── */}
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
            style={{
              justifyContent: "space-between",
              alignItems: "center",
            }}
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

      {/* ── Product search (full-screen modal) ────────────────────────── */}
      <Modal
        visible={showSearchSheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSearchSheet(false)}
      >
        <YStack
          flex={1}
          bg="$background"
          theme={themeName as any}
          pt="$6"
          px="$4"
          gap="$3"
        >
          {/* Header */}
          <XStack
            style={{
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text fontSize="$6" fontWeight="bold" color="$color">
              Buscar producto
            </Text>
            <Button
              size="$4"
              circular
              chromeless
              icon={<X size={22} />}
              onPress={() => setShowSearchSheet(false)}
            />
          </XStack>

          {/* Search input */}
          <XStack
            bg="$color3"
            borderWidth={1}
            borderColor="$borderColor"
            style={{ borderRadius: 14, alignItems: "center" }}
            px="$3"
            gap="$2"
            height={50}
          >
            <Search size={20} color="$color10" />
            <Input
              flex={1}
              size="$4"
              bg="transparent"
              borderWidth={0}
              color="$color"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Nombre o código…"
              placeholderTextColor="$color8"
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              autoFocus
              px={0}
            />
            {searchQuery.length > 0 && (
              <Button
                size="$3"
                chromeless
                circular
                icon={<X size={16} color="$color10" />}
                onPress={() => setSearchQuery("")}
              />
            )}
          </XStack>

          {/* Cart badge */}
          {cart.length > 0 && (
            <XStack
              bg="$blue3"
              style={{
                alignItems: "center",
                borderRadius: 10,
              }}
              px="$3"
              py="$2.5"
              gap="$2"
            >
              <ShoppingCart size={16} color="$blue10" />
              <Text fontSize="$3" color="$blue10" fontWeight="600">
                {cart.length} producto{cart.length !== 1 ? "s" : ""} en carrito
              </Text>
            </XStack>
          )}

          {/* Results */}
          <FlatList
            data={searchResults}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: p }) => {
              const inCart = !!cart.find((c) => c.product.id === p.id);
              return (
                <Pressable
                  onPress={() => toggleCartItem(p)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <XStack
                    px="$3"
                    py="$3.5"
                    style={{
                      alignItems: "center",
                      borderRadius: inCart ? 12 : 0,
                    }}
                    gap="$3"
                    borderBottomWidth={1}
                    borderColor="$borderColor"
                    bg={inCart ? "$green3" : "transparent"}
                  >
                    {p.photoUri ? (
                      <Image
                        source={{ uri: p.photoUri }}
                        style={{ width: 48, height: 48, borderRadius: 12 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <YStack
                        width={48}
                        height={48}
                        bg="$color3"
                        style={{
                          borderRadius: 12,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Package size={22} color="$color8" />
                      </YStack>
                    )}
                    <YStack flex={1} gap="$1">
                      <Text
                        fontSize="$4"
                        fontWeight="600"
                        color="$color"
                        numberOfLines={1}
                      >
                        {p.name}
                      </Text>
                      <XStack gap="$2" style={{ alignItems: "center" }}>
                        <Text fontSize="$4" fontWeight="bold" color="$blue10">
                          ${p.salePrice.toFixed(2)}
                        </Text>
                        <Text fontSize="$3" color="$color10">
                          Stock: {p.stockBaseQty}
                        </Text>
                      </XStack>
                    </YStack>
                    {inCart ? (
                      <XStack
                        px="$3"
                        py="$2"
                        bg="$green9"
                        style={{
                          borderRadius: 10,
                          alignItems: "center",
                        }}
                        gap="$1.5"
                      >
                        <ShoppingCart size={16} color="white" />
                        <Text fontSize="$3" fontWeight="bold" color="white">
                          Añadido
                        </Text>
                      </XStack>
                    ) : (
                      <XStack
                        px="$3"
                        py="$2"
                        bg="$color3"
                        style={{
                          borderRadius: 10,
                          alignItems: "center",
                        }}
                      >
                        <Text fontSize="$3" fontWeight="500" color="$color10">
                          Agregar
                        </Text>
                      </XStack>
                    )}
                  </XStack>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <YStack p="$6" style={{ alignItems: "center" }} gap="$3">
                <Search size={48} color="$color8" />
                <Text color="$color10" fontSize="$4">
                  {searchQuery.trim()
                    ? "No se encontraron productos"
                    : "Escribe para buscar productos"}
                </Text>
              </YStack>
            }
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </YStack>
      </Modal>

      {/* ── Checkout sheet ────────────────────────────────────────────────── */}
      <Sheet
        open={showCheckout}
        onOpenChange={setShowCheckout}
        modal
        snapPoints={[65]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor={OVERLAY}
        />
        <Sheet.Frame bg="$background" theme={themeName as any}>
          <Sheet.Handle />
          <YStack p="$4" gap="$4">
            <Text fontSize="$7" fontWeight="bold" color="$color">
              Confirmar venta
            </Text>

            {/* Order summary */}
            <Card
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 14 }}
              overflow="hidden"
              bg="$color2"
              p="$3.5"
              gap="$2.5"
            >
              {cart.map((item) => {
                const subtotal = item.quantity * item.unitPrice;
                return (
                  <XStack
                    key={item.product.id}
                    style={{ alignItems: "center" }}
                    justify="space-between"
                  >
                    <Text
                      fontSize="$4"
                      color="$color"
                      flex={1}
                      numberOfLines={1}
                    >
                      {item.product.name}
                    </Text>
                    <Text fontSize="$3" color="$color10" mx="$2">
                      x{item.quantity} × ${item.unitPrice.toFixed(2)}
                    </Text>
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
                );
              })}
            </Card>

            {/* Payment method */}
            <YStack gap="$2.5">
              <Text fontSize="$5" fontWeight="bold" color="$color">
                Método de pago
              </Text>
              <XStack gap="$3">
                <Button
                  flex={1}
                  size="$6"
                  icon={Banknote}
                  theme={paymentMethod === "CASH" ? "green" : undefined}
                  variant={paymentMethod === "CASH" ? undefined : "outlined"}
                  onPress={() => setPaymentMethod("CASH")}
                >
                  Efectivo
                </Button>
                <Button
                  flex={1}
                  size="$6"
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
              borderTopWidth={1}
              borderColor="$borderColor"
            >
              <Text fontSize="$7" fontWeight="bold" color="$color">
                Total
              </Text>
              <Text fontSize="$9" fontWeight="bold" color="$green10">
                ${cartTotal.toFixed(2)}
              </Text>
            </XStack>

            {/* Confirm */}
            <Button
              size="$6"
              theme="green"
              icon={confirming ? <Spinner /> : ShoppingCart}
              disabled={confirming || cart.length === 0}
              onPress={handleConfirmSale}
            >
              {confirming ? "Registrando..." : "Confirmar venta"}
            </Button>
          </YStack>
        </Sheet.Frame>
      </Sheet>
    </YStack>
  );
}
