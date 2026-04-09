import { useColors } from "@/hooks/use-colors";
import { fmtMoney } from "@/utils/format";
import React from "react";
import { Text, View } from "react-native";
import { BarChart } from "react-native-gifted-charts";

const fmtYLabel = (v: string) => {
  const n = Number(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n <= -1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  if (n <= -1_000) return `${(n / 1_000).toFixed(0)}K`;
  return v;
};

export type BarDataItem = {
  value: number;
  label?: string;
  frontColor?: string;
  spacing?: number;
  labelTextStyle?: object;
  labelWidth?: number;
};

type AdminBarChartProps = {
  data: BarDataItem[];
  showLine?: boolean;
  noOfSections?: number;
  stepValue?: number;
  mostNegativeValue?: number;
  xAxisLabel?: string;
  yAxisLabel?: string;
};

export function AdminBarChart({
  data,
  showLine = true,
  noOfSections = 3,
  stepValue,
  mostNegativeValue,
  xAxisLabel,
  yAxisLabel,
}: AdminBarChartProps) {
  const colors = useColors();

  return (
    <View>
      {yAxisLabel ? (
        <Text
          style={{
            fontSize: 10,
            color: colors.text,
            marginBottom: 2,
            fontWeight: "500",
          }}
        >
          {yAxisLabel}
        </Text>
      ) : null}
      <BarChart
        data={data}
        showVerticalLines={true}
        barBorderRadius={4}
        showScrollIndicator={true}
        noOfSections={noOfSections}
        hideRules={true}
        yAxisTextStyle={{ fontSize: 10, color: colors.muted }}
        formatYLabel={fmtYLabel}
        yAxisThickness={1}
        xAxisThickness={1}
        isAnimated
        animationDuration={400}
        showLine={showLine}
        lineConfig={{
          color: colors.text,
          hideDataPoints: true,
          curvature: 0.2,
          curved: true,
        }}
        stepValue={stepValue}
        mostNegativeValue={mostNegativeValue}
        yAxisExtraHeight={25}
        renderTooltip={(item: BarDataItem) => (
          <View
            style={{
              backgroundColor: colors.card,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              marginBottom: 0,
              marginLeft: -6,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 10,
                fontWeight: "600",
              }}
            >
              ${fmtMoney(Math.abs(item.value))}
            </Text>
          </View>
        )}
      />
      {xAxisLabel ? (
        <Text
          style={{
            fontSize: 10,
            color: colors.text,
            textAlign: "center",
            marginTop: 2,
            fontWeight: "500",
          }}
        >
          {xAxisLabel}
        </Text>
      ) : null}
    </View>
  );
}
