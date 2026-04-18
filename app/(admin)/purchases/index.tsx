import { AdminSales } from "@/components/admin/admin-sales";
import { EmptyState } from "@/components/ui/empty-state";
import { ICON_BTN_BG } from "@/constants/colors";
import {
    Bluetooth,
    Building2,
    Check,
    ChevronRight,
    DollarSign,
    Package,
    Plus,
    Receipt,
    ScanLine,
    Search,
    ShoppingBag,
    ShoppingCart,
    Trash2,
    X,
} from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useId, useMemo, useState } from "react";
import {
    Alert,
    FlatList,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    Button,
    Card,
    Input,
    Separator,
    Spinner,
    Text,
    TextArea,
    XStack,
    YStack,
} from "tamagui";

import { ExpensesSection } from "@/components/admin/expenses-section";
import { PeriodSelector } from "@/components/admin/period-selector";
import { SuppliersSection } from "@/components/admin/suppliers-section";
import { ScreenTabs, type TabDef } from "@/components/ui/screen-tabs";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useColors } from "@/hooks/use-colors";
import { usePeriodNavigation } from "@/hooks/use-period-navigation";
import { useProductRepository } from "@/hooks/use-product-repository";
import { usePurchaseRepository } from "@/hooks/use-purchase-repository";
import { useScannerGun } from "@/hooks/use-scanner-gun";
import { useSupplierRepository } from "@/hooks/use-supplier-repository";
import type { Product } from "@/models/product";
import type { Purchase, PurchaseItem } from "@/models/purchase";
import type { Supplier } from "@/models/supplier";
import { weekEndISO } from "@/utils/format";

// ── Sub-tab types ────────────────────────────────────────────────────────────

type PTab = "purchases" | "sales" | "expenses" | "suppliers";

