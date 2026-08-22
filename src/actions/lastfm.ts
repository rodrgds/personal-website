import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";

import { SimpleCache } from "../lib/cache";
import type { JsonObject } from "../lib/json";
import { getPersonalDataDirectus } from "../lib/personal-data/directus";
import type {
  DataSourceRow,
  MetricSummaryRow,
} from "../lib/personal-data/model";

interface StoredScrobble extends JsonObject {
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

interface LastfmTrack {
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

/** Fields the sync job stores in the data_sources row state. */
const lastfmStateSchema = z.looseObject({
  nowPlayingCheckedAt: z.string().optional(),
  nowPlaying: z
    .looseObject({
      name: z.string(),
      url: z.string(),
      artist: z.looseObject({ name: z.string() }),
      album: z.looseObject({ "#text": z.string() }),
    })
    .optional(),
  registeredUts: z.number().optional(),
});

function isFreshNowPlaying(source: DataSourceRow | null): LastfmTrack | null {
  const parsed = lastfmStateSchema.safeParse(source?.state ?? {});
  if (!parsed.success) return null;

  const state = parsed.data;
  const checkedAt = state.nowPlayingCheckedAt ?? "";
  if (Date.now() - new Date(checkedAt).getTime() > 20 * 60_000) return null;
  // SAFETY: the zod schema above validated the now-playing track fields;
  // LastfmTrack only adds optional passthrough fields on top of them.
  return (state.nowPlaying as LastfmTrack | undefined) ?? null;
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

  const tracks: LastfmTrack[] = rows.map((row) => {
    const artist: LastfmTrack["artist"] = { name: row.artist };
    if (row.artist_mbid) artist.mbid = row.artist_mbid;
    const album: LastfmTrack["album"] = { "#text": row.album ?? "" };
    if (row.album_mbid) album.mbid = row.album_mbid;

    const track: LastfmTrack = {
      name: row.track,
      url: row.url ?? "",
      artist,
      album,
      date: { uts: String(row.uts) },
    };
    if (row.image_url) {
      track.image = [{ size: "extralarge", "#text": row.image_url }];
    }
    return track;
  });
  const nowPlaying = isFreshNowPlaying(source);
  if (nowPlaying) tracks.unshift(nowPlaying);

  const registeredUts =
    lastfmStateSchema.safeParse(source?.state ?? {}).data?.registeredUts ?? 0;
  const stats: LastfmResult["stats"] = {
    totalScrobbles: summary?.total_value ?? 0,
  };
  if (registeredUts) stats.registeredDate = String(registeredUts);
  return {
    recenttracks: { track: tracks.slice(0, limit) },
    stats,
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
