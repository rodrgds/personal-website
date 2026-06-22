import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { lastfmDataCache } from "./cache";

export const getLastfmData = defineAction({
  input: z.object({
    limit: z.number().optional().default(10),
    forceRefresh: z.boolean().optional(),
  }),
  handler: async (input) => {
    const cacheKey = `lastfm-data-${input.limit}`;

    if (!input.forceRefresh) {
      const cached = lastfmDataCache.get(cacheKey);
      if (cached) return cached;
    }

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
      tracksUrl.searchParams.set("limit", input.limit.toString());
      tracksUrl.searchParams.set("extended", "1");

      const tracksResponse = await fetch(tracksUrl.toString());

      if (!tracksResponse.ok) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Last.fm API error: ${tracksResponse.status}`,
        });
      }

      const tracksData = await tracksResponse.json();

      const userUrl = new URL("https://ws.audioscrobbler.com/2.0/");
      userUrl.searchParams.set("method", "user.getInfo");
      userUrl.searchParams.set("user", LASTFM_USERNAME);
      userUrl.searchParams.set("api_key", LASTFM_API_KEY);
      userUrl.searchParams.set("format", "json");

      const userResponse = await fetch(userUrl.toString());

      if (!userResponse.ok) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Last.fm API error: ${userResponse.status}`,
        });
      }

      const userData = await userResponse.json();

      const result = {
        recenttracks: tracksData.recenttracks,
        stats: {
          totalScrobbles: parseInt(userData.user.playcount) || 0,
          registeredDate: userData.user.registered?.unixtime,
        },
      };

      lastfmDataCache.set(cacheKey, result);
      return result;
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
