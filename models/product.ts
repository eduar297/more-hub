export type SaleMode = "UNIT" | "VARIABLE";

export interface PriceTier {
  id: number;
  productId: number;
  minQty: number;
  maxQty: number | null;
  price: number;
}

export interface PriceTierInput {
  minQty: number;
  maxQty: number | null;
  price: number;
}

export interface Product {
  id: number;
  name: string;
  code: string;
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
  priceTiers?: PriceTier[];
}

export type CreateProductInput = Omit<
  Product,
  | "id"
  | "storeId"
  | "createdAt"
  | "updatedAt"
  | "photoHash"
  | "cloudPhotoPath"
  | "priceTiers"
> & { priceTiers?: PriceTierInput[] };
export type UpdateProductInput = Partial<
  Omit<
    Product,
    | "id"
    | "storeId"
    | "createdAt"
    | "updatedAt"
    | "photoHash"
    | "cloudPhotoPath"
    | "priceTiers"
  >
> & { priceTiers?: PriceTierInput[] };
