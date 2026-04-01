import { AlertCircle, CheckCircle, Info, X } from "@tamagui/lucide-icons";
import { Button, Text, XStack } from "tamagui";

type BannerVariant = "error" | "success" | "info";

interface FeedbackBannerProps {
  message: string;
  variant?: BannerVariant;
  onDismiss?: () => void;
}

const config: Record<
  BannerVariant,
  { bg: string; color: string; Icon: typeof AlertCircle }
> = {
  error: { bg: "$red3", color: "$red10", Icon: AlertCircle },
  success: { bg: "$green3", color: "$green10", Icon: CheckCircle },
  info: { bg: "$blue3", color: "$blue10", Icon: Info },
};

export function FeedbackBanner({
  message,
  variant = "error",
  onDismiss,
}: FeedbackBannerProps) {
  const { bg, color, Icon } = config[variant];

  return (
    <XStack
      bg={bg as any}
      px="$3"
      py="$2.5"
      rounded="$3"
      gap="$2"
      style={{ alignItems: "center" }}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Icon size={16} color={color as any} />
      <Text fontSize="$2" color={color as any} flex={1}>
        {message}
      </Text>
      {onDismiss && (
        <Button
          size="$2"
          chromeless
          circular
          icon={<X size={14} color={color as any} />}
          onPress={onDismiss}
          accessibilityLabel="Cerrar notificación"
        />
      )}
    </XStack>
  );
}
