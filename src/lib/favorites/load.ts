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
  defaultIcon: string;
}

const SECTION_CONFIG: SectionConfig[] = [
  { id: "movies", title: "Movies", defaultIcon: "🎬" },
  { id: "shows", title: "Shows", defaultIcon: "📺" },
  { id: "podcasts", title: "Podcasts", defaultIcon: "🎧" },
  { id: "books", title: "Books", defaultIcon: "📚" },
  { id: "blogs", title: "Blogs", defaultIcon: "✍️" },
  { id: "articles", title: "Articles", defaultIcon: "📄" },
  { id: "videos", title: "Videos", defaultIcon: "▶️" },
  { id: "cool", title: "Cool Stuff", defaultIcon: "⭐" },
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
    ...(favorite.icon ? { icon: favorite.icon } : {}),
    ...(favorite.comment ? { comment: favorite.comment } : {}),
  };

  if (!isTmdbConfigured()) return fallback;

  try {
    const details = await getTmdbMediaDetails(mediaType, favorite.tmdbId);
    return {
      ...fallback,
      title: details.title,
      ...(details.year ? { year: details.year } : {}),
      ...(details.posterUrl ? { image: details.posterUrl } : {}),
    };
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

  const itemsBySection: Record<FavoriteSectionId, FavoriteItem[]> = {
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
  };

  return SECTION_CONFIG.map((section) => ({
    ...section,
    items: itemsBySection[section.id],
  }));
}
