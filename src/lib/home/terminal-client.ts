// Interactions for the terminal home: the boot log, the life.exe reel and the
// Porto clock.
import { prefersReducedMotion, readThemeColors } from "./ink";
import { cue } from "../sound";
import { blockBar, pixelSlide } from "../terminal/ascii";
import type { BootStage } from "./boot-stage";

const BOOT_SEEN_KEY = "rgo:terminal-booted";
const FRAME_MS = 4200;

function hasSeenBoot(): boolean {
  try {
    return sessionStorage.getItem(BOOT_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberBoot(): void {
  try {
    sessionStorage.setItem(BOOT_SEEN_KEY, "1");
  } catch {
    // Private windows can refuse storage; the boot just plays again.
  }
}

const ASCII_RAMP = " .:-=+*#%@";
const BIRTH_MS = new Date("2006-12-02T00:00:00Z").getTime();
const YEAR_MS = 31_556_952_000;

/** Draw the portrait as ASCII art: brighter areas get denser characters on a dark screen. */
async function asciiPortrait(
  src: string,
  columns: number,
  darkScreen: boolean,
): Promise<string[]> {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();
  const rows = Math.round(
    columns * (image.naturalHeight / image.naturalWidth) * 0.56,
  );
  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = rows;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(image, 0, 0, columns, rows);
  const pixels = ctx.getImageData(0, 0, columns, rows).data;
  const light: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    light.push(
      (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) / 255,
    );
  }
  // Stretch the contrast so the face fills the whole ramp.
  const sorted = [...light].sort((x, y) => x - y);
  const low = sorted[Math.floor(sorted.length * 0.04)];
  const high = sorted[Math.floor(sorted.length * 0.985)];
  const lines: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < columns; x++) {
      const value = Math.min(
        1,
        Math.max(
          0,
          (light[y * columns + x] - low) / Math.max(0.01, high - low),
        ),
      );
      // The photo has a black background, so bright stays dense in both
      // themes: the face reads as a shape and the background stays empty.
      const tone = darkScreen ? value : value * 0.92;
      line +=
        ASCII_RAMP[
          Math.min(
            ASCII_RAMP.length - 1,
            Math.floor(Math.pow(tone, 1.15) * ASCII_RAMP.length),
          )
        ];
    }
    lines.push(line);
  }
  return lines;
}

function screenIsDark(element: Element): boolean {
  const ink = readThemeColors(element).ink;
  return ink[0] * 0.299 + ink[1] * 0.587 + ink[2] * 0.114 > 128;
}

let stageModule: Promise<typeof import("./boot-stage")> | null = null;

/** The 3D boot's module (three.js); fetched once, as early as possible. */
function loadStage(): Promise<typeof import("./boot-stage")> {
  stageModule ??= import("./boot-stage");
  return stageModule;
}

// The inline script marks a boot that will play before this module runs, so
// start downloading three.js now rather than when the boot is mounted.
if (
  document.querySelector("[data-terminal]")?.getAttribute("data-boot") ===
    "staging" &&
  !prefersReducedMotion()
)
  void loadStage().catch(() => {});

