// Peek: a small terminal window that follows the pointer over anything with
// one of these attributes:
//
//   data-peek-tip="what it means"    a one-line tooltip, for abbreviations
//   data-peek-image="url"            a screenshot or photo
//   data-peek-images="url url ..."   up to four pictures in a grid
//   data-peek-scene="porto"          the drawn Porto map
//   data-peek-title / -meta / -body  a text card, optionally with an image
//   data-peek-rating="4"             stars for favourites
//
// link-peek.ts shows external links' previews through peekAt(). Styles live
// in global.css (.peek). Hover-capable pointers only.
import type { InkRenderer as InkRendererType, InkScene } from "../home/ink";

const SELECTOR =
  "[data-peek-tip], [data-peek-image], [data-peek-images], [data-peek-scene], [data-peek-title]";

/** What a peek shows; read from a trigger's data attributes or passed in. */
export interface PeekContent {
  tip?: string;
  label?: string;
  title?: string;
  meta?: string;
  body?: string;
  image?: string;
  images?: string[];
  scene?: boolean;
  rating?: number;
  episodes?: string[];
}

interface PeekView {
  root: HTMLElement;
  bar: HTMLElement;
  image: HTMLImageElement;
  canvas: HTMLCanvasElement;
  grid: HTMLElement;
  title: HTMLElement;
  meta: HTMLElement;
  rating: HTMLElement;
  body: HTMLElement;
  episodes: HTMLUListElement;
}

function createView(): PeekView {
  const root = document.createElement("div");
  root.className = "peek";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `<div class="peek-bar"><span class="peek-label"></span></div><div class="peek-media"><img alt="" decoding="async"><canvas></canvas><div class="peek-grid"></div></div><div class="peek-text"><p class="peek-title"></p><p class="peek-meta"></p><p class="peek-rating"></p><p class="peek-body"></p><ul class="peek-episodes" aria-label="Favorite episodes"></ul></div>`;
  document.body.append(root);
  const pick = <T extends Element>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`peek is missing ${selector}`);
    return element;
  };
  return {
    root,
    bar: pick<HTMLElement>(".peek-label"),
    image: pick<HTMLImageElement>("img"),
    canvas: pick<HTMLCanvasElement>("canvas"),
    grid: pick<HTMLElement>(".peek-grid"),
    title: pick<HTMLElement>(".peek-title"),
    meta: pick<HTMLElement>(".peek-meta"),
    rating: pick<HTMLElement>(".peek-rating"),
    body: pick<HTMLElement>(".peek-body"),
    episodes: pick<HTMLUListElement>(".peek-episodes"),
  };
}

let view: PeekView | null = null;
let renderer: InkRendererType | null = null;
let scene: InkScene | null = null;
let frame = 0;
let started = 0;
let pointerX = 0;
let pointerY = 0;
let active: HTMLElement | null = null;

function ensureView(): PeekView {
  if (!view || !document.body.contains(view.root)) {
    view = createView();
    renderer = null;
  }
  return view;
}

function place(): void {
  if (!view) return;
  const width = view.root.offsetWidth;
  const height = view.root.offsetHeight;
  let left = pointerX + 18;
  let top = pointerY + 18;
  if (left + width > window.innerWidth - 12) left = pointerX - width - 18;
  if (top + height > window.innerHeight - 12)
    top = Math.max(12, window.innerHeight - height - 12);
  view.root.style.transform = `translate(${Math.max(12, left)}px, ${top}px)`;
}

function stopScene(): void {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  scene = null;
}

