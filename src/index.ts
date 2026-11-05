import * as http from "http";
import { config } from "./config";
import { fetchProducts } from "./cex";
import { check, describeConfig, lastResult, latestProducts, latestProductsAt, secondsSinceLastCheck } from "./monitor";
import { emailConfigured, sendTestEmail } from "./notify";
import { watchlistPage } from "./templates";

/** Ignore /check calls that arrive within this many seconds of the last check. */
const MIN_SECONDS_BETWEEN_CHECKS = 60;

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/check") {
    if (config.schedule.checkToken && url.searchParams.get("token") !== config.schedule.checkToken) {
      return json(res, 401, { error: "bad token" });
    }
    if (secondsSinceLastCheck() < MIN_SECONDS_BETWEEN_CHECKS) {
      return json(res, 200, { skipped: "checked recently", last: lastResult });
    }
    return json(res, 200, await check());
  }

  if (url.pathname === "/test-notify") {
    if (config.schedule.checkToken && url.searchParams.get("token") !== config.schedule.checkToken) {
      return json(res, 401, { error: "bad token" });
    }
    if (!emailConfigured()) {
      return json(res, 500, { ok: false, error: "RESEND_API_KEY and EMAIL_TO must be set" });
    }
    try {
      await sendTestEmail(latestProducts.length ? latestProducts : await fetchProducts());
      return json(res, 200, { ok: true, from: config.email.from, recipients: config.email.to.length });
    } catch (err) {
      return json(res, 502, { ok: false, error: (err as Error).message });
    }
  }

  if (url.pathname === "/watchlist") {
    // Just woken up (e.g. Render free tier)? Wait for the first check so the page isn't empty.
    if (!latestProducts.length) await check();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(watchlistPage(latestProducts, latestProductsAt));
  }

  if (url.pathname === "/" || url.pathname === "/status") {
    return json(res, 200, { service: "cex-3070-notify", last: lastResult });
  }

  json(res, 404, { error: "not found" });
});

server.listen(config.port, () => {
  console.log(`Listening on port ${config.port}`);
  console.log(`Config: ${describeConfig()}`);
});

check();
const timer = setInterval(check, config.schedule.intervalMinutes * 60_000);

function shutdown(): void {
  console.log("Shutting down...");
  clearInterval(timer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
