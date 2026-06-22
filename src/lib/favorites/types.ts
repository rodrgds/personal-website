export type FavoriteSectionId =
  | "movies"
  | "shows"
  | "podcasts"
  | "books"
  | "blogs"
  | "articles"
  | "videos"
  | "cool";

export type FavoriteRating = 1 | 2 | 3 | 4 | 5;

export interface FavoriteEpisode {
  number?: string;
  guest?: string;
  title: string;
}

interface BaseFavoriteInput {
  rating: FavoriteRating;
  categories: string[];
  icon?: string;
  comment?: string;
}

export interface TmdbFavoriteInput extends BaseFavoriteInput {
  tmdbId: number;
  label: string;
}

export interface StandardFavoriteInput extends BaseFavoriteInput {
  title: string;
  year?: string;
  author?: string;
  url?: string;
  image?: string;
  favoriteEpisodes?: FavoriteEpisode[];
}

export interface FavoriteRegistryInput {
  movies: TmdbFavoriteInput[];
  shows: TmdbFavoriteInput[];
  podcasts: StandardFavoriteInput[];
  books: StandardFavoriteInput[];
  blogs: StandardFavoriteInput[];
  articles: StandardFavoriteInput[];
  videos: StandardFavoriteInput[];
  cool: StandardFavoriteInput[];
}

export interface FavoriteItem {
  id: string;
  title: string;
  rating: number;
  categories: string[];
  year?: string;
  author?: string;
  url?: string;
  image?: string;
  icon?: string;
  comment?: string;
  favoriteEpisodes?: FavoriteEpisode[];
}

export interface FavoriteSection {
  id: FavoriteSectionId;
  title: string;
  defaultIcon: string;
  items: FavoriteItem[];
}
