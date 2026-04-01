import type React from "react";
import { Text, YStack } from "tamagui";

interface EmptyStateProps {
  icon: React.ReactElement;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <YStack
      flex={1}
      style={{ justifyContent: "center", alignItems: "center" }}
      gap="$3"
      p="$8"
      accessibilityRole="summary"
    >
      {icon}
      <Text
        fontSize="$5"
        fontWeight="bold"
        color="$color"
        style={{ textAlign: "center" }}
      >
        {title}
      </Text>
      {description && (
        <Text
          color="$color10"
          style={{ textAlign: "center" }}
          fontSize="$3"
          maxW={280}
        >
          {description}
        </Text>
      )}
    </YStack>
  );
}
