import { TicketRepository } from "@/repositories/ticket.repository";
import { useSQLiteContext } from "expo-sqlite";
import { useMemo } from "react";

export function useTicketRepository() {
  const db = useSQLiteContext();
  return useMemo(() => new TicketRepository(db), [db]);
}
