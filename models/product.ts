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
  storeId: number;
}

export type CreateProductInput = Omit<Product, "id" | "storeId">;
export type UpdateProductInput = Partial<Omit<Product, "id" | "storeId">>;
