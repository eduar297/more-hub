import { EmptyState } from "@/components/ui/empty-state";
import { ICON_BTN_BG } from "@/constants/colors";
import { useStore } from "@/contexts/store-context";
import { ChevronDown, Plus, Receipt, Trash2, X } from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useId, useState } from "react";
import {
    Alert,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    Button,
    Card,
    Input,
    Label,
    Spinner,
    Text,
    TextArea,
    XStack,
    YStack,
} from "tamagui";

import { PeriodSelector } from "@/components/admin/period-selector";
import { todayISO, weekEndISO } from "@/utils/format";

import { useColors } from "@/hooks/use-colors";
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
  const c = useColors();
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

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView
          edges={["top"]}
          style={[eStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack
            p="$3"
            px="$4"
            style={{ alignItems: "center", justifyContent: "space-between" }}
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <XStack style={{ alignItems: "center" }} gap="$2">
              <Receipt size={18} color="$blue10" />
              <Text fontSize={16} fontWeight="700" color="$color">
                Categoría de gasto
              </Text>
            </XStack>
            <TouchableOpacity
              onPress={() => setOpen(false)}
              hitSlop={8}
              style={eStyles.closeBtn}
            >
              <X size={18} color="$color" />
            </TouchableOpacity>
          </XStack>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
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
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

// ── ExpenseForm ───────────────────────────────────────────────────────────────

function ExpenseForm({
  onSubmit,
  loading,
  onCancel,
}: {
  onSubmit: (data: {
    category: ExpenseCategory;
    description: string;
    amount: number;
    date: string;
  }) => void;
  loading?: boolean;
  onCancel?: () => void;
}) {
  const uid = useId();
  const c = useColors();
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
    <View style={{ flex: 1 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
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
                returnKeyType="next"
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
        </YStack>
      </ScrollView>

      {/* ── Fixed footer ─────────────────────────────────────── */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: c.border,
          backgroundColor: c.modalBg,
        }}
      >
        <XStack gap="$2.5">
          {onCancel && (
            <Button flex={1} variant="outlined" onPress={onCancel} size="$4">
              Cancelar
            </Button>
          )}
          <Button
            flex={1}
            theme="blue"
            size="$4"
            icon={loading ? <Spinner /> : undefined}
            disabled={!canSubmit || loading}
            opacity={!canSubmit || loading ? 0.5 : 1}
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
        </XStack>
      </View>
    </View>
  );
}

// ── ExpensesScreen ────────────────────────────────────────────────────────────

export function ExpensesSection() {
  const expenseRepo = useExpenseRepository();
  const c = useColors();
  const { syncVersion } = useStore();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [periodTotal, setPeriodTotal] = useState(0);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

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
    syncVersion,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

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
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setSelectedExpense(item)}
            >
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
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── Detail Modal ────────────────────────────────────────────────── */}
      <Modal
        visible={!!selectedExpense}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedExpense(null)}
      >
        <SafeAreaView
          edges={["top"]}
          style={[eStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack
            p="$3"
            px="$4"
            style={{ alignItems: "center", justifyContent: "space-between" }}
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <XStack style={{ alignItems: "center" }} gap="$2">
              <Receipt size={18} color="$blue10" />
              <Text fontSize={16} fontWeight="700" color="$color">
                Detalle de gasto
              </Text>
            </XStack>
            <TouchableOpacity
              onPress={() => setSelectedExpense(null)}
              hitSlop={8}
              style={eStyles.closeBtn}
            >
              <X size={18} color="$color" />
            </TouchableOpacity>
          </XStack>

          {selectedExpense && (
            <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
              {/* Category badge */}
              <XStack style={{ alignItems: "center" }} gap="$3">
                <YStack
                  width={52}
                  height={52}
                  bg={CATEGORY_BG[selectedExpense.category] as any}
                  style={{
                    borderRadius: 26,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Receipt
                    size={24}
                    color={CATEGORY_COLORS[selectedExpense.category] as any}
                  />
                </YStack>
                <YStack
                  bg={CATEGORY_BG[selectedExpense.category] as any}
                  px="$3"
                  py="$1"
                  style={{ borderRadius: 6 }}
                >
                  <Text
                    fontSize="$4"
                    fontWeight="700"
                    color={CATEGORY_COLORS[selectedExpense.category] as any}
                  >
                    {EXPENSE_CATEGORIES[selectedExpense.category]}
                  </Text>
                </YStack>
              </XStack>

              {/* Description */}
              <YStack gap="$1">
                <Text fontSize="$3" color="$color10">
                  Descripción
                </Text>
                <Text fontSize="$5" fontWeight="600" color="$color">
                  {selectedExpense.description}
                </Text>
              </YStack>

              {/* Amount */}
              <YStack gap="$1">
                <Text fontSize="$3" color="$color10">
                  Monto
                </Text>
                <Text fontSize="$8" fontWeight="bold" color="$red10">
                  ${fmtCurrency(selectedExpense.amount)}
                </Text>
              </YStack>

              {/* Date */}
              <YStack gap="$1">
                <Text fontSize="$3" color="$color10">
                  Fecha
                </Text>
                <Text fontSize="$5" color="$color">
                  {fmtDate(selectedExpense.date)}
                </Text>
              </YStack>

              {/* Delete button */}
            </ScrollView>
          )}

          {selectedExpense && (
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderTopWidth: 1,
                borderTopColor: c.border,
                backgroundColor: c.modalBg,
              }}
            >
              <Button
                theme="red"
                size="$4"
                icon={Trash2}
                onPress={() => {
                  setSelectedExpense(null);
                  handleDelete(selectedExpense);
                }}
              >
                Eliminar gasto
              </Button>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* ── Create Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={showCreateSheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateSheet(false)}
      >
        <SafeAreaView
          edges={["top"]}
          style={[eStyles.modalRoot, { backgroundColor: c.modalBg }]}
        >
          <XStack
            p="$3"
            px="$4"
            style={{ alignItems: "center", justifyContent: "space-between" }}
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <XStack style={{ alignItems: "center" }} gap="$2">
              <Receipt size={18} color="$blue10" />
              <Text fontSize={16} fontWeight="700" color="$color">
                Nuevo gasto
              </Text>
            </XStack>
            <TouchableOpacity
              onPress={() => setShowCreateSheet(false)}
              hitSlop={8}
              style={eStyles.closeBtn}
            >
              <X size={18} color="$color" />
            </TouchableOpacity>
          </XStack>
          <ExpenseForm
            onSubmit={handleCreate}
            loading={saving}
            onCancel={() => setShowCreateSheet(false)}
          />
        </SafeAreaView>
      </Modal>
    </YStack>
  );
}

const eStyles = StyleSheet.create({
  modalRoot: { flex: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ICON_BTN_BG,
    alignItems: "center",
    justifyContent: "center",
  },
});
