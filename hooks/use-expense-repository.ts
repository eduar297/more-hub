import { ExpenseRepository } from "@/repositories/expense.repository";
import { useSQLiteContext } from "expo-sqlite";
import { useMemo } from "react";

export function useExpenseRepository() {
  const db = useSQLiteContext();
  return useMemo(() => new ExpenseRepository(db), [db]);
}
