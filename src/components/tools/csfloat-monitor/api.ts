import type { MonitorSettings, Listing } from "./types";

export interface FetchResult {
  listings: Listing[];
  resetTime?: number; // Seconds until rate limit reset
  status: number;
  proxyUsed?: string;
  error?: string;
}

function canReceiveCredential(requestUrl: string): boolean {
  const url = new URL(requestUrl);
  return (
    url.origin === "https://csfloat.com" ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  );
}

function isListing(value: unknown): value is Listing {
  if (!value || typeof value !== "object") return false;
  const listing = value as Record<string, unknown>;
  const item = listing.item as Record<string, unknown> | undefined;
  return (
    typeof listing.id === "string" &&
    typeof listing.created_at === "string" &&
    typeof listing.price === "number" &&
    (listing.type === "buy_now" || listing.type === "auction") &&
    Boolean(item) &&
    typeof item?.market_hash_name === "string"
  );
}

export async function fetchListings(
  settings: MonitorSettings,
): Promise<FetchResult> {
  /* eslint-disable @typescript-eslint/naming-convention */
  const params = new URLSearchParams({
    sort_by: settings.sortBy,
    limit: settings.limit.toString(),
    min_price: settings.minPrice.toString(),
    max_price: settings.maxPrice.toString(),
    category: settings.category.toString(),
    _: Date.now().toString(),
  });

  if (settings.type !== "any") {
    params.append("type", settings.type);
  }

  if (settings.rarity !== -1)
    params.append("rarity", settings.rarity.toString());
  if (settings.defIndex !== -1)
    params.append("def_index", settings.defIndex.toString());
  if (settings.paintIndex !== -1)
    params.append("paint_index", settings.paintIndex.toString());
  if (settings.paintSeed !== -1)
    params.append("paint_seed", settings.paintSeed.toString());

  if (settings.minFloat > 0)
    params.append("min_float", settings.minFloat.toString());
  if (settings.maxFloat < 1)
    params.append("max_float", settings.maxFloat.toString());

  if (settings.minBlue > 0)
    params.append("min_blue", settings.minBlue.toString());
  if (settings.maxBlue < 100)
    params.append("max_blue", settings.maxBlue.toString());

  if (settings.minFade > 80)
    params.append("min_fade", settings.minFade.toString());
  if (settings.maxFade < 100)
    params.append("max_fade", settings.maxFade.toString());

  if (settings.minRefQty > 0)
    params.append("min_ref_qty", settings.minRefQty.toString());
  if (settings.userId) params.append("user_id", settings.userId);
  if (settings.marketHashName)
    params.append("market_hash_name", settings.marketHashName);

  const targetUrl = `https://csfloat.com/api/v1/listings?${params.toString()}`;

  let proxiesToUse: (import("./types").ProxyConfig | null)[] = [null];

  if (settings.proxies && settings.proxies.length > 0) {
    const localProxies = settings.proxies.filter(
      (p) =>
        p.isDirect &&
        (p.url.includes("localhost") || p.url.includes("127.0.0.1")),
    );
    const otherProxies = settings.proxies.filter(
      (p) =>
        !p.isDirect ||
        (!p.url.includes("localhost") && !p.url.includes("127.0.0.1")),
    );

    // Shuffle local proxies
    localProxies.sort(() => Math.random() - 0.5);
    // Shuffle other proxies
    otherProxies.sort(() => Math.random() - 0.5);

    // 15% chance to use non-local proxy first for load distribution
    const useRandomProxy = Math.random() < 0.15;
    if (useRandomProxy && otherProxies.length > 0) {
      proxiesToUse = [...otherProxies, ...localProxies];
    } else {
      // Prioritize local (85% of the time)
      proxiesToUse = [...localProxies, ...otherProxies];
    }
  }

  let lastError = "";

  for (const proxy of proxiesToUse) {
    try {
      let url: string;
      const proxyUrl = proxy ? proxy.url : null;

      if (proxy && proxy.isDirect) {
        // Direct proxy mode (e.g. lcp --proxyUrl ...)
        // Replaces target domain with proxy URL
        const targetPath = targetUrl.replace("https://csfloat.com", "");
        // Remove trailing slash from proxy if present
        const cleanProxy = proxyUrl ? proxyUrl.replace(/\/$/, "") : "";
        url = cleanProxy + targetPath;
      } else {
        // Standard CORS proxy (append target URL)
        // Fix for local proxies usually expecting unencoded URLs
        url = proxyUrl ? proxyUrl + targetUrl : targetUrl;
      }

      // Prepare headers
      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      // CSFloat REQUIRES Authorization.
      if (settings.apiKey && !canReceiveCredential(url)) {
        lastError = `Refusing to send credentials to ${new URL(url).origin}`;
        continue;
      }

      if (settings.apiKey) {
        headers["Authorization"] = settings.apiKey;
      }

      const response = await fetch(url, {
        method: "GET",
        headers: headers,
        mode: "cors",
      });

      if (response.status === 403 || response.status === 401) {
        lastError = `Proxy ${proxyUrl || "Direct"} auth failed: ${response.status} ${response.statusText}. Check your API Key or if the proxy allows the Auth header.`;
        continue;
      }

      const resetHeader = response.headers.get("X-RateLimit-Reset");
      const resetTime = resetHeader ? parseInt(resetHeader, 10) : undefined;

      if (response.status === 429) {
        return {
          listings: [],
          status: 429,
          resetTime,
          proxyUsed: proxyUrl || "Direct",
        };
      }

      if (!response.ok) {
        lastError = `Proxy ${proxyUrl || "Direct"} error: ${response.status} ${response.statusText}`;
        continue; // Try next proxy
      }

      const data: unknown = await response.json();
      const payload = data as { data?: unknown; listings?: unknown };
      const rawListings = payload.data ?? payload.listings;
      if (!Array.isArray(rawListings) || !rawListings.every(isListing)) {
        lastError = `Proxy ${proxyUrl || "Direct"} returned an invalid response`;
        continue;
      }
      const listings = rawListings;

      return { listings, status: 200, proxyUsed: proxyUrl || "Direct" };
    } catch (e: any) {
      const pUrl = proxy ? proxy.url : "Direct";
      // Catch specific fetch errors (like CORS or Network failures)
      lastError = `Proxy ${pUrl} failed: ${e.name === "TypeError" ? "CORS/Network Block" : e.message || "Unknown error"}`;
      continue; // Try next proxy
    }
  }

  return { listings: [], status: 500, error: lastError };
}