const PURCHASE_TABS: TabDef<PTab>[] = [
  { key: "purchases", label: "Compras", Icon: ShoppingBag },
  { key: "sales", label: "Ventas", Icon: DollarSign },
  { key: "expenses", label: "Gastos", Icon: Receipt },
  { key: "suppliers", label: "Proveedores", Icon: Building2 },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface CartItem {
  productId: number;
  productName: string;
  photoUri: string | null;
  qty: string;
  unitCost: string;
}

// ── CartItemRow ───────────────────────────────────────────────────────────────

function CartItemRow({
  item,
  onQtyChange,
  onCostChange,
  onRemove,
}: {
  item: CartItem;
  onQtyChange: (v: string) => void;
  onCostChange: (v: string) => void;
  onRemove: () => void;
}) {
  const uid = useId();
  const qty = parseFloat(item.qty) || 0;
  const cost = parseFloat(item.unitCost) || 0;

  return (
    <XStack
      px="$3"
      py="$3"
      gap="$3"
      borderBottomWidth={StyleSheet.hairlineWidth}
      borderColor="$borderColor"
      style={{ alignItems: "center" }}
    >
      {/* Photo */}
      {item.photoUri ? (
        <Image
          source={{ uri: item.photoUri }}
          style={thumbStyles.thumb}
          resizeMode="cover"
        />
      ) : (
        <YStack style={thumbStyles.placeholder}>
          <Package size={18} color="$color8" />
        </YStack>
      )}

      {/* Name + inputs */}
      <YStack flex={1} gap="$1.5">
        <Text fontSize="$4" fontWeight="600" color="$color" numberOfLines={1}>
          {item.productName}
        </Text>
        <XStack gap="$2" style={{ alignItems: "center" }}>
          <Input
            id={`${uid}-qty`}
            value={item.qty}
            onChangeText={onQtyChange}
            keyboardType="decimal-pad"
            returnKeyType="next"
            size="$3"
            placeholder="1"
            width={60}
            textAlign="center"
          />
          <Text fontSize="$3" color="$color10">
            ×
          </Text>
          <Input
            id={`${uid}-cost`}
            value={item.unitCost}
            onChangeText={onCostChange}
            keyboardType="decimal-pad"
            returnKeyType="done"
            size="$3"
            placeholder="0.00"
            width={80}
            textAlign="center"
          />
        </XStack>
      </YStack>

      {/* Subtotal + delete */}
      <YStack style={{ alignItems: "flex-end" }} gap="$2">
        <Text fontSize="$5" fontWeight="bold" color="$green10">
          ${(qty * cost).toFixed(2)}
        </Text>
        <Pressable onPress={onRemove} hitSlop={12} style={{ padding: 6 }}>
          <Trash2 size={18} color="$red10" />
        </Pressable>
      </YStack>
    </XStack>
  );
}

// ── PurchasesScreen ───────────────────────────────────────────────────────────

export default function PurchasesScreen() {
  const purchaseRepo = usePurchaseRepository();
  const supplierRepo = useSupplierRepository();
  const productRepo = useProductRepository();
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";
  const c = useColors();
  const [activeTab, setActiveTab] = useState<PTab>("purchases");

  // ── history ──────────────────────────────────────────────────────────────
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const nav = usePeriodNavigation();
  const [periodStats, setPeriodStats] = useState({
    totalSpent: 0,
    totalTransport: 0,
    purchaseCount: 0,
  });

  // ── detail ────────────────────────────────────────────────────────────────
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(
    null,
  );
  const [detailItems, setDetailItems] = useState<PurchaseItem[]>([]);
  const [detailPhotoMap, setDetailPhotoMap] = useState<Record<number, string>>(
    {},
  );
  const [showDetailSheet, setShowDetailSheet] = useState(false);

  // ── create ────────────────────────────────────────────────────────────────
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(
    null,
  );
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [transportCost, setTransportCost] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [creating, setCreating] = useState(false);

  // ── product search ────────────────────────────────────────────────────────
  const [showSearchSheet, setShowSearchSheet] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [allProducts, setAllProducts] = useState<Product[]>([]);

  // ── scanner ───────────────────────────────────────────────────────────────
  const scan = useBarcodeScanner({
    onResult: (result) => {
      if (result.kind === "not-found") {
        Alert.alert(
          "Producto no encontrado",
          `Código: ${result.code}\nRegistra el producto primero en la sección "Productos".`,
        );
        return;
      }
      const p = result.product;
      setCart((prev) => {
        const existingIdx = prev.findIndex((i) => i.productId === p.id);
        if (existingIdx >= 0) {
          const updated = [...prev];
          const current = parseFloat(updated[existingIdx].qty) || 1;
          updated[existingIdx] = {
            ...updated[existingIdx],
            qty: String(current + 1),
          };
          return updated;
        }
        return [
          ...prev,
          {
            productId: p.id,
            productName: p.name,
            photoUri: p.photoUri ?? null,
            qty: "1",
            unitCost: String(p.costPrice),
          },
        ];
      });
    },
    onError: (msg) => Alert.alert("Error", msg),
  });

  // Scanner gun (Bluetooth HID) — looks up product by code and adds to purchase cart
  const gun = useScannerGun({
    onScan: useCallback(
      async (code: string) => {
        const p = await productRepo.findByCode(code);
        if (!p) {
          Alert.alert(
            "Producto no encontrado",
            `Código: ${code}\nRegistra el producto primero en la sección "Productos".`,
          );
          return;
        }
        setCart((prev) => {
          const existingIdx = prev.findIndex((i) => i.productId === p.id);
          if (existingIdx >= 0) {
            const updated = [...prev];
            const current = parseFloat(updated[existingIdx].qty) || 1;
            updated[existingIdx] = {
              ...updated[existingIdx],
              qty: String(current + 1),
            };
            return updated;
          }
          return [
            ...prev,
            {
              productId: p.id,
              productName: p.name,
              photoUri: p.photoUri ?? null,
              qty: "1",
              unitCost: String(p.costPrice),
            },
          ];
        });
      },
      [productRepo],
    ),
  });

  // ── data loading ──────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      let list: Purchase[];
      let stats: {
        totalSpent: number;
        totalTransport: number;
        purchaseCount: number;
      };
      if (nav.period === "day") {
        [list, stats] = await Promise.all([
          purchaseRepo.findByDay(nav.selectedDay),
          purchaseRepo.daySummary(nav.selectedDay),
        ]);
      } else if (nav.period === "week") {
        const wkEnd = weekEndISO(nav.selectedWeekStart);
        [list, stats] = await Promise.all([
          purchaseRepo.findByDateRange(nav.selectedWeekStart, wkEnd),
          purchaseRepo.rangeSummary(nav.selectedWeekStart, wkEnd),
        ]);
      } else if (nav.period === "month") {
        [list, stats] = await Promise.all([
          purchaseRepo.findByMonth(nav.selectedMonth),
          purchaseRepo.monthlySummary(nav.selectedMonth),
        ]);
      } else if (nav.period === "year") {
        [list, stats] = await Promise.all([
          purchaseRepo.findByYear(nav.selectedYear),
          purchaseRepo.rangeSummary(
            `${nav.selectedYear}-01-01`,
            `${nav.selectedYear}-12-31`,
          ),
        ]);
      } else {
        [list, stats] = await Promise.all([
          purchaseRepo.findByDateRange(nav.dateRange.from, nav.dateRange.to),
          purchaseRepo.rangeSummary(nav.dateRange.from, nav.dateRange.to),
        ]);
      }
      setPurchases(list);
      setPeriodStats(stats);
    } finally {
      setLoadingHistory(false);
    }
  }, [
    purchaseRepo,
    nav.period,
    nav.selectedDay,
    nav.selectedMonth,
    nav.selectedYear,
    nav.selectedWeekStart,
    nav.dateRange,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory]),
  );

  const openDetail = async (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    const items = await purchaseRepo.findItemsByPurchaseId(purchase.id);
    setDetailItems(items);
    // Build photo map from current product data
    const photoMap: Record<number, string> = {};
    await Promise.all(
      items.map(async (it) => {
        const product = await productRepo.findById(it.productId);
        if (product?.photoUri) photoMap[it.productId] = product.photoUri;
      }),
    );
    setDetailPhotoMap(photoMap);
    setShowDetailSheet(true);
  };

  const openCreate = async () => {
    const [supplierList, productList] = await Promise.all([
      supplierRepo.findAll(),
      productRepo.findAll(),
    ]);
    setSuppliers(supplierList);
    setAllProducts(productList);
    setSelectedSupplier(null);
    setPurchaseNotes("");
    setTransportCost("");
    setCart([]);
    setShowCreateSheet(true);
  };

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return allProducts;
    const q = searchQuery.toLowerCase().trim();
    return allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
    );
  }, [allProducts, searchQuery]);

  const toggleSearchItem = useCallback((product: Product) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.productId === product.id);
      if (idx >= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          photoUri: product.photoUri ?? null,
          qty: "1",
          unitCost: String(product.costPrice),
        },
      ];
    });
  }, []);

  // ── cart helpers ──────────────────────────────────────────────────────────
  const updateCartQty = (idx: number, val: string) => {
    setCart((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], qty: val };
      return updated;
    });
  };

  const updateCartCost = (idx: number, val: string) => {
    setCart((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], unitCost: val };
      return updated;
    });
  };

  const removeFromCart = (idx: number) =>
    setCart((prev) => prev.filter((_, i) => i !== idx));

  const cartItemsTotal = cart.reduce((sum, item) => {
    const qty = parseFloat(item.qty) || 0;
    const cost = parseFloat(item.unitCost) || 0;
    return sum + qty * cost;
  }, 0);

  const parsedTransport = parseFloat(transportCost) || 0;
  const cartTotal = cartItemsTotal + parsedTransport;

  const canConfirm =
    cart.length > 0 &&
    cart.every(
      (i) =>
        parseFloat(i.qty) > 0 &&
        i.unitCost.length > 0 &&
        parseFloat(i.unitCost) >= 0,
    );

  // ── confirm purchase ──────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!canConfirm || creating) return;
    setCreating(true);
    try {
      await purchaseRepo.create({
        supplierId: selectedSupplier?.id ?? null,
        supplierName: selectedSupplier?.name ?? "Sin proveedor",
        notes: purchaseNotes.trim() || null,
        transportCost: parsedTransport,
        items: cart.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantity: parseFloat(i.qty),
          unitCost: parseFloat(i.unitCost),
        })),
      });
      await loadHistory();
      setShowCreateSheet(false);
    } catch (e) {
      Alert.alert("Error al registrar compra", (e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  // ── formatting helpers ────────────────────────────────────────────────────
  const fmtCurrency = (v: number) =>
    v.toLocaleString("es-VE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-VE", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <YStack flex={1} bg="$background">
      <ScreenTabs
        tabs={PURCHASE_TABS}
        active={activeTab}
        onSelect={setActiveTab}
      />

      {activeTab === "suppliers" && <SuppliersSection />}

      {activeTab === "sales" && <AdminSales />}

      {activeTab === "expenses" && <ExpensesSection />}

      {activeTab === "purchases" && (
        <>
          {/* Period selector + stats */}
          <YStack px="$4" pt="$2" pb="$2" gap="$2">
            <XStack
              style={{ alignItems: "center", justifyContent: "space-between" }}
            >
              <Text fontSize="$3" color="$color10">
                {periodStats.purchaseCount}{" "}
                {periodStats.purchaseCount === 1 ? "compra" : "compras"} · $
                {fmtCurrency(periodStats.totalSpent)}
              </Text>
              <Button
                theme="blue"
                size="$3"
                icon={<Plus />}
                onPress={openCreate}
              >
                Nueva
              </Button>
            </XStack>
            <PeriodSelector nav={nav} />
          </YStack>

          {/* History list */}
          {loadingHistory ? (
            <YStack
              flex={1}
              style={{ alignItems: "center", justifyContent: "center" }}
            >
              <Spinner size="large" />
            </YStack>
          ) : purchases.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag size={48} color="$color8" />}
              title="No hay compras registradas."
              description='Toca "Nueva" para registrar una.'
            />
          ) : (
            <FlatList
              data={purchases}
              keyExtractor={(p) => String(p.id)}
              contentContainerStyle={{
                padding: 16,
                gap: 8,
                paddingBottom: 100,
              }}
              renderItem={({ item }) => (
                <Card
                  pressStyle={{ opacity: 0.9, scale: 0.98 }}
                  onPress={() => openDetail(item)}
                  bg="$color1"
                  borderWidth={1}
                  borderColor="$color4"
                  p="$3"
                >
                  <XStack style={{ alignItems: "center" }} gap="$3">
                    <YStack
                      width={44}
                      height={44}
                      bg="$green4"
                      style={{
                        borderRadius: 22,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ShoppingBag size={20} color="$green10" />
                    </YStack>

                    <YStack flex={1} gap="$0.5">
                      <Text fontSize="$4" fontWeight="600" color="$color">
                        {item.supplierName}
                      </Text>
                      <Text fontSize="$3" color="$color10">
                        {fmtDate(item.createdAt)}
                      </Text>
                      <XStack mt="$0.5">
                        <YStack
                          bg="$green2"
                          px="$2"
                          py="$0.5"
                          style={{ borderRadius: 4 }}
                        >
                          <Text fontSize="$2" color="$green10" fontWeight="600">
                            {item.itemCount}{" "}
                            {item.itemCount === 1 ? "producto" : "productos"}
                          </Text>
                        </YStack>
                      </XStack>
                    </YStack>

                    <XStack style={{ alignItems: "center" }} gap="$1">
                      <Text fontSize="$5" fontWeight="bold" color="$color">
                        ${fmtCurrency(item.total)}
                      </Text>
                      <ChevronRight size={16} color="$color8" />
                    </XStack>
                  </XStack>
                </Card>
              )}
            />
          )}
        </>
      )}

      {/* ── Purchase Detail Modal ─────────────────────────────────────── */}
      <Modal
        visible={showDetailSheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDetailSheet(false)}
      >
        <SafeAreaView
          edges={["top"]}
          style={[pStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          {/* Header */}
          <XStack
            p="$3"
            px="$4"
            style={{ alignItems: "center", justifyContent: "space-between" }}
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <XStack style={{ alignItems: "center" }} gap="$2">
              <ShoppingBag size={18} color="$green10" />
              <Text fontSize={16} fontWeight="700" color="$color">
                Detalle de compra
              </Text>
            </XStack>
            <TouchableOpacity
              onPress={() => setShowDetailSheet(false)}
              hitSlop={8}
              style={pStyles.closeBtn}
            >
              <X size={18} color="$color" />
            </TouchableOpacity>
          </XStack>

          {selectedPurchase && (
            <ScrollView
              contentContainerStyle={{
                padding: 16,
                paddingBottom: 40,
                gap: 12,
              }}
            >
              {/* Supplier + date header */}
              <XStack style={{ alignItems: "center" }} gap="$3">
                <YStack
                  width={52}
                  height={52}
                  bg="$green4"
                  style={{
                    borderRadius: 26,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ShoppingBag size={26} color="$green10" />
                </YStack>
                <YStack flex={1}>
                  <Text fontSize="$6" fontWeight="bold" color="$color">
                    {selectedPurchase.supplierName}
                  </Text>
                  <Text fontSize="$3" color="$color10">
                    {fmtDate(selectedPurchase.createdAt)}
                  </Text>
                </YStack>
              </XStack>

              {selectedPurchase.notes ? (
                <YStack bg="$color2" p="$3" style={{ borderRadius: 8 }}>
                  <Text fontSize="$3" color="$color10">
                    {selectedPurchase.notes}
                  </Text>
                </YStack>
              ) : null}

              <Separator />

              <Text fontSize="$4" fontWeight="600" color="$color">
                Productos recibidos
              </Text>

              {detailItems.map((item) => (
                <XStack
                  key={item.id}
                  style={{ alignItems: "center" }}
                  gap="$3"
                  py="$2"
                  borderBottomWidth={1}
                  borderBottomColor="$color3"
                >
                  {detailPhotoMap[item.productId] ? (
                    <Image
                      source={{ uri: detailPhotoMap[item.productId] }}
                      style={thumbStyles.thumb}
                      resizeMode="cover"
                    />
                  ) : (
                    <YStack style={thumbStyles.placeholder}>
                      <Package size={18} color="$color8" />
                    </YStack>
                  )}
                  <YStack flex={1}>
                    <Text fontSize="$4" fontWeight="500" color="$color">
                      {item.productName}
                    </Text>
                    <Text fontSize="$3" color="$color10">
                      {item.quantity} × ${fmtCurrency(item.unitCost)}
                    </Text>
                  </YStack>
                  <Text fontSize="$4" fontWeight="bold" color="$color">
                    ${fmtCurrency(item.subtotal)}
                  </Text>
                </XStack>
              ))}

              <Separator />

              {selectedPurchase.transportCost > 0 && (
                <XStack
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text fontSize="$3" color="$color10">
                    Transporte
                  </Text>
                  <Text fontSize="$4" color="$color">
                    ${fmtCurrency(selectedPurchase.transportCost)}
                  </Text>
                </XStack>
              )}

              <XStack
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text fontSize="$5" fontWeight="bold" color="$color">
                  Total pagado
                </Text>
                <Text fontSize="$6" fontWeight="bold" color="$green10">
                  ${fmtCurrency(selectedPurchase.total)}
                </Text>
              </XStack>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* ── New Purchase Modal ─────────────────────────────────────────── */}
      <Modal
        visible={showCreateSheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!creating) setShowCreateSheet(false);
        }}
      >
        <SafeAreaView
          edges={["top"]}
          style={[pStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          {/* Header */}
          <XStack
            p="$3"
            px="$4"
            style={{ alignItems: "center", justifyContent: "space-between" }}
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <XStack style={{ alignItems: "center" }} gap="$2">
              <ShoppingBag size={18} color="$blue10" />
              <Text fontSize={16} fontWeight="700" color="$color">
                Nueva Compra
              </Text>
            </XStack>
            <TouchableOpacity
              onPress={() => {
                if (!creating) setShowCreateSheet(false);
              }}
              hitSlop={8}
              style={pStyles.closeBtn}
            >
              <X size={18} color="$color" />
            </TouchableOpacity>
          </XStack>

          {/* Scanner gun connection indicator */}
          {gun.isConnected && (
            <XStack
              bg="$blue2"
              px="$4"
              py="$2"
              style={{ alignItems: "center" }}
              gap="$2"
            >
              <Bluetooth size={16} color="$blue10" />
              <Text fontSize="$3" color="$blue10" fontWeight="600">
                Pistola escaneadora conectada
              </Text>
            </XStack>
          )}

          {/* Scrollable content */}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
          >
            {/* Supplier selector */}
            <YStack gap="$1">
              <Text fontSize="$3" color="$color10" fontWeight="600">
                Proveedor
              </Text>
              <Card
                pressStyle={{ opacity: 0.9, scale: 0.98 }}
                onPress={() => setShowSupplierPicker(true)}
                bg="$color2"
                p="$3"
                style={{ borderRadius: 12 }}
              >
                <XStack
                  style={{
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <XStack style={{ alignItems: "center" }} gap="$2">
                    <Building2 size={18} color="$color10" />
                    <Text
                      fontSize="$4"
                      color={selectedSupplier ? "$color" : "$color8"}
                    >
                      {selectedSupplier?.name ?? "Sin proveedor (opcional)"}
                    </Text>
                  </XStack>
                  <ChevronRight size={16} color="$color8" />
                </XStack>
              </Card>
            </YStack>

            {/* Notes */}
            <YStack gap="$1">
              <Text fontSize="$3" color="$color10" fontWeight="600">
                Notas (opcional)
              </Text>
              <TextArea
                placeholder="Nro. de factura, condiciones, observaciones..."
                value={purchaseNotes}
                onChangeText={setPurchaseNotes}
                numberOfLines={2}
                size="$4"
              />
            </YStack>

            {/* Transport cost */}
            <YStack gap="$1">
              <Text fontSize="$3" color="$color10" fontWeight="600">
                Costo de transporte (opcional)
              </Text>
              <Input
                placeholder="0.00"
                value={transportCost}
                onChangeText={setTransportCost}
                keyboardType="decimal-pad"
                returnKeyType="done"
                size="$4"
              />
            </YStack>

            <Separator />

            {/* Cart header */}
            <XStack
              style={{
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text fontSize="$4" fontWeight="600" color="$color">
                Productos ({cart.length})
              </Text>
              <XStack gap="$2">
                <Button size="$3" icon={<ScanLine />} onPress={scan}>
                  Escanear
                </Button>
                <Button
                  theme="blue"
                  size="$3"
                  icon={<Search />}
                  onPress={() => {
                    setSearchQuery("");
                    setShowSearchSheet(true);
                  }}
                >
                  Buscar
                </Button>
              </XStack>
            </XStack>

            {/* Cart items */}
            {cart.length === 0 ? (
              <YStack style={{ alignItems: "center" }} py="$5" gap="$2">
                <Package size={36} color="$color8" />
                <Text
                  fontSize="$4"
                  color="$color8"
                  style={{ textAlign: "center" }}
                >
                  Escanea o busca los productos recibidos
                </Text>
              </YStack>
            ) : (
              <YStack gap="$3">
                {cart.map((item, idx) => (
                  <CartItemRow
                    key={`${item.productId}-${idx}`}
                    item={item}
                    onQtyChange={(v) => updateCartQty(idx, v)}
                    onCostChange={(v) => updateCartCost(idx, v)}
                    onRemove={() => removeFromCart(idx)}
                  />
                ))}
              </YStack>
            )}
          </ScrollView>

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
              {parsedTransport > 0 && (
                <XStack
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text fontSize="$3" color="$color10">
                    Subtotal productos
                  </Text>
                  <Text fontSize="$4" color="$color">
                    ${fmtCurrency(cartItemsTotal)}
                  </Text>
                </XStack>
              )}
              {parsedTransport > 0 && (
                <XStack
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text fontSize="$3" color="$color10">
                    Transporte
                  </Text>
                  <Text fontSize="$4" color="$color">
                    ${fmtCurrency(parsedTransport)}
                  </Text>
                </XStack>
              )}
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
                  ${fmtCurrency(cartTotal)}
                </Text>
              </XStack>
              <Button
                theme="green"
                size="$6"
                icon={creating ? <Spinner /> : undefined}
                disabled={!canConfirm || creating}
                onPress={handleConfirm}
              >
                Confirmar compra
              </Button>
            </YStack>
          )}
        </SafeAreaView>

        {/* ── Supplier Picker (nested modal) ────────────────────────────── */}
        <Modal
          visible={showSupplierPicker}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowSupplierPicker(false)}
        >
          <SafeAreaView
            edges={["top"]}
            style={[pStyles.modalRoot, { backgroundColor: c.modalBg }]}
          >
            <XStack
              p="$3"
              px="$4"
              style={{ alignItems: "center", justifyContent: "space-between" }}
              borderBottomWidth={1}
              borderBottomColor="$borderColor"
            >
              <XStack style={{ alignItems: "center" }} gap="$2">
                <Building2 size={18} color="$blue10" />
                <Text fontSize={16} fontWeight="700" color="$color">
                  Seleccionar proveedor
                </Text>
              </XStack>
              <TouchableOpacity
                onPress={() => setShowSupplierPicker(false)}
                hitSlop={8}
                style={pStyles.closeBtn}
              >
                <X size={18} color="$color" />
              </TouchableOpacity>
            </XStack>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
              {/* "None" option */}
              <Card
                pressStyle={{ opacity: 0.9, scale: 0.98 }}
                onPress={() => {
                  setSelectedSupplier(null);
                  setShowSupplierPicker(false);
                }}
                bg={selectedSupplier === null ? "$blue2" : "$color1"}
                borderWidth={1}
                borderColor={selectedSupplier === null ? "$blue8" : "$color3"}
                p="$3"
              >
                <Text
                  fontSize="$4"
                  color={selectedSupplier === null ? "$blue10" : "$color10"}
                >
                  Sin proveedor
                </Text>
              </Card>

              {suppliers.map((s) => (
                <Card
                  key={s.id}
                  pressStyle={{ opacity: 0.9, scale: 0.98 }}
                  onPress={() => {
                    setSelectedSupplier(s);
                    setShowSupplierPicker(false);
                  }}
                  bg={selectedSupplier?.id === s.id ? "$blue2" : "$color1"}
                  borderWidth={1}
                  borderColor={
                    selectedSupplier?.id === s.id ? "$blue8" : "$color3"
                  }
                  p="$3"
                >
                  <Text
                    fontSize="$4"
                    fontWeight="500"
                    color={selectedSupplier?.id === s.id ? "$blue10" : "$color"}
                  >
                    {s.name}
                  </Text>
                  {s.contactName ? (
                    <Text fontSize="$3" color="$color10">
                      {s.contactName}
                    </Text>
                  ) : null}
                </Card>
              ))}

              {suppliers.length === 0 && (
                <YStack style={{ alignItems: "center" }} py="$4" gap="$2">
                  <Text
                    fontSize="$4"
                    color="$color8"
                    style={{ textAlign: "center" }}
                  >
                    No hay proveedores.{"\n"}Créalos en la pestaña
                    &quot;Proveedores&quot;.
                  </Text>
                </YStack>
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* ── Product search modal (nested) ──────────────────────────── */}
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
            <XStack
              style={{
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text fontSize="$5" fontWeight="bold" color="$color">
                Buscar producto
              </Text>
              <Button
                size="$3"
                circular
                chromeless
                icon={<X size={18} />}
                onPress={() => {
                  setShowSearchSheet(false);
                  gun.refocus();
                }}
              />
            </XStack>

            <XStack
              bg="$color3"
              borderWidth={1}
              borderColor="$borderColor"
              style={{ borderRadius: 12, alignItems: "center" }}
              px="$3"
              gap="$2"
              height={44}
            >
              <Search size={18} color="$color10" />
              <Input
                flex={1}
                size="$3"
                bg="transparent"
                borderWidth={0}
                color="$color"
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Nombre o código de barras…"
                placeholderTextColor="$color8"
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                autoFocus
                px={0}
              />
              {searchQuery.length > 0 && (
                <Button
                  size="$2"
                  chromeless
                  circular
                  icon={<X size={14} color="$color10" />}
                  onPress={() => setSearchQuery("")}
                />
              )}
            </XStack>

            <XStack
              bg="$blue3"
              style={{ alignItems: "center", borderRadius: 8 }}
              px="$3"
              py="$2"
              gap="$2"
            >
              <ShoppingCart size={14} color="$blue10" />
              <Text fontSize="$2" color="$blue10" fontWeight="600">
                {cart.length} producto{cart.length !== 1 ? "s" : ""}{" "}
                seleccionado
                {cart.length !== 1 ? "s" : ""}
              </Text>
            </XStack>

            <YStack flex={1}>
              <FlatList
                data={searchResults}
                keyExtractor={(item) => String(item.id)}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: p }) => {
                  const inCart = cart.some((c) => c.productId === p.id);
                  return (
                    <Pressable
                      onPress={() => toggleSearchItem(p)}
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                      <XStack
                        px="$3"
                        py="$3"
                        style={{
                          alignItems: "center",
                          borderRadius: inCart ? 10 : 0,
                        }}
                        gap="$3"
                        borderBottomWidth={1}
                        borderColor="$borderColor"
                        bg={inCart ? "$green3" : "transparent"}
                      >
                        {p.photoUri ? (
                          <Image
                            source={{ uri: p.photoUri }}
                            style={{ width: 44, height: 44, borderRadius: 10 }}
                            resizeMode="cover"
                          />
                        ) : (
                          <YStack
                            width={44}
                            height={44}
                            bg="$color3"
                            style={{
                              borderRadius: 10,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Package size={20} color="$color8" />
                          </YStack>
                        )}
                        <YStack flex={1} gap="$0.5">
                          <Text
                            fontSize="$3"
                            fontWeight="600"
                            color="$color"
                            numberOfLines={1}
                          >
                            {p.name}
                          </Text>
                          <XStack gap="$2" style={{ alignItems: "center" }}>
                            <Text fontSize="$2" color="$color10">
                              Stock: {p.stockBaseQty}
                            </Text>
                          </XStack>
                        </YStack>
                        {inCart ? (
                          <XStack
                            px="$2"
                            py="$1.5"
                            bg="$green9"
                            style={{ borderRadius: 8, alignItems: "center" }}
                            gap="$1"
                          >
                            <ShoppingCart size={14} color="white" />
                            <Text fontSize="$2" fontWeight="bold" color="white">
                              Añadido
                            </Text>
                          </XStack>
                        ) : (
                          <XStack
                            px="$2"
                            py="$1.5"
                            bg="$color3"
                            style={{ borderRadius: 8, alignItems: "center" }}
                          >
                            <Text
                              fontSize="$2"
                              fontWeight="500"
                              color="$color10"
                            >
                              Agregar
                            </Text>
                          </XStack>
                        )}
                      </XStack>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <YStack p="$6" style={{ alignItems: "center" }} gap="$2">
                    <Search size={40} color="$color8" />
                    <Text color="$color10" fontSize="$3">
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

            {/* Floating close button */}
            <YStack
              px="$4"
              pb="$5"
              pt="$2"
              bg="$background"
              theme={themeName as any}
            >
              <Button
                size="$5"
                theme="blue"
                icon={Check}
                onPress={() => {
                  setShowSearchSheet(false);
                  gun.refocus();
                }}
              >
                Listo
              </Button>
            </YStack>
          </YStack>
        </Modal>
      </Modal>

      {/* Hidden input for scanner gun (Bluetooth HID keyboard) */}
      <TextInput ref={gun.inputRef} {...gun.inputProps} />
    </YStack>
  );
}

const pStyles = StyleSheet.create({
  modalRoot: { flex: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ICON_BTN_BG,
    alignItems: "center",
    justifyContent: "center",
  },
});

const thumbStyles = StyleSheet.create({
  thumb: { width: 40, height: 40, borderRadius: 8 },
  placeholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: ICON_BTN_BG,
    alignItems: "center",
    justifyContent: "center",
  },
});
