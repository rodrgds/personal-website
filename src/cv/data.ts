import { getCollection } from "astro:content";
import type {
  CertificationData,
  CVCollectionEntry,
  CVCollectionsData,
  CVCertification,
  CVEducation,
  CVExperience,
  CVHonor,
  CVProject,
  EducationData,
  ExperienceData,
  HonorData,
  ProjectData,
  RelatedItem,
  ResolvedCV,
} from "./types";
import type { CVProfile } from "./profiles";

type CVCollectionKind =
  | "experience"
  | "projects"
  | "education"
  | "honors"
  | "certifications";

const CV_ENTRY_PREFIXES: Record<CVCollectionKind, string> = {
  experience: "experience",
  projects: "project",
  education: "education",
  honors: "honor",
  certifications: "certification",
};

function normalizeBullets(value: string[] | undefined): string[] {
  if (!value || value.length === 0) return [];
  return value.filter((item) => item.trim().length > 0);
}

function resolveBullets(
  collectionSlug: string,
  bullets: string[] | undefined,
  overrides: Record<string, string[]> | undefined,
): string[] {
  if (overrides?.[collectionSlug]) {
    return normalizeBullets(overrides[collectionSlug]);
  }

  return normalizeBullets(bullets);
}

function sortByStartDateDesc<T extends { startDate: string }>(
  entries: CVCollectionEntry<T>[],
): CVCollectionEntry<T>[] {
  return [...entries].sort((a, b) =>
    b.data.startDate.localeCompare(a.data.startDate),
  );
}

function sortByIssueDateDesc<T extends { issueDate: string }>(
  entries: CVCollectionEntry<T>[],
): CVCollectionEntry<T>[] {
  return [...entries].sort((a, b) =>
    b.data.issueDate.localeCompare(a.data.issueDate),
  );
}

function sortByDateDesc<T extends { date: string }>(
  entries: CVCollectionEntry<T>[],
): CVCollectionEntry<T>[] {
  return [...entries].sort((a, b) => b.data.date.localeCompare(a.data.date));
}

type EntryWithRelated = { slug: string; title: string; related?: string[] };

export function getCVEntryHref(data: CVCollectionsData, slug: string): string {
  const collectionKey = (
    Object.entries({
      experience: data.experience,
      projects: data.projects,
      education: data.education,
      honors: data.honors,
      certifications: data.certifications,
    }) as [CVCollectionKind, { id: string }[]][]
  ).find(([, entries]) => entries.some((entry) => entry.id === slug))?.[0];

  if (!collectionKey) {
    return `#${slug}`;
  }

  return `#${CV_ENTRY_PREFIXES[collectionKey]}-${slug}`;
}

export function getCVRelatedItems(
  data: CVCollectionsData,
  currentSlug: string,
  relatedSlugs: string[] | undefined,
): RelatedItem[] {
  const allEntries: EntryWithRelated[] = [
    ...data.education.map((e) => ({
      slug: e.id,
      title: e.data.institution,
      related: e.data.related,
    })),
    ...data.experience.map((e) => ({
      slug: e.id,
      title: e.data.company,
      related: e.data.related,
    })),
    ...data.projects.map((e) => ({
      slug: e.id,
      title: e.data.name,
      related: e.data.related,
    })),
    ...data.certifications.map((e) => ({
      slug: e.id,
      title: e.data.name,
      related: e.data.related,
    })),
    ...data.honors.map((e) => ({
      slug: e.id,
      title: e.data.title,
      related: e.data.related,
    })),
  ];

  const slugMap = new Map(allEntries.map((e) => [e.slug, e]));

  const directRelated = (relatedSlugs ?? [])
    .map((slug) => slugMap.get(slug))
    .filter((item): item is EntryWithRelated => !!item)
    .map((item) => ({ slug: item.slug, title: item.title }));

  const reverseRelated = allEntries
    .filter((entry) => entry.related?.includes(currentSlug))
    .map((entry) => ({ slug: entry.slug, title: entry.title }));

  const seen = new Set<string>();
  const merged: RelatedItem[] = [];
  for (const item of [...directRelated, ...reverseRelated]) {
    if (!seen.has(item.slug)) {
      seen.add(item.slug);
      merged.push(item);
    }
  }

  return merged;
}

async function getTypedCollection<T>(
  collection:
    | "experience"
    | "projects"
    | "education"
    | "certifications"
    | "honors",
): Promise<CVCollectionEntry<T>[]> {
  const entries = await getCollection(collection as any);
  return entries as unknown as CVCollectionEntry<T>[];
}

export async function getCVCollectionsData(): Promise<CVCollectionsData> {
  const [experience, projects, education, certifications, honors] =
    await Promise.all([
      getTypedCollection<ExperienceData>("experience"),
      getTypedCollection<ProjectData>("projects"),
      getTypedCollection<EducationData>("education"),
      getTypedCollection<CertificationData>("certifications"),
      getTypedCollection<HonorData>("honors"),
    ]);

  return {
    experience: sortByStartDateDesc(experience),
    projects: sortByStartDateDesc(projects),
    education: sortByStartDateDesc(education),
    certifications: sortByIssueDateDesc(certifications),
    honors: sortByDateDesc(honors),
  };
}

