// Site-wide ASCII effects, all opt-in through data attributes:
//   .ascii-spinner           a braille spinner (shared clock)
//   [data-scramble]          text decodes out of noise when it scrolls into view
//   [data-scramble-hover]    text decodes again on every hover
//   img[data-ascii-reveal]   a photo resolves out of coloured glyphs when first seen
//   [data-prompt-path]       the header path retypes itself after a page change
import { SPINNER_FRAMES, asciiResolve, reducedMotion, scramble } from "./ascii";

const spinners = document.getElementsByClassName("ascii-spinner");
let spinnerFrame = 0;
let observer: IntersectionObserver | null = null;
const busy = new WeakSet<HTMLElement>();

function tickSpinners(): void {
  if (spinners.length === 0) return;
  const frame = reducedMotion()
    ? SPINNER_FRAMES[0]
    : SPINNER_FRAMES[spinnerFrame++ % SPINNER_FRAMES.length];
  for (const spinner of spinners) spinner.textContent = frame;
}

function decode(element: HTMLElement, duration: number): void {
  if (busy.has(element)) return;
  busy.add(element);
  scramble(element, duration);
  window.setTimeout(() => busy.delete(element), duration + 50);
}

function scan(): void {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target;
        observer?.unobserve(target);
        if (target instanceof HTMLImageElement) asciiResolve(target, 1000);
        else if (target instanceof HTMLElement) decode(target, 650);
      }
    },
    { threshold: 0.3 },
  );
  for (const element of document.querySelectorAll<HTMLElement>(
    "[data-scramble], img[data-ascii-reveal]",
  )) {
    observer.observe(element);
  }
}

let lastPath: string | null = null;

/** Retype the header prompt path from where the old one and the new one differ. */
function typePromptPath(): void {
  const element = document.querySelector<HTMLElement>("[data-prompt-path]");
  if (!element) return;
  const next = element.textContent ?? "";
  const previous = lastPath;
  lastPath = next;
  if (previous === null || previous === next || reducedMotion()) return;
  let shared = 0;
  while (shared < next.length && next[shared] === previous[shared]) shared++;
  let length = shared;
  element.textContent = next.slice(0, length);
  const timer = window.setInterval(() => {
    length += 1;
    element.textContent = next.slice(0, length);
    if (length >= next.length) window.clearInterval(timer);
  }, 32);
}

export function mountEffects(): void {
  window.setInterval(tickSpinners, 80);
  document.addEventListener("pointerover", (event) => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-scramble-hover]")
        : null;
    const from =
      event.relatedTarget instanceof Element
        ? event.relatedTarget.closest("[data-scramble-hover]")
        : null;
    if (target && target !== from) decode(target, 360);
  });
  document.addEventListener("astro:page-load", () => {
    scan();
    typePromptPath();
  });
  document.addEventListener("astro:before-swap", () => observer?.disconnect());
  scan();
  typePromptPath();
}
