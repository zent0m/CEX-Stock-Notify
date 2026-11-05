import { config } from "./config";
import { Product } from "./types";

interface AlgoliaHit {
  boxId: string;
  boxName: string;
  sellPrice: number;
  ecomQuantity?: number | null;
  stores?: string[] | null;
  boxDeleted?: number;
  showOnWeb?: number;
  imageUrls?: { large?: string | null; medium?: string | null; small?: string | null } | null;
}

let appId = config.cex.algoliaAppId;
let apiKey = config.cex.algoliaApiKey;

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Origin: "https://uk.webuy.com",
  Referer: "https://uk.webuy.com/",
};

async function search(): Promise<Response> {
  return fetch(config.cex.searchUrl, {
    method: "POST",
    headers: {
      ...BROWSER_HEADERS,
      "Content-Type": "application/json",
      "X-Algolia-Application-Id": appId,
      "X-Algolia-API-Key": apiKey,
    },
    body: JSON.stringify({
      query: config.watch.query,
      filters: `categoryId:${config.cex.graphicsCardCategoryId}`,
      hitsPerPage: 1000,
      attributesToRetrieve: ["boxId", "boxName", "sellPrice", "ecomQuantity", "stores", "boxDeleted", "showOnWeb", "imageUrls"],
      attributesToHighlight: [],
    }),
    signal: AbortSignal.timeout(20_000),
  });
}

/** Re-read the public Algolia credentials from CeX's site settings (in case they rotate). */
async function refreshKeys(): Promise<boolean> {
  try {
    const res = await fetch(config.cex.settingsUrl, {
      headers: { ...BROWSER_HEADERS, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const json: any = await res.json();
    const s = json?.response?.data?.preLoginSettings;
    if (s?.algoliaAppId && s?.algoliaSearchAppKey) {
      const changed = s.algoliaAppId !== appId || s.algoliaSearchAppKey !== apiKey;
      appId = s.algoliaAppId;
      apiKey = s.algoliaSearchAppKey;
      console.log(`Refreshed CeX search keys${changed ? " (they had changed)" : " (unchanged)"}`);
      return changed;
    }
  } catch (err) {
    console.error("Could not refresh CeX search keys:", (err as Error).message);
  }
  return false;
}

function matches(hit: AlgoliaHit): boolean {
  const { namePattern, includeTi, maxPrice } = config.watch;
  if (!hit.boxId || !hit.boxName) return false;
  if (hit.boxDeleted === 1 || hit.showOnWeb === 0) return false;
  if (!namePattern.test(hit.boxName)) return false;
  // Any "xx70 Ti" / "3080Ti" etc., not just the 3070 Ti, so other NAME_PATTERNs work too.
  if (!includeTi && /\b\d{4}\s*ti\b/i.test(hit.boxName)) return false;
  if (maxPrice !== null && hit.sellPrice > maxPrice) return false;
  return true;
}

/** Fetch every graphics card matching the watch settings, with current stock. Throws on failure. */
export async function fetchProducts(): Promise<Product[]> {
  let res = await search();
  if ((res.status === 401 || res.status === 403) && (await refreshKeys())) {
    res = await search();
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`CeX search failed: HTTP ${res.status} ${body}`);
  }

  const json: any = await res.json();
  const hits: AlgoliaHit[] = Array.isArray(json?.hits) ? json.hits : [];
  if (typeof json?.nbHits === "number" && json.nbHits > hits.length) {
    console.warn(
      `CeX search "${config.watch.query}" matched ${json.nbHits} cards but only ${hits.length} were returned ` +
        `(1000 max per request) — some cards may be missed. Use a narrower SEARCH_QUERY.`,
    );
  }

  return hits.filter(matches).map((h) => {
    const img = h.imageUrls?.medium || h.imageUrls?.large || h.imageUrls?.small;
    return {
      boxId: h.boxId,
      name: h.boxName.replace(/\s+/g, " ").trim(),
      price: h.sellPrice,
      onlineQty: h.ecomQuantity ?? 0,
      stores: [...new Set(h.stores ?? [])].sort(),
      // CeX image paths contain spaces ("Graphics Cards - PCI-E"), which email clients choke on.
      image: img ? encodeURI(img) : undefined,
    };
  });
}
