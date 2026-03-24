import type { TextProps } from "tamagui";
import { Text } from "tamagui";

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: "default" | "title" | "defaultSemiBold" | "subtitle" | "link";
};

const typeStyles: Record<string, Partial<TextProps>> = {
  default: { fontSize: 16, lineHeight: 24 },
  defaultSemiBold: { fontSize: 16, lineHeight: 24, fontWeight: "600" },
  title: { fontSize: 32, fontWeight: "bold", lineHeight: 32 },
  subtitle: { fontSize: 20, fontWeight: "bold" },
  link: { fontSize: 16, lineHeight: 30, color: "$blue10" },
};

export function ThemedText({
  lightColor,
  darkColor,
  type = "default",
  ...rest
}: ThemedTextProps) {
  return <Text color="$color" {...typeStyles[type]} {...rest} />;
}
