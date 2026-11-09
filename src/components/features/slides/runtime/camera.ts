// Pan/zoom camera for the slide world: screen = world * z + (x, y).

export interface View {
  x: number;
  y: number;
  z: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_ZOOM = 0.015;
const MAX_ZOOM = 8;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

type ZoomPoint = [number, number, number];

/**
 * Smooth zoom-and-pan path (van Wijk and Nuij, as in d3-interpolate). Points
 * are [centerX, centerY, visibleWidth]; far jumps zoom out on the way.
 */
function smoothZoom(from: ZoomPoint, to: ZoomPoint) {
  const rho = Math.SQRT2;
  const [ux0, uy0, w0] = from;
  const [ux1, uy1, w1] = to;
  const dx = ux1 - ux0;
  const dy = uy1 - uy0;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1e-12) {
    const s = Math.log(w1 / w0) / rho;
    return {
      length: Math.abs(s),
      at: (t: number): ZoomPoint => [
        ux0 + t * dx,
        uy0 + t * dy,
        w0 * Math.exp(rho * t * s),
      ],
    };
  }
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + rho ** 4 * d2) / (2 * w0 * rho ** 2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - rho ** 4 * d2) / (2 * w1 * rho ** 2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const s = (r1 - r0) / rho;
  return {
    length: s,
    at: (t: number): ZoomPoint => {
      const distance = t * s;
      const u =
        (w0 / (rho ** 2 * d1)) *
        (Math.cosh(r0) * Math.tanh(rho * distance + r0) - Math.sinh(r0));
      return [
        ux0 + u * dx,
        uy0 + u * dy,
        (w0 * Math.cosh(r0)) / Math.cosh(rho * distance + r0),
      ];
    },
  };
}

export class Camera {
  view: View = { x: 0, y: 0, z: 1 };
  private frame = 0;
  private readonly world: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly onChange: () => void;

  constructor(world: HTMLElement, viewport: HTMLElement, onChange: () => void) {
    this.world = world;
    this.viewport = viewport;
    this.onChange = onChange;
  }

  get width(): number {
    return this.viewport.clientWidth;
  }

  get height(): number {
    return this.viewport.clientHeight;
  }

  private render(): void {
    const { x, y, z } = this.view;
    this.world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    this.onChange();
  }

  set(view: View): void {
    this.stop();
    this.view = { ...view, z: clampZoom(view.z) };
    this.render();
  }

  stop(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.viewport.removeAttribute("data-moving");
  }

  get moving(): boolean {
    return this.frame !== 0;
  }

  fit(rect: WorldRect, padding = 0): View {
    const z = clampZoom(
      Math.min(
        (this.width - padding * 2) / rect.width,
        (this.height - padding * 2) / rect.height,
      ),
    );
    return {
      z,
      x: this.width / 2 - (rect.x + rect.width / 2) * z,
      y: this.height / 2 - (rect.y + rect.height / 2) * z,
    };
  }

  toWorld(clientX: number, clientY: number): Point {
    const bounds = this.viewport.getBoundingClientRect();
    return {
      x: (clientX - bounds.left - this.view.x) / this.view.z,
      y: (clientY - bounds.top - this.view.y) / this.view.z,
    };
  }

  panBy(dx: number, dy: number): void {
    this.set({ ...this.view, x: this.view.x + dx, y: this.view.y + dy });
  }

  zoomAt(clientX: number, clientY: number, factor: number): void {
    const bounds = this.viewport.getBoundingClientRect();
    const px = clientX - bounds.left;
    const py = clientY - bounds.top;
    const z = clampZoom(this.view.z * factor);
    const ratio = z / this.view.z;
    this.set({
      z,
      x: px - (px - this.view.x) * ratio,
      y: py - (py - this.view.y) * ratio,
    });
  }

  animateTo(target: View, instant = false): Promise<void> {
    this.stop();
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (instant || reduced) {
      this.set(target);
      return Promise.resolve();
    }
    const toPoint = (view: View): ZoomPoint => [
      (this.width / 2 - view.x) / view.z,
      (this.height / 2 - view.y) / view.z,
      this.width / view.z,
    ];
    const path = smoothZoom(toPoint(this.view), toPoint(target));
    const duration = Math.min(1300, Math.max(380, path.length * 620));
    const started = performance.now();
    this.viewport.setAttribute("data-moving", "");
    return new Promise((resolve) => {
      const tick = (now: number) => {
        const t = Math.min(1, (now - started) / duration);
        const [cx, cy, width] = path.at(easeInOut(t));
        const z = this.width / width;
        this.view = {
          z,
          x: this.width / 2 - cx * z,
          y: this.height / 2 - cy * z,
        };
        this.render();
        if (t < 1) {
          this.frame = requestAnimationFrame(tick);
          return;
        }
        this.frame = 0;
        this.view = target;
        this.render();
        this.viewport.removeAttribute("data-moving");
        resolve();
      };
      this.frame = requestAnimationFrame(tick);
    });
  }
}
