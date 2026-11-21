// Low-resolution "phosphor" renderer for small drawings such as the Porto map.
//
// Scenes draw in grayscale onto a small offscreen canvas: white is empty,
// black is full ink and pure red (#ff0000) marks the accent. The renderer
// dithers that picture into single-colour dots in the current theme.

export type Rgb = readonly [number, number, number];

export interface InkColors {
  ink: Rgb;
  accent: Rgb;
}

export interface InkScene {
  /** Draw the scene. `progress` runs 0..1 through the scene's animation. */
  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    progress: number,
    time: number,
  ): void;
}

function pack(color: Rgb): number {
  // ImageData is RGBA in memory, so a little-endian Uint32 reads ABGR.
  return ((255 << 24) | (color[2] << 16) | (color[1] << 8) | color[0]) >>> 0;
}

/** Interleaved gradient noise: an even, low-pattern dither threshold. */
function gradientNoise(x: number, y: number): number {
  const v = 52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1);
  return v - Math.floor(v);
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function parseCssColor(value: string, fallback: Rgb): Rgb {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = value.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return fallback;
}

/** Ink is the theme's text colour; the accent is the phosphor amber. */
export function readThemeColors(element: Element): InkColors {
  const style = getComputedStyle(element);
  return {
    ink: parseCssColor(style.getPropertyValue("--heading-color"), [16, 15, 15]),
    accent: parseCssColor(style.getPropertyValue("--accent"), [232, 137, 63]),
  };
}

export class InkRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly layer: HTMLCanvasElement;
  private readonly layerCtx: CanvasRenderingContext2D;
  private image: ImageData | null = null;
  private out: Uint32Array | null = null;
  private threshold = new Float32Array(0);
  private speckle = new Float32Array(0);
  private width = 0;
  private height = 0;
  private readonly cell: number;
  private inkPacked = pack([16, 15, 15]);
  private accentPacked = pack([232, 137, 63]);

  constructor(canvas: HTMLCanvasElement, cell = 2) {
    const ctx = canvas.getContext("2d");
    const layer = document.createElement("canvas");
    const layerCtx = layer.getContext("2d", { willReadFrequently: true });
    if (!ctx || !layerCtx) throw new Error("2D canvas is not available");
    this.canvas = canvas;
    this.ctx = ctx;
    this.layer = layer;
    this.layerCtx = layerCtx;
    this.cell = cell;
  }

  setColors(colors: InkColors): void {
    this.inkPacked = pack(colors.ink);
    this.accentPacked = pack(colors.accent);
  }

  /** Match the internal resolution to the canvas's CSS size. */
  resize(): void {
    const width = Math.max(1, Math.round(this.canvas.clientWidth / this.cell));
    const height = Math.max(
      1,
      Math.round(this.canvas.clientHeight / this.cell),
    );
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.layer.width = width;
    this.layer.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.image = this.ctx.createImageData(width, height);
    this.out = new Uint32Array(this.image.data.buffer);
    this.threshold = new Float32Array(width * height);
    this.speckle = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        this.threshold[y * width + x] = 0.04 + gradientNoise(x, y) * 0.92;
        this.speckle[y * width + x] = hash(x, y);
      }
    }
  }

  /** Render `scene`. `develop` (0..1) fades the ink in from speckles. */
  render(
    scene: InkScene,
    progress: number,
    develop: number,
    time: number,
  ): void {
    this.resize();
    const out = this.out;
    const image = this.image;
    if (!out || !image) return;
    const ctx = this.layerCtx;
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, this.width, this.height);
    scene.draw(ctx, this.width, this.height, progress, time);
    ctx.restore();
    const source = ctx.getImageData(0, 0, this.width, this.height).data;
    for (let i = 0; i < out.length; i++) {
      const o = i * 4;
      const r = source[o];
      const g = source[o + 1];
      const b = source[o + 2];
      const isAccent = r > 180 && g < 90 && b < 90;
      let dark = isAccent
        ? 0.85
        : 1 - (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      if (develop < 1)
        dark =
          this.speckle[i] < develop * 1.2
            ? dark * Math.min(1, develop * 1.5)
            : 0;
      out[i] =
        dark > this.threshold[i]
          ? isAccent
            ? this.accentPacked
            : this.inkPacked
          : 0;
    }
    this.ctx.putImageData(image, 0, 0);
  }
}

export function smoothstep(
  edge0: number,
  edge1: number,
  value: number,
): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
