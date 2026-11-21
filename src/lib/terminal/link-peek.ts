// Previews for external links in prose: a short dwell fetches the page's
// Open Graph data from /api/link-preview and shows it in the same peek window
// as everything else (peek.ts). Rows and cards opt out with
// `data-no-link-fx`; links that already peek something keep their own.
import { z } from "astro/zod";
import { peekAt } from "./peek";

const DWELL_MS = 120;
const SKIP =
  "nav, button, astro-island, dialog, .tty, [data-no-link-fx], [data-peek-title], [data-peek-image], [data-peek-images], [data-peek-scene]";

const previewSchema = z.object({
  domain: z.string(),
  handle: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  image: z.string().optional(),
});

type Preview = z.infer<typeof previewSchema>;

const cache = new Map<string, Promise<Preview | null>>();
let timer = 0;
let hovered: HTMLAnchorElement | null = null;

/** An external http(s) link with text in it, outside rows and controls. */
export function isProseLink(anchor: HTMLAnchorElement): boolean {
  if (!anchor.href || anchor.closest(SKIP)) return false;
  if (anchor.querySelector("img, svg, picture, video, div, p")) return false;
  try {
    const url = new URL(anchor.href);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== window.location.hostname
    );
  } catch {
    return false;
  }
}

function load(href: string): Promise<Preview | null> {
  let pending = cache.get(href);
  if (!pending) {
    pending = fetch(`/api/link-preview?url=${encodeURIComponent(href)}`, {
      headers: { accept: "application/json" },
    })
      .then(async (response) =>
        response.ok
          ? (previewSchema.safeParse(await response.json()).data ?? null)
          : null,
      )
      .catch(() => null);
    cache.set(href, pending);
  }
  return pending;
}

async function preview(anchor: HTMLAnchorElement): Promise<void> {
  const data = await load(anchor.href);
  if (hovered !== anchor || !data) return;
  if (!data.title && !data.description && !data.image) return;
  peekAt(anchor, {
    label: data.handle ? `${data.domain}/${data.handle}` : data.domain,
    title: data.title ?? data.domain,
    body: data.description,
    image: data.image,
  });
}

export function mountLinkPeek(): void {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  document.addEventListener("pointerover", (event) => {
    const anchor =
      event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>("a[href]")
        : null;
    if (anchor === hovered) return;
    window.clearTimeout(timer);
    hovered = anchor && isProseLink(anchor) ? anchor : null;
    if (!hovered) return;
    const target = hovered;
    timer = window.setTimeout(() => void preview(target), DWELL_MS);
  });
  document.addEventListener("pointerout", (event) => {
    if (!hovered) return;
    const to = event.relatedTarget;
    if (to instanceof Node && hovered.contains(to)) return;
    window.clearTimeout(timer);
    hovered = null;
  });
}
