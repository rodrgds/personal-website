// Step state for one slide. Works on canvas slides and speaker-view clones.

interface StepRange {
  from: number;
  to: number;
}

export function parseRange(value: string): StepRange {
  const [start, end] = value.split("-");
  const from = Number(start) || 0;
  if (end === undefined || end === "") return { from, to: Infinity };
  return { from, to: Number(end) };
}

function inRange(range: StepRange, step: number): boolean {
  return step >= range.from && step <= range.to;
}

function parseLines(spec: string): Set<number> {
  const lines = new Set<number>();
  for (const part of spec.split(",")) {
    const [start, end] = part.trim().split("-").map(Number);
    if (!Number.isFinite(start)) continue;
    const last = Number.isFinite(end) ? end : start;
    for (let line = start; line <= last; line += 1) lines.add(line);
  }
  return lines;
}

function codeRanges(element: HTMLElement): string[] {
  try {
    const parsed: string[] = JSON.parse(element.dataset.codeSteps ?? "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Expands reveals and returns the slide's last step. Idempotent. */
export function prepareSlide(slide: HTMLElement): number {
  for (const reveal of slide.querySelectorAll<HTMLElement>("[data-reveal]")) {
    const start = Number(reveal.dataset.reveal) || 1;
    const listItems = reveal.querySelectorAll<HTMLElement>(
      ":scope > ul > li, :scope > ol > li",
    );
    const items =
      listItems.length > 0
        ? [...listItems]
        : [...reveal.children].filter(
            (child): child is HTMLElement => child instanceof HTMLElement,
          );
    items.forEach((item, index) => {
      item.dataset.show ??= String(start + index);
      item.dataset.fx ??= "up";
    });
    reveal.removeAttribute("data-reveal");
  }

  let last = 0;
  for (const element of slide.querySelectorAll<HTMLElement>(
    "[data-show], [data-focus]",
  )) {
    const range = parseRange(
      element.dataset.show ?? element.dataset.focus ?? "0",
    );
    last = Math.max(last, range.from);
    if (Number.isFinite(range.to)) last = Math.max(last, range.to + 1);
  }
  for (const code of slide.querySelectorAll<HTMLElement>("[data-code-steps]")) {
    const start = Number(code.dataset.codeStart) || 1;
    last = Math.max(last, start + codeRanges(code).length - 1);
  }
  for (const mark of slide.querySelectorAll<HTMLElement>("[data-mark-at]")) {
    last = Math.max(last, Number(mark.dataset.markAt) || 0);
  }
  for (const widget of slide.querySelectorAll<HTMLElement>("[data-steps]")) {
    last = Math.max(last, Number(widget.dataset.steps) || 0);
  }
  slide.dataset.steps = String(last);
  return last;
}

export function lastStep(slide: HTMLElement): number {
  return Number(slide.dataset.steps) || 0;
}

export interface StepDetail {
  step: number;
  forward: boolean;
}

export function applyStep(
  slide: HTMLElement,
  step: number,
  forward: boolean,
): void {
  slide.dataset.step = String(step);
  for (const element of slide.querySelectorAll<HTMLElement>("[data-show]")) {
    const visible = inRange(parseRange(element.dataset.show ?? "0"), step);
    element.toggleAttribute("data-off", !visible);
  }
  for (const element of slide.querySelectorAll<HTMLElement>("[data-focus]")) {
    const focused = inRange(parseRange(element.dataset.focus ?? "0"), step);
    element.toggleAttribute("data-focused", focused);
  }
  for (const code of slide.querySelectorAll<HTMLElement>("[data-code-steps]")) {
    const ranges = codeRanges(code);
    const start = Number(code.dataset.codeStart) || 1;
    const index = Math.min(step - start, ranges.length - 1);
    const lines = index >= 0 ? parseLines(ranges[index]) : null;
    code.toggleAttribute("data-code-active", lines !== null);
    code
      .querySelectorAll<HTMLElement>("[data-line]")
      .forEach((line, lineIndex) => {
        line.toggleAttribute(
          "data-code-focus",
          lines?.has(lineIndex + 1) ?? false,
        );
      });
  }
  const detail: StepDetail = { step, forward };
  slide.dispatchEvent(new CustomEvent("deck:step", { detail }));
}
