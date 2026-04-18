import type React from "react";
import { Text, YStack } from "tamagui";

interface EmptyStateProps {
  icon: React.ReactElement;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <YStack flex={1} items="center" justify="center" gap="$3" px="$6">
      {icon}
      <Text fontSize="$5" fontWeight="bold" color="$color8" text="center">
        {title}
      </Text>
      {description && (
        <Text color="$color10" text="center" fontSize="$3" maxW={280}>
          {description}
        </Text>
      )}
    </YStack>
  );
}
