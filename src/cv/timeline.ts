import type { CVCollectionsData } from "./types";

export type TimelineCategory =
  | "experience"
  | "projects"
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
  startMonth: number;
  endMonth: number;
}

export interface TimelineLayout {
  startMonth: number;
  endMonth: number;
  monthCount: number;
  entries: TimelinePositionedEntry[];
  rowCount: number;
  density: number[];
  maxDensity: number;
  ticks: Array<{ month: number; label?: string }>;
}

export const TIMELINE_CATEGORIES: TimelineCategory[] = [
  "experience",
  "projects",
  "education",
  "honors",
  "certifications",
];

export const TIMELINE_CATEGORY_LABELS: Record<TimelineCategory, string> = {
  experience: "Experience",
  projects: "Projects",
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
  return image ?? logo;
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
      category: "projects" as const,
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

  const rowEnds: number[] = [];
  const positionedEntries = [...entries]
    .sort(
      (a, b) =>
        parseMonth(a.startDate) - parseMonth(b.startDate) ||
        a.title.localeCompare(b.title),
    )
    .map((entry) => {
      const startMonth = parseMonth(entry.startDate);
      const endMonth = entry.endDate ? parseMonth(entry.endDate) : currentMonth;
      const occupiedUntil = Math.max(endMonth, startMonth + 10);
      let row = rowEnds.findIndex((rowEnd) => rowEnd < startMonth);

      if (row === -1) row = rowEnds.length;
      rowEnds[row] = occupiedUntil;

      return {
        ...entry,
        row,
        startMonth,
        endMonth,
      };
    });

  const density = Array.from({ length: monthCount }, (_, offset) => {
    const month = startMonth + offset;
    return entries.reduce((count, entry) => {
      const start = parseMonth(entry.startDate);
      const end = entry.endDate ? parseMonth(entry.endDate) : currentMonth;
      return count + (month >= start && month <= end ? 1 : 0);
    }, 0);
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
    rowCount: Math.max(1, rowEnds.length),
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
