import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";

import { fetchUpstream, parseUpstreamJson } from "../lib/upstream";
import { lastfmDataCache } from "./cache";

const recentTracksSchema = z.object({
  recenttracks: z.looseObject({
    track: z.array(
      z.looseObject({
        name: z.string(),
        url: z.string(),
        artist: z.looseObject({ name: z.string() }),
        album: z.looseObject({ "#text": z.string() }),
        date: z.looseObject({ uts: z.string() }).optional(),
        "@attr": z
          .looseObject({ nowplaying: z.string().optional() })
          .optional(),
      }),
    ),
  }),
});
const lastfmUserSchema = z.object({
  user: z.looseObject({
    playcount: z.string(),
    registered: z.looseObject({ unixtime: z.string() }).optional(),
  }),
});

type LastfmResult = {
  recenttracks: z.infer<typeof recentTracksSchema>["recenttracks"];
  stats: { totalScrobbles: number; registeredDate?: string };
};

function limitLastfmResult(result: LastfmResult, limit: number): LastfmResult {
  return {
    ...result,
    recenttracks: {
      ...result.recenttracks,
      track: result.recenttracks.track.slice(0, limit),
    },
  };
}

export const getLastfmData = defineAction({
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().default(10),
    // Retained for wire compatibility; public callers cannot bypass the cache.
    forceRefresh: z.boolean().optional(),
  }),
  handler: async (input) => {
    const cacheKey = "lastfm-data";

    const cached = lastfmDataCache.get(cacheKey) as LastfmResult | null;
    if (cached) return limitLastfmResult(cached, input.limit);

    const LASTFM_API_KEY = import.meta.env.LASTFM_API_KEY;
    const LASTFM_USERNAME = import.meta.env.LASTFM_USERNAME;

    if (!LASTFM_API_KEY || !LASTFM_USERNAME) {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Last.fm credentials not configured",
      });
    }

    try {
      const tracksUrl = new URL("https://ws.audioscrobbler.com/2.0/");
      tracksUrl.searchParams.set("method", "user.getRecentTracks");
      tracksUrl.searchParams.set("user", LASTFM_USERNAME);
      tracksUrl.searchParams.set("api_key", LASTFM_API_KEY);
      tracksUrl.searchParams.set("format", "json");
      tracksUrl.searchParams.set("limit", "100");
      tracksUrl.searchParams.set("extended", "1");

      const result = (await lastfmDataCache.getOrSet(cacheKey, async () => {
        const tracksResponse = await fetchUpstream(tracksUrl);

        if (!tracksResponse.ok) {
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Last.fm API error: ${tracksResponse.status}`,
          });
        }

        const tracksData = await parseUpstreamJson(
          tracksResponse,
          recentTracksSchema,
          "Last.fm",
        );

        const userUrl = new URL("https://ws.audioscrobbler.com/2.0/");
        userUrl.searchParams.set("method", "user.getInfo");
        userUrl.searchParams.set("user", LASTFM_USERNAME);
        userUrl.searchParams.set("api_key", LASTFM_API_KEY);
        userUrl.searchParams.set("format", "json");

        const userResponse = await fetchUpstream(userUrl);

        if (!userResponse.ok) {
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Last.fm API error: ${userResponse.status}`,
          });
        }

        const userData = await parseUpstreamJson(
          userResponse,
          lastfmUserSchema,
          "Last.fm",
        );

        const result = {
          recenttracks: tracksData.recenttracks,
          stats: {
            totalScrobbles: parseInt(userData.user.playcount) || 0,
            registeredDate: userData.user.registered?.unixtime,
          },
        };

        return result;
      })) as LastfmResult;

      return limitLastfmResult(result, input.limit);
    } catch (error) {
      if (error instanceof ActionError) throw error;
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch Last.fm data",
      });
    }
  },
});
