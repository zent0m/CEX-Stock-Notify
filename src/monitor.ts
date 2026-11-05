import { config } from "./config";
import { fetchProducts } from "./cex";
import { findStockChanges, isInStock } from "./diff";
import { emailConfigured, notifyChanges, sendDailyEmail, sendStartupNotice } from "./notify";
import { createStateStore } from "./state";
import { DailyStats, Meta, Product, Snapshot } from "./types";

export interface CheckResult {
  ok: boolean;
  at: string;
  products?: number;
  inStock?: number;
  changes?: number;
  restocks?: number;
  soldOut?: number;
  reduced?: number;
  baseline?: boolean;
  error?: string;
}

const store = createStateStore();
let running: Promise<CheckResult> | null = null;
export let lastResult: CheckResult | null = null;
/** Products from the last successful check, for the /watchlist page and daily email. */
export let latestProducts: Product[] = [];
export let latestProductsAt: string | null = null;

// ---------- London time helpers (daily email is scheduled in UK time) ----------

export function londonNow(d = new Date()): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

// ---------- Daily-email bookkeeping ----------

function freshStats(): DailyStats {
  return { since: new Date().toISOString(), checks: 0, failures: 0, restocks: 0, reduced: 0, soldOut: 0, emailsSent: 0, lastError: null };
}

let meta: Meta | null = null;

async function getMeta(): Promise<Meta> {
  if (meta) return meta;
  meta = await store.loadMeta().catch(() => null);
  if (!meta) {
    // Fresh start (e.g. Render wiped the disk). If we're already past today's daily hour,
    // the "monitor started" email covers today, so don't send a daily one straight after it.
    const { date, hour } = londonNow();
    const pastHour = config.daily.hour !== null && hour >= config.daily.hour;
    meta = { lastDailyDate: pastHour ? date : null, stats: freshStats() };
  }
  return meta;
}

async function afterCheck(result: CheckResult): Promise<void> {
  const m = await getMeta();
  const s = m.stats;
  s.checks++;
  if (!result.ok) {
    s.failures++;
    s.lastError = result.error ?? "unknown error";
  }
  s.restocks += result.restocks ?? 0;
  s.soldOut += result.soldOut ?? 0;
  s.reduced += result.reduced ?? 0;
  if (result.changes) s.emailsSent++;

  const h = config.daily.hour;
  const { date, hour } = londonNow();
  if (h !== null && hour >= h && m.lastDailyDate !== date) {
    try {
      await sendDailyEmail({
        products: latestProducts,
        stats: s,
        lastCheckAt: result.at,
        lastCheckOk: result.ok,
        lastCheckError: result.error ?? null,
      });
      console.log(`[${result.at}] Daily check-in email sent`);
      m.lastDailyDate = date;
      m.stats = freshStats();
    } catch (err) {
      console.error("Daily email failed (will retry next check):", (err as Error).message);
    }
  }

  await store.saveMeta(m).catch((err) => console.error("Could not save meta:", err.message));
}

// ---------- The check itself ----------

async function runCheck(): Promise<CheckResult> {
  const at = new Date().toISOString();
  try {
    const products = await fetchProducts();
    const inStock = products.filter(isInStock).length;

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
      latestProducts = products;
      latestProductsAt = at;
      console.log(`[${at}] Baseline saved: ${products.length} models, ${inStock} in stock`);
      await sendStartupNotice(products).catch((err) => console.error("Startup email failed:", err.message));
      return { ok: true, at, products: products.length, inStock, changes: 0, baseline: true };
    }

    const changes = findStockChanges(previous, products);
    if (changes.length > 0) {
      // Notify before saving, so a failed email is retried on the next check.
      await notifyChanges(changes);
    }
    await store.save(snapshot);
    latestProducts = products;
    latestProductsAt = at;

    const count = (k: string) => changes.filter((c) => c.kind === k).length;
    const result: CheckResult = {
      ok: true,
      at,
      products: products.length,
      inStock,
      changes: changes.length,
      restocks: count("restock"),
      soldOut: count("soldout"),
      reduced: count("reduced"),
    };

    console.log(
      `[${at}] ${products.length} models, ${inStock} in stock, ${changes.length} changes` +
        (changes.length ? ` (${result.restocks} restock, ${result.soldOut} sold out, ${result.reduced} down)` : ""),
    );
    for (const c of changes) {
      console.log(
        `  ${c.kind.padEnd(7)} £${c.product.price} ${c.product.name} online ${c.onlineBefore}->${c.onlineAfter}` +
          (c.newStores.length ? ` +[${c.newStores.join(", ")}]` : "") +
          (c.goneStores.length ? ` -[${c.goneStores.join(", ")}]` : ""),
      );
    }
    return result;
  } catch (err) {
    const error = (err as Error).message;
    console.error(`[${at}] Check failed: ${error}`);
    return { ok: false, at, error };
  }
}

/** Run a check (plus daily-email bookkeeping), or join the one already in progress. */
export function check(): Promise<CheckResult> {
  if (!running) {
    running = (async () => {
      const result = await runCheck();
      lastResult = result;
      await afterCheck(result).catch((err) => console.error("Post-check step failed:", err.message));
      return result;
    })().finally(() => (running = null));
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
    `decreases=${w.alertOnDecrease}`,
    `daily=${config.daily.hour !== null ? `${config.daily.hour}:00 UK` : "off"}`,
    `state=${store.kind}`,
    `email=${emailConfigured() ? `${config.email.to.length} recipient(s) from ${config.email.from}` : "DISABLED"}`,
  ].join(" ");
}
