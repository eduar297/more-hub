import type { CartItem } from "@/components/worker/types";
import { ICON_BTN_BG } from "@/constants/colors";
import { Minus, Package, Plus, Trash2 } from "@tamagui/lucide-icons";
import { memo } from "react";
import { Image, Pressable, StyleSheet } from "react-native";
import { Text, XStack, YStack } from "tamagui";

interface CartItemRowProps {
  item: CartItem;
  onChangeQty: (qty: number) => void;
  onRemove: () => void;
}

export const CartItemRow = memo(function CartItemRow({
  item,
  onChangeQty,
  onRemove,
}: CartItemRowProps) {
  const subtotal = item.quantity * item.unitPrice;

  return (
    <XStack
      px="$3"
      py="$3"
      gap="$3"
      style={styles.row}
      borderBottomWidth={StyleSheet.hairlineWidth}
      borderColor="$borderColor"
    >
      {/* Photo */}
      {item.product.photoUri ? (
        <Image
          source={{ uri: item.product.photoUri }}
          style={styles.thumb}
          resizeMode="cover"
        />
      ) : (
        <YStack style={styles.thumbPlaceholder}>
          <Package size={20} color="$color8" />
        </YStack>
      )}

      {/* Content */}
      <YStack flex={1} gap="$1.5">
        <Text fontSize="$4" fontWeight="600" color="$color" numberOfLines={1}>
          {item.product.name}
        </Text>

        <XStack style={styles.row} gap="$3">
          {/* Stepper */}
          <XStack bg="$color3" style={styles.stepper} height={40}>
            <Pressable
              onPress={() =>
                item.quantity > 1 && onChangeQty(item.quantity - 1)
              }
              style={styles.stepperBtn}
              hitSlop={8}
            >
              <Minus size={18} color="$color11" />
            </Pressable>
            <Text
              fontSize="$4"
              fontWeight="bold"
              color="$color"
              width={34}
              style={styles.qtyText}
            >
              {item.quantity}
            </Text>
            <Pressable
              onPress={() => {
                if (item.quantity < item.product.stockBaseQty) {
                  onChangeQty(item.quantity + 1);
                }
              }}
              style={[
                styles.stepperBtn,
                item.quantity >= item.product.stockBaseQty &&
                  styles.stepperBtnDisabled,
              ]}
              hitSlop={8}
            >
              <Plus
                size={18}
                color={
                  item.quantity >= item.product.stockBaseQty
                    ? "$color6"
                    : "$color11"
                }
              />
            </Pressable>
          </XStack>

          {/* Unit price */}
          <Text fontSize="$3" color="$color10">
            × ${item.unitPrice.toFixed(2)}
          </Text>
        </XStack>

        {/* Stock indicator */}
        <Text
          fontSize="$2"
          color={
            item.quantity >= item.product.stockBaseQty ? "$red10" : "$color8"
          }
        >
          Stock: {item.product.stockBaseQty}
        </Text>
      </YStack>

      {/* Subtotal + delete */}
      <YStack style={styles.rightCol} gap="$2">
        <Text fontSize="$5" fontWeight="bold" color="$green10">
          ${subtotal.toFixed(2)}
        </Text>
        <Pressable onPress={onRemove} hitSlop={12} style={styles.deleteBtn}>
          <Trash2 size={18} color="$red10" />
        </Pressable>
      </YStack>
    </XStack>
  );
});

const styles = StyleSheet.create({
  row: { alignItems: "center" },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  thumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: ICON_BTN_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  stepper: { borderRadius: 10, alignItems: "center" },
  stepperBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyText: { textAlign: "center" },
  rightCol: { alignItems: "flex-end" },
  deleteBtn: { padding: 6 },
  stepperBtnDisabled: { opacity: 0.35 },
});
