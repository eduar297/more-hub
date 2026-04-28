import { PricingAnalysisSection } from "@/components/admin/pricing-analysis";
import { PurchaseSuggestionsSection } from "@/components/admin/purchase-suggestions";
import { SalesAnalysisSection } from "@/components/admin/sales-analysis";
import { ProductCard } from "@/components/product/product-card";
import { ProductForm } from "@/components/product/product-form";
import type { TabDef } from "@/components/ui/screen-tabs";
import { ScreenTabs } from "@/components/ui/screen-tabs";
import { SearchInput } from "@/components/ui/search-input";
import { ICON_BTN_BG } from "@/constants/colors";
import { useStore } from "@/contexts/store-context";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useColors } from "@/hooks/use-colors";
import { useProductRepository } from "@/hooks/use-product-repository";
import { useScannerGun } from "@/hooks/use-scanner-gun";
import { useUnitRepository } from "@/hooks/use-unit-repository";
import type { CreateProductInput, Product } from "@/models/product";
import type { Unit, UnitCategory } from "@/models/unit";
import { generateEAN13 } from "@/utils/barcode";
import {
  Bluetooth,
  ChevronDown,
  Package,
  Pencil,
  Plus,
  ScanLine,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  X,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Keyboard,
  Modal,
  SectionList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Spinner, Text, XStack, YStack } from "tamagui";

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
          {product.code}
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
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  thumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: ICON_BTN_BG,
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
  { key: "catalog", label: "Productos", Icon: Package },
  { key: "pricing", label: "Precios", Icon: TrendingUp },
  { key: "purchases", label: "Compras", Icon: ShoppingCart },
  { key: "sales", label: "Ventas", Icon: TrendingDown },
];

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ProductsScreen() {
  const products = useProductRepository();
  const units = useUnitRepository();
  const c = useColors();
  const { syncVersion } = useStore();

  const [section, setSection] = useState<Section>("catalog");
  const [searchQuery, setSearchQuery] = useState("");
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<UnitCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(),
  );

  // Product modal
  type ModalMode = "create" | "view";
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("view");
  const [detailEditing, setDetailEditing] = useState(false);
  const [createCode, setCreateCode] = useState<string>("");
  const [scannedCode, setScannedCode] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [addingStock, setAddingStock] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSelectedProduct(null);
    setCreateCode("");
    setScannedCode(false);
    setDetailEditing(false);
  }, []);

  // Barcode scanner
  const scan = useBarcodeScanner({
    onResult(result) {
      if (result.kind === "found") {
        setSelectedProduct(result.product);
        setDetailEditing(false);
        setModalMode("view");
        setModalOpen(true);
      } else {
        setCreateCode(result.code);
        setScannedCode(true);
        setModalMode("create");
        setModalOpen(true);
      }
    },
    onError(msg) {
      setError(msg);
    },
  });

  // Scanner gun (Bluetooth HID) — same logic as camera scanner
  const gun = useScannerGun({
    onScan: useCallback(
      async (code: string) => {
        const found = await products.findByCode(code);
        if (found) {
          setSelectedProduct(found);
          setDetailEditing(false);
          setModalMode("view");
          setModalOpen(true);
        } else {
          setCreateCode(code);
          setScannedCode(true);
          setModalMode("create");
          setModalOpen(true);
        }
      },
      [products],
    ),
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
  }, [products, units, syncVersion]);

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
                p.code.toLowerCase().includes(q),
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
    setCreateCode(generateEAN13());
    setScannedCode(false);
    setModalMode("create");
    setModalOpen(true);
  };

  const handleCreate = async (data: CreateProductInput) => {
    setCreating(true);
    setError(null);
    try {
      const created = await products.create(data);
      setSelectedProduct(created);
      setCreateCode("");
      setScannedCode(false);
      setDetailEditing(false);
      setModalMode("view");
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
      setDetailEditing(false);
      await loadData();
    } catch (e) {
      setError("Error actualizando: " + (e as Error).message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleAddStock = async (qty: number) => {
    if (!selectedProduct) return;
    setAddingStock(true);
    setError(null);
    try {
      const updated = await products.update(selectedProduct.id, {
        stockBaseQty: selectedProduct.stockBaseQty + qty,
      });
      setSelectedProduct(updated);
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
      closeModal();
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

      {/* Scanner gun connection indicator */}
      {gun.isConnected && (
        <XStack
          px="$4"
          py="$2"
          bg="$blue2"
          style={{ alignItems: "center" }}
          gap="$2"
        >
          <Bluetooth size={16} color="$blue10" />
          <Text fontSize="$3" color="$blue10" fontWeight="600">
            Pistola escaneadora conectada
          </Text>
        </XStack>
      )}

      {/* ── Catalog tab ─────────────────────────────────────────────── */}
      {section === "catalog" && (
        <>
          {/* Action bar */}
          <XStack gap="$3" px="$4" pt="$2" pb="$3">
            <Button flex={1} icon={ScanLine} size="$4" onPress={scan}>
              Escanear
            </Button>
            <Button
              flex={1}
              theme="blue"
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
                    setDetailEditing(false);
                    setModalMode("view");
                    setModalOpen(true);
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
      {section === "sales" && (
        <SalesAnalysisSection onPricesUpdated={loadData} />
      )}

      {/* ── Product modal ── */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <SafeAreaView
              edges={["top", "bottom"]}
              style={[pStyles.modalRoot, { backgroundColor: c.modalBg }]}
            >
              {/* ── Header ── */}
              <XStack
                p="$3"
                px="$4"
                items="center"
                justify="space-between"
                borderBottomWidth={1}
                borderBottomColor="$borderColor"
              >
                <XStack items="center" gap="$2" flex={1}>
                  {modalMode === "create" ? (
                    <Plus size={18} color={c.blue as any} />
                  ) : (
                    <Package size={18} color={c.blue as any} />
                  )}
                  <Text
                    fontSize={16}
                    fontWeight="700"
                    color="$color"
                    numberOfLines={1}
                    style={{ flexShrink: 1 }}
                  >
                    {modalMode === "create"
                      ? "Nuevo producto"
                      : selectedProduct?.name ?? "Detalle"}
                  </Text>
                </XStack>
                <XStack items="center" gap="$3">
                  {/* Edit toggle (only in view mode) */}
                  {modalMode === "view" && selectedProduct && (
                    <TouchableOpacity
                      onPress={() => setDetailEditing((v) => !v)}
                      hitSlop={8}
                      style={[
                        pStyles.headerBtn,
                        detailEditing && { backgroundColor: c.blue + "20" },
                      ]}
                    >
                      <Pencil
                        size={18}
                        color={
                          detailEditing ? (c.blue as any) : (c.text as any)
                        }
                      />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={closeModal}
                    hitSlop={8}
                    style={pStyles.headerBtn}
                  >
                    <X size={18} color={c.text as any} />
                  </TouchableOpacity>
                </XStack>
              </XStack>

              {/* ── Create ── */}
              {modalMode === "create" && (
                <ProductForm
                  key={createCode}
                  code={createCode}
                  scanned={scannedCode}
                  units={allUnits}
                  onSubmit={handleCreate}
                  loading={creating}
                  onCancel={closeModal}
                />
              )}

              {/* ── View / Edit (ProductCard) ── */}
              {modalMode === "view" && selectedProduct && (
                <ProductCard
                  product={selectedProduct}
                  units={allUnits}
                  editing={detailEditing}
                  unitSymbol={unitMap.get(selectedProduct.baseUnitId)?.symbol}
                  onSave={handleEdit}
                  onAddStock={handleAddStock}
                  onDelete={handleDeletePress}
                  saving={editSaving}
                  addingStock={addingStock}
                  deleting={deleting}
                />
              )}
            </SafeAreaView>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Hidden input for scanner gun (Bluetooth HID keyboard) */}
      <TextInput ref={gun.inputRef} {...gun.inputProps} />
    </YStack>
  );
}

const pStyles = StyleSheet.create({
  modalRoot: { flex: 1 },
  headerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ICON_BTN_BG,
    alignItems: "center",
    justifyContent: "center",
  },
});
