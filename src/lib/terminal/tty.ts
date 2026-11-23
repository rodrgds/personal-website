// The in-page terminal. Open with `:` or `` ` `` (or the [:tty] button), type
// `help`. This file is the view: the shell lives in ./shell, the data comes
// from /api/tty.json and the styles are in global.css (.tty).
import { donutFrame, matrixRain, reducedMotion } from "./ascii";
import { cue } from "../sound";
import { renderMarkdown } from "./markdown";
import { commonPrefix, complete } from "./complete";
import type { CommandInfo, Completion } from "./complete";
import type { Out, Tone } from "./shell/io";
import { PROGRAMS, createShell } from "./shell/registry";
import { aliasFor, runLine } from "./shell/run";
import type { Screen } from "./shell/run";
import type { AskTurn, Host, Shell } from "./shell/types";
import { HOME } from "./shell/vfs";
import { ttyDataSchema } from "./tty-data";
import type { TtyData } from "./tty-data";

const HISTORY_KEY = "rgo:tty-history";
const PROMPT = "rodrigo@rgo.pt";

interface TtyView {
  root: HTMLElement;
  log: HTMLElement;
  input: HTMLInputElement;
  path: HTMLElement;
  ghostTyped: HTMLElement;
  ghostRest: HTMLElement;
  menu: HTMLElement;
}

interface MenuState {
  items: Completion[];
  index: number;
}

let view: TtyView | null = null;
let data: TtyData | null = null;
let loading: Promise<TtyData | null> | null = null;
let shell: Shell | null = null;
const history: string[] = [];
const askHistory: AskTurn[] = [];
let historyIndex = -1;
let lastFocus: Element | null = null;
let menu: MenuState | null = null;
let run: AbortController | null = null;
let statusLine: HTMLElement | null = null;
let toyAbort: (() => void) | null = null;

function readHistory(): string[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function writeHistory(): void {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-50)));
  } catch {
    // Storage can be blocked; history then lasts for this page only.
  }
}

async function loadData(): Promise<TtyData | null> {
  if (data) return data;
  loading ??= fetch("/api/tty.json")
    .then((response) => (response.ok ? response.json() : null))
    .then((json) => {
      const parsed = ttyDataSchema.safeParse(json);
      data = parsed.success ? parsed.data : null;
      return data;
    })
    .catch(() => null);
  const loaded = await loading;
  if (!loaded) loading = null;
  return loaded;
}

async function ensureShell(): Promise<Shell | null> {
  if (shell) return shell;
  const loaded = await loadData();
  if (loaded) shell ??= createShell(loaded, host, history, askHistory);
  return shell;
}

function currentPath(): string {
  return shell ? shell.fs.display(shell.cwd) : "~";
}

function updatePrompt(): void {
  if (view) view.path.textContent = currentPath();
}

// ---------------------------------------------------------------------------
// Output

function line(className = ""): HTMLElement {
  const element = document.createElement("div");
  element.className = `tty-out ${className}`.trim();
  view?.log.append(element);
  return element;
}

function print(text: string, className = ""): void {
  line(className).textContent = text;
}

function scrollLog(): void {
  if (view) view.log.scrollTop = view.log.scrollHeight;
}

function go(href: string): void {
  closeTty();
  if (/^https?:|^mailto:/.test(href)) {
    window.open(href, "_blank", "noopener");
    return;
  }
  const link = document.createElement("a");
  link.href = href;
  document.body.append(link);
  link.click();
  link.remove();
}

