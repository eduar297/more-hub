import type { YStackProps } from "tamagui";
import { YStack } from "tamagui";

export type ThemedViewProps = YStackProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedView({
  lightColor,
  darkColor,
  ...otherProps
}: ThemedViewProps) {
  return <YStack background="$background" {...otherProps} />;
}
