import { EmptyState } from "@/components/ui/empty-state";
import { OVERLAY } from "@/constants/colors";
import { ChevronDown, Plus, Receipt, Trash2 } from "@tamagui/lucide-icons";
import { useCallback, useEffect, useId, useState } from "react";
import { Alert, FlatList, ScrollView } from "react-native";
import {
    Button,
    Card,
    Input,
    Label,
    Sheet,
    Spinner,
    Text,
    TextArea,
    XStack,
    YStack,
} from "tamagui";

import { PeriodSelector } from "@/components/admin/period-selector";
import { todayISO, weekEndISO } from "@/utils/format";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { useExpenseRepository } from "@/hooks/use-expense-repository";
import { usePeriodNavigation } from "@/hooks/use-period-navigation";
import type { Expense, ExpenseCategory } from "@/models/expense";
import { EXPENSE_CATEGORIES } from "@/models/expense";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  TRANSPORT: "$blue10",
  ELECTRICITY: "$yellow10",
  RENT: "$purple10",
  REPAIRS: "$orange10",
  SUPPLIES: "$pink10",
  OTHER: "$color10",
};

const CATEGORY_BG: Record<ExpenseCategory, string> = {
  TRANSPORT: "$blue4",
  ELECTRICITY: "$yellow4",
  RENT: "$purple4",
  REPAIRS: "$orange4",
  SUPPLIES: "$pink4",
  OTHER: "$color4",
};

const categoryKeys = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[];

