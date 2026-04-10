export interface WebConfig {
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string;
  tagline: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  showPrices: boolean;
  showStock: boolean;
  theme: "light" | "dark";
}

export const DEFAULT_WEB_CONFIG: WebConfig = {
  logoUrl: null,
  bannerUrl: null,
  primaryColor: "#3b82f6",
  tagline: null,
  description: null,
  phone: null,
  whatsapp: null,
  address: null,
  instagram: null,
  facebook: null,
  tiktok: null,
  showPrices: true,
  showStock: false,
  theme: "light",
};

/** Convert snake_case DB row → camelCase model */
export function parseWebConfig(row: Record<string, unknown>): WebConfig {
  return {
    logoUrl: (row.logo_url as string) ?? null,
    bannerUrl: (row.banner_url as string) ?? null,
    primaryColor: (row.primary_color as string) ?? "#3b82f6",
    tagline: (row.tagline as string) ?? null,
    description: (row.description as string) ?? null,
    phone: (row.phone as string) ?? null,
    whatsapp: (row.whatsapp as string) ?? null,
    address: (row.address as string) ?? null,
    instagram: (row.instagram as string) ?? null,
    facebook: (row.facebook as string) ?? null,
    tiktok: (row.tiktok as string) ?? null,
    showPrices: row.show_prices !== false,
    showStock: row.show_stock === true,
    theme: row.theme === "dark" ? "dark" : "light",
  };
}

/** Convert camelCase model → snake_case JSONB for the RPC */
export function serializeWebConfig(c: WebConfig): Record<string, unknown> {
  return {
    logo_url: c.logoUrl,
    banner_url: c.bannerUrl,
    primary_color: c.primaryColor,
    tagline: c.tagline,
    description: c.description,
    phone: c.phone,
    whatsapp: c.whatsapp,
    address: c.address,
    instagram: c.instagram,
    facebook: c.facebook,
    tiktok: c.tiktok,
    show_prices: c.showPrices,
    show_stock: c.showStock,
    theme: c.theme,
  };
}
