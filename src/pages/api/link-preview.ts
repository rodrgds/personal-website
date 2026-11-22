import type { APIRoute } from "astro";

import { SimpleCache } from "../../lib/cache";
import {
  extractPreview,
  fetchHtml,
  type LinkPreviewData,
} from "../../lib/link-preview";

export const prerender = false;

const SUCCESS_TTL_MS = 24 * 60 * 60 * 1_000;
const FAILURE_TTL_MS = 15 * 60 * 1_000;

const successCache = new SimpleCache<LinkPreviewData>(SUCCESS_TTL_MS, 200);
const failureCache = new SimpleCache<LinkPreviewData>(FAILURE_TTL_MS, 200);

/** Reject protocols, credentials, and hosts a request to a private network. */
function safeUrl(value: string, requestHost: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return null;
  if (host === requestHost) return null;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b, c, d] = ipv4.slice(1).map(Number);
    if (a > 255 || b > 255 || c > 255 || d > 255) return null;
    if (a === 0 || a === 10 || a === 127) return null;
    if (a === 169 && b === 254) return null;
    if (a === 172 && b >= 16 && b <= 31) return null;
    if (a === 192 && b === 168) return null;
  }
  // Reject IPv6 literals; public sites have hostnames.
  if (host.includes(":") && /^[0-9a-f:.]+$/.test(host)) return null;

  return url;
}

export const GET: APIRoute = ({ request }) => {
  const requestUrl = new URL(request.url);
  const rawUrl = requestUrl.searchParams.get("url") ?? "";
  const target = safeUrl(rawUrl, requestUrl.hostname);

  if (!target) {
    return Response.json(
      { error: "Unsupported URL" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const cacheKey = target.toString();

  return (async () => {
    const cached = successCache.get(cacheKey) ?? failureCache.get(cacheKey);
    if (cached) {
      return Response.json(cached, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const html = await fetchHtml(target);
    if (html === null) {
      const empty: LinkPreviewData = {
        domain: target.hostname.replace(/^www\./, ""),
      };
      failureCache.set(cacheKey, empty);
      return Response.json(empty, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const preview = extractPreview(html, target);
    successCache.set(cacheKey, preview);
    return Response.json(preview, {
      headers: { "Cache-Control": "no-store" },
    });
  })();
};