async function startScene(target: PeekView): Promise<void> {
  const [{ InkRenderer, readThemeColors }, { mapScene }] = await Promise.all([
    import("../home/ink"),
    import("../home/scenes"),
  ]);
  if (active === null) return;
  renderer ??= new InkRenderer(target.canvas, 2);
  renderer.setColors(readThemeColors(document.documentElement));
  scene = mapScene();
  started = 0;
  const loop = (time: number): void => {
    frame = 0;
    if (!scene || !renderer) return;
    if (!started) started = time;
    const progress = Math.min(1, (time - started) / 2400);
    renderer.render(scene, progress, Math.min(1, (time - started) / 500), time);
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
}

function fromDataset(trigger: HTMLElement): PeekContent {
  const data = trigger.dataset;
  return {
    tip: data.peekTip,
    label: data.peekLabel,
    title: data.peekTitle,
    meta: data.peekMeta,
    body: data.peekBody,
    image: data.peekImage,
    images: (data.peekImages ?? "").split(" ").filter(Boolean),
    scene: data.peekScene === "porto",
    rating: Number(data.peekRating ?? 0),
    episodes: data.peekEpisodes?.split("\n").filter(Boolean),
  };
}

/** A poster (taller than wide), a cover (about square) or anything wider. */
function formatOf(image: HTMLImageElement): "poster" | "cover" | "wide" {
  const ratio = image.naturalHeight / Math.max(1, image.naturalWidth);
  return ratio > 1.15 ? "poster" : ratio >= 0.87 ? "cover" : "wide";
}

function show(trigger: HTMLElement, content: PeekContent): void {
  const target = ensureView();
  // A modal <dialog> renders in the top layer, above everything else, so the
  // card has to live inside it to be seen.
  const host = trigger.closest("dialog[open]") ?? document.body;
  if (target.root.parentElement !== host) host.append(target.root);
  active = trigger;
  const pictures = content.images ?? [];
  const gallery = pictures.length > 1;
  const image = content.image ?? (gallery ? undefined : pictures[0]);
  const isScene = Boolean(content.scene);
  const title = content.tip ?? content.title;
  target.root.dataset.kind = content.tip
    ? "tip"
    : isScene
      ? "scene"
      : gallery
        ? "gallery"
        : title
          ? "card"
          : "image";
  target.root.dataset.hasMedia = String(
    !content.tip && (Boolean(image) || gallery || isScene),
  );
  target.grid.dataset.count = String(Math.min(4, pictures.length));
  target.grid.replaceChildren(
    ...(gallery ? pictures.slice(0, 4) : []).map((src) => {
      const picture = document.createElement("img");
      picture.alt = "";
      picture.decoding = "async";
      picture.onload = () => place();
      picture.src = src;
      return picture;
    }),
  );
  target.root.dataset.hasText = String(Boolean(title));
  target.bar.textContent =
    content.label ??
    (isScene
      ? "porto.map"
      : (title ?? trigger.textContent ?? "").trim().toLowerCase());
  target.image.removeAttribute("src");
  delete target.root.dataset.format;
  if (image && !content.tip) {
    // The layout follows the picture's format, known once it loads; the size
    // changes then, so place the card again.
    target.image.onload = () => {
      target.root.dataset.format = formatOf(target.image);
      place();
    };
    target.image.onerror = () => {
      target.root.dataset.hasMedia = "false";
      place();
    };
    target.image.src = image;
  }
  target.title.textContent = title ?? "";
  target.meta.textContent = content.meta ?? "";
  const rating = content.rating ?? 0;
  target.rating.textContent =
    rating > 0 ? `${"★".repeat(rating)}${"☆".repeat(5 - rating)}` : "";
  target.body.textContent = content.body ?? "";
  target.episodes.replaceChildren(
    ...(content.episodes ?? []).map((episode) => {
      const entry = document.createElement("li");
      entry.textContent = episode;
      return entry;
    }),
  );
  stopScene();
  if (isScene) void startScene(target);
  target.root.dataset.visible = "true";
  place();
}

/** Peek something that has no data attributes, such as a fetched preview. */
export function peekAt(trigger: HTMLElement, content: PeekContent): void {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  show(trigger, content);
}

function hide(): void {
  active = null;
  stopScene();
  if (view) view.root.dataset.visible = "false";
}

export function mountPeek(): void {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  document.addEventListener("pointerover", (event) => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(SELECTOR)
        : null;
    if (target && target !== active) show(target, fromDataset(target));
  });
  document.addEventListener("pointerout", (event) => {
    // Leaving whatever is peeking, for anything outside it.
    if (!active || !(event.target instanceof Node)) return;
    if (!active.contains(event.target)) return;
    const to = event.relatedTarget;
    if (to instanceof Node && active.contains(to)) return;
    hide();
  });
  window.addEventListener(
    "pointermove",
    (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (active) place();
    },
    { passive: true },
  );
  window.addEventListener("scroll", hide, { passive: true });
  document.addEventListener("astro:before-swap", hide);
}
