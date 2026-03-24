import { ProductDetail } from "@/components/product/product-detail";
import { ProductForm } from "@/components/product/product-form";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useProductRepository } from "@/hooks/use-product-repository";
import { useUnitRepository } from "@/hooks/use-unit-repository";
import type { CreateProductInput, Product } from "@/models/product";
import type { Unit, UnitCategory } from "@/models/unit";
import { generateEAN13 } from "@/utils/barcode";
import { Package, Plus, ScanLine } from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Image, Keyboard, ScrollView, StyleSheet } from "react-native";
import {
  Button,
  Input,
  Label,
  Sheet,
  Spinner,
  Text,
  XStack,
  YStack,
} from "tamagui";

// ── Product row ──────────────────────────────────────────────────────────────

function ProductRow({
  product,
  unit,
  onPress,
}: {
  product: Product;
  unit: Unit | undefined;
  onPress: () => void;
}) {
  return (
    <XStack
      px="$4"
      py="$3"
      bg="$background"
      pressStyle={{ bg: "$color2" }}
      onPress={onPress}
      borderBottomWidth={1}
      borderColor="$borderColor"
      style={{ alignItems: "center" }}
      gap="$3"
    >
      {/* Thumbnail */}
      {product.photoUri ? (
        <Image
          source={{ uri: product.photoUri }}
          style={rowStyles.thumb}
          resizeMode="cover"
        />
      ) : (
        <YStack style={rowStyles.thumbPlaceholder}>
          <Package size={20} color="$color8" />
        </YStack>
      )}

      <YStack flex={1} gap="$1">
        <Text fontSize="$4" fontWeight="bold" color="$color" numberOfLines={1}>
          {product.name}
        </Text>
        <Text fontSize="$2" color="$color10">
          {product.barcode}
        </Text>
      </YStack>
      <YStack style={{ alignItems: "flex-end" }} gap="$1">
        <Text fontSize="$4" color="$blue10" fontWeight="600">
          ${product.pricePerBaseUnit.toFixed(2)}
        </Text>
        <Text fontSize="$2" color="$color10">
          Stock: {product.stockBaseQty} {unit?.symbol ?? "—"}
        </Text>
      </YStack>
    </XStack>
  );
}

const rowStyles = StyleSheet.create({
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  thumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "rgba(128,128,128,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
});

// ── Category section ─────────────────────────────────────────────────────────