/** three.js only loads when WebGL works; otherwise the flat boot runs. */
function supportsBootStage(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function mountBoot(root: HTMLElement): () => void {
  const boot = root.querySelector<HTMLElement>("[data-term-boot]");
  if (!boot) return () => {};
  const lines = [...boot.querySelectorAll<HTMLElement>("[data-boot-line]")];
  const barText = boot.querySelector<HTMLElement>("[data-boot-bar-text]");
  const barValue = boot.querySelector<HTMLElement>("[data-boot-bar-value]");
  // On the 3D monitor the screen is 1024px wide whatever the window is.
  const barWidth = (): number =>
    boot.classList.contains("boot-3d") || window.innerWidth >= 760 ? 56 : 26;
  const setBar = (fraction: number): void => {
    if (barText) barText.textContent = `[${blockBar(fraction, barWidth())}]`;
    if (barValue)
      barValue.textContent = `${String(Math.round(fraction * 100)).padStart(3)}%`;
  };
  const uptime = boot.querySelector<HTMLElement>("[data-boot-uptime]");
  const lastLogin = boot.querySelector<HTMLElement>("[data-boot-lastlogin]");
  const ascii = boot.querySelector<HTMLElement>("[data-boot-ascii]");
  const scan = boot.querySelector<HTMLElement>("[data-boot-scan]");
  const timers: number[] = [];
  let ticker = 0;
  let stage: BootStage | null = null;
  let session = 0;

  const later = (ms: number, run: () => void): void => {
    timers.push(window.setTimeout(run, ms));
  };

  const SKIP_EVENTS = [
    "keydown",
    "wheel",
    "touchstart",
    "pointerdown",
  ] as const;

  /**
   * End the boot. `now` skips the fade, for page swaps; `seamless` is the end
   * of the 3D flight, where the page on the monitor is already this page.
   */
  const finish = (now = false, seamless = false): void => {
    session += 1;
    for (const timer of timers) window.clearTimeout(timer);
    timers.length = 0;
    window.clearInterval(ticker);
    rememberBoot();
    root.toggleAttribute("data-boot-seamless", seamless);
    root.dataset.boot = "done";
    for (const type of SKIP_EVENTS) window.removeEventListener(type, onSkip);
    const active = stage;
    stage = null;
    if (!active) return;
    if (now || seamless) active.dispose();
    else void active.fadeOut(420).then(() => active.dispose());
  };
  const onSkip = (): void => finish();
  const listenForSkip = (): void => {
    for (const type of SKIP_EVENTS)
      window.addEventListener(type, onSkip, { once: true, passive: true });
  };

  const portrait = async (duration: number): Promise<void> => {
    const src = ascii?.dataset.src;
    if (!ascii || !src) return;
    const columns =
      window.innerWidth < 760 && !boot.classList.contains("boot-3d") ? 72 : 92;
    let rows: string[] = [];
    try {
      rows = await asciiPortrait(src, columns, screenIsDark(boot));
    } catch {
      return;
    }
    // Scan the portrait in from the top while the log runs.
    const step = duration / Math.max(1, rows.length);
    rows.forEach((_, index) => {
      later(index * step, () => {
        ascii.textContent = rows.slice(0, index + 1).join("\n");
      });
    });
    later(rows.length * step, () => {
      if (scan) scan.textContent = "ok";
    });
  };

  const prepare = (): void => {
    const now = new Date();
    if (lastLogin) {
      const when = new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Lisbon",
      }).format(now);
      lastLogin.textContent = `last login: ${when} on tty1 from porto`;
    }
    window.clearInterval(ticker);
    ticker = window.setInterval(() => {
      if (uptime)
        uptime.textContent = `${((Date.now() - BIRTH_MS) / YEAR_MS).toFixed(8)} years`;
    }, 60);
    if (ascii) ascii.textContent = "";
    if (scan) scan.textContent = "scanning";
    for (const line of lines) {
      line.removeAttribute("data-shown");
      line.removeAttribute("data-typed");
      if (line.dataset.type) line.textContent = "";
    }
  };

  /**
   * Reveal the log line by line from `start` ms; returns when it ends. Typed
   * lines show their prompt, then the input key by key at a human pace.
   */
  const schedule = (start: number): number => {
    let at = start;
    stage?.setBusy(true);
    lines.forEach((line, index) => {
      const typed = line.dataset.type;
      const prompt = line.dataset.prompt ?? "";
      later(at, () => {
        line.setAttribute("data-shown", "");
        setBar((index + 1) / lines.length);
      });
      if (typed) {
        later(at, () => {
          stage?.setBusy(false);
          line.textContent = prompt;
        });
        at += 260;
        for (let i = 1; i <= typed.length; i++) {
          const char = typed[i - 1];
          later(at, () => {
            line.textContent = prompt + typed.slice(0, i);
            stage?.press(char);
          });
          at += 65 + Math.random() * 55;
        }
        at += 140;
        later(at, () => {
          stage?.press("Enter");
          line.setAttribute("data-typed", "");
        });
        at += 220;
      } else {
        at += line.classList.contains("boot-gap") ? 60 : 92;
      }
    });
    later(at, () => stage?.setBusy(true));
    return at;
  };

  /** The flat boot: the log fills the window, then the tube powers off. */
  const playFlat = (): void => {
    root.dataset.boot = "running";
    prepare();
    const end = schedule(380);
    void portrait(end - 600);
    later(end + 250, () => {
      root.dataset.boot = "power";
    });
    later(end + 800, () => finish());
    listenForSkip();
  };

  /** The 3D boot: walk up to the computer, switch it on, fly into the screen. */
  const playStage = async (): Promise<void> => {
    const mine = ++session;
    root.dataset.boot = "staging";
    prepare();
    listenForSkip();
    let created: BootStage;
    try {
      const { createBootStage } = await loadStage();
      if (mine !== session) return;
      // Count the boot as seen now, so the page loading on the monitor does
      // not boot again inside it.
      rememberBoot();
      created = await createBootStage(boot, window.location.href);
      // Skipped while the model loaded: take the half-built stage down.
      if (mine !== session) {
        created.dispose();
        return;
      }
    } catch {
      if (mine === session) finish();
      return;
    }
    stage = created;
    await created.powerOn();
    if (mine !== session) return;
    const end = schedule(420);
    void portrait(end - 600);
    // After startx the monitor shows the site itself; then fly in until it
    // is the window, and hand over to the real page underneath.
    later(end + 250, () => {
      void created
        .showPage()
        .then(() => (mine === session ? created.zoomIn() : undefined))
        .then(() => {
          if (mine === session) finish(false, true);
        });
    });
  };

  const play = (): void => {
    if (supportsBootStage()) void playStage();
    else playFlat();
  };

  const replay = root.querySelector<HTMLElement>("[data-boot-replay]");
  const onReplay = (event: Event): void => {
    // The click that pressed [reboot] must not count as a skip.
    event.stopPropagation();
    window.setTimeout(play, 0);
  };
  replay?.addEventListener("click", onReplay);

  if (prefersReducedMotion() || hasSeenBoot()) root.dataset.boot = "done";
  else play();

  return () => {
    finish(true);
    replay?.removeEventListener("click", onReplay);
  };
}

