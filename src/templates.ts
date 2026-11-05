/**
 * HTML for emails and the /watchlist page.
 * Emails use tables + inline styles because email clients (Gmail, Outlook) ignore most CSS.
 */
import { config } from "./config";
import { DailyStats, Product, StockChange } from "./types";

const C = {
  bg: "#f3f4f6",
  card: "#ffffff",
  border: "#e5e7eb",
  text: "#111827",
  muted: "#6b7280",
  header: "#111827",
  accent: "#16a34a",
  accentBg: "#dcfce7",
  newBg: "#ede9fe",
  newText: "#6d28d9",
  downBg: "#fef3c7",
  downText: "#b45309",
  soldBg: "#fee2e2",
  soldText: "#b91c1c",
  link: "#1d4ed8",
  outText: "#9ca3af",
};

/** WATCH_LABEL, e.g. "RTX 3070". */
const L = () => config.watch.label;

const FONT ="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const gbp = (n: number) => `£${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** "£320 → £272" (DISCOUNT_PERCENT off, in green), or just "£320" if the discount is 0. */
function priceWithDiscount(price: number, muted = false): string {
  const pct = config.watch.discountPercent;
  if (!pct) return gbp(price);
  // Integer maths avoids float noise like 259.24999…
  const discounted = Math.round(price * (100 - pct)) / 100;
  const arrowColor = muted ? C.outText : C.muted;
  const discColor = muted ? C.outText : C.accent;
  return `${gbp(price)} <span style="color:${arrowColor};font-weight:400">→</span> <span style="color:${discColor}">${gbp(discounted)}</span>`;
}
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const inStock = (p: Product) => p.onlineQty > 0 || p.stores.length > 0;

function badge(text: string, bg: string, fg: string): string {
  return `<span style="display:inline-block;padding:2px 8px;margin:0 6px 6px 0;border-radius:999px;background:${bg};color:${fg};font-size:12px;font-weight:600;line-height:18px">${esc(text)}</span>`;
}

function image(p: Product, size: number): string {
  if (!p.image) {
    return `<div style="width:${size}px;height:${size}px;border-radius:8px;background:${C.bg}"></div>`;
  }
  return `<img src="${esc(p.image)}" width="${size}" height="${size}" alt="" style="display:block;width:${size}px;height:${size}px;border-radius:8px;border:1px solid ${C.border};background:#fff;object-fit:contain">`;
}

/** Shared page shell: grey background, centred 600px column, dark header, footer. */
function layout(opts: { preheader: string; heading: string; sub: string; body: string }): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};color:${C.text}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
  <tr><td style="background:${C.header};border-radius:12px 12px 0 0;padding:20px 24px">
    <div style="color:#9ca3af;font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:600">CeX ${esc(L())} Watch</div>
    <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:4px">${esc(opts.heading)}</div>
    <div style="color:#d1d5db;font-size:14px;margin-top:4px">${esc(opts.sub)}</div>
  </td></tr>
  <tr><td style="background:${C.card};border-radius:0 0 12px 12px;padding:8px 24px 20px">
    ${opts.body}
  </td></tr>
  <tr><td style="padding:16px 8px;color:${C.muted};font-size:12px;text-align:center">
    Automated alert · prices and stock from CeX UK at the time of the check
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;margin-top:10px;padding:8px 16px;border-radius:8px;background:${C.accent};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">${esc(label)}</a>`;
}

function storeList(stores: string[], max = 12): string {
  const shown = stores.slice(0, max).map(esc).join(", ");
  return stores.length > max ? `${shown} <span style="color:${C.muted}">+${stores.length - max} more</span>` : shown;
}

function changeLines(c: StockChange): string[] {
  const lines: string[] = [];
  if (c.onlineAfter !== c.onlineBefore && config.watch.online) {
    lines.push(`Online stock <strong>${c.onlineBefore} → ${c.onlineAfter}</strong>`);
  }
  if (c.newStores.length > 0) {
    lines.push(`Now in ${plural(c.newStores.length, "store")}: ${storeList(c.newStores)}`);
  }
  if (c.goneStores.length > 0) {
    lines.push(`No longer in: ${storeList(c.goneStores)}`);
  }
  if (c.kind !== "soldout" && c.kind !== "restock") {
    const left = [c.product.onlineQty > 0 ? `${c.product.onlineQty} online` : "", c.product.stores.length ? plural(c.product.stores.length, "store") : ""]
      .filter(Boolean)
      .join(" · ");
    if (left) lines.push(`Still available: ${left}`);
  }
  return lines;
}

