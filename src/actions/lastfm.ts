import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";

import { SimpleCache } from "../lib/cache";
import { getPersonalDataDirectus } from "../lib/personal-data/directus";
import type {
  DataSourceRow,
  MetricSummaryRow,
} from "../lib/personal-data/model";

interface StoredScrobble extends Record<string, unknown> {
  id: string;
  uts: number;
  artist: string;
  artist_mbid: string | null;
  track: string;
  track_mbid: string | null;
  album: string | null;
  album_mbid: string | null;
  url: string | null;
  image_url: string | null;
}

interface LastfmTrack extends Record<string, unknown> {
  name: string;
  url: string;
  artist: { name: string; mbid?: string };
  album: { "#text": string; mbid?: string };
  image?: Array<{ size: string; "#text": string }>;
  date?: { uts: string };
  "@attr"?: { nowplaying?: string };
}

interface LastfmResult {
  recenttracks: { track: LastfmTrack[] };
  stats: { totalScrobbles: number; registeredDate?: string };
}

const lastfmCache = new SimpleCache<LastfmResult>(2 * 60 * 1000, 5);

function sourceState(
  source: DataSourceRow | null,
): Record<string, unknown> | null {
  const rawState: unknown = source?.state;
  if (rawState && typeof rawState === "object") {
    return rawState as Record<string, unknown>;
  }
  if (typeof rawState === "string") {
    try {
      const parsed = JSON.parse(rawState) as unknown;
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function isFreshNowPlaying(source: DataSourceRow | null): LastfmTrack | null {
  const state = sourceState(source);
  if (!state || typeof state !== "object") return null;
  const checkedAt = String(state.nowPlayingCheckedAt ?? "");
  if (Date.now() - new Date(checkedAt).getTime() > 20 * 60_000) return null;
  const track = state.nowPlaying;
  return track && typeof track === "object" ? (track as LastfmTrack) : null;
}

async function readLastfmData(limit: number): Promise<LastfmResult> {
  const directus = getPersonalDataDirectus();
  const [rows, summary, source] = await Promise.all([
    directus.request<StoredScrobble[]>("/items/music_scrobbles", {
      query: {
        fields:
          "id,uts,artist,artist_mbid,track,track_mbid,album,album_mbid,url,image_url",
        sort: "-uts",
        limit,
      },
    }),
    directus.readOne<MetricSummaryRow>("metric_summaries", "music"),
    directus.readOne<DataSourceRow>("data_sources", "lastfm"),
  ]);

  const tracks: LastfmTrack[] = rows.map((row) => ({
    name: row.track,
    url: row.url ?? "",
    artist: {
      name: row.artist,
      ...(row.artist_mbid ? { mbid: row.artist_mbid } : {}),
    },
    album: {
      "#text": row.album ?? "",
      ...(row.album_mbid ? { mbid: row.album_mbid } : {}),
    },
    ...(row.image_url
      ? { image: [{ size: "extralarge", "#text": row.image_url }] }
      : {}),
    date: { uts: String(row.uts) },
  }));
  const nowPlaying = isFreshNowPlaying(source);
  if (nowPlaying) tracks.unshift(nowPlaying);

  const registeredUts = Number(sourceState(source)?.registeredUts ?? 0);
  return {
    recenttracks: { track: tracks.slice(0, limit) },
    stats: {
      totalScrobbles: summary?.total_value ?? 0,
      ...(registeredUts ? { registeredDate: String(registeredUts) } : {}),
    },
  };
}

export const getLastfmData = defineAction({
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().default(10),
    forceRefresh: z.boolean().optional(),
  }),
  handler: async (input) => {
    const key = `lastfm:${input.limit}`;
    if (input.forceRefresh) lastfmCache.clear();
    try {
      return await lastfmCache.getOrSet(key, () => readLastfmData(input.limit));
    } catch (error) {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to load stored Last.fm data",
      });
    }
  },
});
