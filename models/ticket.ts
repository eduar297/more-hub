export type PaymentMethod = "CASH" | "CARD";
export type TicketStatus = "ACTIVE" | "VOIDED";

export interface Ticket {
  id: string;
  createdAt: string;
  paymentMethod: PaymentMethod;
  total: number;
  itemCount: number;
  workerId: number | null;
  workerName: string | null;
  workerPhotoUri: string | null;
  storeId: number;
  status: TicketStatus;
  voidedAt: string | null;
  voidedBy: number | null;
  voidReason: string | null;
  updatedAt: string;
  syncedAt: string | null;
}

export interface TicketItem {
  id: number;
  ticketId: string;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  /** Snapshot of FIFO unit cost at sale time (null only for legacy data with no batches). */
  costPrice: number | null;
  code: string | null;
  photoUri: string | null;
  originalPrice: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketInput {
  paymentMethod: PaymentMethod;
  workerId?: number | null;
  workerName?: string | null;
  items: {
    productId: number;
    productName: string;
    quantity: number;
    unitPrice: number;
  }[];
}
