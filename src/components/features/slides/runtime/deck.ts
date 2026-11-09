import { Camera, type WorldRect } from "./camera";
import { INK_COLORS, Ink, TOOLS, type InkColor, type Tool } from "./ink";
import { clearMarks, updateMarks } from "./marks";
import {
  capturePointer,
  deckMessage,
  isTyping,
  toggleTheme,
  type DeckContext,
  type DeckMessage,
} from "./shared";
import { initScript, initSpeaker } from "./speaker";
import { applyStep, lastStep, prepareSlide } from "./steps";
import { initWidgets } from "./widgets";

const INTERACTIVE =
  "input, textarea, select, button, a, label, [data-interactive]";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

interface DeckPosition {
  index: number;
  step: number;
}

function parseHash(slides: HTMLElement[]): DeckPosition {
  const hash = decodeURIComponent(window.location.hash.slice(1)).replace(
    /^\//,
    "",
  );
  const numeric = /^(\d+)(?:\.(\d+))?$/.exec(hash);
  if (numeric) {
    return {
      index: clamp(Number(numeric[1]) - 1, 0, slides.length - 1),
      step: Number(numeric[2] ?? 0),
    };
  }
  const byId = slides.findIndex((slide) => slide.id && slide.id === hash);
  return { index: Math.max(0, byId), step: 0 };
}

export function initDeck(): void {
  const root = document.querySelector<HTMLElement>("[data-deck]");
  if (!root) return;
  const slug = root.dataset.slug ?? "deck";
  const slides = [
    ...root.querySelectorAll<HTMLElement>("[data-map] [data-slide]"),
  ];
  slides.forEach((slide, index) => {
    slide.dataset.index = String(index);
    const chapter =
      slide.closest<HTMLElement>("[data-chapter]")?.dataset.title ?? "";
    slide.dataset.chapter = chapter;
    if (!slide.dataset.title) {
      slide.dataset.title =
        slide.querySelector("h1, h2, h3")?.textContent?.trim() ||
        `Slide ${index + 1}`;
    }
    prepareSlide(slide);
  });

  const params = new URLSearchParams(window.location.search);
  const channel =
    "BroadcastChannel" in window
      ? new BroadcastChannel(`slides:${slug}`)
      : null;
  const context: DeckContext = { root, slug, slides, channel };
  if (params.has("speaker")) {
    root.dataset.mode = "speaker";
    initSpeaker(context);
  } else if (params.has("script")) {
    root.dataset.mode = "script";
    initScript(context);
  } else {
    root.dataset.mode = "canvas";
    initCanvas(context);
  }
}