function mountLife(root: HTMLElement): () => void {
  const player = root.querySelector<HTMLElement>("[data-life-player]");
  const reel = player?.querySelector<HTMLElement>(".term-reel");
  if (!player || !reel) return () => {};
  const frames = [...player.querySelectorAll<HTMLElement>("[data-life-frame]")];
  const caption = player.querySelector<HTMLElement>("[data-life-caption]");
  const counter = player.querySelector<HTMLElement>("[data-life-counter]");
  const toggle = player.querySelector<HTMLElement>("[data-life-toggle]");
  if (frames.length === 0) return () => {};

  const still = prefersReducedMotion();
  let index = 0;
  let paused = still;
  let visible = true;
  let advance = 0;
  let cancelSlide = (): void => {};

  const pictureOf = (i: number): HTMLImageElement | null =>
    frames[i]?.querySelector("img") ?? null;

  const schedule = (): void => {
    window.clearTimeout(advance);
    if (paused || !visible) return;
    // Hold the first frame until the boot is over.
    if (root.dataset.boot !== "done") {
      advance = window.setTimeout(schedule, 400);
      return;
    }
    advance = window.setTimeout(() => show(index + 1, 1), FRAME_MS);
  };

  const label = (): void => {
    const active = frames[index];
    if (caption)
      caption.textContent = `[${active.dataset.label ?? ""}] ${active.dataset.caption ?? ""}`;
    if (counter) {
      counter.textContent = `${String(index + 1).padStart(2, "0")}/${String(frames.length).padStart(2, "0")}`;
    }
  };

  const show = (next: number, direction: 1 | -1): void => {
    cancelSlide();
    const previous = index;
    index = (next + frames.length) % frames.length;
    label();
    // Photos after the first two load one frame ahead of being shown (the
    // frames are stacked in view, so lazy loading would fetch them all).
    for (const at of [index, (index + 1) % frames.length]) {
      const photo = frames[at]?.querySelector("img");
      const pending = photo?.dataset.src;
      if (photo && pending && !photo.getAttribute("src")) photo.src = pending;
    }
    const activate = (): void => {
      frames.forEach((element, i) =>
        element.toggleAttribute("data-active", i === index),
      );
    };
    if (still || previous === index) {
      activate();
    } else {
      cancelSlide = pixelSlide(
        reel,
        pictureOf(previous),
        pictureOf(index),
        direction,
        () => {
          cancelSlide = () => {};
        },
      );
      activate();
    }
    schedule();
  };

  const onClick = (event: Event): void => {
    const target = event.target instanceof Element ? event.target : null;
    const step = target?.closest<HTMLElement>("[data-life-step]");
    if (step) {
      const back = step.dataset.lifeStep === "-1";
      cue("navigate", {
        emphasis: "subtle",
        direction: back ? "back" : "forward",
      });
      show(index + Number(step.dataset.lifeStep), back ? -1 : 1);
    }
    if (target?.closest("[data-life-toggle]")) {
      paused = !paused;
      cue("toggle", { direction: paused ? "back" : "forward" });
      if (toggle) toggle.textContent = paused ? "play" : "pause";
      schedule();
    }
  };

  const observer = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    schedule();
  });
  observer.observe(player);
  player.addEventListener("click", onClick);
  if (toggle && still) toggle.textContent = "play";
  label();
  schedule();

  return () => {
    cancelSlide();
    window.clearTimeout(advance);
    observer.disconnect();
    player.removeEventListener("click", onClick);
  };
}

function mountClock(root: HTMLElement): () => void {
  const clock = root.querySelector<HTMLElement>("[data-term-clock]");
  if (!clock) return () => {};
  const format = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Lisbon",
  });
  const update = (): void => {
    clock.textContent = format.format(new Date());
  };
  update();
  const timer = window.setInterval(update, 1000);
  return () => window.clearInterval(timer);
}

export function mountTerminal(root: HTMLElement): () => void {
  const stops = [mountBoot(root), mountLife(root), mountClock(root)];
  return () => {
    for (const stop of stops) stop();
  };
}
