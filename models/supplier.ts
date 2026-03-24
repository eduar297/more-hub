export interface Supplier {
  id: number;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
}

export type CreateSupplierInput = Omit<Supplier, "id" | "createdAt">;
export type UpdateSupplierInput = Partial<CreateSupplierInput>;
