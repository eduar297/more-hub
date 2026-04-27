import type { Product } from "@/models/product";
import { Check, Package, Search, ShoppingCart, X } from "@tamagui/lucide-icons";
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Input, Text, XStack, YStack } from "tamagui";

// ── Memoized product row ─────────────────────────────────────────────────────

interface ProductRowProps {
  product: Product;
  inCart: boolean;
  onToggle: (product: Product) => void;
}

const ProductRow = memo(
  function ProductRow({ product, inCart, onToggle }: ProductRowProps) {
    const outOfStock = product.stockBaseQty <= 0;
    return (
      <Pressable
        onPress={outOfStock ? undefined : () => onToggle(product)}
        style={pressableStyle}
        disabled={outOfStock}
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
          opacity={outOfStock ? 0.4 : 1}
        >
          {product.photoUri ? (
            <Image
              source={{ uri: product.photoUri }}
              style={styles.productImg}
              resizeMode="cover"
            />
          ) : (
            <YStack
              width={48}
              height={48}
              bg="$color3"
              style={styles.productImgPlaceholder}
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
              {product.name}
            </Text>
            <XStack gap="$2" style={styles.center}>
              <Text fontSize="$4" fontWeight="bold" color="$blue10">
                ${product.salePrice.toFixed(2)}
              </Text>
              <Text fontSize="$3" color="$color10">
                Stock: {product.stockBaseQty}
              </Text>
            </XStack>
          </YStack>
          {inCart ? (
            <XStack
              px="$3"
              py="$2"
              bg="$green9"
              style={styles.badge}
              gap="$1.5"
            >
              <ShoppingCart size={16} color="white" />
              <Text fontSize="$3" fontWeight="bold" color="white">
                Añadido
              </Text>
            </XStack>
          ) : outOfStock ? (
            <XStack px="$3" py="$2" bg="$red3" style={styles.badge}>
              <Text fontSize="$3" fontWeight="500" color="$red10">
                Agotado
              </Text>
            </XStack>
          ) : (
            <XStack px="$3" py="$2" bg="$color3" style={styles.badge}>
              <Text fontSize="$3" fontWeight="500" color="$color10">
                Agregar
              </Text>
            </XStack>
          )}
        </XStack>
      </Pressable>
    );
  },
  (prev, next) =>
    prev.product.id === next.product.id && prev.inCart === next.inCart,
);

const pressableStyle = { opacity: 1 as number };

// ── Empty list component (stable ref) ────────────────────────────────────────

const EmptySearch = memo(function EmptySearch({
  hasQuery,
}: {
  hasQuery: boolean;
}) {
  return (
    <YStack p="$6" style={styles.center} gap="$3">
      <Search size={48} color="$color8" />
      <Text color="$color10" fontSize="$4">
        {hasQuery
          ? "No se encontraron productos"
          : "Escribe para buscar productos"}
      </Text>
    </YStack>
  );
});

// ── Main modal ───────────────────────────────────────────────────────────────

interface ProductSearchModalProps {
  visible: boolean;
  onClose: () => void;
  themeName: string;
  products: Product[];
  cartProductIds: ReadonlySet<number>;
  cartCount: number;
  onToggleCartItem: (product: Product) => void;
}

export function ProductSearchModal({
  visible,
  onClose,
  themeName,
  products,
  cartProductIds,
  cartCount,
  onToggleCartItem,
}: ProductSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const insets = useSafeAreaInsets();

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase().trim();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
    );
  }, [products, searchQuery]);

  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <ProductRow
        product={item}
        inCart={cartProductIds.has(item.id)}
        onToggle={onToggleCartItem}
      />
    ),
    [cartProductIds, onToggleCartItem],
  );

  const keyExtractor = useCallback((item: Product) => String(item.id), []);

  const listEmpty = useMemo(
    () => <EmptySearch hasQuery={!!searchQuery.trim()} />,
    [searchQuery],
  );

  const handleClose = useCallback(() => {
    setSearchQuery("");
    onClose();
  }, [onClose]);

  return (
    <YStack flex={1}>
      <FlatList
        // Use FlatList as the root so the keyboard dismisses on scroll
        data={visible ? searchResults : []}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={visible ? listEmpty : null}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        removeClippedSubviews
        maxToRenderPerBatch={15}
        initialNumToRender={12}
        windowSize={5}
        style={visible ? styles.list : styles.hidden}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          visible ? (
            <YStack
              bg="$background"
              theme={themeName as any}
              pt="$6"
              px="$4"
              gap="$3"
              pb="$1"
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
                  onPress={handleClose}
                />
              </XStack>

              {/* Search input */}
              <XStack
                bg="$color3"
                borderWidth={1}
                borderColor="$borderColor"
                style={styles.searchBar}
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

              <XStack
                bg="$blue3"
                style={styles.cartBadge}
                px="$3"
                py="$2.5"
                gap="$2"
              >
                <ShoppingCart size={16} color="$blue10" />
                <Text fontSize="$3" color="$blue10" fontWeight="600">
                  {cartCount} producto{cartCount !== 1 ? "s" : ""} seleccionado
                  {cartCount !== 1 ? "s" : ""}
                </Text>
              </XStack>
            </YStack>
          ) : null
        }
      />

      {/* Floating close button — easy thumb access */}
      {visible && (
        <YStack
          px="$4"
          pb={Math.max(20, insets.bottom + 5)}
          pt="$2"
          bg="$background"
          theme={themeName as any}
        >
          <Button size="$5" theme="blue" icon={Check} onPress={handleClose}>
            Listo
          </Button>
        </YStack>
      )}
    </YStack>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center" },
  productImg: { width: 48, height: 48, borderRadius: 12 },
  productImgPlaceholder: {
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: { borderRadius: 10, alignItems: "center" },
  searchBar: { borderRadius: 14, alignItems: "center" },
  cartBadge: { alignItems: "center", borderRadius: 10 },
  list: { flex: 1 },
  hidden: { display: "none" },
  listContent: { paddingBottom: 40 },
});
