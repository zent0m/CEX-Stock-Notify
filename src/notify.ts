import { config } from "./config";
import { StockChange } from "./types";

export interface Push {
  title: string;
  message: string;
  click?: string;
  tags?: string[];
  priority?: 1 | 2 | 3 | 4 | 5;
}

/** Publish via ntfy's JSON API (handles £ and other UTF-8 properly, unlike headers). */
export async function sendPush(push: Push): Promise<void> {
  if (!config.ntfy.topic) {
    console.warn(`[ntfy disabled — NTFY_TOPIC not set] ${push.title}: ${push.message}`);
    return;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.ntfy.token) headers.Authorization = `Bearer ${config.ntfy.token}`;

  let res: Response;
  try {
    res = await fetch(config.ntfy.server, {
      method: "POST",
      headers,
      body: JSON.stringify({ topic: config.ntfy.topic, ...push }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // Node's fetch hides the real reason (DNS, TLS, timeout…) in err.cause.
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    const detail = cause ? ` (${cause.code ?? ""} ${cause.message ?? ""})`.replace("( ", "(") : "";
    throw new Error(`ntfy request to ${config.ntfy.server} failed: ${(err as Error).message}${detail}`);
  }
  if (!res.ok) {
    throw new Error(`ntfy publish failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

function describe(change: StockChange): string {
  const parts: string[] = [];
  if (change.onlineAfter > change.onlineBefore) {
    parts.push(`Online: ${change.onlineBefore} → ${change.onlineAfter}`);
  }
  if (change.newStores.length > 0) {
    const shown = change.newStores.slice(0, 8).join(", ");
    const more = change.newStores.length > 8 ? ` +${change.newStores.length - 8} more` : "";
    parts.push(`New in store: ${shown}${more}`);
  }
  if (change.isNewModel) parts.push("(model not seen before)");
  return parts.join("\n");
}

/** Max individual pushes per check; anything beyond is rolled into one summary. */
const MAX_INDIVIDUAL = 8;

export async function notifyChanges(changes: StockChange[]): Promise<void> {
  const individual = changes.slice(0, MAX_INDIVIDUAL);
  const rest = changes.slice(MAX_INDIVIDUAL);

  for (const change of individual) {
    const { product } = change;
    await sendPush({
      title: `£${product.price} — ${product.name}`,
      message: describe(change),
      click: config.cex.productUrl(product.boxId),
      tags: ["video_game"],
      priority: 4,
    });
  }

  if (rest.length > 0) {
    await sendPush({
      title: `+${rest.length} more RTX 3070 stock changes`,
      message: rest.map((c) => `£${c.product.price} ${c.product.name}`).join("\n"),
      click: `https://uk.webuy.com/search/?stext=${encodeURIComponent(config.watch.query)}`,
      tags: ["video_game"],
      priority: 3,
    });
  }
}
