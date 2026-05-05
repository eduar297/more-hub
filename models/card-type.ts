export interface CardType {
  id: number;
  name: string;
  description: string | null;
  cardNumber: string | null;
  isActive: boolean;
  storeId: number;
  createdAt: string;
  updatedAt: string;
}

export type CreateCardTypeInput = Omit<
  CardType,
  "id" | "storeId" | "createdAt" | "updatedAt"
>;

export type UpdateCardTypeInput = Partial<
  Omit<CardType, "id" | "storeId" | "createdAt" | "updatedAt">
>;

// Common card types for Cuba
export const CUBA_CARD_TYPES = [
  {
    name: "Transfermóvil",
    description: "Transferencias móviles",
    cardNumber: null,
  },
  {
    name: "EnZona",
    description: "Pagos digitales EnZona",
    cardNumber: null,
  },
  {
    name: "BCC",
    description: "Banco Central de Cuba",
    cardNumber: null,
  },
  {
    name: "BPA",
    description: "Banco Popular de Ahorro",
    cardNumber: null,
  },
  {
    name: "BICSA",
    description: "Banco de Inversión y Comercio Exterior",
    cardNumber: null,
  },
  {
    name: "Bandec",
    description: "Banco de Desarrollo Económico y Social",
    cardNumber: null,
  },
  {
    name: "BFI",
    description: "Banco Financiero Internacional",
    cardNumber: null,
  },
  {
    name: "QvaPay",
    description: "Monedero digital QvaPay",
    cardNumber: null,
  },
] as const;
