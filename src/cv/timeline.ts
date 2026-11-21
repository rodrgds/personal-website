import type { CVCollectionsData } from "./types";

export type TimelineCategory =
  | "experience"
  | "personal-projects"
  | "university-projects"
  | "education"
  | "honors"
  | "certifications";

/** What an entry is, as shown in TYPE columns and filters. */
export interface TimelineType {
  key: "work" | "build" | "uni" | "study" | "award" | "course";
  /** One entry, e.g. "project". */
  label: string;
  /** A filter button, e.g. "projects". */
  plural: string;
  categories: TimelineCategory[];
}

/** Display groups; the order is the filter order. */
export const TIMELINE_TYPES: TimelineType[] = [
  { key: "work", label: "work", plural: "work", categories: ["experience"] },
  {
    key: "build",
    label: "project",
    plural: "projects",
    categories: ["personal-projects"],
  },
  {
    key: "uni",
    label: "uni",
    plural: "uni",
    categories: ["university-projects"],
  },
  { key: "study", label: "study", plural: "study", categories: ["education"] },
  { key: "award", label: "award", plural: "awards", categories: ["honors"] },
  {
    key: "course",
    label: "course",
    plural: "courses",
    categories: ["certifications"],
  },
];

export function timelineType(category: TimelineCategory): TimelineType {
  return (
    TIMELINE_TYPES.find((type) => type.categories.includes(category)) ??
    TIMELINE_TYPES[0]
  );
}

export interface TimelineEntry {
  /** Unique across collections, e.g. "project-openpost". */
  id: string;
  /** The collection entry id; its page is /cv/<slug>. */
  slug: string;
  category: TimelineCategory;
  type: TimelineType;
  /** Short name for rows, e.g. "FEUP". */
  name: string;
  /** Short second part of a row: the place, or what a project is. */
  context: string;
  /** Full title and subtitle, for pages and hover cards. */
  title: string;
  subtitle: string;
  startDate: string;
  endDate?: string;
  kind: "span" | "point";
  visual?: string;
  href: string;
  isCurrent: boolean;
  /** One line for hover cards: a tagline or the first CV bullet. */
  summary?: string;
  /** Project status, when the entry is a project. */
  status?: string;
}

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

function getCurrentMonth(now: Date): number {
  return now.getFullYear() * 12 + now.getMonth();
}

function getVisual(logo?: string, image?: string): string | undefined {
  return logo ?? image;
}

export function getCVEntryPath(slug: string): string {
  return `/cv/${slug}`;
}

export function getTimelineEntries(
  data: CVCollectionsData,
  now = new Date(),
): TimelineEntry[] {
  const currentMonth = getCurrentMonth(now);

  const entries: Omit<TimelineEntry, "type">[] = [
    ...data.experience.map(({ id, data: item }) => ({
      id: `experience-${id}`,
      slug: id,
      category: "experience" as const,
      name: item.short ?? item.role,
      context: item.orgShort ?? item.company,
      title: item.role,
      subtitle: item.company,
      startDate: item.startDate,
      endDate: item.endDate,
      kind: "span" as const,
      visual: getVisual(item.logo, item.image),
      href: getCVEntryPath(id),
      isCurrent: !item.endDate,
      summary: item.bullets?.[0],
    })),
    ...data.projects.map(({ id, data: item }) => ({
      id: `project-${id}`,
      slug: id,
      category:
        item.category === "university"
          ? ("university-projects" as const)
          : ("personal-projects" as const),
      name: item.short ?? item.name,
      context:
        item.tagline ??
        (item.category === "university"
          ? "University project"
          : "Personal project"),
      title: item.name,
      subtitle:
        item.cvRole ??
        (item.category === "university"
          ? "University project"
          : "Personal project"),
      startDate: item.startDate,
      endDate: item.endDate,
      kind: "span" as const,
      visual: getVisual(item.logo, item.image),
      href: getCVEntryPath(id),
      isCurrent:
        !item.endDate && (item.status === "active" || item.status === "wip"),
      summary: item.tagline ?? item.bullets?.[0],
      status: item.status,
    })),
    ...data.education.map(({ id, data: item }) => ({
      id: `education-${id}`,
      slug: id,
      category: "education" as const,
      name: item.short ?? item.institution,
      context: `${item.degree}, ${item.area}`,
      title: item.institution,
      subtitle: `${item.degree} in ${item.area}`,
      startDate: item.startDate,
      endDate: item.endDate,
      kind: "span" as const,
      visual: getVisual(item.logo, item.image),
      href: getCVEntryPath(id),
      isCurrent: !item.endDate,
      summary: item.bullets?.[0],
    })),
    ...data.honors.map(({ id, data: item }) => ({
      id: `honor-${id}`,
      slug: id,
      category: "honors" as const,
      name: item.short ?? item.title,
      context: item.orgShort ?? item.issuer,
      title: item.title,
      subtitle: item.issuer,
      startDate: item.date,
      endDate: item.date,
      kind: "point" as const,
      visual: getVisual(item.logo, item.image),
      href: getCVEntryPath(id),
      isCurrent: false,
      summary: item.bullets?.[0],
    })),
    ...data.certifications.map(({ id, data: item }) => ({
      id: `certification-${id}`,
      slug: id,
      category: "certifications" as const,
      name: item.short ?? item.name,
      context: item.orgShort ?? item.issuer,
      title: item.name,
      subtitle: item.issuer,
      startDate: item.issueDate,
      endDate: item.issueDate,
      kind: "point" as const,
      visual: getVisual(item.logo, item.image),
      href: getCVEntryPath(id),
      isCurrent: false,
      summary: item.bullets?.[0],
    })),
  ];

  const slugs = new Set<string>();
  for (const entry of entries) {
    // Every entry gets its own /cv/<slug> page, so ids must be unique
    // across collections.
    if (slugs.has(entry.slug)) {
      throw new Error(`Two CV entries share the id "${entry.slug}"`);
    }
    slugs.add(entry.slug);

    const start = parseMonth(entry.startDate);
    const end = entry.endDate ? parseMonth(entry.endDate) : currentMonth;
    if (end < start) {
      throw new Error(
        `Timeline entry "${entry.id}" ends before it starts (${entry.startDate}–${entry.endDate})`,
      );
    }
  }

  return entries
    .map((entry) => ({ ...entry, type: timelineType(entry.category) }))
    .sort(
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

/** "1y 3m" from a start month to an end month (or now), inclusive. */
export function formatTimelineDuration(
  startDate: string,
  endDate: string | undefined,
  now = new Date(),
): string {
  const end = endDate ? parseMonth(endDate) : getCurrentMonth(now);
  const months = end - parseMonth(startDate) + 1;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${Math.max(1, rest)}m`;
  return rest ? `${years}y ${rest}m` : `${years}y`;
}
