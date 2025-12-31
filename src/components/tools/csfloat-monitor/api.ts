import type { MonitorSettings, Listing } from "./types";

export interface FetchResult {
  listings: Listing[];
  resetTime?: number; // Seconds until rate limit reset
  status: number;
  proxyUsed?: string;
  error?: string;
}

export async function fetchListings(
  settings: MonitorSettings
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

  if (settings.rarity !== -1) params.append("rarity", settings.rarity.toString());
  if (settings.defIndex !== -1) params.append("def_index", settings.defIndex.toString());
  if (settings.paintIndex !== -1) params.append("paint_index", settings.paintIndex.toString());
  if (settings.paintSeed !== -1) params.append("paint_seed", settings.paintSeed.toString());
  
  if (settings.minFloat > 0) params.append("min_float", settings.minFloat.toString());
  if (settings.maxFloat < 1) params.append("max_float", settings.maxFloat.toString());
  
  if (settings.minBlue > 0) params.append("min_blue", settings.minBlue.toString());
  if (settings.maxBlue < 100) params.append("max_blue", settings.maxBlue.toString());
  
  if (settings.minFade > 80) params.append("min_fade", settings.minFade.toString());
  if (settings.maxFade < 100) params.append("max_fade", settings.maxFade.toString());

  if (settings.minRefQty > 0) params.append("min_ref_qty", settings.minRefQty.toString());
  if (settings.userId) params.append("user_id", settings.userId);
  if (settings.marketHashName) params.append("market_hash_name", settings.marketHashName);

  const targetUrl = `https://csfloat.com/api/v1/listings?${params.toString()}`;
  const proxies =
    settings.proxyUrls && settings.proxyUrls.length > 0
      ? [...settings.proxyUrls].sort(() => Math.random() - 0.5)
      : [null];

  let lastError = "";

  for (const proxy of proxies) {
    try {
      // Fix for local proxies (like lcp) usually expecting unencoded URLs
      // corsproxy.io also works with unencoded.
      const url = proxy ? proxy + targetUrl : targetUrl;

      // Prepare headers
      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      // CSFloat REQUIRES Authorization.
      // We must send it, but we need to handle the fact that some proxies
      // will block it unless we use specific strategies.
      if (settings.apiKey) {
        headers["Authorization"] = settings.apiKey;
      }

      const response = await fetch(url, {
        method: "GET",
        headers: headers,
        mode: "cors",
      });

      if (response.status === 403 || response.status === 401) {
        lastError = `Proxy ${proxy || "Direct"} auth failed: ${response.status} ${response.statusText}. Check your API Key or if the proxy allows the Auth header.`;
        continue;
      }

      const resetHeader = response.headers.get("X-RateLimit-Reset");
      const resetTime = resetHeader ? parseInt(resetHeader, 10) : undefined;

      if (response.status === 429) {
        return {
          listings: [],
          status: 429,
          resetTime,
          proxyUsed: proxy || "Direct",
        };
      }

      if (!response.ok) {
        lastError = `Proxy ${proxy || "Direct"} error: ${response.status} ${response.statusText}`;
        continue; // Try next proxy
      }

      const data = await response.json();
      const listings: Listing[] = data.data || data.listings || [];

      return { listings, status: 200, proxyUsed: proxy || "Direct" };
    } catch (e: any) {
      // Catch specific fetch errors (like CORS or Network failures)
      lastError = `Proxy ${proxy || "Direct"} failed: ${e.name === "TypeError" ? "CORS/Network Block" : e.message || "Unknown error"}`;
      continue; // Try next proxy
    }
  }

  return { listings: [], status: 500, error: lastError };
}
