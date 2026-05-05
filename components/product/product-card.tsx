import { BarcodeDisplay } from "@/components/product/barcode-display";
import {
    PriceTierEditorRow,
    PriceTiersEditor,
    normalizePriceTierRows,
    validatePriceTierRows,
} from "@/components/product/price-tiers-editor";
import { PhotoPicker } from "@/components/ui/photo-picker";
import { UnitPicker } from "@/components/ui/unit-picker";
import { useColors } from "@/hooks/use-colors";
import type { CreateProductInput, Product, SaleMode } from "@/models/product";
import type { Unit } from "@/models/unit";
import {
    Eye,
    EyeOff,
    Package,
    PackagePlus,
    Trash2,
} from "@tamagui/lucide-icons";
import { useEffect, useId, useState } from "react";
import { Image, ScrollView, Switch, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import {
    Button,
    Input,
    Label,
    Separator,
    Spinner,
    Text,
    XStack,
    YStack,
} from "tamagui";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProductCardProps {
  product: Product;
  units: Unit[];
  editing: boolean;
  unitSymbol?: string;
  onSave: (data: CreateProductInput) => void;
  onAddStock: (qty: number) => void;
  onDelete: () => void;
  saving?: boolean;
  addingStock?: boolean;
  deleting?: boolean;
}

// ── Detail row (read-only) ───────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <XStack
      py="$2.5"
      style={{ justifyContent: "space-between", alignItems: "center" }}
    >
      <Text color="$color10" fontSize="$3">
        {label}
      </Text>
      <Text color="$color" fontSize="$4" fontWeight="500">
        {value}
      </Text>
    </XStack>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function ProductCard({
  product,
  units,
  editing,
  unitSymbol,
  onSave,
  onAddStock,
  onDelete,
  saving,
  addingStock,
  deleting,
}: ProductCardProps) {
  const uid = useId();
  const c = useColors();

  // Edit state — reset when product changes or editing toggles off
  const [name, setName] = useState(product.name);
  const [costPrice, setCostPrice] = useState(String(product.costPrice));
  const [salePrice, setSalePrice] = useState(String(product.salePrice));
  const [stock, setStock] = useState(String(product.stockBaseQty));
  const [unitId, setUnitId] = useState(String(product.baseUnitId));
  const [saleMode, setSaleMode] = useState<SaleMode>(product.saleMode);
  const [photoUri, setPhotoUri] = useState<string | null>(
    product.photoUri ?? null,
  );
  const [visible, setVisible] = useState(product.visible);
  const [addStockQty, setAddStockQty] = useState("");
  const [removeStockQty, setRemoveStockQty] = useState("");
  const [details, setDetails] = useState(product.details ?? "");
  const [tierRows, setTierRows] = useState<PriceTierEditorRow[]>(
    product.priceTiers?.length
      ? product.priceTiers.map((tier) => ({
          id: tier.id,
          minQty: String(tier.minQty),
          maxQty: tier.maxQty === null ? "" : String(tier.maxQty),
          price: String(tier.price),
        }))
      : [],
  );

  // Reset form fields when switching into edit mode or product changes
  useEffect(() => {
    setName(product.name);
    setCostPrice(String(product.costPrice));
    setSalePrice(String(product.salePrice));
    setStock(String(product.stockBaseQty));
    setUnitId(String(product.baseUnitId));
    setSaleMode(product.saleMode);
    setPhotoUri(product.photoUri ?? null);
    setVisible(product.visible);
    setAddStockQty("");
    setRemoveStockQty("");
    setDetails(product.details ?? "");
    setTierRows(
      product.priceTiers?.length
        ? product.priceTiers.map((tier) => ({
            id: tier.id,
            minQty: String(tier.minQty),
            maxQty: tier.maxQty === null ? "" : String(tier.maxQty),
            price: String(tier.price),
          }))
        : [],
    );
  }, [product, editing]);

  const parsedCost = parseFloat(costPrice);
  const parsedSale = parseFloat(salePrice);
  const parsedStock = parseFloat(stock);
  const tierError = validatePriceTierRows(tierRows);
  const normalizedTierRows = normalizePriceTierRows(tierRows);

  const canSave =
    name.trim().length > 0 &&
    !isNaN(parsedCost) &&
    parsedCost > 0 &&
    !isNaN(parsedSale) &&
    parsedSale > 0 &&
    !isNaN(parsedStock) &&
    parsedStock >= 0 &&
    unitId.length > 0 &&
    !tierError;

  const parsedAddStockQty = parseFloat(addStockQty);
  const parsedRemoveStockQty = parseFloat(removeStockQty);
  const canAddStock = !isNaN(parsedAddStockQty) && parsedAddStockQty > 0;
  const canRemoveStock =
    !isNaN(parsedRemoveStockQty) && parsedRemoveStockQty > 0;

  const hasTierChanges =
    normalizedTierRows.length !== (product.priceTiers?.length ?? 0) ||
    normalizedTierRows.some((tier, index) => {
      const existing = product.priceTiers?.[index];
      return (
        !existing ||
        existing.minQty !== tier.minQty ||
        existing.maxQty !== tier.maxQty ||
        existing.price !== tier.price
      );
    });

  const hasChanges =
    name !== product.name ||
    costPrice !== String(product.costPrice) ||
    salePrice !== String(product.salePrice) ||
    stock !== String(product.stockBaseQty) ||
    unitId !== String(product.baseUnitId) ||
    saleMode !== product.saleMode ||
    photoUri !== (product.photoUri ?? null) ||
    visible !== product.visible ||
    details !== (product.details ?? "") ||
    hasTierChanges;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      code: product.code,
      costPrice: parsedCost,
      salePrice: parsedSale,
      visible,
      stockBaseQty: parsedStock,
      saleMode,
      baseUnitId: parseInt(unitId, 10),
      photoUri,
      details: details.trim() || null,
      priceTiers: normalizedTierRows.length > 0 ? normalizedTierRows : [],
    });
  };

  const margin =
    product.costPrice > 0
      ? (
          ((product.salePrice - product.costPrice) / product.salePrice) *
          100
        ).toFixed(1)
      : null;

  // ── READ-ONLY VIEW ─────────────────────────────────────────────────────────

  if (!editing) {
    return (
      <View style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16 }}
        >
          <YStack gap="$2">
            {/* Photo */}
            {product.photoUri && (
              <Image
                source={{ uri: product.photoUri }}
                style={{
                  width: "100%",
                  height: 220,
                  borderRadius: 14,
                }}
                resizeMode="cover"
              />
            )}

            {/* Code (barcode + QR) */}
            <YStack bg="$color2" style={{ borderRadius: 14 }} p="$3" gap="$2">
              <XStack gap="$2.5">
                <YStack
                  flex={2}
                  bg="white"
                  style={{
                    borderRadius: 10,
                    overflow: "hidden",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  py="$2"
                >
                  <BarcodeDisplay
                    code={product.code}
                    width={180}
                    barHeight={48}
                    showText={false}
                  />
                </YStack>
                <YStack
                  flex={1}
                  bg="white"
                  style={{
                    borderRadius: 10,
                    overflow: "hidden",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  p="$2"
                >
                  <QRCode
                    value={product.code}
                    size={46}
                    backgroundColor="white"
                  />
                </YStack>
              </XStack>
              <Text
                fontSize="$2"
                color="$color10"
                letterSpacing={2}
                style={{ textAlign: "center" }}
              >
                {product.code}
              </Text>
            </YStack>

            {/* Info rows */}
            <YStack
              bg="$color2"
              style={{ borderRadius: 14, overflow: "hidden" }}
              px="$4"
            >
              <InfoRow
                label="Precio costo"
                value={`$${product.costPrice.toFixed(2)}`}
              />
              <Separator />
              <InfoRow
                label="Precio venta"
                value={`$${product.salePrice.toFixed(2)}`}
              />
              <Separator />
              <InfoRow label="Margen" value={margin ? `${margin}%` : "—"} />
              {product.priceTiers && product.priceTiers.length > 0 ? (
                <>
                  <Separator />
                  <YStack py="$2">
                    <Text color="$color10" fontSize="$3" fontWeight="600">
                      Precios por cantidad
                    </Text>
                    {product.priceTiers.map((tier) => (
                      <Text
                        key={`${tier.minQty}-${tier.maxQty ?? "open"}-${
                          tier.price
                        }`}
                        color="$color"
                        fontSize="$2"
                      >
                        {tier.minQty}
                        {tier.maxQty !== null ? `–${tier.maxQty}` : "+"}: $
                        {tier.price.toFixed(2)}
                      </Text>
                    ))}
                  </YStack>
                </>
              ) : null}
            </YStack>

            {product.details ? (
              <YStack
                bg="$color2"
                style={{ borderRadius: 14, overflow: "hidden" }}
                px="$4"
                py="$3"
              >
                <Text color="$color10" fontSize="$3" mb="$1">
                  Detalles
                </Text>
                <Text color="$color" fontSize="$3" lineHeight={20}>
                  {product.details}
                </Text>
              </YStack>
            ) : null}

            <YStack
              bg="$color2"
              style={{ borderRadius: 14, overflow: "hidden" }}
              px="$4"
            >
              <InfoRow
                label="Stock disponible"
                value={`${product.stockBaseQty} ${unitSymbol ?? "uds"}`}
              />
              <Separator />
              <InfoRow
                label="Modo de venta"
                value={product.saleMode === "UNIT" ? "Por unidad" : "Variable"}
              />
              <Separator />
              <InfoRow
                label="Visible"
                value={product.visible ? "Sí" : "No — oculto"}
              />
            </YStack>

            {/* Delete */}
          </YStack>
        </ScrollView>

        {/* ── Fixed footer ───────────────────────────────── */}
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: c.border,
            backgroundColor: c.modalBg,
          }}
        >
          <Button
            theme="red"
            variant="outlined"
            size="$3.5"
            icon={deleting ? <Spinner size="small" /> : <Trash2 size={16} />}
            onPress={onDelete}
            disabled={deleting}
          >
            {deleting ? "Eliminando..." : "Eliminar producto"}
          </Button>
        </View>
      </View>
    );
  }

  // ── EDIT VIEW ──────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ padding: 16, paddingBottom: 180 }}
        style={{ flex: 1 }}
      >
        <YStack gap="$3">
          {/* Photo */}
          <YStack gap="$1">
            <Label color="$color10" fontSize="$3">
              Foto
            </Label>
            <PhotoPicker uri={photoUri} onChange={setPhotoUri} />
          </YStack>

          {/* Code (read-only) */}
          <YStack bg="$color2" style={{ borderRadius: 14 }} p="$3" gap="$2">
            <XStack gap="$2">
              <YStack
                flex={2}
                bg="white"
                style={{
                  borderRadius: 10,
                  overflow: "hidden",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                py="$2"
              >
                <BarcodeDisplay
                  code={product.code}
                  width={170}
                  barHeight={40}
                  showText={false}
                />
              </YStack>
              <YStack
                flex={1}
                bg="white"
                style={{
                  borderRadius: 10,
                  overflow: "hidden",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                p="$2"
              >
                <QRCode
                  value={product.code}
                  size={64}
                  backgroundColor="white"
                />
              </YStack>
            </XStack>
            <Text fontSize="$1" color="$color8" style={{ textAlign: "center" }}>
              {product.code} — no editable
            </Text>
          </YStack>

          {/* Name */}
          <YStack gap="$1">
            <Label htmlFor={`${uid}-name`} color="$color10" fontSize="$3">
              Nombre
            </Label>
            <Input
              id={`${uid}-name`}
              placeholder="Nombre del producto"
              value={name}
              onChangeText={setName}
              returnKeyType="next"
              size="$4"
            />
          </YStack>

          {/* Details */}
          <YStack gap="$1">
            <Label htmlFor={`${uid}-details`} color="$color10" fontSize="$3">
              Detalles
            </Label>
            <Input
              id={`${uid}-details`}
              placeholder="Descripción, ingredientes, notas…"
              value={details}
              onChangeText={setDetails}
              multiline
              numberOfLines={3}
              size="$4"
              style={{ minHeight: 80 }}
            />
          </YStack>

          {/* Prices side-by-side */}
          <XStack gap="$3">
            <YStack flex={1} gap="$1">
              <Label htmlFor={`${uid}-cost`} color="$color10" fontSize="$3">
                Precio costo
              </Label>
              <Input
                id={`${uid}-cost`}
                placeholder="0.00"
                value={costPrice}
                onChangeText={setCostPrice}
                keyboardType="decimal-pad"
                returnKeyType="next"
                size="$4"
              />
            </YStack>
            <YStack flex={1} gap="$1">
              <Label htmlFor={`${uid}-sale`} color="$color10" fontSize="$3">
                Precio venta
              </Label>
              <Input
                id={`${uid}-sale`}
                placeholder="0.00"
                value={salePrice}
                onChangeText={setSalePrice}
                keyboardType="decimal-pad"
                returnKeyType="done"
                size="$4"
              />
            </YStack>
          </XStack>

          {/* Stock */}
          <YStack gap="$1">
            <Label htmlFor={`${uid}-stock`} color="$color10" fontSize="$3">
              Stock actual
            </Label>
            <Input
              id={`${uid}-stock`}
              placeholder="0"
              value={stock}
              onChangeText={setStock}
              keyboardType="decimal-pad"
              returnKeyType="done"
              size="$4"
            />
          </YStack>

          {/* Unit */}
          <YStack gap="$1">
            <Label color="$color10" fontSize="$3">
              Unidad base
            </Label>
            <UnitPicker units={units} value={unitId} onChange={setUnitId} />
          </YStack>

          {/* Sale mode */}
          <YStack gap="$1">
            <Label color="$color10" fontSize="$3">
              Modo de venta
            </Label>
            <XStack gap="$2">
              <Button
                flex={1}
                theme={saleMode === "UNIT" ? "blue" : undefined}
                onPress={() => setSaleMode("UNIT")}
                size="$3.5"
              >
                Por unidad
              </Button>
              <Button
                flex={1}
                theme={saleMode === "VARIABLE" ? "blue" : undefined}
                onPress={() => setSaleMode("VARIABLE")}
                size="$3.5"
              >
                Variable
              </Button>
            </XStack>
          </YStack>

          <PriceTiersEditor
            rows={tierRows}
            onChange={setTierRows}
            error={tierError}
          />

          {/* Visible toggle */}
          <XStack
            gap="$3"
            style={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <XStack gap="$2" style={{ alignItems: "center", flex: 1 }}>
              {visible ? (
                <Eye size={18} color="$green10" />
              ) : (
                <EyeOff size={18} color="$color8" />
              )}
              <Label
                color="$color10"
                fontSize="$3"
                style={{ margin: 0, lineHeight: 18 }}
              >
                Visible para vendedores
              </Label>
            </XStack>
            <Switch
              value={visible}
              onValueChange={setVisible}
              trackColor={{ false: c.border, true: c.blue }}
            />
          </XStack>

          {/* ── Stock adjustments ── */}
          <Separator my="$1" />
          <YStack gap="$3">
            <Text fontSize="$4" fontWeight="600" color="$color">
              Ajustes de stock
            </Text>
            <Text fontSize="$2" color="$color10" ml="auto">
              Actual: {product.stockBaseQty} {unitSymbol ?? "uds"}
            </Text>

            {/* Add stock */}
            <YStack gap="$2">
              <XStack items="center" gap="$2">
                <PackagePlus size={16} color="$green10" />
                <Text fontSize="$3" fontWeight="500" color="$color">
                  Añadir stock
                </Text>
              </XStack>
              <XStack gap="$2" items="center">
                <Input
                  flex={1}
                  placeholder="Cantidad a añadir"
                  value={addStockQty}
                  onChangeText={setAddStockQty}
                  keyboardType="numeric"
                  returnKeyType="done"
                  size="$4"
                />
                <Button
                  theme="green"
                  size="$4"
                  icon={
                    addingStock ? (
                      <Spinner size="small" />
                    ) : (
                      <Package size={16} />
                    )
                  }
                  disabled={addingStock || !canAddStock}
                  onPress={() => canAddStock && onAddStock(parsedAddStockQty)}
                >
                  {addingStock ? "..." : "Añadir"}
                </Button>
              </XStack>
            </YStack>

            {/* Remove stock */}
            <YStack gap="$2">
              <XStack items="center" gap="$2">
                <Package size={16} color="$red10" />
                <Text fontSize="$3" fontWeight="500" color="$color">
                  Eliminar stock
                </Text>
              </XStack>
              <XStack gap="$2" items="center">
                <Input
                  flex={1}
                  placeholder="Cantidad a eliminar"
                  value={removeStockQty}
                  onChangeText={setRemoveStockQty}
                  keyboardType="numeric"
                  returnKeyType="done"
                  size="$4"
                />
                <Button
                  theme="red"
                  size="$4"
                  icon={
                    addingStock ? (
                      <Spinner size="small" />
                    ) : (
                      <Package size={16} />
                    )
                  }
                  disabled={addingStock || !canRemoveStock}
                  onPress={() =>
                    canRemoveStock && onAddStock(-parsedRemoveStockQty)
                  }
                >
                  {addingStock ? "..." : "Eliminar"}
                </Button>
              </XStack>
            </YStack>
          </YStack>
        </YStack>
      </ScrollView>

      {/* ── Fixed footer ───────────────────────────────── */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: c.border,
          backgroundColor: c.modalBg,
        }}
      >
        {/* Save */}
        <Button
          size="$4"
          theme="blue"
          disabled={saving || !canSave || !hasChanges}
          opacity={saving || !canSave || !hasChanges ? 0.5 : 1}
          onPress={handleSave}
          icon={saving ? <Spinner /> : undefined}
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </Button>
      </View>
    </View>
  );
}
