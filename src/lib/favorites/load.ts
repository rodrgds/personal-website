import { getImage } from "astro:assets";
import { FAVORITES } from "../../data/favorites";
import {
  getTmdbMediaDetails,
  isTmdbConfigured,
  type TmdbMediaType,
} from "../tmdb";
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

async function mapStandardFavorite(
  sectionId: FavoriteSectionId,
  favorite: StandardFavoriteInput,
): Promise<FavoriteItem> {
  const item: FavoriteItem = {
    id: `${sectionId}:${slugify(favorite.title)}`,
    ...favorite,
  };
  if (favorite.image) item.image = await coverUrl(favorite.image);
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

export async function loadFavorites(): Promise<FavoriteSection[]> {
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
      favorites.map((favorite) => mapStandardFavorite(sectionId, favorite)),
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