function CategorySection({
  category,
  products,
  unitMap,
  onProductPress,
}: {
  category: UnitCategory;
  products: Product[];
  unitMap: Map<number, Unit>;
  onProductPress: (p: Product) => void;
}) {
  return (
    <YStack mb="$5">
      <XStack
        px="$4"
        py="$2"
        bg="$color2"
        style={{ alignItems: "center" }}
        gap="$2"
      >
        <Text
          fontSize="$4"
          fontWeight="bold"
          color="$color10"
          textTransform="uppercase"
          letterSpacing={1}
        >
          {category.name}
        </Text>
        <Text fontSize="$3" color="$color8">
          ({products.length})
        </Text>
      </XStack>
      {products.map((p) => (
        <ProductRow
          key={p.id}
          product={p}
          unit={unitMap.get(p.baseUnitId)}
          onPress={() => onProductPress(p)}
        />
      ))}
    </YStack>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ProductsScreen() {
  const products = useProductRepository();
  const units = useUnitRepository();
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<UnitCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Sheets
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showStockSheet, setShowStockSheet] = useState(false);
  const [createBarcode, setCreateBarcode] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [addingStock, setAddingStock] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [stockQty, setStockQty] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Track keyboard so the stock sheet can grow above it
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardWillShow", () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener("keyboardWillHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Barcode scanner
  const scan = useBarcodeScanner({
    onResult(result) {
      if (result.kind === "found") {
        setSelectedProduct(result.product);
        setShowDetailSheet(true);
      } else {
        setCreateBarcode(result.barcode);
        setShowCreateSheet(true);
      }
    },
    onError(msg) {
      setError(msg);
    },
  });

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, unts, cats] = await Promise.all([
        products.findAll(),
        units.findAll(),
        units.findAllCategories(),
      ]);
      setAllProducts(prods);
      setAllUnits(unts);
      setCategories(cats);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [products, units]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // ── Derived data ───────────────────────────────────────────────────────────

  const unitMap = useMemo(
    () => new Map(allUnits.map((u) => [u.id, u])),
    [allUnits],
  );

  const grouped = useMemo(() => {
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const groups = new Map<
      number,
      { category: UnitCategory; products: Product[] }
    >();

    for (const product of allProducts) {
      const unit = unitMap.get(product.baseUnitId);
      const catId = unit?.categoryId ?? -1;
      if (!groups.has(catId)) {
        const cat = catMap.get(catId) ?? { id: catId, name: "Sin categoría" };
        groups.set(catId, { category: cat, products: [] });
      }
      groups.get(catId)!.products.push(product);
    }

    return Array.from(groups.values()).sort((a, b) =>
      a.category.name.localeCompare(b.category.name),
    );
  }, [allProducts, unitMap, categories]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAddManual = () => {
    setCreateBarcode(generateEAN13());
    setShowCreateSheet(true);
  };

  const handleCreate = async (data: CreateProductInput) => {
    setCreating(true);
    setError(null);
    try {
      const created = await products.create(data);
      setSelectedProduct(created);
      setShowCreateSheet(false);
      setShowDetailSheet(true);
      await loadData();
    } catch (e) {
      setError("Error creando producto: " + (e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async (data: CreateProductInput) => {
    if (!selectedProduct) return;
    setEditSaving(true);
    setError(null);
    try {
      const updated = await products.update(selectedProduct.id, data);
      setSelectedProduct(updated);
      setShowEditSheet(false);
      await loadData();
    } catch (e) {
      setError("Error actualizando: " + (e as Error).message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleAddStock = async () => {
    if (!selectedProduct) return;
    const qty = parseFloat(stockQty);
    if (isNaN(qty) || qty <= 0) return;
    setAddingStock(true);
    setError(null);
    try {
      const updated = await products.update(selectedProduct.id, {
        stockBaseQty: selectedProduct.stockBaseQty + qty,
      });
      setSelectedProduct(updated);
      setStockQty("");
      setShowStockSheet(false);
      await loadData();
    } catch (e) {
      setError("Error añadiendo stock: " + (e as Error).message);
    } finally {
      setAddingStock(false);
    }
  };

  const executeDelete = async () => {
    if (!selectedProduct) return;
    setDeleting(true);
    setError(null);
    try {
      await products.delete(selectedProduct.id);
      setShowDetailSheet(false);
      setSelectedProduct(null);
      await loadData();
    } catch (e) {
      setError("Error eliminando: " + (e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeletePress = () => {
    if (!selectedProduct) return;
    Alert.alert(
      "Eliminar producto",
      `¿Estás seguro de eliminar "${selectedProduct.name}"? Esta acción no puede deshacerse.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: executeDelete },
      ],
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <YStack flex={1} bg="$background">
      {/* Action bar */}
      <XStack gap="$3" px="$4" pt="$4" pb="$3">
        <Button flex={1} theme="blue" icon={ScanLine} size="$4" onPress={scan}>
          Escanear
        </Button>
        <Button
          flex={1}
          theme="green"
          icon={Plus}
          size="$4"
          onPress={handleAddManual}
        >
          Agregar
        </Button>
      </XStack>

      {/* Error banner */}
      {error && (
        <XStack px="$4" py="$2" bg="$red2">
          <Text fontSize="$3" color="$red10">
            {error}
          </Text>
        </XStack>
      )}

      {/* Content */}
      {loading ? (
        <YStack
          flex={1}
          style={{ justifyContent: "center", alignItems: "center" }}
          gap="$3"
        >
          <Spinner size="large" color="$blue10" />
          <Text color="$color10">Cargando productos…</Text>
        </YStack>
      ) : grouped.length === 0 ? (
        <YStack
          flex={1}
          style={{ justifyContent: "center", alignItems: "center" }}
          gap="$3"
          p="$8"
        >
          <Package size={56} color="$color8" />
          <Text fontSize="$5" fontWeight="bold" color="$color">
            Sin productos
          </Text>
          <Text color="$color10" style={{ textAlign: "center" }}>
            Agrega tu primer producto con el botón &quot;Agregar&quot; o
            escaneando un código de barras.
          </Text>
        </YStack>
      ) : (
        <ScrollView>
          {grouped.map(({ category, products: catProducts }) => (
            <CategorySection
              key={category.id}
              category={category}
              products={catProducts}
              unitMap={unitMap}
              onProductPress={(p) => {
                setSelectedProduct(p);
                setShowDetailSheet(true);
              }}
            />
          ))}
        </ScrollView>
      )}

      {/* Create product sheet */}
      <Sheet
        open={showCreateSheet}
        onOpenChange={setShowCreateSheet}
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
            <ProductForm
              barcode={createBarcode}
              units={allUnits}
              onSubmit={handleCreate}
              loading={creating}
            />
          </ScrollView>
        </Sheet.Frame>
      </Sheet>

      {/* Product detail sheet */}
      <Sheet
        open={showDetailSheet}
        onOpenChange={setShowDetailSheet}
        modal
        snapPoints={[95]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="rgba(0,0,0,0.5)"
        />
        <Sheet.Frame p="$4" theme={themeName as any}>
          <Sheet.Handle />
          <ScrollView>
            {selectedProduct && (
              <ProductDetail
                product={selectedProduct}
                onEdit={() => setShowEditSheet(true)}
                onAddStock={() => setShowStockSheet(true)}
                onDelete={handleDeletePress}
                deleting={deleting}
              />
            )}
          </ScrollView>
        </Sheet.Frame>
      </Sheet>

      {/* Edit product sheet */}
      <Sheet
        open={showEditSheet}
        onOpenChange={setShowEditSheet}
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
            {selectedProduct && (
              <ProductForm
                product={selectedProduct}
                units={allUnits}
                onSubmit={handleEdit}
                loading={editSaving}
              />
            )}
          </ScrollView>
        </Sheet.Frame>
      </Sheet>

      {/* Stock entry sheet */}
      <Sheet
        open={showStockSheet}
        onOpenChange={setShowStockSheet}
        modal
        snapPoints={[keyboardVisible ? 85 : 50]}
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
            <YStack gap="$3">
              <Text fontSize="$5" fontWeight="bold" color="$color">
                Añadir stock
              </Text>
              {selectedProduct && (
                <Text color="$color10" fontSize="$3">
                  Stock actual: {selectedProduct.stockBaseQty}{" "}
                  {unitMap.get(selectedProduct.baseUnitId)?.symbol ?? "uds"}
                </Text>
              )}
              <YStack gap="$1">
                <Label htmlFor="stock-qty-input" color="$color10" fontSize="$3">
                  Cantidad recibida
                </Label>
                <Input
                  id="stock-qty-input"
                  placeholder="0"
                  value={stockQty}
                  onChangeText={setStockQty}
                  keyboardType="numeric"
                  returnKeyType="done"
                  size="$4"
                />
              </YStack>
              <Button
                theme="green"
                size="$4"
                icon={addingStock ? <Spinner /> : undefined}
                disabled={
                  addingStock ||
                  !stockQty ||
                  isNaN(parseFloat(stockQty)) ||
                  parseFloat(stockQty) <= 0
                }
                onPress={handleAddStock}
              >
                {addingStock ? "Guardando..." : "Confirmar entrada"}
              </Button>
            </YStack>
          </ScrollView>
        </Sheet.Frame>
      </Sheet>
    </YStack>
  );
}
