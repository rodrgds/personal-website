import { getImage } from "astro:assets";
import { FAVORITES } from "../../data/favorites";
import {
  getTmdbMediaDetails,
  isTmdbConfigured,
  type TmdbMediaType,
} from "../tmdb";
import { extractPreview, fetchHtml } from "../link-preview";
import type {
  FavoriteItem,
  FavoriteSection,
  FavoriteSectionId,
  StandardFavoriteInput,
  TmdbFavoriteInput,
} from "./types";

interface SectionConfig {
  id: FavoriteSectionId;
  title: string;
}

const SECTION_CONFIG: SectionConfig[] = [
  { id: "movies", title: "Movies" },
  { id: "shows", title: "Shows" },
  { id: "podcasts", title: "Podcasts" },
  { id: "books", title: "Books" },
  { id: "blogs", title: "Blogs" },
  { id: "articles", title: "Articles" },
  { id: "videos", title: "Videos" },
  { id: "cool", title: "Cool Stuff" },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Covers without a metadata provider, optimised by Astro. */
const COVERS = import.meta.glob<ImageMetadata>(
  "../../assets/favorites/*.{png,jpg,jpeg,webp,avif}",
  { eager: true, import: "default" },
);

/** Cards and peeks show covers at most ~300px wide; 480 covers 1.5x. */
const COVER_WIDTH = 480;

/** `/images/favorites/<file>` in the data resolves to a resized WebP. */
async function coverUrl(path: string): Promise<string> {
  const name = path.split("/").pop() ?? "";
  const key = Object.keys(COVERS).find((file) => file.endsWith(`/${name}`));
  const cover = key ? COVERS[key] : undefined;
  if (!cover) return path;
  const result = await getImage({
    src: cover,
    width: Math.min(COVER_WIDTH, cover.width),
    format: "webp",
  });
  return result.src;
}

/** A YouTube video's id from its link; channels and other sites have none. */
function youtubeId(url: string): string | undefined {
  try {
    const link = new URL(url);
    const host = link.hostname.replace(/^(www|m)\./, "");
    const id =
      host === "youtu.be"
        ? link.pathname.slice(1)
        : host === "youtube.com"
          ? (link.searchParams.get("v") ??
            /^\/(?:shorts|live|embed)\/([\w-]+)/.exec(link.pathname)?.[1])
          : undefined;
    return id && /^[\w-]{11}$/.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A video's thumbnail for its peek, checked at build time: the 1280px one
 * when YouTube has it (some videos do not), else the 320px one all have.
 */
async function videoPreview(url: string): Promise<string | undefined> {
  const id = youtubeId(url);
  if (!id) return undefined;
  const large = `https://i.ytimg.com/vi/${id}/hq720.jpg`;
  try {
    const response = await fetch(large, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) return large;
  } catch {
    // Offline or slow: the small one always exists.
  }
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

/** A page's own picture (Open Graph or Twitter card), as link previews use. */
async function pagePicture(url: string): Promise<string | undefined> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return undefined;
  }
  const html = await fetchHtml(target);
  return html === null ? undefined : extractPreview(html, target).image;
}

async function mapStandardFavorite(
  sectionId: FavoriteSectionId,
  favorite: StandardFavoriteInput,
  previews: boolean,
): Promise<FavoriteItem> {
  const item: FavoriteItem = {
    id: `${sectionId}:${slugify(favorite.title)}`,
    ...favorite,
  };
  if (favorite.image) item.image = await coverUrl(favorite.image);
  else if (previews && favorite.url) {
    const preview =
      (await videoPreview(favorite.url)) ?? (await pagePicture(favorite.url));
    if (preview) item.preview = preview;
  }
  return item;
}

async function mapTmdbFavorite(
  mediaType: TmdbMediaType,
  favorite: TmdbFavoriteInput,
): Promise<FavoriteItem> {
  const fallback: FavoriteItem = {
    id: `${mediaType}:${favorite.tmdbId}`,
    title: favorite.label,
    rating: favorite.rating,
    categories: favorite.categories,
  };
  if (favorite.icon) fallback.icon = favorite.icon;
  if (favorite.comment) fallback.comment = favorite.comment;

  if (!isTmdbConfigured()) return fallback;

  try {
    const details = await getTmdbMediaDetails(mediaType, favorite.tmdbId);
    const enriched: FavoriteItem = {
      ...fallback,
      title: details.title,
    };
    if (details.year) enriched.year = details.year;
    if (details.posterUrl) enriched.image = details.posterUrl;
    return enriched;
  } catch (error) {
    console.error(
      `Failed to load TMDB ${mediaType} ${favorite.tmdbId} (${favorite.label}):`,
      error,
    );
    return fallback;
  }
}

/**
 * Every section with its items. With `previews`, links without a picture of
 * their own get one for the peek (a video's thumbnail, else the page's
 * Open Graph image), read over the network: only /faves asks, and it is
 * built once, so pages rendered per request never wait on other sites.
 */
export async function loadFavorites({
  previews = false,
}: { previews?: boolean } = {}): Promise<FavoriteSection[]> {
  const movies = await Promise.all(
    FAVORITES.movies.map((favorite) => mapTmdbFavorite("movie", favorite)),
  );
  const shows = await Promise.all(
    FAVORITES.shows.map((favorite) => mapTmdbFavorite("tv", favorite)),
  );

  const standard = (
    sectionId: FavoriteSectionId,
    favorites: StandardFavoriteInput[],
  ): Promise<FavoriteItem[]> =>
    Promise.all(
      favorites.map((favorite) =>
        mapStandardFavorite(sectionId, favorite, previews),
      ),
    );

  const itemsBySection = {
    movies,
    shows,
    podcasts: await standard("podcasts", FAVORITES.podcasts),
    books: await standard("books", FAVORITES.books),
    blogs: await standard("blogs", FAVORITES.blogs),
    articles: await standard("articles", FAVORITES.articles),
    videos: await standard("videos", FAVORITES.videos),
    cool: await standard("cool", FAVORITES.cool),
  } satisfies Record<FavoriteSectionId, FavoriteItem[]>;

  return SECTION_CONFIG.map((section) => ({
    ...section,
    items: itemsBySection[section.id],
  }));
}