/** Smaller, muted card for stock going down or selling out. */
function downCard(c: StockChange): string {
  const p = c.product;
  const url = config.cex.productUrl(p.boxId);
  const b = c.kind === "soldout" ? badge("SOLD OUT", C.soldBg, C.soldText) : badge("STOCK DOWN", C.downBg, C.downText);
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.border};margin-top:8px">
    <tr>
      <td width="70" valign="top" style="padding:12px 14px 4px 0;${c.kind === "soldout" ? "opacity:.6" : ""}"><a href="${esc(url)}">${image(p, 56)}</a></td>
      <td valign="top" style="padding:12px 0 4px">
        <div>${b}</div>
        <a href="${esc(url)}" style="color:${C.text};font-size:15px;font-weight:600;text-decoration:none;line-height:20px">${esc(p.name)}</a>
        <div style="font-size:16px;font-weight:700;margin:2px 0">${priceWithDiscount(p.price)}</div>
        ${changeLines(c).map((l) => `<div style="font-size:13px;color:${C.muted};line-height:19px">${l}</div>`).join("")}
      </td>
    </tr>
  </table>`;
}

function changeCard(c: StockChange): string {
  const p = c.product;
  const url = config.cex.productUrl(p.boxId);
  const badges = [
    c.isNewModel ? badge("NEW MODEL", C.newBg, C.newText) : "",
    c.onlineAfter > c.onlineBefore ? badge("ONLINE", C.accentBg, C.accent) : "",
    c.newStores.length > 0 ? badge("IN STORE", C.accentBg, C.accent) : "",
  ].join("");

  const lines = changeLines(c);

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.border};margin-top:12px">
    <tr>
      <td width="112" valign="top" style="padding:16px 16px 4px 0"><a href="${esc(url)}">${image(p, 96)}</a></td>
      <td valign="top" style="padding:16px 0 4px">
        ${badges ? `<div>${badges}</div>` : ""}
        <a href="${esc(url)}" style="color:${C.text};font-size:16px;font-weight:600;text-decoration:none;line-height:22px">${esc(p.name)}</a>
        <div style="font-size:24px;font-weight:700;color:${C.text};margin:4px 0">${priceWithDiscount(p.price)}</div>
        ${lines.map((l) => `<div style="font-size:14px;color:${C.muted};line-height:20px">${l}</div>`).join("")}
        ${button(url, "View on CeX")}
      </td>
    </tr>
  </table>`;
}

function sectionTitle(text: string): string {
  return `<div style="font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.muted};margin:20px 0 4px">${esc(text)}</div>`;
}

/**
 * Every watched model, cheapest first: in-stock ones with photos, out-of-stock ones as a
 * compact list (keeps the email under Gmail's ~102 KB clipping limit).
 */
