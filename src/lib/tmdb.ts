import { SimpleCache } from "./cache";

const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";
const TMDB_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000;

export type TmdbMediaType = "movie" | "tv";
export type TmdbPosterSize = "w185" | "w342" | "w500" | "original";

export interface TmdbMediaDetails {
  id: number;
  title: string;
  year?: string;
  posterUrl?: string;
}

interface TmdbMediaResponse {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  last_air_date?: string;
  in_production?: boolean;
  poster_path?: string | null;
}

interface TmdbSeasonResponse {
  poster_path?: string | null;
}

const tmdbMediaCache = new SimpleCache<TmdbMediaDetails>(TMDB_CACHE_DURATION);
const tmdbPosterCache = new SimpleCache<string>(TMDB_CACHE_DURATION);

export function isTmdbConfigured(): boolean {
  return Boolean(import.meta.env.TMDB_API_KEY);
}

export function getTmdbPosterUrl(
  posterPath: string,
  size: TmdbPosterSize = "w342",
): string {
  return `${TMDB_IMAGE_BASE_URL}/${size}${posterPath}`;
}

async function requestTmdb<T>(path: string): Promise<T> {
  const apiKey = import.meta.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const url = new URL(`${TMDB_API_BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `TMDB API request failed (${response.status} ${response.statusText})`,
    );
  }

  return response.json() as Promise<T>;
}

function getYearLabel(
  mediaType: TmdbMediaType,
  data: TmdbMediaResponse,
): string | undefined {
  const firstDate =
    mediaType === "movie" ? data.release_date : data.first_air_date;
  const firstYear = firstDate?.slice(0, 4);
  if (!firstYear || mediaType === "movie") return firstYear;

  if (data.in_production) return `${firstYear}-`;

  const lastYear = data.last_air_date?.slice(0, 4);
  return lastYear && lastYear !== firstYear
    ? `${firstYear}-${lastYear}`
    : firstYear;
}

export async function getTmdbMediaDetails(
  mediaType: TmdbMediaType,
  tmdbId: number,
): Promise<TmdbMediaDetails> {
  const cacheKey = `${mediaType}-${tmdbId}`;
  const cached = tmdbMediaCache.get(cacheKey);
  if (cached) return cached;

  const data = await requestTmdb<TmdbMediaResponse>(`/${mediaType}/${tmdbId}`);
  const year = getYearLabel(mediaType, data);
  const details: TmdbMediaDetails = {
    id: data.id,
    title: data.title ?? data.name ?? `TMDB ${tmdbId}`,
    ...(year ? { year } : {}),
    ...(data.poster_path
      ? { posterUrl: getTmdbPosterUrl(data.poster_path) }
      : {}),
  };

  tmdbMediaCache.set(cacheKey, details);
  return details;
}

export async function getTmdbSeasonPoster(
  showId: number,
  seasonNumber: number,
): Promise<string | null> {
  const cacheKey = `tv-${showId}-season-${seasonNumber}`;
  const cached = tmdbPosterCache.get(cacheKey);
  if (cached) return cached;

  const data = await requestTmdb<TmdbSeasonResponse>(
    `/tv/${showId}/season/${seasonNumber}`,
  );
  if (!data.poster_path) return null;

  const posterUrl = getTmdbPosterUrl(data.poster_path);
  tmdbPosterCache.set(cacheKey, posterUrl);
  return posterUrl;
}
