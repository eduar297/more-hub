import { PricingAnalysisSection } from "@/components/admin/pricing-analysis";
import { PurchaseSuggestionsSection } from "@/components/admin/purchase-suggestions";
import { SalesAnalysisSection } from "@/components/admin/sales-analysis";
import { ProductDetail } from "@/components/product/product-detail";
import { ProductForm } from "@/components/product/product-form";
import type { TabDef } from "@/components/ui/screen-tabs";
import { ScreenTabs } from "@/components/ui/screen-tabs";
import { SearchInput } from "@/components/ui/search-input";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useProductRepository } from "@/hooks/use-product-repository";
import { useUnitRepository } from "@/hooks/use-unit-repository";
import type { CreateProductInput, Product } from "@/models/product";
import type { Unit, UnitCategory } from "@/models/unit";
import { generateEAN13 } from "@/utils/barcode";
import {
  ChevronDown,
  Package,
  Plus,
  ScanLine,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Keyboard,
  ScrollView,
  SectionList,
  StyleSheet,
} from "react-native";
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
  const margin =
    product.costPrice > 0
      ? Math.round(
          ((product.salePrice - product.costPrice) / product.salePrice) * 100,
        )
      : null;
  const inStock = product.stockBaseQty > 0;
  return (
    <XStack
      px="$4"
      py="$2"
      bg="$background"
      pressStyle={{ bg: "$color2" }}
      onPress={onPress}
      borderBottomWidth={1}
      borderColor="$borderColor"
      style={{ alignItems: "center" }}
      gap="$3"
    >
      {product.photoUri ? (
        <Image
          source={{ uri: product.photoUri }}
          style={rowStyles.thumb}
          resizeMode="cover"
        />
      ) : (
        <YStack style={rowStyles.thumbPlaceholder}>
          <Package size={18} color="$color8" />
        </YStack>
      )}

      <YStack flex={1} gap="$0.5">
        <Text fontSize="$3" fontWeight="bold" color="$color" numberOfLines={1}>
          {product.name}
        </Text>
        <Text fontSize="$1" color="$color10" numberOfLines={1}>
          {product.barcode}
        </Text>
      </YStack>

      <YStack style={{ alignItems: "flex-end" }} gap="$0.5">
        <Text fontSize="$3" color="$blue10" fontWeight="600">
          ${product.salePrice.toFixed(2)}
        </Text>
        {margin !== null && (
          <Text fontSize="$1" color="$green10">
            Margen {margin}%
          </Text>
        )}
        <Text
          fontSize="$1"
          color={inStock ? "$color10" : "$red10"}
          fontWeight={inStock ? "400" : "600"}
        >
          {inStock
            ? `Stock: ${product.stockBaseQty} ${unit?.symbol ?? "—"}`
            : "Sin stock"}
        </Text>
      </YStack>
    </XStack>
  );
}

const rowStyles = StyleSheet.create({
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  thumbPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "rgba(128,128,128,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
});

// ── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  name,
  count,
  isCollapsed,
  onToggle,
}: {
  name: string;
  count: number;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <XStack
      px="$4"
      py="$2"
      bg="$color2"
      borderBottomWidth={1}
      borderColor="$borderColor"
      style={{ alignItems: "center" }}
      gap="$2"
      pressStyle={{ bg: "$color3" }}
      onPress={onToggle}
    >
      <Text
        flex={1}
        fontSize="$2"
        fontWeight="bold"
        color="$color10"
        textTransform="uppercase"
        letterSpacing={1}
      >
        {name}
      </Text>
      <Text fontSize="$2" color="$color8">
        {count}
      </Text>
      <ChevronDown
        size={16}
        color="$color8"
        style={{
          transform: [{ rotate: isCollapsed ? "-90deg" : "0deg" }],
        }}
      />
    </XStack>
  );
}

// ── Tab definitions ──────────────────────────────────────────────────────────

type Section = "catalog" | "pricing" | "purchases" | "sales";

