import { todayISO } from "@/utils/format";
import { Calendar, ChevronLeft, ChevronRight, X } from "@tamagui/lucide-icons";
import { useEffect, useMemo, useState } from "react";
import {
    Modal,
    Pressable,
    Text as RNText,
    StyleSheet,
    View,
    useColorScheme,
} from "react-native";
import type { DateData } from "react-native-calendars";
import { Calendar as RNCalendar } from "react-native-calendars";
import { Button, Card, Text, XStack } from "tamagui";

export type Period = "day" | "week" | "month" | "year" | "range";

export interface DateRange {
  from: string;
  to: string;
}

const PERIOD_LABELS: Record<Period, string> = {
  day: "Día",
  week: "Semana",
  month: "Mes",
  year: "Año",
  range: "Rango",
};

export function PeriodTabs({
  period,
  onChangePeriod,
}: {
  period: Period;
  onChangePeriod: (p: Period) => void;
}) {
  return (
    <XStack
      bg="$color2"
      style={{ borderRadius: 10 }}
      p="$1"
      gap={4}
      height={38}
    >
      {(["day", "week", "month", "year", "range"] as Period[]).map((p) => {
        const active = period === p;
        return (
          <Pressable
            key={p}
            onPress={() => onChangePeriod(p)}
            style={{
              flex: 1,
              borderRadius: 8,
              backgroundColor: active ? "#2563eb" : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              fontSize={12}
              fontWeight="700"
              color={active ? "white" : "$color10"}
            >
              {PERIOD_LABELS[p]}
            </Text>
          </Pressable>
        );
      })}
    </XStack>
  );
}

export function DateNavigator({
  label,
  onPrev,
  onNext,
  canGoForward,
  onCalendarPress,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  canGoForward: boolean;
  onCalendarPress?: () => void;
}) {
  return (
    <Card
      bg="$color1"
      borderWidth={1}
      borderColor="$borderColor"
      style={{ borderRadius: 12 }}
      p="$2"
    >
      <XStack style={{ alignItems: "center", justifyContent: "space-between" }}>
        <Button size="$3" chromeless icon={ChevronLeft} onPress={onPrev} />
        <Pressable
          onPress={onCalendarPress}
          style={{ alignItems: "center", flex: 1 }}
        >
          <Calendar size={14} color="$blue10" />
          <Text
            fontSize="$3"
            fontWeight="600"
            color="$color"
            mt="$0.5"
            style={{ textAlign: "center" }}
          >
            {label}
          </Text>
        </Pressable>
        <Button
          size="$3"
          chromeless
          icon={ChevronRight}
          onPress={onNext}
          disabled={!canGoForward}
          opacity={canGoForward ? 1 : 0.3}
        />
      </XStack>
    </Card>
  );
}

/* ── Calendar picker modal ────────────────────────────────────────────────── */

const MONTHS_SHORT = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

const MODAL_TITLE: Record<Period, string> = {
  day: "Seleccionar día",
  week: "Seleccionar mes",
  month: "Seleccionar mes",
  year: "Seleccionar año",
  range: "Seleccionar rango",
};

export function CalendarSheet({
  open,
  onClose,
  mode,
  selectedDay,
  selectedMonth,
  selectedYear,
  range,
  onSelectDay,
  onSelectMonth,
  onSelectYear,
  onSelectRange,
}: {
  open: boolean;
  onClose: () => void;
  mode: Period;
  selectedDay?: string;
  selectedMonth?: string;
  selectedYear?: string;
  range?: DateRange;
  onSelectDay?: (date: string) => void;
  onSelectMonth?: (month: string) => void;
  onSelectYear?: (year: string) => void;
  onSelectRange?: (range: DateRange) => void;
}) {
  const dark = useColorScheme() === "dark";
  const today = todayISO();
  const nowYear = new Date().getFullYear();
  const nowYM = `${nowYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const c = useMemo(
    () => ({
      bg: dark ? "#1c1c1e" : "#ffffff",
      card: dark ? "#2c2c2e" : "#f2f2f7",
      text: dark ? "#f2f2f7" : "#1c1c1e",
      muted: dark ? "#8e8e93" : "#8e8e93",
      border: dark ? "#3a3a3c" : "#e5e5ea",
      blue: "#2563eb",
      blueLight: "#93c5fd",
      blueFaint: dark ? "#1e3a5f" : "#eff6ff",
      disabled: dark ? "#3a3a3c" : "#d1d1d6",
    }),
    [dark],
  );

  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [pickerYear, setPickerYear] = useState(nowYear);

  useEffect(() => {
    if (!open) return;
    setRangeStart(range?.from ?? null);
    setRangeEnd(range?.to ?? null);
    if (mode === "month" || mode === "week") {
      setPickerYear(
        selectedMonth ? parseInt(selectedMonth.slice(0, 4), 10) : nowYear,
      );
    } else {
      setPickerYear(nowYear);
    }
  }, [open, range?.from, range?.to, mode, selectedMonth, nowYear]);

  const markedDates = useMemo(() => {
    if (mode === "day") {
      return selectedDay
        ? { [selectedDay]: { selected: true, selectedColor: c.blue } }
        : {};
    }
    if (mode === "range") {
      if (!rangeStart) return {};
      if (!rangeEnd)
        return { [rangeStart]: { selected: true, selectedColor: c.blue } };
      const marks: Record<
        string,
        {
          startingDay?: boolean;
          endingDay?: boolean;
          color?: string;
          textColor?: string;
        }
      > = {};
      const s = new Date(rangeStart + "T12:00:00");
      const e = new Date(rangeEnd + "T12:00:00");
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        marks[key] = {
          color: key === rangeStart || key === rangeEnd ? c.blue : c.blueLight,
          textColor: "white",
          startingDay: key === rangeStart,
          endingDay: key === rangeEnd,
        };
      }
      return marks;
    }
    return {};
  }, [mode, selectedDay, rangeStart, rangeEnd, c.blue, c.blueLight]);

  const calendarTheme = useMemo(
    () => ({
      backgroundColor: "transparent",
      calendarBackground: "transparent",
      textSectionTitleColor: c.muted,
      selectedDayBackgroundColor: c.blue,
      selectedDayTextColor: "#ffffff",
      todayTextColor: c.blue,
      dayTextColor: c.text,
      textDisabledColor: c.disabled,
      monthTextColor: c.text,
      arrowColor: c.blue,
      textMonthFontWeight: "bold" as const,
      textDayFontSize: 14,
      textMonthFontSize: 15,
    }),
    [c],
  );

  // ── Month/Week grid ────────────────────────────────────────────────────────
  const MonthPicker = (
    <View>
      <View style={styles.pickerNav}>
        <Pressable
          onPress={() => setPickerYear((y) => y - 1)}
          style={styles.pickerNavBtn}
        >
          <ChevronLeft size={20} color={c.blue as any} />
        </Pressable>
        <RNText style={[styles.pickerNavYear, { color: c.text }]}>
          {pickerYear}
        </RNText>
        <Pressable
          onPress={() => setPickerYear((y) => y + 1)}
          disabled={pickerYear >= nowYear}
          style={styles.pickerNavBtn}
        >
          <ChevronRight
            size={20}
            color={(pickerYear >= nowYear ? c.disabled : c.blue) as any}
          />
        </Pressable>
      </View>
      <View style={styles.monthGrid}>
        {MONTHS_SHORT.map((name, i) => {
          const mStr = `${pickerYear}-${String(i + 1).padStart(2, "0")}`;
          const isSelected = selectedMonth === mStr;
          const isFuture = mStr > nowYM;
          return (
            <Pressable
              key={mStr}
              onPress={() => {
                if (!isFuture) {
                  onSelectMonth?.(mStr);
                  onClose();
                }
              }}
              style={styles.monthCellWrap}
            >
              <View
                style={[
                  styles.monthCell,
                  {
                    backgroundColor: isSelected ? c.blue : c.card,
                    opacity: isFuture ? 0.3 : 1,
                  },
                ]}
              >
                <RNText
                  style={[
                    styles.monthCellText,
                    { color: isSelected ? "white" : c.text },
                  ]}
                >
                  {name}
                </RNText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  // ── Year grid ──────────────────────────────────────────────────────────────
  const years = Array.from({ length: 7 }, (_, i) => nowYear - 6 + i);
  const YearPicker = (
    <View style={styles.yearGrid}>
      {years.map((y) => {
        const yStr = String(y);
        const isSelected = selectedYear === yStr;
        return (
          <Pressable
            key={y}
            onPress={() => {
              onSelectYear?.(yStr);
              onClose();
            }}
            style={styles.yearCellWrap}
          >
            <View
              style={[
                styles.yearCell,
                { backgroundColor: isSelected ? c.blue : c.card },
              ]}
            >
              <RNText
                style={[
                  styles.yearCellText,
                  { color: isSelected ? "white" : c.text },
                ]}
              >
                {y}
              </RNText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.centeredContainer} pointerEvents="box-none">
        <Pressable onPress={() => {}}>
          <View
            style={[
              styles.card,
              { backgroundColor: c.bg, borderColor: c.border },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <RNText style={[styles.title, { color: c.text }]}>
                {MODAL_TITLE[mode]}
              </RNText>
              <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                <X size={18} color={c.muted as any} />
              </Pressable>
            </View>

            {/* Day picker */}
            {mode === "day" && (
              <RNCalendar
                markingType="dot"
                markedDates={markedDates}
                onDayPress={(day: DateData) => {
                  if (day.dateString > today) return;
                  onSelectDay?.(day.dateString);
                  onClose();
                }}
                maxDate={today}
                theme={calendarTheme}
              />
            )}

            {/* Month/Week grid */}
            {(mode === "month" || mode === "week") && MonthPicker}

            {/* Year grid */}
            {mode === "year" && YearPicker}

            {/* Range picker */}
            {mode === "range" && (
              <>
                <View style={styles.rangeRow}>
                  <View
                    style={[
                      styles.rangeChip,
                      {
                        backgroundColor: rangeStart ? c.blueFaint : c.card,
                        borderColor: rangeStart ? c.blue : c.border,
                      },
                    ]}
                  >
                    <RNText style={[styles.chipLabel, { color: c.muted }]}>
                      Desde
                    </RNText>
                    <RNText style={[styles.chipValue, { color: c.text }]}>
                      {rangeStart ?? "—"}
                    </RNText>
                  </View>
                  <RNText style={[styles.arrow, { color: c.muted }]}>→</RNText>
                  <View
                    style={[
                      styles.rangeChip,
                      {
                        backgroundColor: rangeEnd ? c.blueFaint : c.card,
                        borderColor: rangeEnd ? c.blue : c.border,
                      },
                    ]}
                  >
                    <RNText style={[styles.chipLabel, { color: c.muted }]}>
                      Hasta
                    </RNText>
                    <RNText style={[styles.chipValue, { color: c.text }]}>
                      {rangeEnd ?? "—"}
                    </RNText>
                  </View>
                </View>
                <RNCalendar
                  markingType="period"
                  markedDates={markedDates}
                  onDayPress={(day: DateData) => {
                    if (day.dateString > today) return;
                    if (!rangeStart || (rangeStart && rangeEnd)) {
                      setRangeStart(day.dateString);
                      setRangeEnd(null);
                    } else {
                      const s =
                        day.dateString < rangeStart
                          ? day.dateString
                          : rangeStart;
                      const e =
                        day.dateString < rangeStart
                          ? rangeStart
                          : day.dateString;
                      setRangeStart(s);
                      setRangeEnd(e);
                    }
                  }}
                  maxDate={today}
                  theme={calendarTheme}
                />
                <View style={styles.confirmRow}>
                  <Pressable
                    onPress={() => {
                      if (rangeStart && rangeEnd) {
                        onSelectRange?.({ from: rangeStart, to: rangeEnd });
                        onClose();
                      }
                    }}
                    disabled={!rangeStart || !rangeEnd}
                    style={[
                      styles.confirmBtn,
                      {
                        backgroundColor:
                          rangeStart && rangeEnd ? c.blue : c.disabled,
                        opacity: rangeStart && rangeEnd ? 1 : 0.6,
                      },
                    ]}
                  >
                    <RNText style={styles.confirmText}>Aplicar rango</RNText>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  centeredContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
  },
  closeBtn: {
    padding: 4,
  },
  // ── Month/Week picker ─────────────────────────────────────────────────────
  pickerNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pickerNavBtn: {
    padding: 4,
  },
  pickerNavYear: {
    fontSize: 17,
    fontWeight: "700",
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
  monthCellWrap: {
    width: "33.33%",
    padding: 4,
  },
  monthCell: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  monthCellText: {
    fontSize: 14,
    fontWeight: "600",
  },
  // ── Year picker ───────────────────────────────────────────────────────────
  yearGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 16,
  },
  yearCellWrap: {
    width: "33.33%",
    padding: 4,
  },
  yearCell: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  yearCellText: {
    fontSize: 15,
    fontWeight: "600",
  },
  // ── Range picker ──────────────────────────────────────────────────────────
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rangeChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  chipLabel: {
    fontSize: 11,
    textAlign: "center",
  },
  chipValue: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  arrow: {
    fontSize: 18,
  },
  confirmRow: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  confirmBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: "white",
  },
});
