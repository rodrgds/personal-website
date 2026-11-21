// Small ASCII effects used across the site: block progress bars, spinners,
// text that decodes out of noise, photos that resolve out of glyphs, and two
// tty toys. Ideas after asciicn (asciicn.sumak.dev); the code is our own.

export const SPINNER_FRAMES = [
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
];

const EIGHTHS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];

/** A bar of full blocks with an eighth-width partial, e.g. "█████▍    ". */
export function blockBar(fraction: number, width: number): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  const eighths = Math.round(clamped * width * 8);
  const full = Math.floor(eighths / 8);
  const partial = EIGHTHS[eighths % 8];
  return `${"█".repeat(full)}${partial}`.padEnd(width, " ");
}

export function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const NOISE = "!<>-_\\/[]{}=+*^?#%&$@";

/**
 * Decode an element's text out of random glyphs. Spaces stay put and the
 * text keeps its width, so nothing around it moves.
 */
export function scramble(element: HTMLElement, duration = 600): void {
  // Only plain text: scrambling would wipe icons or other markup inside.
  if (element.children.length > 0) return;
  const target =
    element.dataset.scrambleText ??
    (element.textContent ?? "").replace(/\s+/g, " ").trim();
  element.dataset.scrambleText = target;
  if (reducedMotion() || !target.trim()) {
    element.textContent = target;
    return;
  }
  const start = performance.now();
  // Each character settles at its own moment, left to right with jitter.
  const settle = [...target].map(
    (_, index) =>
      (index / Math.max(1, target.length)) * 0.7 + Math.random() * 0.3,
  );
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / duration);
    element.textContent = [...target]
      .map((char, index) =>
        char === " " || t >= settle[index]
          ? char
          : NOISE[Math.floor(Math.random() * NOISE.length)],
      )
      .join("");
    if (t < 1) requestAnimationFrame(step);
    else element.textContent = target;
  };
  requestAnimationFrame(step);
}

const RAMP = " .:-=+*#%@";

export interface DrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where an <img> actually paints inside its box, honouring object-fit/position. */
export function paintedRect(
  image: HTMLImageElement,
  boxWidth: number,
  boxHeight: number,
): DrawRect {
  const style = getComputedStyle(image);
  const left = Number.parseFloat(style.paddingLeft) || 0;
  const top = Number.parseFloat(style.paddingTop) || 0;
  const innerWidth =
    boxWidth - left - (Number.parseFloat(style.paddingRight) || 0);
  const innerHeight =
    boxHeight - top - (Number.parseFloat(style.paddingBottom) || 0);
  const naturalWidth = image.naturalWidth || innerWidth;
  const naturalHeight = image.naturalHeight || innerHeight;
  let width = innerWidth;
  let height = innerHeight;
  if (style.objectFit === "cover" || style.objectFit === "contain") {
    const fit = style.objectFit === "cover" ? Math.max : Math.min;
    const scale = fit(innerWidth / naturalWidth, innerHeight / naturalHeight);
    width = naturalWidth * scale;
    height = naturalHeight * scale;
  }
  const [px = "50%", py = "50%"] = style.objectPosition.split(" ");
  const fx = px.endsWith("%") ? Number.parseFloat(px) / 100 : 0.5;
  const fy = py.endsWith("%") ? Number.parseFloat(py) / 100 : 0.5;
  return {
    x: left + (innerWidth - width) * fx,
    y: top + (innerHeight - height) * fy,
    width,
    height,
  };
}

/**
 * Resolve a photo out of coloured glyphs: start with big cells, shrink them,
 * then fade to the real picture. The canvas sits over the image and removes
 * itself when done.
 */