export function watchlistTable(products: Product[], opts: { includeOutOfStock?: boolean } = {}): string {
  const includeOut = opts.includeOutOfStock ?? true;
  const byPrice = (a: Product, b: Product) => a.price - b.price || a.name.localeCompare(b.name);
  const stocked = products.filter(inStock).sort(byPrice);
  const out = products.filter((p) => !inStock(p)).sort(byPrice);
  const line = `border-top:1px solid ${C.border}`;

  const stockedRows = stocked
    .map((p) => {
      const url = esc(config.cex.productUrl(p.boxId));
      const stock = [p.onlineQty > 0 ? `${p.onlineQty} online` : "", p.stores.length > 0 ? plural(p.stores.length, "store") : ""]
        .filter(Boolean)
        .join(" · ");
      return `<tr><td width="54" style="padding:8px 10px 8px 0;${line}"><a href="${url}">${image(p, 44)}</a></td><td style="padding:8px 8px 8px 0;${line};font-size:14px;line-height:19px"><a href="${url}" style="color:${C.text};text-decoration:none">${esc(p.name)}</a><div style="font-size:12px;color:${C.accent};font-weight:600">${stock}</div></td><td align="right" style="padding:8px 0;${line};font-size:15px;font-weight:700;white-space:nowrap">${priceWithDiscount(p.price)}</td></tr>`;
    })
    .join("");

  const outRows = out
    .map(
      (p) =>
        `<tr><td style="padding:5px 8px 5px 0;${line};font-size:13px"><a href="${esc(config.cex.productUrl(p.boxId))}" style="color:${C.outText};text-decoration:none">${esc(p.name)}</a></td><td align="right" style="padding:5px 0;${line};font-size:13px;color:${C.outText};white-space:nowrap">${priceWithDiscount(p.price, true)}</td></tr>`,
    )
    .join("");

  const table = (rows: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
  return [
    stocked.length ? sectionTitle(`In stock now (${stocked.length})`) + table(stockedRows) : "",
    !out.length
      ? ""
      : includeOut
        ? sectionTitle(`Out of stock (${out.length})`) + table(outRows)
        : sectionTitle(`Out of stock (${out.length})`) +
          `<p style="font-size:13px;color:${C.muted};margin:6px 0">Left out to keep this email small.${
            config.publicUrl
              ? ` <a href="${esc(config.publicUrl)}/watchlist" style="color:${C.link}">See the full list →</a>`
              : " Open /watchlist on the app to see them."
          }</p>`,
  ].join("");
}

/** Gmail clips emails over ~102 KB; stay comfortably under it. */
const EMAIL_BUDGET_BYTES = 95_000;

/** Build an email with the full watchlist, falling back to in-stock only if it would be too big. */
function withWatchlist(build: (list: string) => string, products: Product[]): string {
  const full = build(watchlistTable(products));
  return Buffer.byteLength(full) <= EMAIL_BUDGET_BYTES ? full : build(watchlistTable(products, { includeOutOfStock: false }));
}

function stats(products: Product[]): string {
  const stocked = products.filter(inStock);
  const cheapest = stocked.length ? Math.min(...stocked.map((p) => p.price)) : null;
  const cell = (value: string, label: string) =>
    `<td width="33%" align="center" style="padding:12px 4px;background:${C.bg};border-radius:8px">
       <div style="font-size:22px;font-weight:700">${value}</div>
       <div style="font-size:12px;color:${C.muted}">${label}</div></td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin:12px 0 4px"><tr>
    ${cell(String(products.length), "models watched")}
    ${cell(String(stocked.length), "in stock now")}
    ${cell(cheapest !== null ? gbp(cheapest) : "—", "cheapest in stock")}
  </tr></table>`;
}

function filtersLine(): string {
  const w = config.watch;
  const parts = [
    w.includeTi ? `${L()} incl. Ti` : `${L()} (no Ti)`,
    w.maxPrice !== null ? `up to ${gbp(w.maxPrice)}` : "any price",
    [w.online ? "online" : "", w.stores ? "in-store" : ""].filter(Boolean).join(" + ") + " stock",
  ];
  if (w.storeFilter.length) parts.push(`stores matching ${w.storeFilter.join(", ")}`);
  return parts.join(" · ");
}

// ---------- Public builders ----------

const londonNow = () =>
  new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });

/** One email per check: restocks as big cards, then sell-outs and reductions as smaller ones. */
export function changesEmail(changes: StockChange[]): { subject: string; html: string } {
  const restocks = changes.filter((c) => c.kind === "restock");
  const soldOut = changes.filter((c) => c.kind === "soldout");
  const reduced = changes.filter((c) => c.kind === "reduced");
  const newModels = restocks.filter((c) => c.isNewModel).length;

  // Lead with the most interesting change: a restock if there is one.
  const lead = restocks[0] ?? soldOut[0] ?? reduced[0];
  const tag = lead.kind === "restock" ? (lead.isNewModel ? "New model" : "In stock") : lead.kind === "soldout" ? "Sold out" : "Stock down";
  const more = changes.length > 1 ? ` (+${changes.length - 1} more)` : "";

  const heading = restocks.length
    ? restocks.length === 1
      ? `${L()} back in stock`
      : `${restocks.length} ${L()} cards back in stock`
    : soldOut.length && !reduced.length
      ? soldOut.length === 1
        ? `${L()} sold out`
        : `${soldOut.length} ${L()} cards sold out`
      : `${L()} stock update`;

  const summary = [
    restocks.length ? `${restocks.length} in stock` : "",
    newModels ? plural(newModels, "new model") : "",
    soldOut.length ? `${soldOut.length} sold out` : "",
    reduced.length ? `${reduced.length} stock down` : "",
  ].filter(Boolean);

  const body = [
    restocks.map(changeCard).join(""),
    soldOut.length ? sectionTitle(`Sold out (${soldOut.length})`) + soldOut.map(downCard).join("") : "",
    reduced.length ? sectionTitle(`Stock down (${reduced.length})`) + reduced.map(downCard).join("") : "",
  ].join("");

  return {
    subject: `${tag}: ${gbp(lead.product.price)} ${lead.product.name}${more}`,
    html: layout({
      preheader: `${summary.join(" · ")} — ${gbp(lead.product.price)} ${lead.product.name}`,
      heading,
      sub: `${summary.join(" · ")} · ${londonNow()}`,
      body,
    }),
  };
}

