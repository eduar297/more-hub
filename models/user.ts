export type UserRole = "ADMIN" | "WORKER";

export interface User {
  id: number;
  name: string;
  role: UserRole;
  pinHash: string;
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
}>;
