import { ChevronDown, Plus, Receipt, Trash2 } from "@tamagui/lucide-icons";
import { useCallback, useEffect, useId, useState } from "react";
import { Alert, FlatList } from "react-native";
import {
    Button,
    Card,
    Input,
    Label,
    Select,
    Sheet,
    Spinner,
    Text,
    XStack,
    YStack,
} from "tamagui";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { useExpenseRepository } from "@/hooks/use-expense-repository";
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

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
        <Select
          id={`${uid}-cat`}
          value={category}
          onValueChange={(v) => setCategory(v as ExpenseCategory)}
        >
          <Select.Trigger size="$4" iconAfter={ChevronDown}>
            <Select.Value placeholder="Selecciona categoría" />
          </Select.Trigger>
          <Select.Content>
            <Select.ScrollUpButton />
            <Select.Viewport>
              {categoryKeys.map((key, idx) => (
                <Select.Item key={key} value={key} index={idx}>
                  <Select.ItemText>{EXPENSE_CATEGORIES[key]}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton />
          </Select.Content>
        </Select>
      </YStack>

      {/* Description */}
      <YStack gap="$1">
        <Label htmlFor={`${uid}-desc`} color="$color10" fontSize="$3">
          Descripción *
        </Label>
        <Input
          id={`${uid}-desc`}
          placeholder="Ej: Pago de electricidad marzo"
          value={description}
          onChangeText={setDescription}
          returnKeyType="next"
          size="$4"
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
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoadingList(true);
    try {
      const [list, total] = await Promise.all([
        expenseRepo.findAll(),
        expenseRepo.monthlyTotal(),
      ]);
      setExpenses(list);
      setMonthlyTotal(total);
    } finally {
      setLoadingList(false);
    }
  }, [expenseRepo]);

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
      {/* Header */}
      <XStack
        px="$4"
        pt="$6"
        pb="$3"
        style={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <YStack>
          <Text fontSize="$7" fontWeight="bold" color="$color">
            Gastos
          </Text>
          <Text fontSize="$3" color="$color10">
            Este mes: ${fmtCurrency(monthlyTotal)}
          </Text>
        </YStack>
        <Button
          theme="blue"
          size="$3"
          icon={<Plus />}
          onPress={() => setShowCreateSheet(true)}
        >
          Nuevo
        </Button>
      </XStack>

      {/* List */}
      {loadingList ? (
        <YStack
          flex={1}
          style={{ alignItems: "center", justifyContent: "center" }}
        >
          <Spinner size="large" />
        </YStack>
      ) : expenses.length === 0 ? (
        <YStack
          flex={1}
          style={{ alignItems: "center", justifyContent: "center" }}
          gap="$3"
          px="$6"
        >
          <Receipt size={48} color="$color8" />
          <Text fontSize="$5" color="$color8" style={{ textAlign: "center" }}>
            No hay gastos registrados.{"\n"}Toca &quot;Nuevo&quot; para agregar
            uno.
          </Text>
        </YStack>
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
          backgroundColor="rgba(0,0,0,0.5)"
        />
        <Sheet.Frame theme={themeName as any} bg="$background">
          <Sheet.Handle />
          <Sheet.ScrollView keyboardShouldPersistTaps="handled">
            <ExpenseForm onSubmit={handleCreate} loading={saving} />
          </Sheet.ScrollView>
        </Sheet.Frame>
      </Sheet>
    </YStack>
  );
}
