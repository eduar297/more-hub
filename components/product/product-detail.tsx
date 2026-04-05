import { BarcodeDisplay } from "@/components/product/barcode-display";
import type { Product } from "@/models/product";
import { PackagePlus, Pencil, Trash2 } from "@tamagui/lucide-icons";
import { Image } from "react-native";
import QRCode from "react-native-qrcode-svg";
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

        {/* Code visual */}
        {/^\d{13}$/.test(product.code) && (
          <YStack
            bg="$color1"
            style={{ borderRadius: 12 }}
            p="$3"
            gap="$2"
            mb="$2"
          >
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
                  size={76}
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
        )}

        <Separator />

        <DetailRow label="Código" value={product.code} />
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
              ? `${(
                  ((product.salePrice - product.costPrice) /
                    product.salePrice) *
                  100
                ).toFixed(1)}%`
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
          <XStack
            gap="$2"
            mt="$4"
            pt="$3"
            borderTopWidth={1}
            borderColor="$borderColor"
          >
            {onAddStock && (
              <Button
                flex={1}
                theme="green"
                icon={<PackagePlus size={16} />}
                size="$3.5"
                onPress={onAddStock}
              >
                Stock
              </Button>
            )}
            {onEdit && (
              <Button
                flex={1}
                theme="blue"
                icon={<Pencil size={16} />}
                size="$3.5"
                onPress={onEdit}
              >
                Editar
              </Button>
            )}
            {onDelete && (
              <Button
                flex={1}
                theme="red"
                icon={
                  deleting ? <Spinner size="small" /> : <Trash2 size={16} />
                }
                size="$3.5"
                onPress={onDelete}
                disabled={deleting}
              >
                {deleting ? "..." : "Eliminar"}
              </Button>
            )}
          </XStack>
        )}
      </YStack>
    </Card>
  );
}
