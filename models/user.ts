export type UserRole = "ADMIN" | "WORKER";

export interface User {
  id: number;
  name: string;
  role: UserRole;
  pinHash: string;
  photoUri: string | null;
  createdAt: string;
}

export type CreateUserInput = {
  name: string;
  role: UserRole;
  pinHash: string;
};

export type UpdateUserInput = Partial<{
  name: string;
  pinHash: string;
  photoUri: string | null;
}>;