function filterByInclude<T>(
  entries: CVCollectionEntry<T>[],
  includeIds: string[] | undefined,
): CVCollectionEntry<T>[] {
  if (!includeIds) {
    return entries;
  }

  const entryMap = new Map(entries.map((e) => [e.id, e]));
  return includeIds
    .map((id) => entryMap.get(id))
    .filter(Boolean) as CVCollectionEntry<T>[];
}

function applySortStrategy<
  T extends { startDate?: string; issueDate?: string; date?: string },
>(
  entries: CVCollectionEntry<T>[],
  strategy?: "date-desc" | "alphabetical",
): CVCollectionEntry<T>[] {
  if (strategy === "alphabetical") {
    return [...entries].sort((a, b) => a.id.localeCompare(b.id));
  }

  if (strategy === "date-desc") {
    return [...entries].sort((a, b) => {
      const dateA = a.data.startDate ?? a.data.issueDate ?? a.data.date ?? "";
      const dateB = b.data.startDate ?? b.data.issueDate ?? b.data.date ?? "";
      return dateB.localeCompare(dateA) || a.id.localeCompare(b.id);
    });
  }

  return entries;
}

export function resolveCVProfile(
  data: CVCollectionsData,
  profile: CVProfile,
): ResolvedCV {
  const { include, sortStrategy, overrides } = profile;

  let experienceEntries = filterByInclude(data.experience, include?.experience);
  let projectEntries = filterByInclude(data.projects, include?.projects);
  let educationEntries = filterByInclude(data.education, include?.education);
  let certificationEntries = filterByInclude(
    data.certifications,
    include?.certifications,
  );
  let honorEntries = filterByInclude(data.honors, include?.honors);

  if (sortStrategy) {
    experienceEntries = applySortStrategy(experienceEntries, sortStrategy);
    projectEntries = applySortStrategy(projectEntries, sortStrategy);
    educationEntries = applySortStrategy(educationEntries, sortStrategy);
    certificationEntries = applySortStrategy(
      certificationEntries,
      sortStrategy,
    );
    honorEntries = applySortStrategy(honorEntries, sortStrategy);
  }

  const education: CVEducation[] = educationEntries.map(
    ({ id, data: item }) => ({
      slug: id,
      institution: item.institution,
      degree: item.degree,
      area: item.area,
      location: item.location,
      startDate: item.startDate,
      endDate: item.endDate,
      grade: item.grade,
      gradeNote: item.gradeNote,
      bullets: resolveBullets(`education/${id}`, item.bullets, overrides),
      related: getCVRelatedItems(data, id, item.related),
    }),
  );

  const experience: CVExperience[] = experienceEntries.map(
    ({ id, data: item }) => ({
      slug: id,
      company: item.company,
      role: item.role,
      type: item.type,
      location: item.location,
      startDate: item.startDate,
      endDate: item.endDate,
      url: item.url,
      tags: item.tags,
      bullets: resolveBullets(`experience/${id}`, item.bullets, overrides),
      related: getCVRelatedItems(data, id, item.related),
    }),
  );

  const projects: CVProject[] = projectEntries.map(({ id, data: item }) => ({
    slug: id,
    name: item.name,
    startDate: item.startDate,
    endDate: item.endDate,
    url: item.url,
    repo: item.repo,
    role: item.cvRole,
    status: item.status,
    tags: item.tags,
    bullets: resolveBullets(`projects/${id}`, item.bullets, overrides),
    related: getCVRelatedItems(data, id, item.related),
  }));

  const certifications: CVCertification[] = certificationEntries.map(
    ({ id, data: item }) => ({
      slug: id,
      name: item.name,
      issuer: item.issuer,
      issueDate: item.issueDate,
      credentialUrl: item.credentialUrl,
      bullets: resolveBullets(`certifications/${id}`, item.bullets, overrides),
      related: getCVRelatedItems(data, id, item.related),
    }),
  );

  const honors: CVHonor[] = honorEntries.map(({ id, data: item }) => ({
    slug: id,
    title: item.title,
    issuer: item.issuer,
    date: item.date,
    bullets: resolveBullets(`honors/${id}`, item.bullets, overrides),
    related: getCVRelatedItems(data, id, item.related),
  }));

  return {
    education,
    experience,
    projects,
    certifications,
    honors,
  };
}

export function formatCVDate(ym: string): string {
  const [year, month] = ym.split("-");
  const parsed = new Date(Number(year), Number(month) - 1);
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function formatCVRange(startDate: string, endDate?: string): string {
  return `${formatCVDate(startDate)}–${endDate ? formatCVDate(endDate) : "Present"}`;
}