export interface DailyInfo {
  products: Product[];
  stats: DailyStats;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckError: string | null;
}

/** Daily "still running" email: health, what happened since the last one, and the watchlist. */
export function dailyEmail(d: DailyInfo): { subject: string; html: string } {
  const s = d.stats;
  const healthy = d.lastCheckOk === true;
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });
  const stocked = d.products.filter(inStock).length;

  const statusBox = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 4px;background:${healthy ? C.accentBg : C.soldBg};border-radius:8px">
      <tr><td style="padding:12px 14px;font-size:14px;line-height:21px;color:${healthy ? "#14532d" : C.soldText}">
        <strong>${healthy ? "✓ All good" : "⚠ Last check failed"}</strong> — last check ${d.lastCheckAt ? fmt(d.lastCheckAt) : "never"}
        ${!healthy && d.lastCheckError ? `<div style="font-size:13px;margin-top:4px">${esc(d.lastCheckError)}</div>` : ""}
      </td></tr>
    </table>`;

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;border-top:1px solid ${C.border};font-size:14px;color:${C.muted}">${label}</td><td align="right" style="padding:6px 0;border-top:1px solid ${C.border};font-size:14px;font-weight:600">${value}</td></tr>`;

  const activity = `
    ${sectionTitle(`Since ${fmt(s.since)}`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row("Checks run", `${s.checks}${s.failures ? ` <span style="color:${C.soldText}">(${s.failures} failed)</span>` : ""}`)}
      ${row("Back in stock", String(s.restocks))}
      ${row("Sold out", String(s.soldOut))}
      ${row("Stock down", String(s.reduced))}
      ${row("Alert emails sent", String(s.emailsSent))}
    </table>`;

  return {
    subject: healthy
      ? `Still running: ${stocked} of ${d.products.length} ${L()} cards in stock`
      : `⚠ CeX ${L()} monitor: last check failed`,
    html: withWatchlist(
      (list) =>
        layout({
          preheader: healthy ? `All good. ${stocked} models in stock right now.` : `Last check failed: ${d.lastCheckError ?? "unknown error"}`,
          heading: "Daily check-in",
          sub: `${filtersLine()} · ${londonNow()}`,
          body: `${statusBox}${activity}${d.products.length ? sectionTitle("Right now") + stats(d.products) + list : ""}`,
        }),
      d.products,
    ),
  };
}

export function startupEmail(products: Product[]): { subject: string; html: string } {
  const stocked = products.filter(inStock).length;
  return {
    subject: `CeX ${L()} monitor started: ${plural(products.length, "model")}, ${stocked} in stock`,
    html: withWatchlist(
      (list) =>
        layout({
          preheader: `Watching ${products.length} models, ${stocked} in stock right now.`,
          heading: "Monitor started",
          sub: filtersLine(),
          body: `${stats(products)}
        <p style="font-size:14px;color:${C.muted};margin:12px 0 4px">You'll get an email whenever any of these comes into stock online or in a store, or a new ${esc(L())} model appears${config.watch.alertOnDecrease ? ", and when stock goes down or sells out" : ""}.${config.daily.hour !== null ? ` There's also a daily check-in at ${String(config.daily.hour).padStart(2, "0")}:00.` : ""} Here's everything being watched right now:</p>
        ${list}`,
        }),
      products,
    ),
  };
}

export function watchlistPage(products: Product[], checkedAt: string | null): string {
  const when = checkedAt
    ? new Date(checkedAt).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" })
    : "not yet";
  return layout({
    preheader: "",
    heading: "Watchlist",
    sub: `${filtersLine()} · last checked ${when}`,
    body: products.length
      ? `${stats(products)}${watchlistTable(products)}`
      : `<p style="color:${C.muted}">No check has completed yet — refresh in a few seconds.</p>`,
  });
}
