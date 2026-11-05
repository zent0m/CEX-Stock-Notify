import { config } from "./config";
import { fetchProducts } from "./cex";
import { findStockChanges } from "./diff";
import { emailConfigured, notifyChanges, sendStartupNotice } from "./notify";
import { createStateStore } from "./state";
import { Snapshot } from "./types";

export interface CheckResult {
  ok: boolean;
  at: string;
  products?: number;
  inStock?: number;
  changes?: number;
  baseline?: boolean;
  error?: string;
}

const store = createStateStore();
let running: Promise<CheckResult> | null = null;
export let lastResult: CheckResult | null = null;

export function stateStoreKind(): string {
  return store.kind;
}

async function runCheck(): Promise<CheckResult> {
  const at = new Date().toISOString();
  try {
    const products = await fetchProducts();
    const inStock = products.filter((p) => p.onlineQty > 0 || p.stores.length > 0).length;

    // An empty result almost certainly means CeX changed something or blocked us —
    // don't overwrite the saved state, or every card would "reappear" next time.
    if (products.length === 0) {
      throw new Error("CeX returned no matching products; keeping previous state");
    }

    const snapshot: Snapshot = {
      takenAt: at,
      products: Object.fromEntries(products.map((p) => [p.boxId, p])),
    };

    const previous = await store.load();

    if (!previous) {
      await store.save(snapshot);
      console.log(`[${at}] Baseline saved: ${products.length} models, ${inStock} in stock`);
      await sendStartupNotice(products.length, inStock).catch((err) =>
        console.error("Startup email failed:", err.message),
      );
      return { ok: true, at, products: products.length, inStock, changes: 0, baseline: true };
    }

    const changes = findStockChanges(previous, products);
    if (changes.length > 0) {
      // Notify before saving, so a failed email is retried on the next check.
      await notifyChanges(changes);
    }
    await store.save(snapshot);

    console.log(`[${at}] ${products.length} models, ${inStock} in stock, ${changes.length} changes`);
    for (const c of changes) {
      console.log(`  £${c.product.price} ${c.product.name} online ${c.onlineBefore}->${c.onlineAfter} stores +[${c.newStores.join(", ")}]`);
    }
    return { ok: true, at, products: products.length, inStock, changes: changes.length };
  } catch (err) {
    const error = (err as Error).message;
    console.error(`[${at}] Check failed: ${error}`);
    return { ok: false, at, error };
  }
}

/** Run a check, or join the one already in progress. */
export function check(): Promise<CheckResult> {
  if (!running) {
    running = runCheck()
      .then((r) => (lastResult = r))
      .finally(() => (running = null));
  }
  return running;
}

/** Seconds since the last finished check (Infinity if none). */
export function secondsSinceLastCheck(): number {
  return lastResult ? (Date.now() - Date.parse(lastResult.at)) / 1000 : Infinity;
}

export function describeConfig(): string {
  const w = config.watch;
  return [
    `query="${w.query}"`,
    `Ti=${w.includeTi}`,
    `maxPrice=${w.maxPrice ?? "none"}`,
    `online=${w.online}`,
    `stores=${w.stores}${w.storeFilter.length ? ` (${w.storeFilter.join(", ")})` : ""}`,
    `state=${store.kind}`,
    `email=${emailConfigured() ? `${config.email.to.length} recipient(s) from ${config.email.from}` : "DISABLED"}`,
  ].join(" ");
}
