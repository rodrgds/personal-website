import type { MonitorSettings, Listing } from './types';

export interface FetchResult {
    listings: Listing[];
    resetTime?: number; // Seconds until rate limit reset
    status: number;
}

export async function fetchListings(settings: MonitorSettings): Promise<FetchResult> {
    const params = new URLSearchParams({
        sort_by: settings.sortBy,
        limit: settings.limit.toString(),
        type: "buy_now", // Hardcoded as per python script default, but could be configurable
        min_price: settings.minPrice.toString(),
        max_price: settings.maxPrice.toString(),
        _: Date.now().toString() // Cache buster
    });

    const headers: Record<string, string> = {
        "Accept": "application/json",
         // Browser automatically sets User-Agent, Origin, Referer. 
         // We cannot manually set unsafe headers like User-Agent in browser fetch.
    };

    if (settings.apiKey) {
        headers["Authorization"] = settings.apiKey;
    }

    try {
        let url = `https://csfloat.com/api/v1/listings?${params.toString()}`;
        if (settings.proxyUrl) {
            // Ensure proxy URL ends with ? if it needs query params appending or just handles raw URL
            // corsproxy.io uses ?url= or just appends
            // Standardizing on simple string concatenation for now as many proxies work differently
            // but for corsproxy.io/? it expects the url after.
            url = settings.proxyUrl + encodeURIComponent(url);
        }
        
        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });

        const resetHeader = response.headers.get('X-RateLimit-Reset');
        const resetTime = resetHeader ? parseInt(resetHeader, 10) : undefined;

        if (response.status === 429) {
            return { listings: [], status: 429, resetTime };
        }

        if (!response.ok) {
            return { listings: [], status: response.status };
        }

        const data = await response.json();
        const listings: Listing[] = data.data || data.listings || [];

        return { listings, status: 200 };

    } catch (e) {
        console.error("API Fetch Error", e);
        return { listings: [], status: 500 };
    }
}
