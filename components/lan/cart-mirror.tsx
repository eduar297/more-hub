import { ICON_BTN_BG } from "@/constants/colors";
import type { CartMirrorState } from "@/services/lan/protocol";
import { Check, Package, ShoppingCart } from "@tamagui/lucide-icons";
import { useEffect, useState } from "react";
import { FlatList, Image, StyleSheet } from "react-native";
import { Text, XStack, YStack } from "tamagui";

interface Props {
  state: CartMirrorState;
  storeName: string;
}

export function CartMirror({ state, storeName }: Props) {
  // Thank-you screen after checkout
  if (state.lastCheckout) {
    return <ThankYouScreen checkout={state.lastCheckout} />;
  }

  // Empty cart — welcome/branding
  if (state.cart.length === 0) {
    return <WelcomeScreen storeName={storeName} />;
  }

  // Active cart
  return <ActiveCart cart={state.cart} total={state.total} />;
}

// ── Active Cart ──────────────────────────────────────────────────────────────

function ActiveCart({
  cart,
  total,
}: {
  cart: CartMirrorState["cart"];
  total: number;
}) {
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <YStack flex={1} bg="$background">
      {/* Header */}
      <XStack
        px="$5"
        py="$3"
        bg="$color2"
        items="center"
        justify="space-between"
        borderBottomWidth={1}
        borderColor="$borderColor"
      >
        <XStack items="center" gap="$2">
          <ShoppingCart size={24} color="$blue10" />
          <Text fontSize="$6" fontWeight="bold" color="$color">
            Tu compra
          </Text>
        </XStack>
        <Text fontSize="$4" color="$color10">
          {itemCount} artículo{itemCount !== 1 ? "s" : ""}
        </Text>
      </XStack>

      {/* Items list */}
      <FlatList
        data={cart}
        keyExtractor={(item) => String(item.productId)}
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12 }}
        renderItem={({ item }) => {
          const subtotal = item.quantity * item.unitPrice;
          return (
            <XStack
              py="$3"
              items="center"
              gap="$3"
              borderBottomWidth={1}
              borderColor="$borderColor"
            >
              {/* Product image */}
              {item.photoUri ? (
                <Image
                  source={{ uri: item.photoUri }}
                  style={styles.thumb}
                  resizeMode="cover"
                />
              ) : (
                <YStack style={styles.thumbPlaceholder}>
                  <Package size={22} color="$color8" />
                </YStack>
              )}

              {/* Name + price */}
              <YStack flex={1} gap="$0.5">
                <Text
                  fontSize="$5"
                  fontWeight="600"
                  color="$color"
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text fontSize="$3" color="$color10">
                  ${item.unitPrice.toFixed(2)} c/u
                </Text>
              </YStack>

              {/* Quantity */}
              <XStack
                bg="$color3"
                px="$3"
                py="$1.5"
                rounded="$3"
                items="center"
              >
                <Text fontSize="$5" fontWeight="bold" color="$color">
                  ×{item.quantity}
                </Text>
              </XStack>

              {/* Subtotal */}
              <Text
                fontSize="$5"
                fontWeight="bold"
                color="$green10"
                width={100}
                text="right"
              >
                ${subtotal.toFixed(2)}
              </Text>
            </XStack>
          );
        }}
        style={{ flex: 1 }}
      />

      {/* Total bar */}
      <XStack
        px="$5"
        py="$4"
        bg="$color2"
        items="center"
        justify="space-between"
        borderTopWidth={2}
        borderColor="$green8"
      >
        <Text fontSize="$7" fontWeight="bold" color="$color">
          Total
        </Text>
        <Text fontSize={42} fontWeight="900" color="$green10">
          ${total.toFixed(2)}
        </Text>
      </XStack>
    </YStack>
  );
}

// ── Welcome Screen ───────────────────────────────────────────────────────────

function WelcomeScreen({ storeName }: { storeName: string }) {
  return (
    <YStack flex={1} bg="$background" items="center" justify="center" gap="$4">
      <ShoppingCart size={64} color="$color8" />
      <Text fontSize="$9" fontWeight="900" color="$color" text="center">
        {storeName}
      </Text>
      <Text fontSize="$5" color="$color10" text="center">
        Bienvenido · Sus productos aparecerán aquí
      </Text>
    </YStack>
  );
}

// ── Thank You Screen ─────────────────────────────────────────────────────────

function ThankYouScreen({
  checkout,
}: {
  checkout: NonNullable<CartMirrorState["lastCheckout"]>;
}) {
  const [scale, setScale] = useState(0.8);

  useEffect(() => {
    const timer = setTimeout(() => setScale(1), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <YStack flex={1} bg="$green2" items="center" justify="center" gap="$5">
      <YStack
        width={100}
        height={100}
        rounded="$10"
        bg="$green5"
        items="center"
        justify="center"
        style={{ transform: [{ scale }] }}
      >
        <Check size={56} color="$green10" />
      </YStack>
      <Text fontSize={48} fontWeight="900" color="$green10">
        ¡Gracias!
      </Text>
      <Text fontSize="$7" color="$green10">
        Total: ${checkout.total.toFixed(2)}
      </Text>
      <Text fontSize="$4" color="$green10">
        {checkout.itemCount} artículo{checkout.itemCount !== 1 ? "s" : ""} ·{" "}
        {checkout.paymentMethod === "CASH" ? "Efectivo" : "Tarjeta"}
      </Text>
    </YStack>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  thumb: { width: 48, height: 48, borderRadius: 10 },
  thumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: ICON_BTN_BG,
    alignItems: "center",
    justifyContent: "center",
  },
});