export function asciiResolve(image: HTMLImageElement, duration = 900): void {
  const host = image.parentElement;
  if (!host || reducedMotion()) return;
  host.querySelector(":scope > canvas.ascii-resolve")?.remove();
  const run = (): void => {
    const box = image.getBoundingClientRect();
    if (box.width < 8 || box.height < 8) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement("canvas");
    canvas.className = "ascii-resolve";
    canvas.setAttribute("aria-hidden", "true");
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    canvas.style.left = `${image.offsetLeft}px`;
    canvas.style.top = `${image.offsetTop}px`;
    canvas.style.width = `${box.width}px`;
    canvas.style.height = `${box.height}px`;
    host.append(canvas);
    const ctx = canvas.getContext("2d");
    const sample = document.createElement("canvas");
    const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
    if (!ctx || !sampleCtx) {
      canvas.remove();
      return;
    }
    const rect = paintedRect(image, box.width, box.height);
    const background = getComputedStyle(host).backgroundColor;
    image.style.opacity = "0";
    const start = performance.now();
    const draw = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const cell = Math.max(5, 30 - eased * 25);
      const cols = Math.max(1, Math.round(rect.width / cell));
      const rows = Math.max(1, Math.round(rect.height / cell));
      sample.width = cols;
      sample.height = rows;
      sampleCtx.drawImage(image, 0, 0, cols, rows);
      const pixels = sampleCtx.getImageData(0, 0, cols, rows).data;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, box.width, box.height);
      if (background && background !== "rgba(0, 0, 0, 0)") {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, box.width, box.height);
      }
      const cw = rect.width / cols;
      const ch = rect.height / rows;
      ctx.font = `${Math.ceil(ch * 1.05)}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const o = (y * cols + x) * 4;
          const light =
            (pixels[o] * 0.299 +
              pixels[o + 1] * 0.587 +
              pixels[o + 2] * 0.114) /
            255;
          const glyph =
            RAMP[Math.min(RAMP.length - 1, Math.floor(light * RAMP.length))];
          if (glyph === " ") continue;
          ctx.fillStyle = `rgb(${pixels[o]},${pixels[o + 1]},${pixels[o + 2]})`;
          ctx.fillText(
            glyph,
            rect.x + x * cw + cw / 2,
            rect.y + y * ch + ch / 2,
          );
        }
      }
      // Over the last third the real photo fades in under the glyphs.
      const fade = Math.max(0, (t - 0.66) / 0.34);
      image.style.opacity = String(fade);
      canvas.style.opacity = String(1 - fade);
      if (t < 1) requestAnimationFrame(draw);
      else {
        image.style.opacity = "";
        canvas.remove();
      }
    };
    requestAnimationFrame(draw);
  };
  if (image.complete && image.naturalWidth) run();
  else image.addEventListener("load", run, { once: true });
}

type SlideSource = HTMLImageElement | HTMLCanvasElement;

function drawable(
  element: SlideSource | null,
  width: number,
  height: number,
): { source: SlideSource; rect: DrawRect } | null {
  if (!element) return null;
  if (element instanceof HTMLImageElement) {
    if (!element.complete || !element.naturalWidth) return null;
    return { source: element, rect: paintedRect(element, width, height) };
  }
  if (!element.width || !element.height) return null;
  return { source: element, rect: { x: 0, y: 0, width, height } };
}

/**
 * Slide one picture out and the next one in. The pair is drawn through a
 * shrinking and growing grid of big pixels, coarsest halfway through. The
 * canvas covers `host` and removes itself; the returned function cancels.
 */
export function pixelSlide(
  host: HTMLElement,
  from: SlideSource | null,
  to: SlideSource | null,
  direction: 1 | -1,
  onDone: () => void,
  duration = 700,
): () => void {
  const box = host.getBoundingClientRect();
  const width = box.width;
  const height = box.height;
  const outgoing = drawable(from, width, height);
  const incoming = drawable(to, width, height);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const small = document.createElement("canvas");
  const smallCtx = small.getContext("2d");
  if (reducedMotion() || !incoming || !ctx || !smallCtx || width < 8) {
    onDone();
    return () => {};
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.className = "pixel-slide";
  canvas.setAttribute("aria-hidden", "true");
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  host.append(canvas);
  const background = getComputedStyle(host).backgroundColor;
  const paint = (
    item: { source: SlideSource; rect: DrawRect } | null,
    dx: number,
  ): void => {
    if (!item) return;
    smallCtx.save();
    smallCtx.beginPath();
    smallCtx.rect(dx, 0, width, height);
    smallCtx.clip();
    smallCtx.drawImage(
      item.source,
      item.rect.x + dx,
      item.rect.y,
      item.rect.width,
      item.rect.height,
    );
    smallCtx.restore();
  };
  let frame = 0;
  const start = performance.now();
  const finish = (): void => {
    cancelAnimationFrame(frame);
    canvas.remove();
  };
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / duration);
    const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    const block = Math.max(1, Math.round(1 + 23 * Math.sin(Math.PI * t)));
    // Snap the slide to whole blocks so it moves in visible steps.
    const offset = Math.round((eased * width) / block) * block * direction;
    const cols = Math.max(1, Math.ceil(width / block));
    const rows = Math.max(1, Math.ceil(height / block));
    small.width = cols;
    small.height = rows;
    smallCtx.setTransform(cols / width, 0, 0, rows / height, 0, 0);
    smallCtx.fillStyle = background;
    smallCtx.fillRect(0, 0, width, height);
    paint(outgoing, -offset);
    paint(incoming, width * direction - offset);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, cols, rows, 0, 0, canvas.width, canvas.height);
    if (t < 1) frame = requestAnimationFrame(step);
    else {
      finish();
      onDone();
    }
  };
  frame = requestAnimationFrame(step);
  return finish;
}

/** One frame of the classic donut.c torus. */
export function donutFrame(
  a: number,
  b: number,
  width = 64,
  height = 24,
): string {
  const output: string[] = Array.from({ length: width * height }, () => " ");
  const depth: number[] = Array.from({ length: width * height }, () => 0);
  const shades = ".,-~:;=!*#$@";
  const [sinA, cosA, sinB, cosB] = [
    Math.sin(a),
    Math.cos(a),
    Math.sin(b),
    Math.cos(b),
  ];
  for (let theta = 0; theta < 6.28; theta += 0.07) {
    const [sinT, cosT] = [Math.sin(theta), Math.cos(theta)];
    for (let phi = 0; phi < 6.28; phi += 0.02) {
      const [sinP, cosP] = [Math.sin(phi), Math.cos(phi)];
      const circle = cosT + 2;
      const inverse = 1 / (sinP * circle * sinA + sinT * cosA + 5);
      const t = sinP * circle * cosA - sinT * sinA;
      const x = Math.floor(
        width / 2 + width * 0.47 * inverse * (cosP * circle * cosB - t * sinB),
      );
      const y = Math.floor(
        height / 2 +
          height * 0.55 * inverse * (cosP * circle * sinB + t * cosB),
      );
      const index = x + width * y;
      const light = Math.floor(
        8 *
          ((sinT * sinA - sinP * cosT * cosA) * cosB -
            sinP * cosT * sinA -
            sinT * cosA -
            cosP * cosT * sinB),
      );
      if (
        y >= 0 &&
        y < height &&
        x >= 0 &&
        x < width &&
        inverse > depth[index]
      ) {
        depth[index] = inverse;
        output[index] = shades[Math.max(0, light)];
      }
    }
  }
  const lines: string[] = [];
  for (let row = 0; row < height; row++)
    lines.push(output.slice(row * width, (row + 1) * width).join(""));
  return lines.join("\n");
}

/** Digital rain over the whole page until a key, click or ten seconds. */
export function matrixRain(onDone: () => void): void {
  const canvas = document.createElement("canvas");
  canvas.className = "matrix-rain";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    onDone();
    return;
  }
  const size = 16;
  const resize = (): void => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  const columns = Math.ceil(canvas.width / size);
  const drops = Array.from({ length: columns }, () => Math.random() * -50);
  const glyphs = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789rgo.pt";
  const accent =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim() || "#e8893f";
  let frame = 0;
  let last = 0;
  const stop = (): void => {
    cancelAnimationFrame(frame);
    canvas.remove();
    window.removeEventListener("keydown", stop, true);
    window.removeEventListener("pointerdown", stop, true);
    onDone();
  };
  const tick = (now: number): void => {
    frame = requestAnimationFrame(tick);
    if (now - last < 55) return;
    last = now;
    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${size}px "JetBrains Mono", monospace`;
    for (let i = 0; i < drops.length; i++) {
      const y = drops[i] * size;
      ctx.fillStyle = Math.random() > 0.96 ? "#fff" : accent;
      ctx.fillText(
        glyphs[Math.floor(Math.random() * glyphs.length)],
        i * size,
        y,
      );
      drops[i] = y > canvas.height && Math.random() > 0.975 ? 0 : drops[i] + 1;
    }
  };
  frame = requestAnimationFrame(tick);
  window.setTimeout(stop, 10_000);
  window.addEventListener("keydown", stop, true);
  window.addEventListener("pointerdown", stop, true);
}
