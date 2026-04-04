import { useTheme } from "tamagui";

export function useColors() {
  const theme = useTheme();
  return {
    // ── Core ──────────────────────────────────────────────────────────────
    bg: theme.background?.val as string,
    card: theme.color1?.val as string,
    text: theme.color?.val as string,
    muted: theme.color8?.val as string,
    border: theme.borderColor?.val as string,
    input: theme.color2?.val as string,

    // ── Accent ────────────────────────────────────────────────────────────
    blue: theme.blue10?.val as string,
    blueLight: theme.blue3?.val as string,
    green: theme.green10?.val as string,
    greenLight: theme.green3?.val as string,
    orange: theme.orange10?.val as string,
    orangeLight: theme.orange3?.val as string,
    purple: theme.purple10?.val as string,
    purpleLight: theme.purple3?.val as string,
    yellow: theme.yellow10?.val as string,
    yellowLight: theme.yellow3?.val as string,

    // ── Semantic ──────────────────────────────────────────────────────────
    danger: theme.red10?.val as string,
    dangerBg: theme.red3?.val as string,
    successBg: theme.green3?.val as string,
    warningBg: theme.orange3?.val as string,

    // ── Surface ───────────────────────────────────────────────────────────
    rowBg: theme.color1?.val as string,
    divider: theme.color3?.val as string,
    editBg: theme.color3?.val as string,
    headerBg: theme.background?.val as string,
    headerText: theme.color?.val as string,
    tabBarBg: theme.background?.val as string,
    tabBarBorder: theme.borderColor?.val as string,
    modalBg: theme.color1?.val as string,
  };
}
