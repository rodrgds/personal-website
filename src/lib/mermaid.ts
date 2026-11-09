import { createHash } from "node:crypto";
import { render } from "pele";

// Pele reads these custom properties, so diagrams follow the page theme.
const PALETTE = [
  "--pele-bg:transparent",
  "--pele-fg:var(--diagram-fg,currentColor)",
  "--pele-muted:var(--diagram-muted,#878580)",
  "--pele-line:var(--diagram-line,currentColor)",
  "--pele-surface:var(--diagram-surface,transparent)",
  "--pele-surface-alt:var(--diagram-surface-alt,transparent)",
  "--pele-border:var(--diagram-border,currentColor)",
  "--pele-accent:var(--diagram-accent,#da702c)",
  "--pele-critical:var(--diagram-critical,#d14d41)",
].join(";");

export interface MermaidSvg {
  svg: string;
  width: number;
  height: number;
}

const cache = new Map<string, MermaidSvg>();

/** Renders trusted repository Mermaid source to static SVG at build time. */
export function renderMermaid(source: string, fontSize = 16): MermaidSvg {
  const key = `${fontSize}:${source}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const hash = createHash("sha256").update(key).digest("hex").slice(0, 12);
  const diagram = render(source, {
    idPrefix: `mmd-${hash}`,
    links: false,
    images: false,
    responsive: false,
    autoDirection: false,
    fontFamily: "Geist, sans-serif",
    fontSize,
    now: 0,
    // Participants once, at the top: the footer copy only costs height.
    config: { sequence: { mirrorActors: false } },
  });
  const result = {
    svg: diagram.svg.replace('style="', `style="${PALETTE};`),
    width: diagram.width,
    height: diagram.height,
  };
  cache.set(key, result);
  return result;
}
