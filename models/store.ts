export interface Store {
  id: number;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  logoUri: string | null;
  /** MD5 hash of the local logo file — used for cloud sync change detection */
  logoHash: string | null;
  /** Path in Supabase Storage (e.g. "stores/1.jpg") — null if not yet uploaded */
  cloudLogoPath: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateStoreInput = Omit<
  Store,
  "id" | "createdAt" | "updatedAt" | "logoHash" | "cloudLogoPath"
>;
export type UpdateStoreInput = Partial<
  Omit<Store, "id" | "createdAt" | "updatedAt" | "logoHash" | "cloudLogoPath">
>;
