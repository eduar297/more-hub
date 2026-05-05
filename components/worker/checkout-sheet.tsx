import type { CartItem } from "@/components/worker/types";
import { ICON_BTN_BG } from "@/constants/colors";
import { useCardTypeRepository } from "@/hooks/use-card-type-repository";
import { useColors } from "@/hooks/use-colors";
import type { CardType } from "@/models/card-type";
import type { PaymentMethod } from "@/models/ticket";
import {
    Banknote,
    ChevronDown,
    CreditCard,
    ShoppingCart,
    X,
} from "@tamagui/lucide-icons";
import { memo, useCallback, useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Button, Card, Spinner, Text, XStack, YStack } from "tamagui";

interface CheckoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartItem[];
  cartTotal: number;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  selectedCardType: CardType | null;
  onCardTypeChange: (cardType: CardType | null) => void;
  confirming: boolean;
  onConfirm: () => void;
}

export const CheckoutSheet = memo(function CheckoutSheet({
  open,
  onOpenChange,
  cart,
  cartTotal,
  paymentMethod,
  onPaymentMethodChange,
  selectedCardType,
  onCardTypeChange,
  confirming,
  onConfirm,
}: CheckoutSheetProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const cardTypeRepo = useCardTypeRepository();
  const [cardTypes, setCardTypes] = useState<CardType[]>([]);
  const [showCardTypes, setShowCardTypes] = useState(false);

  useEffect(() => {
    if (open) {
      cardTypeRepo.findAllActive().then(setCardTypes);
    }
  }, [open, cardTypeRepo]);

  const handleCardTypeSelect = useCallback(
    (cardType: CardType) => {
      onCardTypeChange(cardType);
      setShowCardTypes(false);
    },
    [onCardTypeChange],
  );

  const handlePaymentMethodChange = useCallback(
    (method: PaymentMethod) => {
      onPaymentMethodChange(method);
      if (method === "CASH") {
        onCardTypeChange(null);
      } else if (method === "CARD" && cardTypes.length === 1) {
        onCardTypeChange(cardTypes[0]);
      }
    },
    [onPaymentMethodChange, onCardTypeChange, cardTypes],
  );
  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => onOpenChange(false)}
    >
      <SafeAreaView
        edges={["top", "bottom"]}
        style={[csStyles.modalRoot, { backgroundColor: c.modalBg }]}
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
            <ShoppingCart size={18} color="$green10" />
            <Text fontSize={16} fontWeight="700" color="$color">
              Confirmar venta
            </Text>
          </XStack>
          <TouchableOpacity
            onPress={() => onOpenChange(false)}
            hitSlop={8}
            style={csStyles.closeBtn}
          >
            <X size={18} color="$color" />
          </TouchableOpacity>
        </XStack>

        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: Math.max(20, insets.bottom + 20),
            gap: 16,
          }}
        >
          {/* Order summary */}
          <Card
            borderWidth={1}
            borderColor="$borderColor"
            style={{ borderRadius: 14 }}
            overflow="hidden"
            bg="$color2"
            p="$3.5"
            gap="$2.5"
          >
            {cart.map((item) => {
              const subtotal = item.quantity * item.unitPrice;
              return (
                <XStack
                  key={item.product.id}
                  style={{ alignItems: "center" }}
                  justify="space-between"
                >
                  <Text fontSize="$4" color="$color" flex={1} numberOfLines={1}>
                    {item.product.name}
                  </Text>
                  <Text fontSize="$3" color="$color10" mx="$2">
                    x{item.quantity} × ${item.unitPrice.toFixed(2)}
                  </Text>
                  <Text
                    fontSize="$4"
                    fontWeight="bold"
                    color="$green10"
                    width={80}
                    style={{ textAlign: "right" }}
                  >
                    ${subtotal.toFixed(2)}
                  </Text>
                </XStack>
              );
            })}
          </Card>

          {/* Payment method */}
          <YStack gap="$2.5">
            <Text fontSize="$5" fontWeight="bold" color="$color">
              Método de pago
            </Text>
            <XStack gap="$3">
              <Button
                flex={1}
                size="$6"
                icon={Banknote}
                theme={paymentMethod === "CASH" ? "green" : undefined}
                variant={paymentMethod === "CASH" ? undefined : "outlined"}
                onPress={() => handlePaymentMethodChange("CASH")}
              >
                Efectivo
              </Button>
              <Button
                flex={1}
                size="$6"
                icon={CreditCard}
                theme={paymentMethod === "CARD" ? "blue" : undefined}
                variant={paymentMethod === "CARD" ? undefined : "outlined"}
                onPress={() => handlePaymentMethodChange("CARD")}
              >
                Tarjeta
              </Button>
            </XStack>

            {/* Card type selection */}
            {paymentMethod === "CARD" && cardTypes.length > 0 && (
              <YStack gap="$2">
                <Text fontSize="$4" fontWeight="600" color="$color">
                  Tipo de tarjeta
                </Text>
                {cardTypes.length === 1 ? (
                  <Card
                    p="$3"
                    borderWidth={1}
                    borderColor="$blue10"
                    bg="$blue3"
                    style={{ borderRadius: 10 }}
                  >
                    <Text fontSize="$4" color="$blue10" fontWeight="600">
                      {cardTypes[0].name}
                    </Text>
                    {cardTypes[0].description && (
                      <Text fontSize="$3" color="$blue9">
                        {cardTypes[0].description}
                      </Text>
                    )}
                  </Card>
                ) : (
                  <Button
                    size="$4"
                    variant="outlined"
                    iconAfter={ChevronDown}
                    onPress={() => setShowCardTypes(!showCardTypes)}
                    style={{ justifyContent: "space-between" }}
                  >
                    {selectedCardType
                      ? selectedCardType.name
                      : "Seleccionar tarjeta"}
                  </Button>
                )}

                {/* Card types list */}
                {showCardTypes && cardTypes.length > 1 && (
                  <YStack
                    gap="$1"
                    p="$2"
                    bg="$color3"
                    style={{ borderRadius: 8 }}
                  >
                    {cardTypes.map((cardType) => (
                      <Button
                        key={cardType.id}
                        variant="ghost"
                        size="$3"
                        onPress={() => handleCardTypeSelect(cardType)}
                        style={{ justifyContent: "flex-start" }}
                        theme={
                          selectedCardType?.id === cardType.id
                            ? "blue"
                            : undefined
                        }
                      >
                        <YStack style={{ alignItems: "flex-start" }}>
                          <Text fontSize="$3" fontWeight="600">
                            {cardType.name}
                          </Text>
                          {cardType.description && (
                            <Text fontSize="$2" color="$color10">
                              {cardType.description}
                            </Text>
                          )}
                        </YStack>
                      </Button>
                    ))}
                  </YStack>
                )}
              </YStack>
            )}
          </YStack>
        </ScrollView>

        {/* Sticky bottom bar */}
        <YStack
          px="$4"
          py="$3"
          gap="$3"
          borderTopWidth={1}
          borderColor="$borderColor"
          bg="$background"
        >
          <XStack
            style={{
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text fontSize="$7" fontWeight="bold" color="$color">
              Total
            </Text>
            <Text fontSize="$9" fontWeight="bold" color="$green10">
              ${cartTotal.toFixed(2)}
            </Text>
          </XStack>

          <Button
            size="$6"
            theme="green"
            icon={confirming ? <Spinner /> : ShoppingCart}
            disabled={
              confirming ||
              cart.length === 0 ||
              (paymentMethod === "CARD" &&
                cardTypes.length > 1 &&
                !selectedCardType)
            }
            onPress={onConfirm}
          >
            {confirming ? "Registrando..." : "Confirmar venta"}
          </Button>
        </YStack>
      </SafeAreaView>
    </Modal>
  );
});

const csStyles = StyleSheet.create({
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
