import { Card, Text, XStack, YStack } from "tamagui";

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <XStack
      px="$1"
      py={1}
      style={{
        borderRadius: 6,
        backgroundColor: up ? "#16a34a22" : "#dc262622",
        alignItems: "center",
      }}
    >
      <Text fontSize={9} fontWeight="600" color={up ? "$green10" : "$red10"}>
        {up ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%
      </Text>
    </XStack>
  );
}

export function StatCard({
  label,
  value,
  icon,
  color,
  detail,
  delta,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  detail?: string;
  /** Percentage change vs previous period. */
  delta?: number;
}) {
  return (
    <Card
      flex={1}
      p="$2"
      bg="$color1"
      borderWidth={1}
      borderColor="$borderColor"
      style={{ borderRadius: 12 }}
    >
      <YStack gap="$1">
        {icon}
        <XStack style={{ alignItems: "center" }} gap="$1">
          <Text
            fontSize="$3"
            fontWeight="bold"
            color={color as any}
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {value}
          </Text>
          {delta !== undefined && <DeltaBadge delta={delta} />}
        </XStack>
        {detail && (
          <Text fontSize={10} color="$color8" numberOfLines={1}>
            {detail}
          </Text>
        )}
        <Text fontSize="$1" color="$color10" numberOfLines={1}>
          {label}
        </Text>
      </YStack>
    </Card>
  );
}
