// The whereami globe, drawn in characters on a canvas. Ideas after
// asciicn's ascii-globe (an orthographic sphere, a light, a 30-degree
// graticule); our own code, with real land from Natural Earth (land.ts) and
// two pins: Porto and the visitor. It sways around the pins instead of
// spinning, so they stay in view. Drag to turn it. It only animates while on
// screen, and holds still under reduced motion.
import { LAND, LAND_HEIGHT, LAND_WIDTH } from "./land";
import type { Point } from "./where";

/**
 * asciicn's "standard" ramp, empty to dense. Every cell gets one tone from 0
 * to 1 (faint sea, a lit and shaded land, the graticule) and the tone picks
 * the glyph, all in one ink: the characters carry the shading.
 */
const RAMP = " .:-=+*#%@";
const DEG = Math.PI / 180;
/** How far it sways either side of its centre, and how long a sway takes. */
const SWAY = 38 * DEG;
const SWAY_MS = 26_000;
/** Tilt towards the viewer, so the north (and Porto) faces us a little. */
const PITCH = 24 * DEG;
/** From the front, a little up and to the right: the pins sit in the light. */
const LIGHT = normalize([0.3, 0.45, 0.84]);
const GRID = 30 * DEG;
const FRAME_MS = 50;

let landBits: Uint8Array | null = null;

function land(): Uint8Array {
  if (landBits) return landBits;
  const raw = atob(LAND);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  landBits = bytes;
  return bytes;
}

function isLand(lat: number, lon: number): boolean {
  const bits = land();
  const row = Math.min(LAND_HEIGHT - 1, Math.max(0, Math.floor(90 - lat)));
  const col =
    (((Math.floor(lon + 180) % LAND_WIDTH) + LAND_WIDTH) % LAND_WIDTH) | 0;
  const index = row * LAND_WIDTH + col;
  return ((bits[index >> 3] >> (7 - (index & 7))) & 1) === 1;
}

function normalize([x, y, z]: [number, number, number]): [
  number,
  number,
  number,
] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

interface Colors {
  panel: string;
  ink: string;
  me: string;
  you: string;
}

function readColors(element: Element): Colors {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string): string =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    panel: read("--term-panel", "#1c1b1a"),
    ink: read("--text-color", "#cecdc3"),
    me: read("--accent", "#da702c"),
    you: read("--flexoki-cyan", "#3aa99f"),
  };
}

export interface AsciiGlobe {
  /** Pin the visitor, or clear the pin. */
  setVisitor(point: Point | null): void;
  destroy(): void;
}

