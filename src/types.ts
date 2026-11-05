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

export interface StockChange {
  product: Product;
  isNewModel: boolean;
  onlineBefore: number;
  onlineAfter: number;
  newStores: string[];
}
