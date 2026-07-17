import type { CVCollectionsData } from "./types";

export type TimelineCategory =
  | "experience"
  | "personal-projects"
  | "university-projects"
  | "education"
  | "honors"
  | "certifications";

export interface TimelineEntry {
  id: string;
  category: TimelineCategory;
  title: string;
  subtitle: string;
  startDate: string;
  endDate?: string;
  kind: "span" | "point";
  visual?: string;
  href: string;
  isCurrent: boolean;
}

export interface TimelinePositionedEntry extends TimelineEntry {
  row: number;
  labelRow: number;
  startMonth: number;
  endMonth: number;
  lanePoints: Array<{ month: number; row: number }>;
}

export interface TimelineLayout {
  startMonth: number;
  endMonth: number;
  monthCount: number;
  entries: TimelinePositionedEntry[];
  rowCount: number;
  labelRowCount: number;
  density: number[];
  maxDensity: number;
  ticks: Array<{ month: number; label?: string }>;
}

export const TIMELINE_CATEGORIES: TimelineCategory[] = [
  "experience",
  "personal-projects",
  "university-projects",
  "education",
  "honors",
  "certifications",
];

export const TIMELINE_CATEGORY_LABELS: Record<TimelineCategory, string> = {
  experience: "Experience",
  "personal-projects": "Personal projects",
  "university-projects": "University projects",
  education: "Education",
  honors: "Honors",
  certifications: "Certifications",
};

function parseMonth(value: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid timeline date "${value}"; expected YYYY-MM`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) {
    throw new Error(`Invalid timeline date "${value}"; expected YYYY-MM`);
  }

  return year * 12 + month - 1;
}

function formatMonth(monthIndex: number): string {
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getCurrentMonth(now: Date): number {
  return now.getFullYear() * 12 + now.getMonth();
}

function getVisual(logo?: string, image?: string): string | undefined {
  return logo ?? image;
}

export function getTimelineEntries(
  data: CVCollectionsData,
  now = new Date(),
): TimelineEntry[] {
  const currentMonth = getCurrentMonth(now);

  const entries: TimelineEntry[] = [
    ...data.experience.map(({ id, data: item }) => ({
      id: `experience-${id}`,
      category: "experience" as const,
      title: item.role,
      subtitle: item.company,
      startDate: item.startDate,
      endDate: item.endDate,
      kind: "span" as const,
      visual: getVisual(item.logo, item.image),
      href: `/cv?view=list#experience-${id}`,
      isCurrent: !item.endDate,
    })),
    ...data.projects.map(({ id, data: item }) => ({
      id: `project-${id}`,
      category:
        item.category === "university"
          ? ("university-projects" as const)
          : ("personal-projects" as const),
      title: item.name,
      subtitle:
        item.category === "university"
          ? "University project"
          : "Personal project",
      startDate: item.startDate,
      endDate: item.endDate,
      kind: "span" as const,
      visual: getVisual(item.logo, item.image),
      href: `/cv?view=list#project-${id}`,
      isCurrent:
        !item.endDate && (item.status === "active" || item.status === "wip"),
    })),
    ...data.education.map(({ id, data: item }) => ({
      id: `education-${id}`,
      category: "education" as const,
      title: item.institution,
      subtitle: `${item.degree} in ${item.area}`,
      startDate: item.startDate,
      endDate: item.endDate,
      kind: "span" as const,
      visual: getVisual(item.logo, item.image),
      href: `/cv?view=list#education-${id}`,
      isCurrent: !item.endDate,
    })),
    ...data.honors.map(({ id, data: item }) => ({
      id: `honor-${id}`,
      category: "honors" as const,
      title: item.title,
      subtitle: item.issuer,
      startDate: item.date,
      endDate: item.date,
      kind: "point" as const,
      visual: getVisual(item.logo, item.image),
      href: `/cv?view=list#honor-${id}`,
      isCurrent: false,
    })),
    ...data.certifications.map(({ id, data: item }) => ({
      id: `certification-${id}`,
      category: "certifications" as const,
      title: item.name,
      subtitle: item.issuer,
      startDate: item.issueDate,
      endDate: item.issueDate,
      kind: "point" as const,
      visual: getVisual(item.logo, item.image),
      href: `/cv?view=list#certification-${id}`,
      isCurrent: false,
    })),
  ];

  for (const entry of entries) {
    const start = parseMonth(entry.startDate);
    const end = entry.endDate ? parseMonth(entry.endDate) : currentMonth;
    if (end < start) {
      throw new Error(
        `Timeline entry "${entry.id}" ends before it starts (${entry.startDate}–${entry.endDate})`,
      );
    }
  }

  return entries.sort(
    (a, b) =>
      parseMonth(a.startDate) - parseMonth(b.startDate) ||
      a.title.localeCompare(b.title),
  );
}

