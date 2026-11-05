import { config } from "./config";
import { Product, Snapshot, StockChange } from "./types";

function storeWatched(store: string): boolean {
  const filter = config.watch.storeFilter;
  if (filter.length === 0) return true;
  const s = store.toLowerCase();
  return filter.some((f) => s.includes(f));
}

/** Work out which products have gained stock since the previous snapshot. */
export function findStockChanges(previous: Snapshot, current: Product[]): StockChange[] {
  const changes: StockChange[] = [];

  for (const product of current) {
    const before = previous.products[product.boxId];
    const isNewModel = !before;
    const onlineBefore = before?.onlineQty ?? 0;
    const storesBefore = new Set(before?.stores ?? []);

    const onlineUp = config.watch.online && product.onlineQty > onlineBefore;
    const newStores = config.watch.stores
      ? product.stores.filter((s) => !storesBefore.has(s) && storeWatched(s))
      : [];

    if (onlineUp || newStores.length > 0) {
      changes.push({
        product,
        isNewModel,
        onlineBefore,
        onlineAfter: product.onlineQty,
        newStores,
      });
    }
  }

  // Cheapest first, so the best deals are at the top of the notification list.
  return changes.sort((a, b) => a.product.price - b.product.price);
}
