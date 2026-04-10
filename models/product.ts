export type SaleMode = "UNIT" | "VARIABLE";

export interface Product {
  id: number;
  name: string;
  code: string;
  /** Legacy field kept for DB compat. Use costPrice / salePrice instead. */
  pricePerBaseUnit: number;
  /** Cost price (purchase). Used for margin calculations. */
  costPrice: number;
  /** Actual selling price shown to workers. */
  salePrice: number;
  /** Whether this product is visible to workers. */
  visible: boolean;
  baseUnitId: number;
  stockBaseQty: number;
  saleMode: SaleMode;
  photoUri: string | null;
  /** MD5 hash of the local photo file — used for cloud sync change detection */
  photoHash: string | null;
  /** Path in Supabase Storage (e.g. "products/42.jpg") — null if not yet uploaded */
  cloudPhotoPath: string | null;
  /** Optional product description / details shown in catalog. */
  details: string | null;
  storeId: number;
  createdAt: string;
  updatedAt: string;
}

export type CreateProductInput = Omit<
  Product,
  "id" | "storeId" | "createdAt" | "updatedAt" | "photoHash" | "cloudPhotoPath"
>;
export type UpdateProductInput = Partial<
  Omit<
    Product,
    | "id"
    | "storeId"
    | "createdAt"
    | "updatedAt"
    | "photoHash"
    | "cloudPhotoPath"
  >
>;
