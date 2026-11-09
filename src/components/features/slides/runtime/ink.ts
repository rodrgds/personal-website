import { getStroke } from "perfect-freehand";
import { z } from "astro/zod";
import type { Camera, Point, WorldRect } from "./camera";
import { capturePointer } from "./shared";
import { hashSeed, roughEllipse, roughLine, roughRect, seeded } from "./rough";

// Drawing layer in world coordinates, so ink stays attached to the slides
// while the camera moves. Ink lives only in this browser (localStorage).

export const TOOLS = [
  "interact",
  "pen",
  "highlighter",
  "eraser",
  "laser",
  "arrow",
  "rect",
  "ellipse",
  "text",
] as const;
export type Tool = (typeof TOOLS)[number];

export const INK_COLORS = [
  "ink",
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
] as const;
export type InkColor = (typeof INK_COLORS)[number];

const strokeSchema = z.object({
  id: z.string(),
  kind: z.enum(["pen", "highlighter", "arrow", "rect", "ellipse", "text"]),
  color: z.enum(INK_COLORS),
  size: z.number().positive(),
  points: z.array(z.number()),
  pressure: z.boolean().optional(),
  text: z.string().optional(),
});
type Stroke = z.infer<typeof strokeSchema>;
type StrokeKind = Stroke["kind"];
const storedInk = z.array(strokeSchema);

/** Screen-pixel sizes for small, medium and large. */
const SIZES = {
  pen: [3, 6, 12],
  highlighter: [22, 36, 56],
  arrow: [3, 5, 9],
  rect: [3, 5, 9],
  ellipse: [3, 5, 9],
  text: [30, 44, 68],
} satisfies Record<StrokeKind, [number, number, number]>;

