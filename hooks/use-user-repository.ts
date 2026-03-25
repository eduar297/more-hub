import { UserRepository } from "@/repositories/user.repository";
import { useSQLiteContext } from "expo-sqlite";
import { useMemo } from "react";

export function useUserRepository() {
  const db = useSQLiteContext();
  return useMemo(() => new UserRepository(db), [db]);
}
