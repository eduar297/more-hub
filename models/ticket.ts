export type PaymentMethod = "CASH" | "CARD";
export type TicketStatus = "ACTIVE" | "VOIDED";

export interface Ticket {
  id: number;
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
}

export interface TicketItem {
  id: number;
  ticketId: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  barcode: string | null;
  photoUri: string | null;
  originalPrice: number | null;
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
