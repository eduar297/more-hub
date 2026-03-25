import React, { useMemo } from "react";
import { View } from "react-native";
import { G, Rect, Svg, Text as SvgText } from "react-native-svg";
import { Text } from "tamagui";

// ── EAN-13 encoding tables ──────────────────────────────────────────────────
// Each digit is encoded as 7 modules (0=white, 1=black).

const ENC_A = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
];
const ENC_B = [
  "0100111",
  "0110011",
  "0011011",
  "0100001",
  "0011101",
  "0111001",
  "0000101",
  "0010001",
  "0001001",
  "0010111",
];
const ENC_C = [
  "1110010",
  "1100110",
  "1101100",
  "1000010",
  "1011100",
  "1001110",
  "1010000",
  "1000100",
  "1001000",
  "1110100",
];

// Parity pattern for the 6 left-group digits, indexed by the first (system) digit.
const PARITY = [
  "AAAAAA",
  "AABABB",
  "AABBAB",
  "AABBBA",
  "ABAABB",
  "ABBAAB",
  "ABBBAA",
  "ABABAB",
  "ABABBA",
  "ABBABA",
];

/**
 * Produces a 113-character bit string (0=white, 1=black) for EAN-13.
 * Structure: 9 quiet | 3 left guard | 42 left data | 5 center guard | 42 right data | 3 right guard | 9 quiet
 */
function encode(barcode: string): string {
  const d = barcode.split("").map(Number);
  const parity = PARITY[d[0]];
  const left = Array.from({ length: 6 }, (_, i) =>
    parity[i] === "A" ? ENC_A[d[i + 1]] : ENC_B[d[i + 1]],
  ).join("");
  const right = Array.from({ length: 6 }, (_, i) => ENC_C[d[i + 7]]).join("");
  return `${"0".repeat(9)}101${left}01010${right}101${"0".repeat(9)}`;
}

// Module index ranges for the guard/center bars (these extend below data bars).
// Left guard: 9-11 → bars at 9, 11
// Center guard: 54-58 → bars at 55, 57
// Right guard: 101-103 → bars at 101, 103
const EXTENDED_BARS = new Set([9, 11, 55, 57, 101, 103]);

// ── Component ───────────────────────────────────────────────────────────────

export interface BarcodeDisplayProps {
  barcode: string;
  /** Total rendered width in dp. Default 280. */
  width?: number;
  /** Height of the data bars in dp. Default 60. */
  barHeight?: number;
  /** Whether to render the digit text below the bars. Default true. */
  showText?: boolean;
}

export function BarcodeDisplay({
  barcode,
  width = 280,
  barHeight = 60,
  showText = true,
}: BarcodeDisplayProps) {
  // Normalise UPC-A (12 digits) → EAN-13 by prepending a leading zero
  const normalised = useMemo(() => {
    if (/^\d{12}$/.test(barcode)) return "0" + barcode;
    return barcode;
  }, [barcode]);

  const bits = useMemo(() => {
    if (normalised.length !== 13 || !/^\d{13}$/.test(normalised)) return null;
    return encode(normalised);
  }, [normalised]);

  // Unsupported format — show a plain text fallback
  if (!bits) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 8 }}>
        <Text fontSize="$3" color="$color10" letterSpacing={2}>
          {barcode}
        </Text>
      </View>
    );
  }

  const TOTAL_MODULES = 113;
  const mw = width / TOTAL_MODULES; // module width in dp
  const guardExtra = 8; // how much guard bars extend below data bars
  const guardHeight = barHeight + guardExtra;
  const fontSize = 11;
  const textY = guardHeight + fontSize + 2;
  const totalHeight = textY + (showText ? 4 : 0);

  // Left data starts at module 12, ends at 53. Center at 34 (text midpoint).
  const leftTextX = 12 * mw + (42 * mw) / 2;
  // Right data starts at module 59, ends at 100. Center at 79.5.
  const rightTextX = 59 * mw + (42 * mw) / 2;

  return (
    <Svg
      width={width}
      height={showText ? totalHeight : guardHeight}
      viewBox={`0 0 ${width} ${showText ? totalHeight : guardHeight}`}
    >
      {/* White background */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={showText ? totalHeight : guardHeight}
        fill="white"
      />

      {/* Bars */}
      <G>
        {Array.from({ length: TOTAL_MODULES }, (_, i) => {
          if (bits[i] !== "1") return null;
          const isExtended = EXTENDED_BARS.has(i);
          return (
            <Rect
              key={i}
              x={i * mw}
              y={0}
              width={mw}
              height={isExtended ? guardHeight : barHeight}
              fill="black"
            />
          );
        })}
      </G>

      {/* Digits */}
      {showText && (
        <G>
          {/* System digit — left of quiet zone */}
          <SvgText
            x={(9 * mw) / 2}
            y={textY}
            fontSize={fontSize}
            fill="black"
            textAnchor="middle"
          >
            {normalised[0]}
          </SvgText>

          {/* Left 6 digits */}
          <SvgText
            x={leftTextX}
            y={textY}
            fontSize={fontSize}
            fill="black"
            textAnchor="middle"
          >
            {normalised.slice(1, 7)}
          </SvgText>

          {/* Right 6 digits */}
          <SvgText
            x={rightTextX}
            y={textY}
            fontSize={fontSize}
            fill="black"
            textAnchor="middle"
          >
            {normalised.slice(7)}
          </SvgText>
        </G>
      )}
    </Svg>
  );
}
