import { Card, Separator, Text, XStack, YStack } from "tamagui";

export interface ProductDetailProps {
  product: {
    id: number;
    name: string;
    barcode: string;
    pricePerBaseUnit: number;
    stockBaseQty: number;
    saleMode: string;
    baseUnitId: number;
  };
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

export function ProductDetail({ product }: ProductDetailProps) {
  return (
    <Card
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$4"
      p="$4"
      bg="$background"
    >
      <YStack gap="$1">
        <Text fontSize="$7" fontWeight="bold" color="$color" mb="$2">
          {product.name}
        </Text>

        <Separator />

        <DetailRow label="Código de barras" value={product.barcode} />
        <Separator />
        <DetailRow
          label="Precio por unidad"
          value={`$${product.pricePerBaseUnit.toFixed(2)}`}
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
      </YStack>
    </Card>
  );
}