function themeIsDark(): boolean {
  const set = document.documentElement.dataset.theme;
  if (set) return set === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const URL_PATTERN = /(https?:\/\/[^\s)]+|rgo\.pt\/[a-z0-9/_#?=-]*)/gi;

/** Make the URLs in plain text clickable. */
function linkify(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // Not inside a link already, and not inside code.
    if (node instanceof Text && !node.parentElement?.closest("a, code"))
      nodes.push(node);
  }
  for (const node of nodes) {
    const text = node.data;
    const fragment = document.createDocumentFragment();
    let last = 0;
    for (const match of text.matchAll(URL_PATTERN)) {
      const start = match.index ?? 0;
      fragment.append(text.slice(last, start));
      const raw = match[0].replace(/[.,]$/, "");
      fragment.append(anchor(raw, raw));
      last = start + raw.length;
    }
    if (last === 0) continue;
    fragment.append(text.slice(last));
    node.replaceWith(fragment);
  }
}

function anchor(text: string, href: string): HTMLAnchorElement {
  const element = document.createElement("a");
  const external = /^https?:/.test(href);
  element.href = external
    ? href
    : href.startsWith("/")
      ? href
      : `/${href.replace(/^rgo\.pt\/?/, "")}`;
  element.textContent = text;
  if (external) {
    element.target = "_blank";
    element.rel = "noopener noreferrer";
  } else element.addEventListener("click", () => closeTty());
  return element;
}

/** A program's output on screen: spans per tone, links, URLs made clickable. */
function screenOut(kind: "out" | "err"): Out {
  let element: HTMLElement | null = null;
  const ensure = (): HTMLElement => {
    element ??= line();
    return element;
  };
  return {
    write(text: string, tone?: Tone) {
      if (!text) return;
      const target = ensure();
      if (tone) {
        const span = document.createElement("span");
        span.className = `tty-${tone}`;
        span.textContent = text;
        target.append(span);
      } else target.append(text);
      scrollLog();
    },
    link(text: string, href: string) {
      ensure().append(anchor(text, href));
      scrollLog();
    },
    markdown(source: string) {
      ensure().replaceChildren(...renderMarkdown(source, anchor));
      scrollLog();
    },
    block(blockKind) {
      ensure().classList.add(`tty-${blockKind}`);
    },
    finish() {
      if (!element) return;
      const last = element.lastChild;
      if (last instanceof Text) last.data = last.data.replace(/\n+$/, "");
      else if (last instanceof HTMLElement && last.lastChild instanceof Text)
        last.lastChild.data = last.lastChild.data.replace(/\n+$/, "");
      element.normalize();
      if (kind === "out") linkify(element);
      if (!element.textContent) element.remove();
      element = null;
      scrollLog();
    },
  };
}

const SCREEN: Screen = {
  out: () => screenOut("out"),
  err: () => screenOut("err"),
};

/** donut.c, spinning in the log for a few seconds. */
function donut(): void {
  const out = line("tty-donut");
  if (reducedMotion()) {
    out.textContent = donutFrame(1, 0.5, 56, 22);
    return;
  }
  let a = 0;
  let b = 0;
  let frame = 0;
  const started = performance.now();
  const stop = (): void => {
    cancelAnimationFrame(frame);
    toyAbort = null;
  };
  toyAbort = stop;
  const tick = (now: number): void => {
    a += 0.07;
    b += 0.03;
    out.textContent = donutFrame(a, b, 56, 22);
    if (now - started < 6000) frame = requestAnimationFrame(tick);
    else stop();
  };
  frame = requestAnimationFrame(tick);
  scrollLog();
}

let inceptionModule: Promise<typeof import("../home/inception")> | null = null;

/** three.js, the room and the snapshot helper, fetched while "inc..." is typed. */
function loadInception(): Promise<typeof import("../home/inception")> {
  if (!inceptionModule) {
    inceptionModule = import("../home/inception").then((module) => {
      module.preloadInception();
      return module;
    });
    void import("modern-screenshot").catch(() => {});
  }
  return inceptionModule;
}

const host: Host = {
  go,
  openTab(url) {
    window.open(url, "_blank", "noopener");
  },
  close: () => closeTty(),
  clear() {
    if (view) view.log.textContent = "";
  },
  theme(wanted) {
    const toggle = document.querySelector<HTMLElement>("[data-theme-toggle]");
    const dark = themeIsDark();
    if (
      wanted === "toggle" ||
      (wanted === "dark" && !dark) ||
      (wanted === "light" && dark)
    )
      toggle?.click();
    return themeIsDark() ? "dark" : "light";
  },
  sound(wanted) {
    const button = document.querySelector<HTMLElement>("[data-sound-toggle]");
    const on = button?.dataset.soundState !== "off";
    if (!wanted || (wanted === "off" && on) || (wanted === "on" && !on))
      button?.click();
    return button?.dataset.soundState === "off" ? "off" : "on";
  },
  donut,
  matrix() {
    closeTty();
    matrixRain(() => undefined);
  },
  inception() {
    closeTty();
    void loadInception().then((module) => module.startInception());
  },
  reboot() {
    try {
      sessionStorage.removeItem("rgo:terminal-booted");
    } catch {
      // Ignore blocked storage; the boot simply won't replay.
    }
    if (location.pathname === "/") location.reload();
    else go("/");
  },
  status(text) {
    if (text === null) {
      statusLine?.remove();
      statusLine = null;
      return;
    }
    if (!statusLine || !statusLine.isConnected) {
      statusLine = line("tty-dim");
    }
    statusLine.textContent = text;
    scrollLog();
  },
};

// ---------------------------------------------------------------------------
// Running a line

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** True when the first word names a program, an alias or a path. */
function isCommand(input: string): boolean {
  const first = (input.split(/\s+/)[0] ?? "").replace(/^["']|["']$/g, "");
  const name = first.toLowerCase();
  return (
    PROGRAMS.has(name) ||
    aliasFor(name) !== undefined ||
    /^(\/|\.\/|~|\$)/.test(first)
  );
}

/** Levenshtein distance up to a small limit, for "did you mean". */
function closeTo(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row.push(
        Math.min(
          previous[j] + 1,
          row[j - 1] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        ),
      );
    previous = row;
  }
  return previous[b.length] <= 1;
}

const QUESTION_WORDS = new Set(["how", "why", "who", "what", "when", "where"]);

/** A single mistyped word ("lss") gets a suggestion instead of an AI call. */
function typoOf(input: string): string | undefined {
  if (/\s/.test(input) || input.length < 2) return undefined;
  const word = input.toLowerCase();
  if (QUESTION_WORDS.has(word.replace(/\?$/, ""))) return undefined;
  return [...PROGRAMS.keys()].find(
    (name) => name.length > 1 && closeTo(word, name),
  );
}

async function execute(raw: string): Promise<void> {
  let input = raw.trim();
  const echo = line("tty-echo");
  echo.textContent = `${PROMPT}:${currentPath()}$ ${input}`;
  if (!input) return;
  if (input.includes("!!") && history.length > 0) {
    input = input.replace(/!!/g, history[history.length - 1]);
    echo.textContent = `${PROMPT}:${currentPath()}$ ${input}`;
  }
  history.push(input);
  historyIndex = history.length;
  writeHistory();

  const active = await ensureShell();
  if (!active) {
    print("error: could not load site data. try again in a second.", "tty-err");
    return;
  }
  const abort = new AbortController();
  run = abort;
  try {
    // Anything that is not a command is a question for ask.
    const typo = isCommand(input) ? undefined : typoOf(input);
    if (typo) {
      print(
        `bash: ${input}: command not found. did you mean ${typo}?`,
        "tty-err",
      );
      active.status = 127;
    } else {
      const command = isCommand(input) ? input : `ask ${shellQuote(input)}`;
      await runLine(active, command, SCREEN, abort.signal);
      // A finished answer is worth a note; a failure says so. ^C is silent.
      if (active.status === 0 && /^ask\b/.test(command))
        cue("ready", { emphasis: "subtle" });
    }
    if (active.status !== 0 && active.status !== 130)
      cue("error", { emphasis: "subtle" });
  } finally {
    if (run === abort) run = null;
    host.status(null);
    updatePrompt();
    scrollLog();
  }
}

function commandInfos(): CommandInfo[] {
  const infos = [...PROGRAMS.values()].map((program) => ({
    name: program.name,
    summary: program.summary,
    flags: program.flags,
    takes: program.takes,
    pathsFrom: program.pathsFrom,
  }));
  return [
    ...infos.filter((info) => info.summary),
    ...infos.filter((info) => !info.summary),
  ];
}

function candidates(value: string): Completion[] {
  return complete(value, {
    data,
    fs: shell?.fs ?? null,
    cwd: shell?.cwd ?? HOME,
    commands: commandInfos(),
  });
}

function hideMenu(): void {
  menu = null;
  if (!view) return;
  view.menu.hidden = true;
  view.menu.textContent = "";
}

function renderMenu(items: Completion[], active: number): void {
  if (!view) return;
  const shown = items.slice(0, 8);
  view.menu.textContent = "";
  view.menu.hidden = shown.length === 0;
  shown.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "tty-suggest-row";
    if (index === active) row.dataset.active = "";
    const label = document.createElement("span");
    label.textContent = item.label;
    row.append(label);
    if (item.note) {
      const note = document.createElement("span");
      note.className = "tty-dim";
      note.textContent = item.note;
      row.append(note);
    }
    row.addEventListener("mousedown", (event) => {
      event.preventDefault();
      accept(item.value);
    });
    view?.menu.append(row);
  });
  if (items.length > shown.length) {
    const more = document.createElement("div");
    more.className = "tty-dim";
    more.textContent = `  +${items.length - shown.length} more, keep typing`;
    view.menu.append(more);
  }
}

