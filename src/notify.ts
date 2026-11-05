import { config } from "./config";
import { StockChange } from "./types";

export interface Email {
  subject: string;
  html: string;
}

/** Pauses between attempts when Resend can't be reached or is rate-limiting us. */
const RETRY_DELAYS_MS = [5_000, 15_000];

class RetryableError extends Error {}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

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

function changeLines(change: StockChange): string[] {
  const lines: string[] = [];
  if (change.onlineAfter > change.onlineBefore) {
    lines.push(`Online stock: ${change.onlineBefore} → ${change.onlineAfter}`);
  }
  if (change.newStores.length > 0) {
    lines.push(`Now in store: ${change.newStores.join(", ")}`);
  }
  if (change.isNewModel) lines.push("New model — not seen before");
  return lines;
}

const FOOTER = `<p style="color:#888;font-size:12px;margin-top:24px">Automated alert from CeX 3070 Notify.</p>`;

/** One email per check, listing every model that gained stock (cheapest first). */
export async function notifyChanges(changes: StockChange[]): Promise<void> {
  if (changes.length === 0) return;

  const first = changes[0].product;
  const more = changes.length > 1 ? ` (+${changes.length - 1} more)` : "";
  const subject = `RTX 3070 in stock: £${first.price} ${first.name}${more}`;

  const items = changes
    .map((c) => {
      const p = c.product;
      const details = changeLines(c)
        .map((l) => `<div style="color:#444">${escapeHtml(l)}</div>`)
        .join("");
      return `
        <div style="margin:0 0 18px">
          <div style="font-size:16px"><strong>£${p.price}</strong> — <a href="${escapeHtml(config.cex.productUrl(p.boxId))}">${escapeHtml(p.name)}</a></div>
          ${details}
        </div>`;
    })
    .join("");

  await sendEmail({
    subject,
    html: `
      <h2 style="margin:0 0 16px">${changes.length} RTX 3070 stock change${changes.length > 1 ? "s" : ""} on CeX</h2>
      ${items}
      ${FOOTER}`,
  });
}

export async function sendStartupNotice(models: number, inStock: number): Promise<void> {
  await sendEmail({
    subject: "CeX 3070 monitor started",
    html: `<p>Watching <strong>${models}</strong> RTX 3070 models (${inStock} currently in stock).</p>
           <p>You'll get an email whenever stock appears online or in a store.</p>${FOOTER}`,
  });
}

export async function sendTestEmail(): Promise<void> {
  await sendEmail({
    subject: "CeX 3070 monitor test",
    html: `<p>Test email sent at ${new Date().toISOString()}.</p>
           <p>Example: <strong>£320</strong> — <a href="${config.cex.productUrl("SGRAGIA30708G01")}">Gigabyte GeForce RTX 3070 Gaming OC 8GB GDDR6</a><br>
           Online stock: 0 → 1<br>Now in store: Birmingham</p>${FOOTER}`,
  });
}
