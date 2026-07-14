import { z } from "astro/zod";

import { SimpleCache } from "./cache";
import { fetchUpstream, parseUpstreamJson } from "./upstream";

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

const tmdbMediaSchema = z.object({
  id: z.number(),
  title: z.string().optional(),
  name: z.string().optional(),
  release_date: z.string().optional(),
  first_air_date: z.string().optional(),
  last_air_date: z.string().optional(),
  in_production: z.boolean().optional(),
  poster_path: z.string().nullable().optional(),
});
const tmdbSeasonSchema = z.object({
  poster_path: z.string().nullable().optional(),
});
type TmdbMediaResponse = z.infer<typeof tmdbMediaSchema>;

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

async function requestTmdb<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  const apiKey = import.meta.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const url = new URL(`${TMDB_API_BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);

  const response = await fetchUpstream(url);
  if (!response.ok) {
    throw new Error(
      `TMDB API request failed (${response.status} ${response.statusText})`,
    );
  }

  return parseUpstreamJson(response, schema, "TMDB");
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
  return tmdbMediaCache.getOrSet(cacheKey, async () => {
    const data = await requestTmdb(`/${mediaType}/${tmdbId}`, tmdbMediaSchema);
    const year = getYearLabel(mediaType, data);
    return {
      id: data.id,
      title: data.title ?? data.name ?? `TMDB ${tmdbId}`,
      ...(year ? { year } : {}),
      ...(data.poster_path
        ? { posterUrl: getTmdbPosterUrl(data.poster_path) }
        : {}),
    };
  });
}

export async function getTmdbSeasonPoster(
  showId: number,
  seasonNumber: number,
): Promise<string | null> {
  const cacheKey = `tv-${showId}-season-${seasonNumber}`;
  const cached = tmdbPosterCache.get(cacheKey);
  if (cached) return cached;

  const data = await requestTmdb(
    `/tv/${showId}/season/${seasonNumber}`,
    tmdbSeasonSchema,
  );
  if (!data.poster_path) return null;

  const posterUrl = getTmdbPosterUrl(data.poster_path);
  tmdbPosterCache.set(cacheKey, posterUrl);
  return posterUrl;
}
