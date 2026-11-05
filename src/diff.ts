import { config } from "./config";
import { ChangeKind, Product, Snapshot, StockChange } from "./types";

function storeWatched(store: string): boolean {
  const filter = config.watch.storeFilter;
  if (filter.length === 0) return true;
  const s = store.toLowerCase();
  return filter.some((f) => s.includes(f));
}

export const isInStock = (p: Pick<Product, "onlineQty" | "stores">) => p.onlineQty > 0 || p.stores.length > 0;

const KIND_ORDER: Record<ChangeKind, number> = { restock: 0, soldout: 1, reduced: 2 };

/**
 * Compare the current products against the previous snapshot.
 * Models missing from the current results are ignored (CeX still returns out-of-stock models,
 * so a missing one has been delisted or filtered out, e.g. after changing MAX_PRICE).
 */
export function findStockChanges(previous: Snapshot, current: Product[]): StockChange[] {
  const w = config.watch;
  const changes: StockChange[] = [];

  for (const product of current) {
    const before = previous.products[product.boxId];
    const onlineBefore = before?.onlineQty ?? 0;
    const storesBefore = before?.stores ?? [];
    const prevSet = new Set(storesBefore);
    const curSet = new Set(product.stores);

    const newStores = w.stores ? product.stores.filter((s) => !prevSet.has(s) && storeWatched(s)) : [];
    const goneStores = w.stores ? storesBefore.filter((s) => !curSet.has(s) && storeWatched(s)) : [];
    const onlineUp = w.online && product.onlineQty > onlineBefore;
    const onlineDown = w.online && product.onlineQty < onlineBefore;

    let kind: ChangeKind;
    if (onlineUp || newStores.length > 0) kind = "restock";
    else if (!w.alertOnDecrease) continue;
    else if (before && isInStock(before) && !isInStock(product)) kind = "soldout";
    else if (onlineDown || goneStores.length > 0) kind = "reduced";
    else continue;

    changes.push({
      kind,
      product,
      isNewModel: !before,
      onlineBefore,
      onlineAfter: product.onlineQty,
      newStores,
      goneStores,
    });
  }

  // Restocks first, then sell-outs, then reductions; cheapest first within each.
  return changes.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.product.price - b.product.price);
}