/** Grey text after the cursor: what Tab or -> would add. */
function renderGhost(): void {
  if (!view) return;
  const value = view.input.value;
  const best = value
    ? candidates(value).find((item) =>
        item.value.toLowerCase().startsWith(value.toLowerCase()),
      )
    : undefined;
  view.ghostTyped.textContent = value;
  view.ghostRest.textContent =
    best && best.value.length > value.length
      ? best.value.slice(value.length)
      : "";
}

/** Live suggestions while typing. */
function suggest(): void {
  if (!view) return;
  menu = null;
  const value = view.input.value;
  const items = value.trim() ? candidates(value) : [];
  const exact = items.length === 1 && items[0].value.trim() === value.trim();
  if (items.length > 1 && !exact) renderMenu(items, -1);
  else hideMenu();
  renderGhost();
}

function accept(value: string): void {
  if (!view) return;
  cue("select", { emphasis: "subtle" });
  view.input.value = value;
  hideMenu();
  renderGhost();
  view.input.focus();
}

function tab(backwards: boolean): void {
  if (!view) return;
  if (menu) {
    const count = Math.min(menu.items.length, 8);
    menu.index = (menu.index + (backwards ? -1 : 1) + count) % count;
    cue("select", {
      emphasis: "subtle",
      direction: backwards ? "back" : "forward",
    });
    view.input.value = menu.items[menu.index].value;
    renderMenu(menu.items, menu.index);
    renderGhost();
    return;
  }
  const value = view.input.value;
  const items = candidates(value);
  if (items.length === 0) return;
  if (items.length === 1) {
    accept(items[0].value);
    return;
  }
  const prefix = commonPrefix(items.map((item) => item.value));
  if (
    prefix.length > value.length &&
    prefix.toLowerCase().startsWith(value.toLowerCase())
  ) {
    view.input.value = prefix;
    cue("select", { emphasis: "subtle" });
    suggest();
    return;
  }
  menu = { items, index: backwards ? Math.min(items.length, 8) - 1 : 0 };
  cue("open", { emphasis: "subtle" });
  view.input.value = items[menu.index].value;
  renderMenu(items, menu.index);
  renderGhost();
}

