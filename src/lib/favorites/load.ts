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

function mapStandardFavorite(
  sectionId: FavoriteSectionId,
  favorite: StandardFavoriteInput,
): FavoriteItem {
  return {
    id: `${sectionId}:${slugify(favorite.title)}`,
    ...favorite,
  };
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

  const itemsBySection = {
    movies,
    shows,
    podcasts: FAVORITES.podcasts.map((favorite) =>
      mapStandardFavorite("podcasts", favorite),
    ),
    books: FAVORITES.books.map((favorite) =>
      mapStandardFavorite("books", favorite),
    ),
    blogs: FAVORITES.blogs.map((favorite) =>
      mapStandardFavorite("blogs", favorite),
    ),
    articles: FAVORITES.articles.map((favorite) =>
      mapStandardFavorite("articles", favorite),
    ),
    videos: FAVORITES.videos.map((favorite) =>
      mapStandardFavorite("videos", favorite),
    ),
    cool: FAVORITES.cool.map((favorite) =>
      mapStandardFavorite("cool", favorite),
    ),
  } satisfies Record<FavoriteSectionId, FavoriteItem[]>;

  return SECTION_CONFIG.map((section) => ({
    ...section,
    items: itemsBySection[section.id],
  }));
}