export function mountAsciiGlobe(
  canvas: HTMLCanvasElement,
  home: Point,
): AsciiGlobe {
  const context = canvas.getContext("2d");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let visitor: Point | null = null;
  // The longitude the globe sways around (Porto, or halfway to the visitor)
  // and the one at the centre of the disc right now.
  let base = home.lng * DEG;
  let centre = base;
  let swayStart = 0;
  let pitch = PITCH;
  let frame = 0;
  let last = 0;
  let visible = false;
  let dragging: { x: number; y: number; centre: number; pitch: number } | null =
    null;
  let colors = readColors(canvas);
  let colorsAt = 0;
  let width = 0;
  let height = 0;
  let cellW = 7;
  let cellH = 12;
  let fontSize = 11;
  let family = "monospace";

  const resize = (): void => {
    if (!context) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    family = getComputedStyle(canvas).fontFamily || "monospace";
    // About 56 columns across the disc, whatever the window's size.
    fontSize = Math.max(8, Math.min(13, Math.min(width, height) / 34));
    context.font = `${fontSize}px ${family}`;
    cellW = context.measureText("M").width || fontSize * 0.6;
    // Rows a little taller than the font, like a terminal's lines.
    cellH = Math.round(fontSize * 1.18);
    draw();
  };

  /** View space to latitude and longitude, in radians. */
  const toLatLon = (
    vx: number,
    vy: number,
    vz: number,
    cosP: number,
    sinP: number,
    cosC: number,
    sinC: number,
  ): [number, number] => {
    const y1 = vy * cosP + vz * sinP;
    const z1 = -vy * sinP + vz * cosP;
    const bx = vx * cosC + z1 * sinC;
    const bz = -vx * sinC + z1 * cosC;
    return [Math.asin(Math.max(-1, Math.min(1, y1))), Math.atan2(bx, bz)];
  };

  /** A place to view space; z > 0 faces us. */
  const toView = (
    point: Point,
    cosP: number,
    sinP: number,
    cosC: number,
    sinC: number,
  ): [number, number, number] => {
    const lat = point.lat * DEG;
    const lon = point.lng * DEG;
    const x = Math.cos(lat) * Math.sin(lon);
    const y = Math.sin(lat);
    const z = Math.cos(lat) * Math.cos(lon);
    const x1 = x * cosC - z * sinC;
    const z1 = x * sinC + z * cosC;
    return [x1, y * cosP - z1 * sinP, y * sinP + z1 * cosP];
  };

  function draw(): void {
    if (!context || !width || !height) return;
    const now = performance.now();
    if (now - colorsAt > 1000) {
      colors = readColors(canvas);
      colorsAt = now;
    }
    context.clearRect(0, 0, width, height);
    context.font = `${fontSize}px ${family}`;
    context.textBaseline = "middle";
    context.textAlign = "center";

    const cols = Math.floor(width / cellW);
    const rows = Math.floor(height / cellH);
    const offsetX = (width - cols * cellW) / 2;
    const offsetY = (height - rows * cellH) / 2;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.46;
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const cosC = Math.cos(centre);
    const sinC = Math.sin(centre);
    // Grid lines are about one cell wide at the centre of the disc.
    const line = (cellH / radius) * 0.55;
    context.fillStyle = colors.ink;

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const px = offsetX + (i + 0.5) * cellW;
        const py = Math.round(offsetY + (j + 0.5) * cellH);
        const nx = (px - cx) / radius;
        const ny = (cy - py) / radius;
        const r2 = nx * nx + ny * ny;
        if (r2 > 1) continue;
        const nz = Math.sqrt(1 - r2);
        // Land coverage from four samples inside the cell, for soft coasts.
        let cover = 0;
        for (const [sx, sy] of [
          [-0.25, -0.25],
          [0.25, -0.25],
          [-0.25, 0.25],
          [0.25, 0.25],
        ]) {
          const ax = nx + (sx * cellW) / radius;
          const ay = ny - (sy * cellH) / radius;
          const a2 = ax * ax + ay * ay;
          if (a2 > 1) continue;
          const [lat, lon] = toLatLon(
            ax,
            ay,
            Math.sqrt(1 - a2),
            cosP,
            sinP,
            cosC,
            sinC,
          );
          if (isLand(lat / DEG, lon / DEG)) cover += 0.25;
        }
        const lit = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
        // Sea is a faint stipple; land is lit, a touch lighter at the coast.
        let tone =
          cover > 0
            ? (0.45 + 0.55 * lit) * (0.75 + 0.25 * cover)
            : 0.07 + 0.08 * lit;
        const [lat, lon] = toLatLon(nx, ny, nz, cosP, sinP, cosC, sinC);
        const dLat = Math.abs(lat - Math.round(lat / GRID) * GRID);
        // Meridians stop short of the poles, where they would merge.
        const dLon =
          Math.abs(lat) > 75 * DEG
            ? Infinity
            : Math.abs(lon - Math.round(lon / GRID) * GRID) * Math.cos(lat);
        if (Math.min(dLat, dLon) < line)
          tone = Math.max(tone, 0.18 + 0.14 * lit);
        const glyph =
          RAMP[Math.min(RAMP.length - 1, Math.floor(tone * RAMP.length))] ??
          " ";
        if (glyph !== " ") context.fillText(glyph, px, py);
      }
    }

    // Pins on the near side, with a label beside each.
    context.textAlign = "left";
    const pins: Array<{
      point: Point;
      glyph: string;
      label: string;
      color: string;
    }> = [{ point: home, glyph: "●", label: "porto", color: colors.me }];
    if (visitor) {
      pins.push({
        point: visitor,
        glyph: "◆",
        label: "you",
        color: colors.you,
      });
    }
    let previous: [number, number] | null = null;
    for (const pin of pins) {
      const [vx, vy, vz] = toView(pin.point, cosP, sinP, cosC, sinC);
      if (vz <= 0.05) continue;
      const x = cx + vx * radius;
      let y = cy - vy * radius;
      // A visitor in Porto would sit on the Porto pin: put the label under.
      const near =
        previous &&
        Math.abs(previous[0] - x) < cellW * 3 &&
        Math.abs(previous[1] - y) < cellH * 1.5;
      context.fillStyle = pin.color;
      context.textAlign = "center";
      context.fillText(pin.glyph, x, y);
      if (near) y += cellH * 1.2;
      context.textAlign = "left";
      context.font = `700 ${fontSize}px ${family}`;
      // A backing in the window's colour, so the label reads over land.
      const labelX = x + cellW * 0.9;
      const labelW = context.measureText(pin.label).width + cellW * 0.6;
      context.fillStyle = colors.panel;
      context.fillRect(labelX - cellW * 0.3, y - cellH / 2, labelW, cellH);
      context.fillStyle = pin.color;
      context.fillText(pin.label, labelX, y);
      context.font = `${fontSize}px ${family}`;
      previous = [x, y];
    }
  }

  const loop = (time: number): void => {
    frame = 0;
    if (!visible || still) return;
    frame = requestAnimationFrame(loop);
    if (time - last < FRAME_MS) return;
    last = time;
    if (!swayStart) swayStart = time;
    if (!dragging) {
      centre =
        base + SWAY * Math.sin(((time - swayStart) / SWAY_MS) * Math.PI * 2);
    }
    draw();
  };

  const start = (): void => {
    if (frame || still) return;
    last = 0;
    frame = requestAnimationFrame(loop);
  };

  let inView = false;
  const update = (): void => {
    visible = inView && !document.hidden;
    if (visible) start();
  };
  const observer = new IntersectionObserver(([entry]) => {
    inView = Boolean(entry?.isIntersecting);
    update();
  });
  observer.observe(canvas);
  const onVisibility = (): void => update();
  document.addEventListener("visibilitychange", onVisibility);
  const sizer = new ResizeObserver(resize);
  sizer.observe(canvas);

  const onDown = (event: PointerEvent): void => {
    dragging = { x: event.clientX, y: event.clientY, centre, pitch };
    canvas.setPointerCapture(event.pointerId);
  };
  const onMove = (event: PointerEvent): void => {
    if (!dragging) return;
    const scale = Math.PI / Math.max(1, canvas.clientWidth);
    centre = dragging.centre - (event.clientX - dragging.x) * scale;
    pitch = Math.max(
      -60 * DEG,
      Math.min(80 * DEG, dragging.pitch + (event.clientY - dragging.y) * scale),
    );
    if (still || !visible) draw();
  };
  const onUp = (): void => {
    if (!dragging) return;
    dragging = null;
    // Sway on from wherever it was left.
    base = centre;
    swayStart = 0;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  void document.fonts?.ready.then(resize);

  return {
    setVisitor(point) {
      visitor = point;
      if (point && !dragging) {
        // Sway around the midpoint, so both pins come into view.
        let delta = point.lng - home.lng;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        base = (home.lng + delta / 2) * DEG;
        if (still) centre = base;
      }
      draw();
    },
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      observer.disconnect();
      sizer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    },
  };
}
