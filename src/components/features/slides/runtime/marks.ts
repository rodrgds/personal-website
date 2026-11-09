import {
  hashSeed,
  roughEllipse,
  roughLine,
  seeded,
  type Random,
} from "./rough";

// Hand-drawn annotations in slide coordinates. rough-notation measures in
// screen pixels, which breaks inside the scaled canvas, so marks are drawn here
// in an SVG overlay sized to the unscaled 1920x1080 slide.

const SVG_NS = "http://www.w3.org/2000/svg";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function slideBoxes(slide: HTMLElement, element: HTMLElement): Box[] {
  const frame = slide.getBoundingClientRect();
  const scale = frame.width / slide.offsetWidth || 1;
  const rects =
    element.dataset.mark === "circle" || element.tagName === "DIV"
      ? [element.getBoundingClientRect()]
      : [...element.getClientRects()];
  return rects
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      x: (rect.left - frame.left) / scale,
      y: (rect.top - frame.top) / scale,
      width: rect.width / scale,
      height: rect.height / scale,
    }));
}

function pathsFor(type: string, boxes: Box[], random: Random): string[] {
  const paths: string[] = [];
  if (type === "circle") {
    const box = boxes[0];
    if (!box) return paths;
    const rx = box.width / 2 + 22;
    const ry = box.height / 2 + 16;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    paths.push(roughEllipse(cx, cy, rx, ry, random));
    return paths;
  }
  for (const box of boxes) {
    const left = box.x;
    const right = box.x + box.width;
    const top = box.y;
    const bottom = box.y + box.height;
    const middle = box.y + box.height / 2;
    switch (type) {
      case "box":
        for (let pass = 0; pass < 2; pass += 1) {
          paths.push(roughLine(left - 8, top - 6, right + 8, top - 6, random));
          paths.push(
            roughLine(right + 8, top - 6, right + 8, bottom + 6, random),
          );
          paths.push(
            roughLine(right + 8, bottom + 6, left - 8, bottom + 6, random),
          );
          paths.push(
            roughLine(left - 8, bottom + 6, left - 8, top - 6, random),
          );
        }
        break;
      case "highlight":
        paths.push(roughLine(left - 4, middle, right + 4, middle, random, 0.4));
        break;
      case "strike":
        paths.push(
          roughLine(left - 4, middle + 2, right + 4, middle - 2, random),
        );
        break;
      case "cross":
        paths.push(roughLine(left, top, right, bottom, random));
        paths.push(roughLine(right, top, left, bottom, random));
        break;
      case "bracket":
        paths.push(
          `${roughLine(left - 4, top, left - 16, top, random)} ${roughLine(left - 16, top, left - 16, bottom, random)} ${roughLine(left - 16, bottom, left - 4, bottom, random)}`,
        );
        paths.push(
          `${roughLine(right + 4, top, right + 16, top, random)} ${roughLine(right + 16, top, right + 16, bottom, random)} ${roughLine(right + 16, bottom, right + 4, bottom, random)}`,
        );
        break;
      default:
        for (let pass = 0; pass < 2; pass += 1) {
          paths.push(roughLine(left, bottom + 4, right, bottom + 4, random));
        }
    }
  }
  return paths;
}

const drawings = new WeakMap<HTMLElement, SVGGElement>();

function drawing(
  slide: HTMLElement,
  mark: HTMLElement,
  index: number,
): SVGGElement | null {
  const existing = drawings.get(mark);
  if (existing?.isConnected) return existing;
  const type = mark.dataset.mark ?? "underline";
  const layer = slide.querySelector<SVGSVGElement>(
    type === "highlight" ? "[data-marks-under]" : "[data-marks]",
  );
  if (!layer) return null;
  const boxes = slideBoxes(slide, mark);
  if (boxes.length === 0) return null;
  const group = document.createElementNS(SVG_NS, "g");
  group.classList.add("mark-drawing", `mark-${type}`);
  group.dataset.color = mark.dataset.markColor ?? "red";
  const random = seeded(
    hashSeed(`${slide.dataset.title ?? ""}:${index}:${type}`),
  );
  const paths = pathsFor(type, boxes, random);
  paths.forEach((d, pathIndex) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("pathLength", "1");
    if (type === "highlight") {
      path.style.strokeWidth = String((boxes[pathIndex]?.height ?? 40) * 0.92);
    }
    path.style.setProperty("--mark-delay", `${pathIndex * 140}ms`);
    group.append(path);
  });
  layer.append(group);
  drawings.set(mark, group);
  return group;
}

/** Shows marks whose step has been reached. */
export function updateMarks(
  slide: HTMLElement,
  step: number,
  animate: boolean,
): void {
  slide.querySelectorAll<HTMLElement>("[data-mark]").forEach((mark, index) => {
    const at = Number(mark.dataset.markAt) || 0;
    const visible = step >= at;
    const existing = drawings.get(mark);
    if (!visible) {
      existing?.removeAttribute("data-drawn");
      return;
    }
    const group = existing?.isConnected
      ? existing
      : drawing(slide, mark, index);
    if (!group || group.hasAttribute("data-drawn")) return;
    group.toggleAttribute("data-instant", !animate);
    // Force a style flush so the dash transition starts from its undrawn state.
    group.getBoundingClientRect();
    group.setAttribute("data-drawn", "");
  });
}

export function clearMarks(slide: HTMLElement): void {
  slide.querySelectorAll<HTMLElement>("[data-mark]").forEach((mark) => {
    drawings.get(mark)?.removeAttribute("data-drawn");
  });
}
