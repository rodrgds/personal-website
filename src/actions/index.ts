import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";

// Simple in-memory cache with expiration
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class SimpleCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private duration: number;

  constructor(durationMs: number) {
    this.duration = durationMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.duration) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

// Create separate cache instances with different durations
// Hevy data: 3 hours (workout data doesn't change very often)
const hevyDataCache = new SimpleCache<any>(3 * 60 * 60 * 1000);

// Last.fm data: 30 minutes (music listening happens frequently)
const lastfmDataCache = new SimpleCache<any>(30 * 60 * 1000);

// Trakt data: 1 hour (watch history updates regularly but not constantly)
const traktDataCache = new SimpleCache<any>(60 * 60 * 1000);

// TMDB images: 7 days (poster images rarely change)
const tmdbImageCache = new SimpleCache<string>(7 * 24 * 60 * 60 * 1000);

export const server = {
  // Get all Hevy data in one action
  getHevyData: defineAction({
    input: z.object({
      forceRefresh: z.boolean().optional(),
    }),
    handler: async (input) => {
      const cacheKey = "hevy-all-data";

      if (!input.forceRefresh) {
        const cached = hevyDataCache.get(cacheKey);
        if (cached) return cached;
      }

      const HEVY_API_KEY = import.meta.env.HEVY_API_KEY;
      if (!HEVY_API_KEY) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Hevy API key not configured",
        });
      }

      try {
        // 1. Fetch all folders to find "Current" folder
        let allFolders: any[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const response = await fetch(
            `https://api.hevyapp.com/v1/routine_folders?page=${page}&pageSize=10`,
            {
              method: "GET",
              headers: {
                Accept: "application/json",
                "api-key": HEVY_API_KEY,
              },
            },
          );

          if (!response.ok) {
            throw new ActionError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Hevy API error: ${response.status} ${response.statusText}`,
            });
          }

          const data = await response.json();
          allFolders = allFolders.concat(data.routine_folders || []);
          hasMore = data.page < data.page_count;
          page++;
        }

        const currentFolder = allFolders.find(
          (folder) => folder.title.toLowerCase() === "current",
        );

        if (!currentFolder) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: 'No "Current" folder found in Hevy',
          });
        }

        // 2. Fetch all routines from the "Current" folder
        let allRoutines: any[] = [];
        page = 1;
        hasMore = true;

        while (hasMore) {
          const response = await fetch(
            `https://api.hevyapp.com/v1/routines?page=${page}&pageSize=10`,
            {
              method: "GET",
              headers: {
                Accept: "application/json",
                "api-key": HEVY_API_KEY,
              },
            },
          );

          if (!response.ok) {
            throw new ActionError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Hevy API error: ${response.status} ${response.statusText}`,
            });
          }

          const data = await response.json();
          allRoutines = allRoutines.concat(data.routines || []);
          hasMore = data.page < data.page_count;
          page++;
        }

        // Filter by Current folder
        const currentRoutines = allRoutines.filter(
          (routine) => routine.folder_id === currentFolder.id,
        );

        // 3. Fetch workout statistics
        const countResponse = await fetch(
          "https://api.hevyapp.com/v1/workouts/count",
          {
            method: "GET",
            headers: {
              Accept: "application/json",
              "api-key": HEVY_API_KEY,
            },
          },
        );

        if (!countResponse.ok) {
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Hevy API error: ${countResponse.status}`,
          });
        }

        const countData = await countResponse.json();

        // Fetch last 5 workouts
        const workoutsResponse = await fetch(
          "https://api.hevyapp.com/v1/workouts?page=1&pageSize=5",
          {
            method: "GET",
            headers: {
              Accept: "application/json",
              "api-key": HEVY_API_KEY,
            },
          },
        );

        if (!workoutsResponse.ok) {
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Hevy API error: ${workoutsResponse.status}`,
          });
        }

        const workoutsData = await workoutsResponse.json();
        const recentWorkouts = (workoutsData.workouts || [])
          .slice(0, 5)
          .map((workout: any) => ({
            title: workout.title,
            startTime: workout.start_time,
            endTime: workout.end_time,
          }));

        const result = {
          routines: currentRoutines,
          stats: {
            workoutCount: countData.workout_count || 0,
            recentWorkouts,
          },
        };

        hevyDataCache.set(cacheKey, result);
        return result;
      } catch (error) {
        if (error instanceof ActionError) throw error;
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch Hevy data",
        });
      }
    },
  }),

  // Get Last.fm data (recent scrobbles + user stats)
  getLastfmData: defineAction({
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
        // Fetch recent tracks
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

        // Fetch user info for total scrobbles
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
  }),

  // Get Trakt.tv data (watch history + user stats)
  getTraktData: defineAction({
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
      let TRAKT_ACCESS_TOKEN = import.meta.env.TRAKT_ACCESS_TOKEN;
      let TRAKT_REFRESH_TOKEN = import.meta.env.TRAKT_REFRESH_TOKEN;
      const TMDB_API_KEY = import.meta.env.TMDB_API_KEY;

      if (
        !TRAKT_ACCESS_TOKEN ||
        !TRAKT_CLIENT_ID ||
        !TRAKT_CLIENT_SECRET ||
        !TRAKT_REFRESH_TOKEN
      ) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Trakt credentials not configured (need access token, refresh token, client ID, and client secret)",
        });
      }

      // Helper function to refresh the token
      const refreshToken = async () => {
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
            refresh_token: TRAKT_REFRESH_TOKEN,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to refresh Trakt token: ${errorBody || response.statusText}`,
          });
        }

        const tokens = await response.json();
        console.log("✅ Successfully refreshed Trakt tokens");
        console.log(`⚠️  UPDATE YOUR .env WITH THESE NEW VALUES:`);
        console.log(`TRAKT_ACCESS_TOKEN=${tokens.access_token}`);
        console.log(`TRAKT_REFRESH_TOKEN=${tokens.refresh_token}`);
        console.log(
          `Token expires in: ${tokens.expires_in} seconds (${tokens.expires_in / 3600} hours)`,
        );

        return tokens;
      };

      // Helper function to call Trakt API
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
        // Fetch watch history
        const historyUrl = `/users/me/history?limit=${input.limit}&extended=full`;
        let historyResponse = await callTraktAPI(
          TRAKT_ACCESS_TOKEN,
          historyUrl,
        );

        // If 401, refresh and retry
        if (historyResponse.status === 401) {
          console.log("⚠️  Access token expired, refreshing...");
          const tokens = await refreshToken();
          TRAKT_ACCESS_TOKEN = tokens.access_token;
          historyResponse = await callTraktAPI(TRAKT_ACCESS_TOKEN, historyUrl);
        }

        if (!historyResponse.ok) {
          const errorBody = await historyResponse.text();
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Trakt API error ${historyResponse.status}: ${errorBody || historyResponse.statusText}`,
          });
        }

        const historyData = await historyResponse.json();

        // Fetch user stats
        let statsResponse = await callTraktAPI(
          TRAKT_ACCESS_TOKEN,
          "/users/me/stats",
        );

        if (statsResponse.status === 401) {
          const tokens = await refreshToken();
          TRAKT_ACCESS_TOKEN = tokens.access_token;
          statsResponse = await callTraktAPI(
            TRAKT_ACCESS_TOKEN,
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

        // Collect unique TMDB IDs to avoid duplicate fetches
        const uniqueMovieIds = new Set<number>();
        const uniqueShowIds = new Set<number>();

        historyData.forEach((item: any) => {
          if (item.type === "movie" && item.movie?.ids?.tmdb) {
            uniqueMovieIds.add(item.movie.ids.tmdb);
          } else if (item.type === "episode" && item.show?.ids?.tmdb) {
            uniqueShowIds.add(item.show.ids.tmdb);
          }
        });

        // Fetch TMDB data for unique IDs with caching
        const tmdbCache = new Map<string, string>();

        if (TMDB_API_KEY) {
          const movieFetches = Array.from(uniqueMovieIds).map(
            async (tmdbId) => {
              const cacheKey = `tmdb-movie-${tmdbId}`;
              const cached = tmdbImageCache.get(cacheKey);
              if (cached) {
                tmdbCache.set(`movie-${tmdbId}`, cached);
                return;
              }

              try {
                const tmdbUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`;
                const tmdbResponse = await fetch(tmdbUrl);
                if (tmdbResponse.ok) {
                  const tmdbData = await tmdbResponse.json();
                  if (tmdbData.poster_path) {
                    const posterUrl = `https://image.tmdb.org/t/p/w342${tmdbData.poster_path}`;
                    tmdbCache.set(`movie-${tmdbId}`, posterUrl);
                    tmdbImageCache.set(cacheKey, posterUrl);
                  }
                }
              } catch (e) {
                // Ignore image fetch errors
              }
            },
          );

          const showFetches = Array.from(uniqueShowIds).map(async (tmdbId) => {
            const cacheKey = `tmdb-show-${tmdbId}`;
            const cached = tmdbImageCache.get(cacheKey);
            if (cached) {
              tmdbCache.set(`show-${tmdbId}`, cached);
              return;
            }

            try {
              const tmdbUrl = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}`;
              const tmdbResponse = await fetch(tmdbUrl);
              if (tmdbResponse.ok) {
                const tmdbData = await tmdbResponse.json();
                if (tmdbData.poster_path) {
                  const posterUrl = `https://image.tmdb.org/t/p/w342${tmdbData.poster_path}`;
                  tmdbCache.set(`show-${tmdbId}`, posterUrl);
                  tmdbImageCache.set(cacheKey, posterUrl);
                }
              }
            } catch (e) {
              // Ignore image fetch errors
            }
          });

          await Promise.all([...movieFetches, ...showFetches]);
        }

        // Map cached images to history items
        const historyWithImages = historyData.map((item: any) => {
          let posterPath = null;

          if (item.type === "movie" && item.movie?.ids?.tmdb) {
            posterPath = tmdbCache.get(`movie-${item.movie.ids.tmdb}`) || null;
          } else if (item.type === "episode" && item.show?.ids?.tmdb) {
            posterPath = tmdbCache.get(`show-${item.show.ids.tmdb}`) || null;
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
            error instanceof Error
              ? error.message
              : "Failed to fetch Trakt data",
        });
      }
    },
  }),
};
