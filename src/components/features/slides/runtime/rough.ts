// Small hand-drawn path generator shared by slide marks and canvas figures.

export type Random = () => number;

/** Deterministic PRNG so a mark or figure keeps the same wobble on redraw. */
export function seeded(seed: number): Random {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

const round = (value: number) => Math.round(value * 10) / 10;

function jitter(random: Random, amount: number): number {
  return (random() * 2 - 1) * amount;
}

/** A slightly bowed line, like one pen pass. */
export function roughLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  random: Random,
  roughness = 1,
): string {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const amount = Math.min(10, 1.5 + length * 0.012) * roughness;
  const startX = x1 + jitter(random, amount * 0.6);
  const startY = y1 + jitter(random, amount * 0.6);
  const endX = x2 + jitter(random, amount * 0.6);
  const endY = y2 + jitter(random, amount * 0.6);
  const bend = jitter(random, amount);
  const normalX = length ? -(y2 - y1) / length : 0;
  const normalY = length ? (x2 - x1) / length : 0;
  const controlX = (startX + endX) / 2 + normalX * bend;
  const controlY = (startY + endY) / 2 + normalY * bend;
  return `M${round(startX)} ${round(startY)} Q${round(controlX)} ${round(controlY)} ${round(endX)} ${round(endY)}`;
}

/** Catmull-Rom points to a smooth cubic Bezier path. */
function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return "";
  const [first] = points;
  let path = `M${round(first[0])} ${round(first[1])}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    path += ` C${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(p2[0])} ${round(p2[1])}`;
  }
  return path;
}

/** An ellipse drawn in one stroke that overshoots its start. */
export function roughEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  random: Random,
  roughness = 1,
): string {
  const start = random() * Math.PI * 2;
  const sweep = Math.PI * 2 + 0.25 + random() * 0.35;
  const steps = 18;
  const wobble = 0.05 * roughness;
  const points: [number, number][] = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = start + (sweep * index) / steps;
    const scale = 1 + jitter(random, wobble);
    points.push([
      cx + Math.cos(angle) * rx * scale,
      cy + Math.sin(angle) * ry * scale,
    ]);
  }
  return smoothPath(points);
}

export function roughRect(
  x: number,
  y: number,
  width: number,
  height: number,
  random: Random,
  roughness = 1,
): string[] {
  return [
    roughLine(x, y, x + width, y, random, roughness),
    roughLine(x + width, y, x + width, y + height, random, roughness),
    roughLine(x + width, y + height, x, y + height, random, roughness),
    roughLine(x, y + height, x, y, random, roughness),
  ];
}