const SVG_NS = "http://www.w3.org/2000/svg";
const LASER_TTL = 520;

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function outlinePath(points: number[][]): string {
  if (points.length < 4) {
    const [x, y] = points[0] ?? [0, 0];
    return `M${x} ${y}Z`;
  }
  const avg = (a: number, b: number) => ((a + b) / 2).toFixed(2);
  let [a, b] = points;
  const c = points[2];
  let d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${avg(b[0], c[0])},${avg(b[1], c[1])} T`;
  for (let index = 2; index < points.length - 1; index += 1) {
    a = points[index];
    b = points[index + 1];
    d += `${avg(a[0], b[0])},${avg(a[1], b[1])} `;
  }
  return `${d}Z`;
}

function triples(points: number[]): number[][] {
  const result: number[][] = [];
  for (let index = 0; index + 2 < points.length; index += 3) {
    result.push([points[index], points[index + 1], points[index + 2]]);
  }
  return result;
}

function freehandPath(stroke: Stroke): string {
  const highlighter = stroke.kind === "highlighter";
  const outline = getStroke(triples(stroke.points), {
    size: stroke.size,
    thinning: highlighter ? 0 : 0.55,
    smoothing: 0.5,
    streamline: highlighter ? 0.6 : 0.4,
    simulatePressure: !highlighter && !stroke.pressure,
    last: true,
  });
  return outlinePath(outline);
}

function figurePaths(stroke: Stroke): string[] {
  const [x1, y1, x2, y2] = stroke.points;
  const random = seeded(hashSeed(stroke.id));
  if (stroke.kind === "rect") {
    return roughRect(
      Math.min(x1, x2),
      Math.min(y1, y2),
      Math.abs(x2 - x1),
      Math.abs(y2 - y1),
      random,
      0.7,
    );
  }
  if (stroke.kind === "ellipse") {
    return [
      roughEllipse(
        (x1 + x2) / 2,
        (y1 + y2) / 2,
        Math.abs(x2 - x1) / 2,
        Math.abs(y2 - y1) / 2,
        random,
        0.6,
      ),
    ];
  }
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.min(
    Math.hypot(x2 - x1, y2 - y1) * 0.4,
    stroke.size * 5 + 14,
  );
  const spread = 0.5;
  return [
    roughLine(x1, y1, x2, y2, random, 0.6),
    roughLine(
      x2,
      y2,
      x2 - head * Math.cos(angle - spread),
      y2 - head * Math.sin(angle - spread),
      random,
      0.3,
    ),
    roughLine(
      x2,
      y2,
      x2 - head * Math.cos(angle + spread),
      y2 - head * Math.sin(angle + spread),
      random,
      0.3,
    ),
  ];
}

function strokeMarkup(stroke: Stroke): string {
  const color = `data-color="${stroke.color}"`;
  switch (stroke.kind) {
    case "pen":
    case "highlighter":
      return `<path class="ink-${stroke.kind}" ${color} d="${freehandPath(stroke)}"/>`;
    case "text": {
      const [x, y] = stroke.points;
      const lines = (stroke.text ?? "").split("\n");
      const spans = lines
        .map(
          (line, index) =>
            `<tspan x="${x}" dy="${index === 0 ? "1em" : "1.2em"}">${escapeXml(line) || " "}</tspan>`,
        )
        .join("");
      return `<text class="ink-text" ${color} x="${x}" y="${y}" font-size="${stroke.size}">${spans}</text>`;
    }
    default:
      return `<path class="ink-line" ${color} stroke-width="${stroke.size}" d="${figurePaths(stroke).join(" ")}"/>`;
  }
}

function segmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t = length
    ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length))
    : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function hits(stroke: Stroke, x: number, y: number, radius: number): boolean {
  const reach = radius + stroke.size / 2;
  const [x1, y1, x2, y2] = stroke.points;
  switch (stroke.kind) {
    case "pen":
    case "highlighter":
      for (let index = 0; index + 2 < stroke.points.length; index += 3) {
        if (
          Math.hypot(stroke.points[index] - x, stroke.points[index + 1] - y) <
          reach
        ) {
          return true;
        }
      }
      return false;
    case "arrow":
      return segmentDistance(x, y, x1, y1, x2, y2) < reach;
    case "rect": {
      const corners = [
        [x1, y1, x2, y1],
        [x2, y1, x2, y2],
        [x2, y2, x1, y2],
        [x1, y2, x1, y1],
      ];
      return corners.some(
        ([ax, ay, bx, by]) => segmentDistance(x, y, ax, ay, bx, by) < reach,
      );
    }
    case "ellipse": {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      for (let index = 0; index < 48; index += 1) {
        const a = (index / 48) * Math.PI * 2;
        const b = ((index + 1) / 48) * Math.PI * 2;
        const distance = segmentDistance(
          x,
          y,
          cx + rx * Math.cos(a),
          cy + ry * Math.sin(a),
          cx + rx * Math.cos(b),
          cy + ry * Math.sin(b),
        );
        if (distance < reach) return true;
      }
      return false;
    }
    case "text": {
      const lines = (stroke.text ?? "").split("\n");
      const width =
        Math.max(...lines.map((line) => line.length)) * stroke.size * 0.56;
      const height = lines.length * stroke.size * 1.2;
      return (
        x > x1 - radius &&
        x < x1 + width + radius &&
        y > y1 - radius &&
        y < y1 + height + radius
      );
    }
  }
}

function strokeCenter(stroke: Stroke): Point {
  if (stroke.kind === "pen" || stroke.kind === "highlighter") {
    let x = 0;
    let y = 0;
    const count = Math.max(1, Math.floor(stroke.points.length / 3));
    for (let index = 0; index + 2 < stroke.points.length; index += 3) {
      x += stroke.points[index];
      y += stroke.points[index + 1];
    }
    return { x: x / count, y: y / count };
  }
  if (stroke.kind === "text")
    return { x: stroke.points[0], y: stroke.points[1] };
  const [x1, y1, x2, y2] = stroke.points;
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter += 1).toString(36)}`;

export interface InkElements {
  root: HTMLElement;
  viewport: HTMLElement;
  input: HTMLElement;
  svg: SVGSVGElement;
  overlay: SVGSVGElement;
}

interface LaserPoint {
  x: number;
  y: number;
  t: number;
}

export class Ink {
  tool: Tool = "interact";
  color: InkColor = "red";
  sizeIndex = 1;
  private strokes: Stroke[] = [];
  private undoStack: Stroke[][] = [];
  private redoStack: Stroke[][] = [];
  private readonly committed: SVGGElement;
  private readonly live: SVGGElement;
  private readonly laserPath: SVGPathElement;
  private readonly cursorRing: SVGCircleElement;
  private laser: LaserPoint[] = [];
  private laserFrame = 0;
  private draft: Stroke | null = null;
  private erasing: Stroke[] | null = null;
  private saveTimer = 0;
  private editor: HTMLTextAreaElement | null = null;
  private readonly els: InkElements;
  private readonly camera: Camera;
  private readonly storageKey: string;
  onChange: () => void = () => {};

  constructor(els: InkElements, camera: Camera, storageKey: string) {
    this.els = els;
    this.camera = camera;
    this.storageKey = storageKey;
    this.committed = document.createElementNS(SVG_NS, "g");
    this.live = document.createElementNS(SVG_NS, "g");
    els.svg.append(this.committed, this.live);
    this.laserPath = document.createElementNS(SVG_NS, "path");
    this.laserPath.classList.add("laser-trail");
    this.cursorRing = document.createElementNS(SVG_NS, "circle");
    this.cursorRing.classList.add("eraser-ring");
    this.cursorRing.setAttribute("r", "14");
    els.overlay.append(this.laserPath, this.cursorRing);
    this.load();
    this.bind();
  }

  get count(): number {
    return this.strokes.length;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  setTool(tool: Tool): void {
    this.commitEditor();
    this.tool = tool;
    this.els.root.dataset.tool = tool;
    this.onChange();
  }

  setColor(color: InkColor): void {
    this.color = color;
    this.els.root.dataset.inkColor = color;
    if (
      this.tool === "interact" ||
      this.tool === "eraser" ||
      this.tool === "laser"
    ) {
      this.setTool("pen");
    }
    this.onChange();
  }

  setSize(index: number): void {
    this.sizeIndex = Math.max(0, Math.min(2, index));
    this.onChange();
  }

  private worldSize(kind: StrokeKind): number {
    return SIZES[kind][this.sizeIndex] / this.camera.view.z;
  }

  private commit(next: Stroke[]): void {
    this.undoStack.push(this.strokes);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this.strokes = next;
    this.render();
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(this.strokes);
    this.strokes = previous;
    this.render();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.strokes);
    this.strokes = next;
    this.render();
  }

  clear(rect?: WorldRect): void {
    const keep = rect
      ? this.strokes.filter((stroke) => {
          const { x, y } = strokeCenter(stroke);
          return !(
            x >= rect.x &&
            x <= rect.x + rect.width &&
            y >= rect.y &&
            y <= rect.y + rect.height
          );
        })
      : [];
    if (keep.length !== this.strokes.length) this.commit(keep);
  }

  private render(): void {
    this.committed.innerHTML = this.strokes.map(strokeMarkup).join("");
    this.scheduleSave();
    this.onChange();
  }

  private renderDraft(): void {
    this.live.innerHTML = this.draft ? strokeMarkup(this.draft) : "";
  }

  private load(): void {
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return;
      const parsed = storedInk.safeParse(JSON.parse(raw));
      if (parsed.success) this.strokes = parsed.data;
    } catch {
      this.strokes = [];
    }
    this.committed.innerHTML = this.strokes.map(strokeMarkup).join("");
  }

  private scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try {
        if (this.strokes.length === 0)
          window.localStorage.removeItem(this.storageKey);
        else
          window.localStorage.setItem(
            this.storageKey,
            JSON.stringify(this.strokes),
          );
      } catch {
        // Storage can be unavailable (private mode); ink still works in memory.
      }
    }, 300);
  }

  private bind(): void {
    const { input } = this.els;
    input.addEventListener("pointerdown", (event) => this.down(event));
    input.addEventListener("pointermove", (event) => this.move(event));
    input.addEventListener("pointerup", (event) => this.up(event));
    input.addEventListener("pointercancel", (event) => this.up(event));
    input.addEventListener("pointerleave", () => {
      this.cursorRing.style.opacity = "0";
    });
  }

  private down(event: PointerEvent): void {
    if (event.button !== 0 || this.tool === "interact") return;
    event.preventDefault();
    event.stopPropagation();
    const { x, y } = this.camera.toWorld(event.clientX, event.clientY);
    if (this.tool === "text") {
      if (this.editor) {
        this.commitEditor();
        return;
      }
      this.openEditor(event.clientX, event.clientY, x, y);
      return;
    }
    if (this.tool === "laser") return;
    capturePointer(this.els.input, event.pointerId);
    if (this.tool === "eraser") {
      this.erasing = this.strokes;
      this.erase(x, y);
      return;
    }
    const kind: StrokeKind = this.tool;
    const freehand = kind === "pen" || kind === "highlighter";
    this.draft = {
      id: newId(),
      kind,
      color:
        kind === "highlighter" && this.color === "ink" ? "yellow" : this.color,
      size: this.worldSize(kind),
      points: freehand ? [x, y, event.pressure || 0.5] : [x, y, x, y],
      pressure: event.pointerType === "pen",
    };
    this.renderDraft();
  }

  private move(event: PointerEvent): void {
    if (this.tool === "laser") {
      this.pushLaser(event);
      return;
    }
    if (this.tool === "eraser") {
      const bounds = this.els.viewport.getBoundingClientRect();
      this.cursorRing.setAttribute("cx", String(event.clientX - bounds.left));
      this.cursorRing.setAttribute("cy", String(event.clientY - bounds.top));
      this.cursorRing.style.opacity = "1";
      if (this.erasing) {
        const { x, y } = this.camera.toWorld(event.clientX, event.clientY);
        this.erase(x, y);
      }
      return;
    }
    const draft = this.draft;
    if (!draft) return;
    if (draft.kind === "pen" || draft.kind === "highlighter") {
      const events = event.getCoalescedEvents?.() ?? [event];
      for (const sample of events.length ? events : [event]) {
        const { x, y } = this.camera.toWorld(sample.clientX, sample.clientY);
        draft.points.push(x, y, sample.pressure || 0.5);
      }
    } else {
      const { x, y } = this.camera.toWorld(event.clientX, event.clientY);
      const [x1, y1] = draft.points;
      let x2 = x;
      let y2 = y;
      if (event.shiftKey && draft.kind !== "arrow") {
        const side = Math.max(Math.abs(x - x1), Math.abs(y - y1));
        x2 = x1 + Math.sign(x - x1 || 1) * side;
        y2 = y1 + Math.sign(y - y1 || 1) * side;
      } else if (event.shiftKey) {
        const angle =
          Math.round(Math.atan2(y - y1, x - x1) / (Math.PI / 12)) *
          (Math.PI / 12);
        const length = Math.hypot(x - x1, y - y1);
        x2 = x1 + Math.cos(angle) * length;
        y2 = y1 + Math.sin(angle) * length;
      }
      draft.points = [x1, y1, x2, y2];
    }
    this.renderDraft();
  }

  private up(event: PointerEvent): void {
    if (this.els.input.hasPointerCapture(event.pointerId)) {
      this.els.input.releasePointerCapture(event.pointerId);
    }
    if (this.erasing) {
      const before = this.erasing;
      this.erasing = null;
      if (before.length !== this.strokes.length) {
        const after = this.strokes;
        this.strokes = before;
        this.commit(after);
      }
      return;
    }
    const draft = this.draft;
    this.draft = null;
    this.renderDraft();
    if (!draft) return;
    if (draft.kind !== "pen" && draft.kind !== "highlighter") {
      const [x1, y1, x2, y2] = draft.points;
      if (Math.hypot(x2 - x1, y2 - y1) * this.camera.view.z < 6) return;
    }
    this.commit([...this.strokes, draft]);
  }

  private erase(x: number, y: number): void {
    const radius = 14 / this.camera.view.z;
    const remaining = this.strokes.filter(
      (stroke) => !hits(stroke, x, y, radius),
    );
    if (remaining.length === this.strokes.length) return;
    this.strokes = remaining;
    this.committed.innerHTML = this.strokes.map(strokeMarkup).join("");
  }

  private pushLaser(event: PointerEvent): void {
    const bounds = this.els.viewport.getBoundingClientRect();
    this.laser.push({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      t: performance.now(),
    });
    if (!this.laserFrame)
      this.laserFrame = requestAnimationFrame(() => this.drawLaser());
  }

  private drawLaser(): void {
    const now = performance.now();
    this.laser = this.laser.filter((point) => now - point.t < LASER_TTL);
    if (this.laser.length === 0) {
      this.laserPath.setAttribute("d", "");
      this.laserFrame = 0;
      return;
    }
    const outline = getStroke(
      this.laser.map((point) => [
        point.x,
        point.y,
        1 - (now - point.t) / LASER_TTL,
      ]),
      {
        size: 9,
        thinning: 0.8,
        smoothing: 0.4,
        streamline: 0.3,
        simulatePressure: false,
        last: true,
      },
    );
    this.laserPath.setAttribute("d", outlinePath(outline));
    this.laserFrame = requestAnimationFrame(() => this.drawLaser());
  }

  private openEditor(
    clientX: number,
    clientY: number,
    worldX: number,
    worldY: number,
  ): void {
    const bounds = this.els.viewport.getBoundingClientRect();
    const editor = document.createElement("textarea");
    const size = SIZES.text[this.sizeIndex];
    editor.className = "ink-editor";
    editor.dataset.color = this.color;
    editor.rows = 1;
    editor.spellcheck = false;
    editor.style.left = `${clientX - bounds.left}px`;
    editor.style.top = `${clientY - bounds.top}px`;
    editor.style.fontSize = `${size}px`;
    editor.dataset.worldX = String(worldX);
    editor.dataset.worldY = String(worldY);
    editor.dataset.size = String(size / this.camera.view.z);
    const grow = () => {
      editor.style.height = "auto";
      editor.style.height = `${editor.scrollHeight}px`;
      editor.style.width = "auto";
      editor.style.width = `${Math.max(size * 2, editor.scrollWidth + size)}px`;
    };
    editor.addEventListener("input", grow);
    editor.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (
        event.key === "Escape" ||
        (event.key === "Enter" && (event.metaKey || event.ctrlKey))
      ) {
        event.preventDefault();
        this.commitEditor();
      }
    });
    editor.addEventListener("blur", () => this.commitEditor());
    this.els.viewport.append(editor);
    this.editor = editor;
    grow();
    requestAnimationFrame(() => editor.focus());
  }

  private commitEditor(): void {
    const editor = this.editor;
    if (!editor) return;
    this.editor = null;
    const text = editor.value.replace(/\s+$/, "");
    editor.remove();
    if (!text) return;
    this.commit([
      ...this.strokes,
      {
        id: newId(),
        kind: "text",
        color: this.color,
        size: Number(editor.dataset.size),
        points: [Number(editor.dataset.worldX), Number(editor.dataset.worldY)],
        text,
      },
    ]);
  }
}
