import type { UserRole } from "@/models/user";
import React, {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
} from "react";

export interface AuthUser {
  id: number;
  name: string;
  role: UserRole;
  photoUri?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  setUser: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);

  const setUser = useCallback((u: AuthUser | null) => {
    setUserState(u);
  }, []);

  const logout = useCallback(() => {
    setUserState(null);
  }, []);

  const value = useMemo(
    () => ({ user, setUser, logout }),
    [user, setUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