const SECTIONS: TabDef<Section>[] = [
  { key: "catalog", label: "Catálogo", Icon: Package },
  { key: "pricing", label: "Precios", Icon: TrendingUp },
  { key: "purchases", label: "Compras", Icon: ShoppingCart },
  { key: "sales", label: "Ventas", Icon: TrendingDown },
];

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ProductsScreen() {
  const products = useProductRepository();
  const units = useUnitRepository();
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";

  const [section, setSection] = useState<Section>("catalog");
  const [searchQuery, setSearchQuery] = useState("");
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<UnitCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(),
  );

  // Sheets
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showStockSheet, setShowStockSheet] = useState(false);
  const [createBarcode, setCreateBarcode] = useState<string>("");
  const [scannedBarcode, setScannedBarcode] = useState(false);
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
        setScannedBarcode(true);
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

  const sections = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return grouped
      .map(({ category, products: catProducts }) => {
        const filtered = q
          ? catProducts.filter(
              (p) =>
                p.name.toLowerCase().includes(q) ||
                p.barcode.toLowerCase().includes(q),
            )
          : catProducts;
        const isCollapsed = collapsedSections.has(category.name);
        return {
          title: category.name,
          count: filtered.length,
          data: isCollapsed ? [] : filtered,
        };
      })
      .filter((s) => s.count > 0);
  }, [grouped, searchQuery, collapsedSections]);

  const toggleSection = useCallback((title: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAddManual = () => {
    setCreateBarcode(generateEAN13());
    setScannedBarcode(false);
    setShowCreateSheet(true);
  };

  const handleCreate = async (data: CreateProductInput) => {
    setCreating(true);
    setError(null);
    try {
      const created = await products.create(data);
      setSelectedProduct(created);
      setShowCreateSheet(false);
      setCreateBarcode("");
      setScannedBarcode(false);
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
      setShowDetailSheet(true);
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
      <ScreenTabs tabs={SECTIONS} active={section} onSelect={setSection} />

      {/* Error banner */}
      {error && (
        <XStack px="$4" py="$2" bg="$red2">
          <Text fontSize="$3" color="$red10">
            {error}
          </Text>
        </XStack>
      )}

      {/* ── Catalog tab ─────────────────────────────────────────────── */}
      {section === "catalog" && (
        <>
          {/* Action bar */}
          <XStack gap="$3" px="$4" pt="$2" pb="$3">
            <Button
              flex={1}
              theme="blue"
              icon={ScanLine}
              size="$4"
              onPress={scan}
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

          {/* Search */}
          <YStack px="$4" pb="$2">
            <SearchInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar por nombre o código…"
            />
          </YStack>

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
            <SectionList
              sections={sections}
              keyExtractor={(item) => String(item.id)}
              renderSectionHeader={({ section: s }) => (
                <SectionHeader
                  name={s.title}
                  count={s.count}
                  isCollapsed={collapsedSections.has(s.title)}
                  onToggle={() => toggleSection(s.title)}
                />
              )}
              renderItem={({ item: p }) => (
                <ProductRow
                  product={p}
                  unit={unitMap.get(p.baseUnitId)}
                  onPress={() => {
                    setSelectedProduct(p);
                    setShowDetailSheet(true);
                  }}
                />
              )}
              SectionSeparatorComponent={null}
              stickySectionHeadersEnabled={false}
            />
          )}
        </>
      )}

      {/* ── Pricing tab ─────────────────────────────────────────────── */}
      {section === "pricing" && (
        <PricingAnalysisSection onPricesUpdated={loadData} />
      )}

      {/* ── Purchases tab ───────────────────────────────────────────── */}
      {section === "purchases" && <PurchaseSuggestionsSection />}

      {/* ── Sales analysis tab ──────────────────────────────────────── */}
      {section === "sales" && <SalesAnalysisSection />}

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
              key={createBarcode}
              barcode={createBarcode}
              scanned={scannedBarcode}
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
        onOpenChange={(open) => {
          setShowDetailSheet(open);
          if (!open) setSelectedProduct(null);
        }}
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
                key={selectedProduct.id}
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
