import { z } from "astro/zod";

export const deckMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state"), index: z.number(), step: z.number() }),
  z.object({ type: z.literal("hello") }),
]);
export type DeckMessage = z.infer<typeof deckMessage>;

export interface DeckContext {
  root: HTMLElement;
  slug: string;
  slides: HTMLElement[];
  channel: BroadcastChannel | null;
}

const THEME_KEY = "slides:theme";

export function toggleTheme(): void {
  const root = document.documentElement;
  const theme = root.dataset.deckTheme === "light" ? "dark" : "light";
  root.dataset.deckTheme = theme;
  root.style.colorScheme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The theme still changes for this page view.
  }
}

export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
}

/** Pointer capture can fail for synthetic or already-released pointers. */
export function capturePointer(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Drawing and panning still work without capture.
  }
}
