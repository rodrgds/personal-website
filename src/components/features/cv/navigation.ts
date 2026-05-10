export const CV_EXPANDABLE_ATTRIBUTE = "data-expandable-id";
export const CV_EXPANDABLE_OPEN_EVENT = "cvexpandable-open";
export const CV_EXPANDABLE_REQUEST_EVENT = "cvexpandable-request";
const CV_EXPANDABLE_SCROLL_DELAY_MS = 250;
const CV_EXPANDABLE_INITIAL_SCROLL_DELAY_MS = 40;

let pendingScrollTimeout: number | null = null;
let pendingScrollFrame: number | null = null;

export interface CVExpandableOpenDetail {
  id: string | null;
}

export interface CVExpandableRequestDetail {
  id: string;
  history?: "push" | "replace" | "none";
  scroll?: boolean;
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
}

function getExpandableSelector(id: string): string {
  return `[${CV_EXPANDABLE_ATTRIBUTE}="${id}"]`;
}

export function getAllExpandableIds(): string[] {
  return Array.from(document.querySelectorAll(`[${CV_EXPANDABLE_ATTRIBUTE}]`))
    .map((element) => element.getAttribute(CV_EXPANDABLE_ATTRIBUTE) ?? "")
    .filter(Boolean);
}

export function getHashTarget(): string | null {
  const hash = window.location.hash.replace(/^#/, "");
  return hash.length > 0 ? hash : null;
}

export function scrollExpandableIntoView(
  id: string,
  behavior: ScrollBehavior = "smooth",
  block: ScrollLogicalPosition = "start",
  delay = CV_EXPANDABLE_SCROLL_DELAY_MS,
): void {
  if (pendingScrollTimeout !== null) {
    window.clearTimeout(pendingScrollTimeout);
    pendingScrollTimeout = null;
  }

  if (pendingScrollFrame !== null) {
    window.cancelAnimationFrame(pendingScrollFrame);
    pendingScrollFrame = null;
  }

  pendingScrollTimeout = window.setTimeout(() => {
    const element = document.querySelector<HTMLElement>(
      getExpandableSelector(id),
    );
    if (!element) return;

    pendingScrollFrame = window.requestAnimationFrame(() => {
      pendingScrollFrame = window.requestAnimationFrame(() => {
        element.scrollIntoView({ behavior, block });
        pendingScrollFrame = null;
      });
    });

    pendingScrollTimeout = null;
  }, delay);
}

export function scrollExpandableIntoViewImmediately(id: string): void {
  scrollExpandableIntoView(
    id,
    "auto",
    "start",
    CV_EXPANDABLE_INITIAL_SCROLL_DELAY_MS,
  );
}

function updateHash(id: string, historyMode: "push" | "replace"): void {
  const url = new URL(window.location.href);
  url.hash = id;

  if (historyMode === "replace") {
    window.history.replaceState({}, "", url);
    return;
  }

  window.history.pushState({}, "", url);
}

export function requestExpandableOpen({
  id,
  history = "push",
  scroll = true,
  behavior = "smooth",
  block = "start",
}: CVExpandableRequestDetail): void {
  if (history !== "none") {
    updateHash(id, history);
  }

  window.dispatchEvent(
    new CustomEvent<CVExpandableRequestDetail>(CV_EXPANDABLE_REQUEST_EVENT, {
      detail: { id, history, scroll, behavior, block },
    }),
  );

  if (scroll) {
    scrollExpandableIntoView(id, behavior, block);
  }
}
