import { ProductDetail } from "@/components/product/product-detail";
import { ProductForm } from "@/components/product/product-form";
import { BarcodeScannerView } from "@/components/ui/barcode-scanner-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useProductRepository } from "@/hooks/use-product-repository";
import { useUnitRepository } from "@/hooks/use-unit-repository";
import type { CreateProductInput, Product } from "@/models/product";
import type { Unit, UnitCategory } from "@/models/unit";
import { Package, Plus, ScanLine } from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView } from "react-native";
import { Button, Sheet, Spinner, Text, XStack, YStack } from "tamagui";

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
    >
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
  const [showScanner, setShowScanner] = useState(false);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [createBarcode, setCreateBarcode] = useState<string | undefined>();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleBarcodeScanned = useCallback(
    async (barcode: string) => {
      setShowScanner(false);
      setError(null);
      try {
        const found = await products.findByBarcode(barcode);
        if (found) {
          setSelectedProduct(found);
          setShowDetailSheet(true);
        } else {
          setCreateBarcode(barcode);
          setShowCreateSheet(true);
        }
      } catch (e) {
        setError("Error buscando producto: " + (e as Error).message);
      }
    },
    [products],
  );

  const handleAddManual = () => {
    setCreateBarcode(undefined);
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <YStack flex={1} bg="$background">
      {/* Action bar */}
      <XStack gap="$3" px="$4" pt="$4" pb="$3">
        <Button
          flex={1}
          theme="blue"
          icon={ScanLine}
          size="$4"
          onPress={() => setShowScanner(true)}
        >
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

      {/* Scanner sheet */}
      <Sheet
        open={showScanner}
        onOpenChange={setShowScanner}
        modal
        snapPoints={[90]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay />
        <Sheet.Frame theme={themeName as any}>
          <Sheet.Handle />
          <BarcodeScannerView
            onScanned={handleBarcodeScanned}
            onCancel={() => setShowScanner(false)}
          />
        </Sheet.Frame>
      </Sheet>

      {/* Create product sheet */}
      <Sheet
        open={showCreateSheet}
        onOpenChange={setShowCreateSheet}
        modal
        snapPoints={[95]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay />
        <Sheet.Frame theme={themeName as any}>
          <Sheet.Handle />
          <ScrollView>
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
        snapPoints={[60]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay />
        <Sheet.Frame p="$4" theme={themeName as any}>
          <Sheet.Handle />
          {selectedProduct && <ProductDetail product={selectedProduct} />}
        </Sheet.Frame>
      </Sheet>
    </YStack>
  );
}