function initCanvas({ root, slug, slides, channel }: DeckContext): void {
  const query = <T extends Element>(selector: string) =>
    root.querySelector<T>(selector);
  const viewport = query<HTMLElement>("[data-viewport]");
  const world = query<HTMLElement>("[data-world]");
  const map = query<HTMLElement>("[data-map]");
  const input = query<HTMLElement>("[data-input]");
  const inkSvg = query<SVGSVGElement>("[data-ink]");
  const overlay = query<SVGSVGElement>("[data-overlay]");
  const board = query<HTMLElement>("[data-board-frame]");
  const toolbar = query<HTMLElement>("[data-toolbar]");
  const help = query<HTMLElement>("[data-help]");
  if (
    !viewport ||
    !world ||
    !map ||
    !input ||
    !inkSvg ||
    !overlay ||
    !toolbar ||
    !slides.length
  ) {
    return;
  }

  let index = 0;
  let step = 0;
  let initialized = false;
  let fitted = true;
  let place: "slide" | "overview" | "board" | "free" = "slide";
  let markTimer = 0;

  const camera = new Camera(world, viewport, () => {
    root.style.setProperty("--zoom", String(camera.view.z));
  });
  const ink = new Ink(
    { root, viewport, input, svg: inkSvg, overlay },
    camera,
    `slides:ink:${slug}`,
  );

  const rectOf = (element: HTMLElement): WorldRect => {
    let x = 0;
    let y = 0;
    let node: HTMLElement | null = element;
    while (node && node !== world) {
      x += node.offsetLeft;
      y += node.offsetTop;
      node =
        node.offsetParent instanceof HTMLElement ? node.offsetParent : null;
    }
    return { x, y, width: element.offsetWidth, height: element.offsetHeight };
  };

  const counter = query<HTMLElement>("[data-counter]");
  const syncToolbar = () => {
    if (counter) counter.textContent = `${index + 1} / ${slides.length}`;
    for (const button of toolbar.querySelectorAll<HTMLElement>("[data-tool]")) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.tool === ink.tool),
      );
    }
    for (const button of toolbar.querySelectorAll<HTMLElement>(
      "[data-color]",
    )) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.color === ink.color),
      );
    }
    for (const button of toolbar.querySelectorAll<HTMLElement>("[data-size]")) {
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.size) === ink.sizeIndex),
      );
    }
    const setDisabled = (action: string, disabled: boolean) => {
      const button = toolbar.querySelector<HTMLButtonElement>(
        `[data-action="${action}"]`,
      );
      if (button) button.disabled = disabled;
    };
    setDisabled("undo", !ink.canUndo);
    setDisabled("redo", !ink.canRedo);
    setDisabled("prev", index === 0 && step === 0);
    setDisabled(
      "next",
      index === slides.length - 1 && step === lastStep(slides[index]),
    );
    root.dataset.place = place;
  };
  ink.onChange = syncToolbar;

  initWidgets(map);
  // Slides away from the camera show all their steps, which reads better
  // when zoomed out. The current slide is stepped through.
  for (const slide of slides) applyStep(slide, lastStep(slide), false);

  const fitCurrent = (instant = false) => {
    place = "slide";
    fitted = true;
    syncToolbar();
    return camera.animateTo(camera.fit(rectOf(slides[index])), instant);
  };

  const go = (
    target: number,
    targetStep: number,
    animate = true,
    broadcast = true,
  ) => {
    const nextIndex = clamp(target, 0, slides.length - 1);
    const slide = slides[nextIndex];
    const nextStep = clamp(targetStep, 0, lastStep(slide));
    const changed = nextIndex !== index || !initialized;
    const forward = changed || nextStep > step;
    window.clearTimeout(markTimer);
    if (changed) {
      const previous = slides[index];
      previous.removeAttribute("data-current");
      clearMarks(previous);
      if (previous !== slide) applyStep(previous, lastStep(previous), false);
      slide.setAttribute("data-current", "");
      index = nextIndex;
      initialized = true;
      step = nextStep;
      applyStep(slide, step, animate);
      void fitCurrent(!animate).then(() => {
        if (index === nextIndex) updateMarks(slide, step, animate);
      });
    } else {
      step = nextStep;
      applyStep(slide, step, forward && animate);
      if (place !== "slide") void fitCurrent();
      markTimer = window.setTimeout(
        () => updateMarks(slide, step, animate),
        animate ? 260 : 0,
      );
    }
    history.replaceState(null, "", `#${index + 1}${step ? `.${step}` : ""}`);
    syncToolbar();
    if (broadcast)
      channel?.postMessage({
        type: "state",
        index,
        step,
      } satisfies DeckMessage);
  };

  const next = (skipSteps = false) => {
    if (!skipSteps && step < lastStep(slides[index])) go(index, step + 1);
    else if (index < slides.length - 1) go(index + 1, 0);
  };
  const prev = (skipSteps = false) => {
    if (!skipSteps && step > 0) go(index, step - 1);
    else if (index > 0)
      go(index - 1, skipSteps ? 0 : lastStep(slides[index - 1]));
  };

  const toggleOverview = () => {
    if (place === "overview") {
      void fitCurrent();
      return;
    }
    place = "overview";
    fitted = false;
    syncToolbar();
    void camera.animateTo(camera.fit(rectOf(map), 48));
  };

  const toggleBoard = () => {
    if (place === "board" || !board) {
      void fitCurrent();
      return;
    }
    place = "board";
    fitted = false;
    syncToolbar();
    void camera.animateTo(camera.fit(rectOf(board)));
  };

  const openSpeaker = () => {
    const url = `${window.location.pathname}?speaker${window.location.hash}`;
    window.open(url, `slides-speaker-${slug}`, "popup,width=1280,height=820");
  };

  const toggleHelp = (open?: boolean) => {
    if (!help) return;
    help.hidden = !(open ?? help.hidden);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  const currentRect = () =>
    place === "board" && board ? rectOf(board) : rectOf(slides[index]);

  const actions = new Map<string, () => void>(
    Object.entries({
      prev: () => prev(),
      next: () => next(),
      overview: toggleOverview,
      board: toggleBoard,
      fit: () => void fitCurrent(),
      speaker: openSpeaker,
      script: () => window.open(`${window.location.pathname}?script`, "_blank"),
      theme: toggleTheme,
      help: () => toggleHelp(),
      fullscreen: toggleFullscreen,
      undo: () => ink.undo(),
      redo: () => ink.redo(),
      "clear-slide": () => ink.clear(currentRect()),
      "clear-all": () => ink.clear(),
    }),
  );

  toolbar.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLElement>("button");
    if (!button) return;
    const tool = TOOLS.find((value) => value === button.dataset.tool);
    const color = INK_COLORS.find((value) => value === button.dataset.color);
    if (tool) ink.setTool(tool);
    else if (color) ink.setColor(color);
    else if (button.dataset.size) ink.setSize(Number(button.dataset.size));
    else if (button.dataset.action) actions.get(button.dataset.action)?.();
    button.blur();
  });
  help?.addEventListener("click", (event) => {
    if (
      event.target === help ||
      (event.target instanceof Element &&
        event.target.closest("[data-help-close]"))
    ) {
      toggleHelp(false);
    }
  });

  // ------------------------------------------------------------ keyboard

  let spaceDown = false;
  let spaceUsed = false;
  let spaceAt = 0;
  const toolKeys = new Map<string, Tool>(
    Object.entries({
      v: "interact",
      p: "pen",
      h: "highlighter",
      e: "eraser",
      l: "laser",
      a: "arrow",
      r: "rect",
      o: "ellipse",
      t: "text",
    }),
  );

  window.addEventListener("keydown", (event) => {
    if (isTyping(event.target)) {
      if (event.key === "Escape" && event.target instanceof HTMLElement)
        event.target.blur();
      return;
    }
    const key = event.key.toLowerCase();
    if (event.metaKey || event.ctrlKey) {
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) ink.redo();
        else ink.undo();
      } else if (key === "y") {
        event.preventDefault();
        ink.redo();
      }
      return;
    }
    if (event.altKey) return;
    if (event.key === " ") {
      event.preventDefault();
      if (!event.repeat) {
        spaceDown = true;
        spaceUsed = false;
        spaceAt = performance.now();
        root.setAttribute("data-space", "");
      }
      return;
    }
    const tool = toolKeys.get(key);
    const colorIndex = Number(event.key) - 1;
    if (tool && !event.shiftKey) {
      ink.setTool(tool);
    } else if (
      colorIndex >= 0 &&
      colorIndex < INK_COLORS.length &&
      /^\d$/.test(event.key)
    ) {
      const color: InkColor = INK_COLORS[colorIndex];
      ink.setColor(color);
    } else {
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case "Enter":
          next(event.shiftKey);
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
        case "Backspace":
          prev(event.shiftKey);
          break;
        case "Home":
          go(0, 0);
          break;
        case "End":
          go(slides.length - 1, 0);
          break;
        case "[":
          ink.setSize(ink.sizeIndex - 1);
          break;
        case "]":
          ink.setSize(ink.sizeIndex + 1);
          break;
        case "?":
          toggleHelp();
          break;
        case "Escape":
          if (help && !help.hidden) toggleHelp(false);
          else if (ink.tool !== "interact") ink.setTool("interact");
          else if (place !== "slide" || !fitted) void fitCurrent();
          break;
        default:
          switch (key) {
            case "m":
            case "g":
              toggleOverview();
              break;
            case "f":
              void fitCurrent();
              break;
            case "w":
              toggleBoard();
              break;
            case "s":
              openSpeaker();
              break;
            case "d":
              toggleTheme();
              break;
            case "u":
              root.toggleAttribute("data-ui-hidden");
              break;
            case "c":
              if (event.shiftKey) ink.clear();
              else ink.clear(currentRect());
              break;
            default:
              return;
          }
      }
    }
    event.preventDefault();
  });

  window.addEventListener("keyup", (event) => {
    if (event.key !== " " || !spaceDown) return;
    spaceDown = false;
    root.removeAttribute("data-space");
    if (
      !spaceUsed &&
      performance.now() - spaceAt < 300 &&
      !isTyping(event.target)
    )
      next();
  });

  // ------------------------------------------------------------ pointer

  const pointers = new Map<number, { x: number; y: number }>();
  let dragStart: { x: number; y: number; target: Element | null } | null = null;
  let moved = false;

  viewport.addEventListener("pointerdown", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const interact = ink.tool === "interact";
    const pan =
      event.button === 1 || spaceDown || (interact && event.button === 0);
    if (!pan) return;
    if (
      interact &&
      !spaceDown &&
      event.button === 0 &&
      target?.closest(INTERACTIVE)
    )
      return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    capturePointer(viewport, event.pointerId);
    if (pointers.size === 1) {
      dragStart = { x: event.clientX, y: event.clientY, target };
      moved = false;
    }
    camera.stop();
  });

  viewport.addEventListener("pointermove", (event) => {
    root.removeAttribute("data-idle");
    scheduleIdle();
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const other = a === previous ? b : a;
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(current.x - other.x, current.y - other.y);
      const midX = (current.x + other.x) / 2;
      const midY = (current.y + other.y) / 2;
      if (before > 0) camera.zoomAt(midX, midY, after / before);
      camera.panBy((current.x - previous.x) / 2, (current.y - previous.y) / 2);
    } else {
      camera.panBy(current.x - previous.x, current.y - previous.y);
    }
    pointers.set(event.pointerId, current);
    if (
      dragStart &&
      Math.hypot(current.x - dragStart.x, current.y - dragStart.y) > 4
    ) {
      moved = true;
      fitted = false;
      spaceUsed = spaceUsed || spaceDown;
      if (place === "slide") place = "free";
    }
  });

  const release = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (pointers.size > 0) return;
    const start = dragStart;
    dragStart = null;
    if (moved || !start || ink.tool !== "interact" || event.button !== 0) {
      syncToolbar();
      return;
    }
    const clicked = start.target?.closest<HTMLElement>("[data-slide]");
    const clickedIndex = clicked ? slides.indexOf(clicked) : -1;
    if (clickedIndex >= 0 && (clickedIndex !== index || place !== "slide")) {
      if (clickedIndex === index) void fitCurrent();
      else go(clickedIndex, 0);
    }
  };
  viewport.addEventListener("pointerup", release);
  viewport.addEventListener("pointercancel", release);

  viewport.addEventListener(
    "wheel",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("textarea, [data-scrollable]")) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : 1;
      if (event.ctrlKey || event.metaKey) {
        camera.zoomAt(
          event.clientX,
          event.clientY,
          Math.exp(-event.deltaY * unit * 0.01),
        );
      } else {
        camera.panBy(-event.deltaX * unit, -event.deltaY * unit);
      }
      fitted = false;
      if (place === "slide") place = "free";
      syncToolbar();
    },
    { passive: false },
  );

  let idleTimer = 0;
  function scheduleIdle() {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(
      () => root.setAttribute("data-idle", ""),
      2200,
    );
  }
  scheduleIdle();

  window.addEventListener("resize", () => {
    if (fitted) void fitCurrent(true);
  });

  window.addEventListener("hashchange", () => {
    const target = parseHash(slides);
    if (target.index !== index || target.step !== step)
      go(target.index, target.step);
  });

  channel?.addEventListener("message", (event) => {
    const message = deckMessage.safeParse(event.data);
    if (!message.success) return;
    if (message.data.type === "hello") {
      channel.postMessage({ type: "state", index, step } satisfies DeckMessage);
    } else {
      go(message.data.index, message.data.step, true, false);
    }
  });

  ink.setTool("interact");
  const start = parseHash(slides);
  void document.fonts.ready.then(() => {
    go(start.index, start.step, false);
    root.removeAttribute("data-loading");
  });
}
