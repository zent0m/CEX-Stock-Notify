import { config } from "./config";
import { changesEmail, dailyEmail, DailyInfo, startupEmail } from "./templates";
import { Product, StockChange } from "./types";

export interface Email {
  subject: string;
  html: string;
}

/** Pauses between attempts when Resend can't be reached or is rate-limiting us. */
const RETRY_DELAYS_MS = [5_000, 15_000];

class RetryableError extends Error {}

async function sendOnce(email: Email): Promise<void> {
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.email.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: config.email.from, to: config.email.to, ...email }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    // Node's fetch hides the real reason (DNS, TLS, timeout…) in err.cause.
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    const detail = cause ? ` (${cause.code ?? ""} ${cause.message ?? ""})`.replace("( ", "(") : "";
    throw new RetryableError(`Resend request failed: ${(err as Error).message}${detail}`);
  }
  if (!res.ok) {
    const msg = `Resend rejected the email: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`;
    throw res.status === 429 || res.status >= 500 ? new RetryableError(msg) : new Error(msg);
  }
}

export function emailConfigured(): boolean {
  return !!config.email.resendApiKey && config.email.to.length > 0;
}

/** Send an email via Resend's HTTP API, retrying network errors, 429s and 5xx. */
export async function sendEmail(email: Email): Promise<void> {
  if (!emailConfigured()) {
    console.warn(`[email disabled — set RESEND_API_KEY and EMAIL_TO] ${email.subject}`);
    return;
  }

  for (let attempt = 0; ; attempt++) {
    try {
      return await sendOnce(email);
    } catch (err) {
      if (!(err instanceof RetryableError) || attempt >= RETRY_DELAYS_MS.length) throw err;
      console.warn(`${err.message} — retrying in ${RETRY_DELAYS_MS[attempt] / 1000}s`);
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

/** One email per check, listing every stock change (restocks first, cheapest first). */
export async function notifyChanges(changes: StockChange[]): Promise<void> {
  if (changes.length === 0) return;
  await sendEmail(changesEmail(changes));
}

/** Sent after a fresh baseline: includes the full watchlist with prices and stock. */
export async function sendStartupNotice(products: Product[]): Promise<void> {
  await sendEmail(startupEmail(products));
}

export async function sendDailyEmail(info: DailyInfo): Promise<void> {
  await sendEmail(dailyEmail(info));
}

/**
 * A realistic preview using live data: two restocks (one flagged as a new model),
 * one model "sold out" and one with stock going down. Subject is marked as a test.
 */
export function sampleChanges(products: Product[]): StockChange[] {
  const stocked = [...products].filter((p) => p.onlineQty > 0 || p.stores.length > 0).sort((a, b) => a.price - b.price);
  if (stocked.length === 0) throw new Error("No in-stock products to build a sample from");
  const base = { onlineBefore: 0, onlineAfter: 0, newStores: [] as string[], goneStores: [] as string[], isNewModel: false };

  const changes: StockChange[] = stocked.slice(0, 2).map((p, i) => ({
    ...base,
    kind: "restock",
    product: p,
    isNewModel: i === 1,
    onlineAfter: p.onlineQty,
    newStores: p.stores,
  }));
  const sold = stocked[2];
  if (sold) {
    changes.push({ ...base, kind: "soldout", product: { ...sold, onlineQty: 0, stores: [] }, onlineBefore: sold.onlineQty, goneStores: sold.stores });
  }
  const down = stocked.find((p) => p.onlineQty > 1 && p.stores.length > 1);
  if (down) {
    changes.push({
      ...base,
      kind: "reduced",
      product: { ...down, onlineQty: down.onlineQty - 1, stores: down.stores.slice(1) },
      onlineBefore: down.onlineQty,
      onlineAfter: down.onlineQty - 1,
      goneStores: down.stores.slice(0, 1),
    });
  }
  return changes;
}

export async function sendTestEmail(products: Product[]): Promise<void> {
  const email = changesEmail(sampleChanges(products));
  await sendEmail({ subject: `[TEST] ${email.subject}`, html: email.html });
}
