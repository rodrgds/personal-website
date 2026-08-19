import type { APIRoute } from "astro";

import { SimpleCache } from "../../lib/cache";

export const prerender = false;

const MAX_HTML_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 8_000;
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1_000;
const FAILURE_TTL_MS = 15 * 60 * 1_000;

interface LinkPreviewData {
  domain: string;
  handle?: string;
  title?: string;
  description?: string;
  image?: string;
}

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

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp|#39);/g,
      (_, name: string) =>
        ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" })[
          name
        ] ?? " ",
    );
}

function parseAttributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of tag.matchAll(attrRe)) {
    const [, name, double, single] = match;
    attrs.set(name.toLowerCase(), decodeEntities(double ?? single ?? ""));
  }
  return attrs;
}

function parseMeta(html: string): Map<string, string> {
  const meta = new Map<string, string>();
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(tag[0]);
    const key = (attrs.get("property") ?? attrs.get("name"))?.toLowerCase();
    const content = attrs.get("content");
    if (key && content !== undefined && !meta.has(key)) {
      meta.set(key, content.trim());
    }
  }
  return meta;
}

async function fetchHtml(url: URL): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; rgo.pt-link-preview/1.0; +https://rgo.pt)",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en",
      },
    });
    if (!response.ok) return null;
    if (!response.body) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/html")) return null;

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    return Buffer.concat(chunks).toString("utf8").slice(0, MAX_HTML_BYTES);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pick(meta: Map<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const value = meta.get(key);
    if (value && value.length > 0) return value;
  }
  return null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPreview(html: string, url: URL): LinkPreviewData {
  const domain = url.hostname.replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");
  let handle: string | undefined;
  if (path.length > 1) {
    try {
      handle = decodeURIComponent(path.slice(1)).slice(0, 48);
    } catch {
      // Malformed percent-encoding; skip the path handle.
    }
  }

  const meta = parseMeta(html);

  const title =
    stripHtml(pick(meta, ["og:title", "twitter:title"]) ?? "") ||
    stripHtml(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "") ||
    undefined;

  const rawDescription = pick(meta, [
    "og:description",
    "twitter:description",
    "description",
  ]);
  const description = rawDescription ? stripHtml(rawDescription) : undefined;

  const rawImage = pick(meta, [
    "og:image:secure_url",
    "og:image",
    "twitter:image",
    "twitter:image:src",
  ]);
  let image: string | undefined;
  if (rawImage) {
    try {
      const imageUrl = new URL(rawImage, url);
      if (imageUrl.protocol === "http:" || imageUrl.protocol === "https:") {
        image = imageUrl.toString();
      }
    } catch {
      // Unusable image URL; keep image undefined.
    }
  }

  return {
    domain,
    handle,
    title: title && title.length <= 300 ? title : undefined,
    description:
      description && description.length <= 400 ? description : undefined,
    image,
  };
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
