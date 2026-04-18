import { useColors } from "@/hooks/use-colors";
import { fmtMoney } from "@/utils/format";
import React, { useMemo } from "react";
import { PieChart } from "react-native-gifted-charts";
import { Text, XStack, YStack } from "tamagui";

// ── Types ────────────────────────────────────────────────────────────────────

export type PieDataItem = {
  value: number;
  color: string;
  label: string;
  /** Optional subtitle shown below the label in legend */
  subtitle?: string;
};

type LegendLayout = "vertical" | "horizontal";

type CenterLabel = {
  title: string;
  value: string;
};

type AdminPieChartProps = {
  data: PieDataItem[];
  /** "vertical" = pie on top, legend below. "horizontal" = pie left, legend right. Default: "horizontal" */
  legendLayout?: LegendLayout;
  /** Outer radius of the donut */
  radius?: number;
  /** Inner radius (donut hole). Defaults to ~60% of radius */
  innerRadius?: number;
  /** Optional center label inside the donut */
  centerLabel?: CenterLabel;
  /** Whether to show percentage next to each legend value */
  showPercentage?: boolean;
  /** Format legend values as money. Default: true */
  formatAsMoney?: boolean;
};

// ── Component ────────────────────────────────────────────────────────────────

export function AdminPieChart({
  data,
  legendLayout = "horizontal",
  radius = 60,
  innerRadius,
  centerLabel,
  showPercentage = true,
  formatAsMoney = true,
}: AdminPieChartProps) {
  const colors = useColors();
  const effectiveInnerRadius = innerRadius ?? Math.round(radius * 0.6);
  const total = data.reduce((s, d) => s + d.value, 0);

  const chartData = data.map((d) => ({ value: d.value, color: d.color }));

  // Force remount when data changes so animations re-trigger
  const chartKey = useMemo(
    () => chartData.map((d) => d.value).join(","),
    [chartData],
  );

  const chart = (
    <PieChart
      key={chartKey}
      data={chartData}
      donut
      radius={radius}
      innerRadius={effectiveInnerRadius}
      innerCircleColor={colors.card}
      backgroundColor={colors.card}
      centerLabelComponent={
        centerLabel
          ? () => (
              <YStack
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 10, color: colors.muted }}>
                  {centerLabel.title}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "bold",
                    color: colors.text,
                  }}
                >
                  {centerLabel.value}
                </Text>
              </YStack>
            )
          : undefined
      }
      isAnimated
      animationDuration={400}
    />
  );

  const legend = (
    <YStack gap="$1.5" flex={legendLayout === "horizontal" ? 1 : undefined}>
      {data.map((item, idx) => {
        const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : "0";
        const valueStr = formatAsMoney
          ? `$${fmtMoney(item.value)}`
          : String(item.value);
        const displayValue = showPercentage
          ? `${valueStr} · ${pct}%`
          : valueStr;

        return (
          <XStack key={idx} style={{ alignItems: "center" }} gap="$2">
            <YStack
              width={10}
              height={10}
              style={{ borderRadius: 5, backgroundColor: item.color }}
            />
            <YStack flex={1}>
              <Text fontSize="$2" color="$color10" numberOfLines={1}>
                {item.label}
              </Text>
              {item.subtitle ? (
                <Text fontSize="$1" color="$color10">
                  {item.subtitle}
                </Text>
              ) : null}
            </YStack>
            <Text fontSize="$2" fontWeight="600" color="$color">
              {displayValue}
            </Text>
          </XStack>
        );
      })}
    </YStack>
  );

  if (legendLayout === "vertical") {
    return (
      <YStack gap="$3">
        <YStack style={{ alignItems: "center" }}>{chart}</YStack>
        {legend}
      </YStack>
    );
  }

  return (
    <XStack style={{ alignItems: "center" }} gap="$4">
      {chart}
      {legend}
    </XStack>
  );
}
