export type UserRole = "ADMIN" | "WORKER";

export interface User {
  id: number;
  name: string;
  role: UserRole;
  pinHash: string;
  photoUri: string | null;
  /** MD5 hash of the local photo file — used for cloud sync change detection */
  photoHash: string | null;
  /** Path in Supabase Storage (e.g. "users/7.jpg") — null if not yet uploaded */
  cloudPhotoPath: string | null;
  storeId: number | null;
  createdAt: string;
  updatedAt: string;
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
