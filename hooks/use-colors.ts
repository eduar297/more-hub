import { useTheme } from "tamagui";

export function useColors() {
  const theme = useTheme();
  return {
    bg: theme.background?.val as string,
    card: theme.color1?.val as string,
    text: theme.color?.val as string,
    muted: theme.color8?.val as string,
    border: theme.borderColor?.val as string,
    input: theme.color2?.val as string,
    blue: theme.blue10?.val as string,
    blueLight: theme.blue3?.val as string,
    green: theme.green10?.val as string,
    greenLight: theme.green3?.val as string,
    orange: theme.orange10?.val as string,
    orangeLight: theme.orange3?.val as string,
    danger: theme.red10?.val as string,
    dangerBg: theme.red3?.val as string,
    successBg: theme.green3?.val as string,
    rowBg: theme.color1?.val as string,
    divider: theme.color3?.val as string,
    editBg: theme.color3?.val as string,
  };
}
