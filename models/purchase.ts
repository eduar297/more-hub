export interface Purchase {
  id: number;
  /** FK to suppliers.id — null when no supplier selected */
  supplierId: number | null;
  /** Snapshot of supplier name at purchase time */
  supplierName: string;
  notes: string | null;
  /** Sum of item costs + transportCost */
  total: number;
  /** Cost of transport for this purchase */
  transportCost: number;
  itemCount: number;
  createdAt: string;
}

export interface PurchaseItem {
  id: number;
  purchaseId: number;
  productId: number;
  /** Snapshot of product name at purchase time */
  productName: string;
  quantity: number;
  /** Cost price paid per unit */
  unitCost: number;
  subtotal: number;
}

export interface CreatePurchaseInput {
  supplierId: number | null;
  supplierName: string;
  notes: string | null;
  transportCost: number;
  items: {
    productId: number;
    productName: string;
    quantity: number;
    unitCost: number;
  }[];
}
