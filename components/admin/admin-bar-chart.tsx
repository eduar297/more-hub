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
  lineColor?: string;
  noOfSections?: number;
  stepValue?: number;
  mostNegativeValue?: number;
  xAxisThickness?: number;
  xAxisColor?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
};

export function AdminBarChart({
  data,
  showLine = true,
  lineColor = "#888",
  noOfSections = 3,
  stepValue,
  mostNegativeValue,
  xAxisThickness = 0,
  xAxisColor,
  xAxisLabel,
  yAxisLabel,
}: AdminBarChartProps) {
  return (
    <View>
      {yAxisLabel ? (
        <Text
          style={{
            fontSize: 10,
            color: "#888",
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
        yAxisTextStyle={{ fontSize: 10, color: "#888" }}
        formatYLabel={fmtYLabel}
        yAxisThickness={0}
        xAxisThickness={xAxisThickness}
        xAxisColor={xAxisColor}
        isAnimated
        animationDuration={400}
        showLine={showLine}
        lineConfig={{
          color: lineColor,
          hideDataPoints: true,
        }}
        stepValue={stepValue}
        mostNegativeValue={mostNegativeValue}
        yAxisExtraHeight={25}
        renderTooltip={(item: BarDataItem) => (
          <View
            style={{
              backgroundColor: "#333",
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              marginBottom: 0,
              marginLeft: -6,
            }}
          >
            <Text
              style={{
                color: "#fff",
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
            color: "#888",
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
