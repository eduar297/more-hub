// Global type augmentation for Tamagui — activates shorthand props (jc, ai, br, etc.)
// and full layout props (justifyContent, alignItems, etc.) across all files.
import type { Conf } from "./tamagui.config";
declare module "tamagui" {
  interface TamaguiCustomConfig extends Conf {}
}