// ---------------------------------------------------------------------------
// View

function createView(): TtyView {
  const root = document.createElement("div");
  root.className = "tty";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Terminal");
  root.dataset.noVim = "";
  root.innerHTML = `<div class="tty-window"><div class="tty-bar"><span>tty1 · ${PROMPT}</span><button type="button" class="tty-close" aria-label="Close terminal">x</button></div><div class="tty-log" aria-live="polite"></div><div class="tty-suggest" hidden></div><form class="tty-line"><label for="tty-input"><span class="tty-host">${PROMPT}</span>:<span class="tty-path"></span>$</label><div class="tty-field"><span class="tty-ghost" aria-hidden="true"><span class="tty-ghost-typed"></span><span class="tty-ghost-rest"></span></span><input id="tty-input" data-cuelume-type autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"></div></form></div>`;
  document.body.append(root);
  const log = root.querySelector<HTMLElement>(".tty-log");
  const input = root.querySelector<HTMLInputElement>("input");
  const path = root.querySelector<HTMLElement>(".tty-path");
  const form = root.querySelector<HTMLFormElement>("form");
  const close = root.querySelector<HTMLButtonElement>(".tty-close");
  const ghostTyped = root.querySelector<HTMLElement>(".tty-ghost-typed");
  const ghostRest = root.querySelector<HTMLElement>(".tty-ghost-rest");
  const suggestMenu = root.querySelector<HTMLElement>(".tty-suggest");
  if (
    !log ||
    !input ||
    !path ||
    !form ||
    !close ||
    !ghostTyped ||
    !ghostRest ||
    !suggestMenu
  )
    throw new Error("tty markup is incomplete");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (run) return;
    const value = input.value;
    cue("type", { key: "enter", input: "keyboard" });
    input.value = "";
    hideMenu();
    renderGhost();
    void execute(value).then(scrollLog);
    scrollLog();
  });
  input.addEventListener("input", () => {
    suggest();
    // Fetch the inception scene while the command is still being typed.
    if (input.value.trimStart().startsWith("inc"))
      void loadInception().catch(() => {});
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!suggestMenu.hidden) hideMenu();
      else closeTty();
    } else if (event.key === "Tab") {
      event.preventDefault();
      tab(event.shiftKey);
    } else if (
      event.key === "ArrowRight" &&
      input.selectionStart === input.value.length &&
      ghostRest.textContent
    ) {
      event.preventDefault();
      accept(input.value + ghostRest.textContent);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      hideMenu();
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex] ?? input.value;
      renderGhost();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      hideMenu();
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] ?? "";
      renderGhost();
    } else if (event.key === "c" && event.ctrlKey) {
      if (run || toyAbort) {
        event.preventDefault();
        run?.abort();
        toyAbort?.();
      }
    } else if (event.key === "l" && event.ctrlKey) {
      event.preventDefault();
      log.textContent = "";
    }
  });
  input.addEventListener("scroll", () => {
    ghostTyped.parentElement?.scrollTo({ left: input.scrollLeft });
  });
  close.addEventListener("click", () => closeTty());
  root.addEventListener("click", (event) => {
    if (event.target === root) closeTty();
  });
  return { root, log, input, path, ghostTyped, ghostRest, menu: suggestMenu };
}

