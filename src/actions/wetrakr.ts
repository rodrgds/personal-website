// What I have been watching, from my public WeTrakr profile. Only the app key
// is needed (WETRAKR_CLIENT_ID, read at runtime): the profile and its watched
// lists are public. Posters come from TMDB.
import { ActionError, defineAction } from "astro:actions";
import { WETRAKR_CLIENT_ID } from "astro:env/server";
import { z } from "astro/zod";

import { SimpleCache } from "../lib/cache";
import {
  getTmdbMediaDetails,
  getTmdbPosterUrl,
  isTmdbConfigured,
} from "../lib/tmdb";

const API = "https://api.wetrakr.com";
const USERNAME = "rodrgds";
/** How many of each kind to read; the newest of both make the list. */
const RECENT = 40;

const tmdbIds = z.looseObject({ tmdb: z.number().nullish() }).optional();

const profileSchema = z.looseObject({
  id: z.number(),
  activity: z.looseObject({
    watch_time: z.looseObject({
      all: z.looseObject({
        minutes: z.number(),
        movies_watched: z.number(),
        episodes_watched: z.number(),
      }),
    }),
  }),
});

const trackingSchema = z
  .looseObject({ watched_at_unknown: z.boolean().optional() })
  .optional();

const movieSchema = z.looseObject({
  id: z.number(),
  title: z.string(),
  release_date: z.string().nullish(),
  watched_at: z.string().nullish(),
  ids: tmdbIds,
  user_tracking: trackingSchema,
});

const episodeSchema = z.looseObject({
  id: z.number(),
  season_number: z.number(),
  number: z.number(),
  watched_at: z.string().nullish(),
  season_poster_path: z.string().nullish(),
  show: z.looseObject({ id: z.number(), title: z.string(), ids: tmdbIds }),
  user_tracking: trackingSchema,
});

const ratingSchema = z.looseObject({
  id: z.number(),
  user_rating: z.looseObject({ rating: z.number() }).nullish(),
});

type Movie = z.infer<typeof movieSchema>;
type Episode = z.infer<typeof episodeSchema>;

export interface WatchItem {
  kind: "film" | "episodes";
  key: string;
  title: string;
  /** The year for a film; the episode, or the run of them, for a show. */
  detail: string;
  /** Episodes of the same show watched in a row on the same day. */
  count: number;
  watchedAt: string;
  rating: number | null;
  thumb: string | null;
  poster: string | null;
}

export interface WatchHistory {
  items: WatchItem[];
  films: number;
  episodes: number;
  hours: number;
}

const cache = new SimpleCache<WatchHistory>(10 * 60 * 1000, 2);

async function request<T extends z.ZodType>(
  path: string,
  schema: T,
): Promise<z.infer<T>> {
  if (!WETRAKR_CLIENT_ID)
    throw new Error("WETRAKR_CLIENT_ID is not configured");
  const response = await fetch(new URL(path, API), {
    headers: {
      Accept: "application/json",
      "User-Agent": "rgo.pt/1.0 (+https://rgo.pt)",
      "wetrakr-api-key": WETRAKR_CLIENT_ID,
      "wetrakr-api-version": "1",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`WeTrakr request failed (${response.status})`);
  }
  return schema.parse(await response.json());
}

function lisbonDay(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

const pad = (value: number): string => String(value).padStart(2, "0");

function smaller(url: string | null): string | null {
  return url ? url.replace("/w342/", "/w185/") : null;
}

async function moviePoster(movie: Movie): Promise<string | null> {
  const tmdb = movie.ids?.tmdb;
  if (!tmdb || !isTmdbConfigured()) return null;
  try {
    return (await getTmdbMediaDetails("movie", tmdb)).posterUrl ?? null;
  } catch {
    return null;
  }
}

/** Runs of the same show on the same day become one row. */
function episodeRuns(episodes: Episode[]): WatchItem[] {
  const items: WatchItem[] = [];
  let run: Episode[] = [];
  const flush = (): void => {
    const latest = run[0];
    const earliest = run.at(-1);
    if (!latest || !earliest || !latest.watched_at) return;
    const first = `s${pad(earliest.season_number)}e${pad(earliest.number)}`;
    const last =
      earliest.season_number === latest.season_number
        ? `e${pad(latest.number)}`
        : `s${pad(latest.season_number)}e${pad(latest.number)}`;
    const poster = latest.season_poster_path
      ? getTmdbPosterUrl(latest.season_poster_path)
      : null;
    items.push({
      kind: "episodes",
      key: `episode-${latest.id}`,
      title: latest.show.title,
      detail: run.length > 1 ? `${first}-${last}` : first,
      count: run.length,
      watchedAt: latest.watched_at,
      rating: null,
      thumb: smaller(poster),
      poster,
    });
    run = [];
  };
  for (const episode of episodes) {
    const previous = run[0];
    if (
      previous?.watched_at &&
      episode.watched_at &&
      (previous.show.id !== episode.show.id ||
        lisbonDay(previous.watched_at) !== lisbonDay(episode.watched_at))
    ) {
      flush();
    }
    run.push(episode);
  }
  flush();
  return items;
}

async function loadHistory(): Promise<WatchHistory> {
  const profile = await request(`/users/${USERNAME}`, profileSchema);
  const base = `/users/${profile.id}`;
  const [movies, episodes, ratings] = await Promise.all([
    request(
      `${base}/tracking/watched/movies?limit=${RECENT}`,
      z.array(movieSchema),
    ),
    request(
      `${base}/tracking/watched/episodes?limit=${RECENT}`,
      z.array(episodeSchema),
    ),
    Promise.all(
      [1, 2].map((page) =>
        request(
          `${base}/ratings/movies?limit=100&page=${page}`,
          z.array(ratingSchema),
        ),
      ),
    ).then((pages) => pages.flat()),
  ]);
  const scores = new Map(
    ratings.map((entry) => [entry.id, entry.user_rating?.rating ?? null]),
  );
  const known = <T extends Movie | Episode>(item: T): boolean =>
    Boolean(item.watched_at) && item.user_tracking?.watched_at_unknown !== true;

  const films = await Promise.all(
    movies.filter(known).map(async (movie): Promise<WatchItem> => {
      const poster = await moviePoster(movie);
      return {
        kind: "film",
        key: `film-${movie.id}`,
        title: movie.title,
        detail: movie.release_date?.slice(0, 4) ?? "",
        count: 1,
        watchedAt: movie.watched_at ?? "",
        rating: scores.get(movie.id) ?? null,
        thumb: smaller(poster),
        poster,
      };
    }),
  );
  const items = [...films, ...episodeRuns(episodes.filter(known))]
    .toSorted((a, b) => b.watchedAt.localeCompare(a.watchedAt))
    .slice(0, RECENT);
  const all = profile.activity.watch_time.all;
  return {
    items,
    films: all.movies_watched,
    episodes: all.episodes_watched,
    hours: Math.round(all.minutes / 60),
  };
}

export const getWatchHistory = defineAction({
  input: z.object({}).optional(),
  handler: async (): Promise<WatchHistory> => {
    try {
      return await cache.getOrSet("history", loadHistory);
    } catch (error) {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error ? error.message : "Could not load WeTrakr",
      });
    }
  },
});
