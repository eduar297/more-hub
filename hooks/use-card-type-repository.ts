import { useStore } from "@/contexts/store-context";
import { CardTypeRepository } from "@/repositories/card-type.repository";
import { useSQLiteContext } from "expo-sqlite";
import { useMemo } from "react";

export function useCardTypeRepository() {
  const db = useSQLiteContext();
  const { currentStore } = useStore();

  return useMemo(
    () => new CardTypeRepository(db, currentStore?.id ?? 0),
    [db, currentStore?.id],
  );
}
