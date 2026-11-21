// The first picture an entry shows, for hover cards on the timeline and the
// home. A project's `cover` wins; otherwise it is read from the entry's MDX:
// the first `src={name}` it renders, matched to the
// `import name from ".../assets/cv/..."` line above it.
import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";
import type { CVCollectionsData } from "./types";

const CV_ASSETS = import.meta.glob<ImageMetadata>(
  "../assets/cv/**/*.{png,jpg,jpeg,webp}",
  { eager: true, import: "default" },
);

const IMPORT = /^import\s+(\w+)\s+from\s+["'][./]*assets\/cv\/([^"']+)["']/gm;
const USE = /\bsrc=\{(\w+)\}/g;

/** The asset path (under src/assets/cv) of the first image an MDX body shows. */
export function firstImagePath(body: string): string | undefined {
  const imports = new Map<string, string>();
  for (const match of body.matchAll(IMPORT)) imports.set(match[1], match[2]);
  for (const match of body.matchAll(USE)) {
    const path = imports.get(match[1]);
    if (path) return path;
  }
  return undefined;
}

function findAsset(path: string): ImageMetadata | undefined {
  const key = Object.keys(CV_ASSETS).find((file) =>
    file.endsWith(`/assets/cv/${path}`),
  );
  return key ? CV_ASSETS[key] : undefined;
}

export interface CVCover {
  src: string;
  /** The file name, for the hover card's title bar. */
  label: string;
}

/** Cover images by entry slug, resized for hover cards. */
export async function getCVCovers(
  data: CVCollectionsData,
  width = 720,
): Promise<Map<string, CVCover>> {
  const entries = [
    ...data.experience,
    ...data.projects,
    ...data.education,
    ...data.honors,
    ...data.certifications,
  ];
  const covers = new Map<string, CVCover>();
  await Promise.all(
    entries.map(async (entry) => {
      const path =
        ("cover" in entry.data ? entry.data.cover : undefined) ??
        firstImagePath(entry.body ?? "");
      const image = path ? findAsset(path) : undefined;
      if (!path || !image) return;
      const result = await getImage({
        src: image,
        width: Math.min(width, image.width),
        format: "webp",
      });
      covers.set(entry.id, {
        src: result.src,
        label: path.split("/").pop() ?? path,
      });
    }),
  );
  return covers;
}
