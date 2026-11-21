// Vim-style keyboard navigation for the whole site.
//
//   j / k        scroll down / up          d / u   half a page
//   gg / G       top / bottom              H / L   back / forward
//   g + h c n u f e s    go to home, cv, now, uses, faves, edu, slides
//   f / F        link hints (F opens in a new tab)
//   : or `       open the tty              ?       keybindings
//   Esc          close whatever is open
//
// Keys are ignored while typing, with modifier keys held, or inside an
// element marked `data-no-vim` (games, tools with their own keys).
import { openTty } from "./tty";

const HINT_CHARS = "asdfghjklqwertyuiopzxcvbnm";

const GO_TO = new Map<string, string>([
  ["h", "/"],
  ["c", "/cv"],
  ["n", "/#now"],
  ["u", "/uses"],
  ["f", "/faves"],
  ["e", "/edu"],
  ["s", "/slides"],
]);

let pending = "";
let pendingTimer = 0;
let hints: {
  layer: HTMLElement;
  items: Array<{ label: string; target: HTMLElement; tag: HTMLElement }>;
  typed: string;
  newTab: boolean;
} | null = null;

function isTyping(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-no-vim]")) return true;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  return target instanceof HTMLElement && target.isContentEditable;
}

function scrollStep(amount: number): void {
  window.scrollBy({ top: amount, behavior: "auto" });
}

function navigate(href: string, newTab = false): void {
  if (newTab) {
    window.open(href, "_blank", "noopener");
    return;
  }
  const link = document.createElement("a");
  link.href = href;
  document.body.append(link);
  // A real click keeps Astro's client-side router in charge of navigation.
  link.click();
  link.remove();
}

function hintLabels(count: number): string[] {
  const chars = HINT_CHARS.split("");
  if (count <= chars.length) return chars.slice(0, count);
  const labels: string[] = [];
  for (const first of chars) {
    for (const second of chars) {
      labels.push(first + second);
      if (labels.length === count) return labels;
    }
  }
  return labels;
}

function visibleTargets(): HTMLElement[] {
  const nodes = document.querySelectorAll<HTMLElement>(
    "a[href], button:not([disabled]), summary, [role='button'], input, select, textarea",
  );
  const result: HTMLElement[] = [];
  for (const node of nodes) {
    if (node.closest(".peek, [aria-hidden='true']")) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    if (
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth
    )
      continue;
    const style = getComputedStyle(node);
    if (style.visibility === "hidden" || style.display === "none") continue;
    result.push(node);
  }
  return result;
}

function closeHints(): void {
  hints?.layer.remove();
  hints = null;
}

function openHints(newTab: boolean): void {
  closeHints();
  const targets = visibleTargets();
  if (targets.length === 0) return;
  const labels = hintLabels(targets.length);
  const layer = document.createElement("div");
  layer.className = "vim-hints";
  layer.setAttribute("aria-hidden", "true");
  const items = targets.map((target, index) => {
    const rect = target.getBoundingClientRect();
    const tag = document.createElement("span");
    tag.className = "vim-hint";
    tag.textContent = labels[index];
    tag.style.transform = `translate(${Math.max(0, rect.left - 4)}px, ${Math.max(0, rect.top - 6)}px)`;
    layer.append(tag);
    return { label: labels[index], target, tag };
  });
  document.body.append(layer);
  hints = { layer, items, typed: "", newTab };
}

function typeHint(key: string): void {
  if (!hints) return;
  hints.typed += key;
  const typed = hints.typed;
  const matches = hints.items.filter((item) => item.label.startsWith(typed));
  for (const item of hints.items) {
    const match = item.label.startsWith(typed);
    item.tag.hidden = !match;
    item.tag.dataset.typed = match ? String(typed.length) : "0";
  }
  if (matches.length === 0) {
    closeHints();
    return;
  }
  const exact = matches.find((item) => item.label === typed);
  if (!exact) return;
  const { target } = exact;
  const newTab = hints.newTab;
  closeHints();
  if (newTab && target instanceof HTMLAnchorElement) {
    window.open(target.href, "_blank", "noopener");
  } else if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    target.focus();
  } else {
    target.focus({ preventScroll: true });
    target.click();
  }
}

function clearPending(): void {
  pending = "";
  window.clearTimeout(pendingTimer);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey)
    return;
  if (hints) {
    if (event.key === "Escape") closeHints();
    else if (/^[a-z]$/.test(event.key)) typeHint(event.key);
    else if (event.key === "Backspace") {
      hints.typed = hints.typed.slice(0, -1);
      typeHint("");
    }
    event.preventDefault();
    return;
  }
  if (isTyping(event)) return;

  const key = event.key;
  if (pending === "g") {
    clearPending();
    if (key === "g") window.scrollTo({ top: 0, behavior: "auto" });
    else {
      const href = GO_TO.get(key);
      if (href) navigate(href);
    }
    event.preventDefault();
    return;
  }

  switch (key) {
    case "j":
      scrollStep(72);
      break;
    case "k":
      scrollStep(-72);
      break;
    case "d":
      scrollStep(window.innerHeight / 2);
      break;
    case "u":
      scrollStep(-window.innerHeight / 2);
      break;
    case "G":
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "auto",
      });
      break;
    case "H":
      history.back();
      break;
    case "L":
      history.forward();
      break;
    case "g":
      pending = "g";
      pendingTimer = window.setTimeout(clearPending, 900);
      break;
    case "f":
      openHints(false);
      break;
    case "F":
      openHints(true);
      break;
    case ":":
    case "`":
      openTty();
      break;
    case "?":
      openTty("help");
      break;
    default:
      return;
  }
  event.preventDefault();
}

export function mountKeys(): void {
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("astro:before-swap", closeHints);
  window.addEventListener("scroll", () => hints && closeHints(), {
    passive: true,
  });
}
