import type { Product } from "@/models/product";
import type { Unit } from "@/models/unit";
import { Package } from "@tamagui/lucide-icons";
import { Image } from "react-native";
import { Text, XStack, YStack } from "tamagui";

export function StockRow({
  product,
  unit,
  rank,
  lowlight,
  onPress,
}: {
  product: Product;
  unit: Unit | undefined;
  rank?: number;
  lowlight?: boolean;
  onPress?: () => void;
}) {
  const stockColor =
    product.stockBaseQty === 0
      ? "$red10"
      : product.stockBaseQty <= 5
        ? "$orange10"
        : "$green10";

  return (
    <XStack
      px="$4"
      py="$3"
      items="center"
      gap="$3"
      onPress={onPress}
      pressStyle={onPress ? { opacity: 0.7, scale: 0.98 } : undefined}
      // @ts-expect-error animation works at runtime on XStack
      animation="fast"
    >
      {rank !== undefined && (
        <Text
          fontSize="$3"
          color="$color8"
          style={{ width: 20, textAlign: "center" }}
        >
          {rank}
        </Text>
      )}
      {/* Thumbnail */}
      {product.photoUri ? (
        <Image
          source={{ uri: product.photoUri }}
          style={{ width: 40, height: 40, borderRadius: 8 }}
          resizeMode="cover"
        />
      ) : (
        <YStack
          width={40}
          height={40}
          rounded="$3"
          bg="$color4"
          items="center"
          justify="center"
        >
          <Package size={20} color="$color8" />
        </YStack>
      )}
      <YStack flex={1}>
        <Text
          fontSize="$3"
          fontWeight="600"
          color={lowlight ? "$orange10" : "$color"}
          numberOfLines={1}
        >
          {product.name}
        </Text>
        <Text fontSize="$2" color="$color10">
          {product.barcode}
        </Text>
      </YStack>
      <Text fontSize="$4" fontWeight="bold" color={stockColor as any}>
        {product.stockBaseQty} {unit?.symbol ?? "uds"}
      </Text>
    </XStack>
  );
}