function fmtCurrency(v: number): string {
  return v.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-VE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── CategoryPicker ────────────────────────────────────────────────────────────

function CategoryPicker({
  value,
  onChange,
}: {
  value: ExpenseCategory;
  onChange: (cat: ExpenseCategory) => void;
}) {
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="$4"
        iconAfter={ChevronDown}
        onPress={() => setOpen(true)}
        bg={CATEGORY_BG[value] as any}
      >
        <Text fontWeight="600" color={CATEGORY_COLORS[value] as any}>
          {EXPENSE_CATEGORIES[value]}
        </Text>
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        modal
        snapPoints={[50]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor={OVERLAY}
        />
        <Sheet.Frame p="$4" bg="$background" theme={themeName as any}>
          <Sheet.Handle />
          <Text fontWeight="bold" fontSize="$5" color="$color" mb="$3">
            Categoría de gasto
          </Text>
          <ScrollView>
            <YStack gap="$2" pb="$6">
              {categoryKeys.map((key) => (
                <Button
                  key={key}
                  theme={key === value ? "blue" : undefined}
                  bg={key === value ? (CATEGORY_BG[key] as any) : "$color2"}
                  onPress={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                >
                  <Text
                    fontWeight="600"
                    color={
                      key === value ? (CATEGORY_COLORS[key] as any) : "$color"
                    }
                  >
                    {EXPENSE_CATEGORIES[key]}
                  </Text>
                </Button>
              ))}
            </YStack>
          </ScrollView>
        </Sheet.Frame>
      </Sheet>
    </>
  );
}

// ── ExpenseForm ───────────────────────────────────────────────────────────────

function ExpenseForm({
  onSubmit,
  loading,
}: {
  onSubmit: (data: {
    category: ExpenseCategory;
    description: string;
    amount: number;
    date: string;
  }) => void;
  loading?: boolean;
}) {
  const uid = useId();
  const [category, setCategory] = useState<ExpenseCategory>("OTHER");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());

  const canSubmit =
    description.trim().length > 0 &&
    amount.length > 0 &&
    parseFloat(amount) > 0 &&
    date.length === 10;

  return (
    <YStack gap="$3" p="$4">
      <Text fontSize="$6" fontWeight="bold" color="$color">
        Nuevo gasto
      </Text>

      {/* Category */}
      <YStack gap="$1">
        <Label htmlFor={`${uid}-cat`} color="$color10" fontSize="$3">
          Categoría
        </Label>
        <CategoryPicker value={category} onChange={setCategory} />
      </YStack>

      {/* Description */}
      <YStack gap="$1">
        <Label htmlFor={`${uid}-desc`} color="$color10" fontSize="$3">
          Descripción *
        </Label>
        <TextArea
          id={`${uid}-desc`}
          placeholder="Ej: Pago de electricidad marzo"
          value={description}
          onChangeText={setDescription}
          size="$4"
          numberOfLines={3}
          verticalAlign="top"
        />
      </YStack>

      {/* Amount + Date */}
      <XStack gap="$3">
        <YStack flex={1} gap="$1">
          <Label htmlFor={`${uid}-amount`} color="$color10" fontSize="$3">
            Monto ($) *
          </Label>
          <Input
            id={`${uid}-amount`}
            placeholder="0.00"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            returnKeyType="done"
            size="$4"
          />
        </YStack>
        <YStack flex={1} gap="$1">
          <Label htmlFor={`${uid}-date`} color="$color10" fontSize="$3">
            Fecha
          </Label>
          <Input
            id={`${uid}-date`}
            placeholder="YYYY-MM-DD"
            value={date}
            onChangeText={setDate}
            returnKeyType="done"
            size="$4"
          />
        </YStack>
      </XStack>

      <Button
        theme="blue"
        size="$4"
        icon={loading ? <Spinner /> : undefined}
        disabled={!canSubmit || loading}
        onPress={() =>
          onSubmit({
            category,
            description: description.trim(),
            amount: parseFloat(amount),
            date,
          })
        }
      >
        Registrar gasto
      </Button>
    </YStack>
  );
}

// ── ExpensesScreen ────────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const expenseRepo = useExpenseRepository();
  const colorScheme = useColorScheme();
  const themeName = colorScheme === "dark" ? "dark" : "light";

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [periodTotal, setPeriodTotal] = useState(0);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  const nav = usePeriodNavigation();

  const loadData = useCallback(async () => {
    setLoadingList(true);
    try {
      let list: Expense[];
      let total: number;
      if (nav.period === "day") {
        [list, total] = await Promise.all([
          expenseRepo.findByDay(nav.selectedDay),
          expenseRepo.dayTotal(nav.selectedDay),
        ]);
      } else if (nav.period === "week") {
        const wkEnd = weekEndISO(nav.selectedWeekStart);
        [list, total] = await Promise.all([
          expenseRepo.findByDateRange(nav.selectedWeekStart, wkEnd),
          expenseRepo.rangeTotal(nav.selectedWeekStart, wkEnd),
        ]);
      } else if (nav.period === "month") {
        [list, total] = await Promise.all([
          expenseRepo.findByMonth(nav.selectedMonth),
          expenseRepo.monthlyTotal(nav.selectedMonth),
        ]);
      } else if (nav.period === "year") {
        [list, total] = await Promise.all([
          expenseRepo.findByYear(nav.selectedYear),
          expenseRepo.rangeTotal(
            `${nav.selectedYear}-01-01`,
            `${nav.selectedYear}-12-31`,
          ),
        ]);
      } else {
        [list, total] = await Promise.all([
          expenseRepo.findByDateRange(nav.dateRange.from, nav.dateRange.to),
          expenseRepo.rangeTotal(nav.dateRange.from, nav.dateRange.to),
        ]);
      }
      setExpenses(list);
      setPeriodTotal(total);
    } finally {
      setLoadingList(false);
    }
  }, [
    expenseRepo,
    nav.period,
    nav.selectedDay,
    nav.selectedMonth,
    nav.selectedWeekStart,
    nav.selectedYear,
    nav.dateRange,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (data: {
    category: ExpenseCategory;
    description: string;
    amount: number;
    date: string;
  }) => {
    setSaving(true);
    try {
      await expenseRepo.create(data);
      await loadData();
      setShowCreateSheet(false);
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (expense: Expense) => {
    Alert.alert(
      "Eliminar gasto",
      `¿Eliminar "${expense.description}" por $${fmtCurrency(expense.amount)}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await expenseRepo.delete(expense.id);
              await loadData();
            } catch (e) {
              Alert.alert("Error", (e as Error).message);
            }
          },
        },
      ],
    );
  };

  return (
    <YStack flex={1} bg="$background">
      {/* Period selector + stats */}
      <YStack px="$4" pt="$2" pb="$2" gap="$2">
        <XStack
          style={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <Text fontSize="$3" color="$color10">
            Total: ${fmtCurrency(periodTotal)}
          </Text>
          <Button
            theme="blue"
            size="$3"
            icon={<Plus />}
            onPress={() => setShowCreateSheet(true)}
          >
            Nuevo
          </Button>
        </XStack>
        <PeriodSelector nav={nav} />
      </YStack>

      {/* List */}
      {loadingList ? (
        <YStack
          flex={1}
          style={{ alignItems: "center", justifyContent: "center" }}
        >
          <Spinner size="large" />
        </YStack>
      ) : expenses.length === 0 ? (
        <EmptyState
          icon={<Receipt size={48} color="$color8" />}
          title="No hay gastos registrados."
          description='Toca "Nuevo" para agregar uno.'
        />
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => (
            <Card bg="$color1" borderWidth={1} borderColor="$color4" p="$3">
              <XStack style={{ alignItems: "center" }} gap="$3">
                <YStack
                  width={44}
                  height={44}
                  bg={CATEGORY_BG[item.category] as any}
                  style={{
                    borderRadius: 22,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Receipt
                    size={20}
                    color={CATEGORY_COLORS[item.category] as any}
                  />
                </YStack>

                <YStack flex={1} gap="$0.5">
                  <Text fontSize="$4" fontWeight="600" color="$color">
                    {item.description}
                  </Text>
                  <XStack gap="$2" style={{ alignItems: "center" }}>
                    <YStack
                      bg={CATEGORY_BG[item.category] as any}
                      px="$2"
                      py="$0.5"
                      style={{ borderRadius: 4 }}
                    >
                      <Text
                        fontSize="$2"
                        color={CATEGORY_COLORS[item.category] as any}
                        fontWeight="600"
                      >
                        {EXPENSE_CATEGORIES[item.category]}
                      </Text>
                    </YStack>
                    <Text fontSize="$2" color="$color10">
                      {fmtDate(item.date)}
                    </Text>
                  </XStack>
                </YStack>

                <XStack style={{ alignItems: "center" }} gap="$2">
                  <Text fontSize="$5" fontWeight="bold" color="$red10">
                    ${fmtCurrency(item.amount)}
                  </Text>
                  <Button
                    size="$2"
                    theme="red"
                    chromeless
                    icon={Trash2}
                    onPress={() => handleDelete(item)}
                  />
                </XStack>
              </XStack>
            </Card>
          )}
        />
      )}

      {/* ── Create Sheet ─────────────────────────────────────────────────── */}
      <Sheet
        open={showCreateSheet}
        onOpenChange={setShowCreateSheet}
        modal
        dismissOnSnapToBottom
        snapPoints={[80]}
      >
        <Sheet.Overlay
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor={OVERLAY}
        />
        <Sheet.Frame theme={themeName as any} bg="$background">
          <Sheet.Handle />
          <Sheet.ScrollView
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <ExpenseForm onSubmit={handleCreate} loading={saving} />
          </Sheet.ScrollView>
        </Sheet.Frame>
      </Sheet>
    </YStack>
  );
}