export function openTty(command?: string): void {
  if (!view || !document.body.contains(view.root)) {
    view = createView();
    history.splice(0, history.length, ...readHistory());
    historyIndex = history.length;
    print(
      "welcome to rgo.pt. ask anything about me in plain words, or type help, ls, or cat a post.",
      "tty-dim",
    );
  }
  if (view.root.dataset.open !== "true") cue("open", { emphasis: "subtle" });
  lastFocus = document.activeElement;
  view.path.textContent = currentPath();
  view.root.dataset.open = "true";
  // Not "data-tty-open": that attribute marks the buttons that open the tty,
  // and the click handler would find it on <html> and run "true".
  document.documentElement.dataset.ttyShown = "true";
  view.input.focus();
  void ensureShell().then(updatePrompt);
  if (command) void execute(command).then(scrollLog);
}

export function closeTty(): void {
  if (!view) return;
  if (view.root.dataset.open === "true") cue("close", { emphasis: "subtle" });
  view.input.blur();
  view.root.dataset.open = "false";
  delete document.documentElement.dataset.ttyShown;
  if (lastFocus instanceof HTMLElement)
    lastFocus.focus({ preventScroll: true });
}

export function mountTty(): void {
  document.addEventListener("click", (event) => {
    const trigger =
      event.target instanceof Element
        ? event.target.closest("[data-tty-open]")
        : null;
    if (!trigger) return;
    event.preventDefault();
    openTty(trigger.getAttribute("data-tty-open") || undefined);
  });
  document.addEventListener("astro:before-swap", () => closeTty());
}