export function getCurrentTimelineEntries(
  data: CVCollectionsData,
  now = new Date(),
): TimelineEntry[] {
  return getTimelineEntries(data, now)
    .filter((entry) => entry.isCurrent)
    .sort(
      (a, b) =>
        parseMonth(b.startDate) - parseMonth(a.startDate) ||
        a.title.localeCompare(b.title),
    );
}

export function buildTimelineLayout(
  entries: TimelineEntry[],
  now = new Date(),
): TimelineLayout {
  if (entries.length === 0) {
    throw new Error("Cannot build an empty timeline");
  }

  const currentMonth = getCurrentMonth(now);
  const earliestMonth = Math.min(
    ...entries.map((entry) => parseMonth(entry.startDate)),
  );
  const latestMonth = Math.max(
    currentMonth,
    ...entries.map((entry) =>
      entry.endDate ? parseMonth(entry.endDate) : currentMonth,
    ),
  );
  const startMonth = earliestMonth - 2;
  const endMonth = latestMonth + 1;
  const monthCount = endMonth - startMonth + 1;

  const sortedEntries = [...entries].sort(
    (a, b) =>
      parseMonth(a.startDate) - parseMonth(b.startDate) ||
      a.title.localeCompare(b.title),
  );
  const positionedEntries: TimelinePositionedEntry[] = sortedEntries.map(
    (entry) => ({
      ...entry,
      row: 0,
      labelRow: 0,
      startMonth: parseMonth(entry.startDate),
      endMonth: entry.endDate ? parseMonth(entry.endDate) : currentMonth,
      lanePoints: [],
    }),
  );
  const startsByMonth = new Map<number, TimelinePositionedEntry[]>();
  const eventMonths = new Set<number>();

  for (const entry of positionedEntries) {
    const startingEntries = startsByMonth.get(entry.startMonth) ?? [];
    startingEntries.push(entry);
    startsByMonth.set(entry.startMonth, startingEntries);
    eventMonths.add(entry.startMonth);
    eventMonths.add(entry.endMonth + 1);
  }

  let activeEntries: TimelinePositionedEntry[] = [];
  let rowCount = 0;

  for (const month of [...eventMonths].sort((a, b) => a - b)) {
    activeEntries = activeEntries.filter((entry) => entry.endMonth >= month);

    activeEntries.forEach((entry, row) => {
      const previousPoint = entry.lanePoints.at(-1);
      if (previousPoint?.row !== row) {
        entry.lanePoints.push({ month, row });
      }
    });

    for (const entry of startsByMonth.get(month) ?? []) {
      entry.row = activeEntries.length;
      entry.lanePoints.push({ month, row: entry.row });
      activeEntries.push(entry);
    }

    rowCount = Math.max(rowCount, activeEntries.length);
  }

  const labelRows: Array<Array<{ start: number; end: number }>> = [];
  const minimumLabelSpanMonths = 10;

  for (const entry of positionedEntries) {
    const occupiedUntil = entry.startMonth + minimumLabelSpanMonths;
    let labelRow = labelRows.findIndex((intervals) =>
      intervals.every(
        (interval) =>
          occupiedUntil < interval.start || entry.startMonth > interval.end,
      ),
    );

    if (labelRow === -1) {
      labelRow = labelRows.length;
      labelRows.push([]);
    }

    entry.labelRow = labelRow;
    labelRows[labelRow].push({
      start: entry.startMonth,
      end: occupiedUntil,
    });
  }

  const densityDelta = new Int32Array(monthCount + 1);
  for (const entry of entries) {
    const entryStart = Math.max(0, parseMonth(entry.startDate) - startMonth);
    const entryEnd = Math.min(
      monthCount - 1,
      (entry.endDate ? parseMonth(entry.endDate) : currentMonth) - startMonth,
    );

    if (entryStart <= entryEnd) {
      densityDelta[entryStart] += 1;
      densityDelta[entryEnd + 1] -= 1;
    }
  }

  let activeEntryCount = 0;
  const density = Array.from({ length: monthCount }, (_, offset) => {
    activeEntryCount += densityDelta[offset];
    return activeEntryCount;
  });

  const ticks = Array.from({ length: monthCount }, (_, offset) => {
    const month = startMonth + offset;
    const monthOfYear = month % 12;
    return {
      month,
      label: monthOfYear === 0 ? String(Math.floor(month / 12)) : undefined,
    };
  }).filter(({ month, label }) => label || month % 3 === 0);

  return {
    startMonth,
    endMonth,
    monthCount,
    entries: positionedEntries,
    rowCount: Math.max(1, rowCount),
    labelRowCount: Math.max(1, labelRows.length),
    density,
    maxDensity: Math.max(...density, 1),
    ticks,
  };
}

export function getTimelineDateLabel(entry: TimelineEntry): string {
  if (entry.kind === "point") return entry.startDate;
  return `${entry.startDate}–${entry.endDate ?? "Now"}`;
}

export function getTimelineMonthKey(month: number): string {
  return formatMonth(month);
}
