/** One CeX product model ("box"), as stored between checks. */
export interface Product {
  boxId: string;
  name: string;
  price: number;
  onlineQty: number;
  stores: string[];
  /** Product photo URL (CeX static CDN), if CeX has one. */
  image?: string;
}

export interface Snapshot {
  takenAt: string;
  products: Record<string, Product>;
}

/**
 * restock  – online stock went up and/or a store gained stock (or a new model appeared with stock)
 * reduced  – online stock went down and/or a store lost stock, but it's still in stock somewhere
 * soldout  – had stock last check, now has none online or in any store
 */
export type ChangeKind = "restock" | "reduced" | "soldout";

export interface StockChange {
  kind: ChangeKind;
  product: Product;
  isNewModel: boolean;
  onlineBefore: number;
  onlineAfter: number;
  newStores: string[];
  goneStores: string[];
}

/** Running totals for the daily "still running" email, plus when it was last sent. */
export interface Meta {
  /** London-time date (YYYY-MM-DD) the daily email was last sent. */
  lastDailyDate: string | null;
  stats: DailyStats;
}

export interface DailyStats {
  since: string;
  checks: number;
  failures: number;
  restocks: number;
  reduced: number;
  soldOut: number;
  emailsSent: number;
  lastError: string | null;
}
