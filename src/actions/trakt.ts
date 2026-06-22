import { readSingleton, updateSingleton } from "@directus/sdk";
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";

import { directusClient } from "../lib/directus";
import { getTmdbMediaDetails, getTmdbSeasonPoster } from "../lib/tmdb";
import { traktDataCache } from "./cache";

export const getTraktData = defineAction({
  input: z.object({
    limit: z.number().optional().default(10),
    forceRefresh: z.boolean().optional(),
  }),
  handler: async (input) => {
    const cacheKey = `trakt-data-${input.limit}`;

    if (!input.forceRefresh) {
      const cached = traktDataCache.get(cacheKey);
      if (cached) return cached;
    }

    const TRAKT_CLIENT_ID = import.meta.env.TRAKT_CLIENT_ID;
    const TRAKT_CLIENT_SECRET = import.meta.env.TRAKT_CLIENT_SECRET;

    let tokens = await directusClient.request(readSingleton("trakt_tokens"));

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Trakt tokens not found in database. Please authenticate first.",
      });
    }

    const refreshToken = async () => {
      try {
        const response = await fetch("https://api.trakt.tv/oauth/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: TRAKT_CLIENT_ID,
            client_secret: TRAKT_CLIENT_SECRET,
            grant_type: "refresh_token",
            redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
            refresh_token: tokens.refresh_token,
          }),
        });

        if (!response.ok) {
          let errorBody = "";
          try {
            errorBody = await response.text();
          } catch {
            errorBody = response.statusText;
          }

          console.error(
            `Failed to refresh Trakt token: ${response.status} - ${errorBody}`,
          );
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Token refresh failed (${response.status}). Please check your Trakt credentials.`,
          });
        }

        const newTokens = await response.json();

        const expiresAt = new Date(
          Date.now() + newTokens.expires_in * 1000,
        ).toISOString();

        await directusClient.request(
          updateSingleton("trakt_tokens", {
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token,
            expires_at: expiresAt,
            token_type: newTokens.token_type,
            scope: newTokens.scope,
          }),
        );

        console.log("Tokens automatically refreshed and saved to Directus");
        console.log(
          `Token expires in: ${newTokens.expires_in} seconds (${newTokens.expires_in / 3600} hours)`,
        );

        tokens.access_token = newTokens.access_token;
        tokens.refresh_token = newTokens.refresh_token;

        return newTokens;
      } catch (error) {
        if (error instanceof ActionError) throw error;

        console.error("Network error refreshing Trakt token:", error);
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Network error connecting to Trakt. Please try again later.",
        });
      }
    };

    const callTraktAPI = async (accessToken: string, endpoint: string) => {
      return fetch(`https://api.trakt.tv${endpoint}`, {
        headers: {
          Accept: "application/json",
          "trakt-api-version": "2",
          "trakt-api-key": TRAKT_CLIENT_ID,
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "PersonalWebsite/1.0",
        },
      });
    };

    try {
      const historyUrl = `/users/me/history?limit=${input.limit}&extended=full`;
      let historyResponse = await callTraktAPI(tokens.access_token, historyUrl);

      if (historyResponse.status === 401) {
        console.log("Token expired, auto-refreshing from Directus...");
        await refreshToken();
        historyResponse = await callTraktAPI(tokens.access_token, historyUrl);
      }

      if (!historyResponse.ok) {
        const errorBody = await historyResponse.text();
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Trakt API error ${historyResponse.status}: ${errorBody || historyResponse.statusText}`,
        });
      }

      const historyData = await historyResponse.json();

      let statsResponse = await callTraktAPI(
        tokens.access_token,
        "/users/me/stats",
      );

      if (statsResponse.status === 401) {
        await refreshToken();
        statsResponse = await callTraktAPI(
          tokens.access_token,
          "/users/me/stats",
        );
      }

      if (!statsResponse.ok) {
        const errorBody = await statsResponse.text();
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Trakt API error ${statsResponse.status}: ${errorBody || statsResponse.statusText}`,
        });
      }

      const statsData = await statsResponse.json();

      const uniqueMovieIds = new Set<number>();
      const uniqueShowSeasons = new Map<number, Set<number>>();

      historyData.forEach((item: any) => {
        if (item.type === "movie" && item.movie?.ids?.tmdb) {
          uniqueMovieIds.add(item.movie.ids.tmdb);
        } else if (
          item.type === "episode" &&
          item.show?.ids?.tmdb &&
          item.episode?.season
        ) {
          if (!uniqueShowSeasons.has(item.show.ids.tmdb)) {
            uniqueShowSeasons.set(item.show.ids.tmdb, new Set());
          }
          uniqueShowSeasons.get(item.show.ids.tmdb)!.add(item.episode.season);
        }
      });

      const tmdbCache = new Map<string, string>();
      const movieFetches = Array.from(uniqueMovieIds).map(async (tmdbId) => {
        try {
          const details = await getTmdbMediaDetails("movie", tmdbId);
          if (details.posterUrl) {
            tmdbCache.set(`movie-${tmdbId}`, details.posterUrl);
          }
        } catch {
          // A missing poster should not prevent watch history from loading.
        }
      });

      const showFetches = [];
      for (const [showId, seasons] of uniqueShowSeasons.entries()) {
        for (const seasonNumber of seasons) {
          showFetches.push(
            (async () => {
              try {
                const posterUrl = await getTmdbSeasonPoster(
                  showId,
                  seasonNumber,
                );
                if (posterUrl) {
                  tmdbCache.set(
                    `show-${showId}-season-${seasonNumber}`,
                    posterUrl,
                  );
                }
              } catch {
                // A missing poster should not prevent watch history from loading.
              }
            })(),
          );
        }
      }

      await Promise.all([...movieFetches, ...showFetches]);

      const historyWithImages = historyData.map((item: any) => {
        let posterPath = null;

        if (item.type === "movie" && item.movie?.ids?.tmdb) {
          posterPath = tmdbCache.get(`movie-${item.movie.ids.tmdb}`) || null;
        } else if (
          item.type === "episode" &&
          item.show?.ids?.tmdb &&
          item.episode?.season
        ) {
          posterPath =
            tmdbCache.get(
              `show-${item.show.ids.tmdb}-season-${item.episode.season}`,
            ) || null;
        }

        return {
          ...item,
          posterPath,
        };
      });

      const result = {
        history: historyWithImages,
        stats: {
          movies: {
            watched: statsData.movies?.watched || 0,
            plays: statsData.movies?.plays || 0,
          },
          episodes: {
            watched: statsData.episodes?.watched || 0,
            plays: statsData.episodes?.plays || 0,
          },
          shows: {
            watched: statsData.shows?.watched || 0,
          },
        },
      };

      traktDataCache.set(cacheKey, result);
      return result;
    } catch (error) {
      if (error instanceof ActionError) throw error;
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to fetch Trakt data",
      });
    }
  },
});
