try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on real environment variables (e.g. on Render)
}

function str(key: string, fallback = ""): string {
  const v = process.env[key];
  return v === undefined || v.trim() === "" ? fallback : v.trim();
}

function bool(key: string, fallback: boolean): boolean {
  const v = str(key);
  return v === "" ? fallback : ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function num(key: string): number | null {
  const v = str(key);
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function list(key: string): string[] {
  return str(key)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(str("PORT", "3000")),

  cex: {
    searchUrl: "https://search.webuy.io/1/indexes/prod_cex_uk/query",
    settingsUrl: "https://wss2.cex.uk.webuy.io/v3/appsettings/prelogin?platformId=1",
    // Public search-only key CeX hands to every browser. Refreshed from settingsUrl if rejected.
    algoliaAppId: str("CEX_ALGOLIA_APP_ID", "LNNFEEWZVA"),
    algoliaApiKey: str("CEX_ALGOLIA_API_KEY", "bf79f2b6699e60a18ae330a1248b452c"),
    graphicsCardCategoryId: 892,
    productUrl: (boxId: string) => `https://uk.webuy.com/product-detail/?id=${encodeURIComponent(boxId)}`,
  },

  watch: {
    query: str("SEARCH_QUERY", "rtx 3070"),
    namePattern: new RegExp(str("NAME_PATTERN", "\\b3070\\b"), "i"),
    includeTi: bool("INCLUDE_TI", true),
    maxPrice: num("MAX_PRICE"),
    online: bool("WATCH_ONLINE", true),
    stores: bool("WATCH_STORES", true),
    storeFilter: list("STORE_FILTER").map((s) => s.toLowerCase()),
  },

  ntfy: {
    server: str("NTFY_SERVER", "https://ntfy.sh").replace(/\/+$/, ""),
    topic: str("NTFY_TOPIC"),
    token: str("NTFY_TOKEN"),
  },

  schedule: {
    intervalMinutes: num("CHECK_INTERVAL_MINUTES") ?? 5,
    checkToken: str("CHECK_TOKEN"),
  },

  state: {
    upstashUrl: str("UPSTASH_REDIS_REST_URL").replace(/\/+$/, ""),
    upstashToken: str("UPSTASH_REDIS_REST_TOKEN"),
    file: str("STATE_FILE", "./data/state.json"),
    key: "cex-3070-notify:state",
  },
};
