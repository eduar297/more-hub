import { BarcodeDisplay } from "@/components/product/barcode-display";
import type { Product } from "@/models/product";
import { PackagePlus, Pencil, Trash2 } from "@tamagui/lucide-icons";
import { Image } from "react-native";
import {
    Button,
    Card,
    Separator,
    Spinner,
    Text,
    XStack,
    YStack,
} from "tamagui";

export interface ProductDetailProps {
  product: Product;
  onEdit?: () => void;
  onAddStock?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <XStack
      py="$2"
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

export function ProductDetail({
  product,
  onEdit,
  onAddStock,
  onDelete,
  deleting,
}: ProductDetailProps) {
  return (
    <Card
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$4"
      p="$4"
      bg="$background"
    >
      <YStack gap="$1">
        {/* Product photo */}
        {product.photoUri && (
          <Image
            source={{ uri: product.photoUri }}
            style={{
              width: "100%",
              height: 200,
              borderRadius: 10,
              marginBottom: 8,
            }}
            resizeMode="cover"
          />
        )}

        <Text fontSize="$7" fontWeight="bold" color="$color" mb="$2">
          {product.name}
        </Text>

        {/* Barcode visual */}
        {/^\d{13}$/.test(product.barcode) && (
          <YStack
            bg="$color1"
            style={{ borderRadius: 12, alignItems: "center" }}
            p="$3"
            gap="$2"
            mb="$2"
          >
            <BarcodeDisplay
              barcode={product.barcode}
              width={240}
              barHeight={50}
            />
            <Text fontSize="$2" color="$color10" letterSpacing={2}>
              {product.barcode}
            </Text>
          </YStack>
        )}

        <Separator />

        <DetailRow label="Código de barras" value={product.barcode} />
        <Separator />
        <DetailRow
          label="Precio costo"
          value={`$${product.costPrice.toFixed(2)}`}
        />
        <Separator />
        <DetailRow
          label="Precio venta"
          value={`$${product.salePrice.toFixed(2)}`}
        />
        <Separator />
        <DetailRow
          label="Margen"
          value={
            product.costPrice > 0
              ? `${(((product.salePrice - product.costPrice) / product.salePrice) * 100).toFixed(1)}%`
              : "—"
          }
        />
        <Separator />
        <DetailRow
          label="Stock disponible"
          value={`${product.stockBaseQty} uds`}
        />
        <Separator />
        <DetailRow
          label="Modo de venta"
          value={product.saleMode === "UNIT" ? "Por unidad" : "Variable"}
        />
        <Separator />
        <DetailRow
          label="Visible"
          value={product.visible ? "Sí" : "No — oculto"}
        />

        {/* Action buttons */}
        {(onEdit || onAddStock || onDelete) && (
          <YStack gap="$2" mt="$4">
            <Separator mb="$2" />
            {onAddStock && (
              <Button
                theme="green"
                icon={PackagePlus}
                size="$4"
                onPress={onAddStock}
              >
                Añadir stock
              </Button>
            )}
            {onEdit && (
              <Button theme="blue" icon={Pencil} size="$4" onPress={onEdit}>
                Editar producto
              </Button>
            )}
            {onDelete && (
              <Button
                theme="red"
                icon={
                  deleting ? <Spinner size="small" /> : <Trash2 size={16} />
                }
                size="$4"
                onPress={onDelete}
                disabled={deleting}
              >
                {deleting ? "Eliminando..." : "Eliminar producto"}
              </Button>
            )}
          </YStack>
        )}
      </YStack>
    </Card>
  );
}
