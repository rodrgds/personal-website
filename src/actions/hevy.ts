import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { hevyDataCache } from "./cache";

export const getHevyData = defineAction({
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

      const currentRoutines = allRoutines.filter(
        (routine) => routine.folder_id === currentFolder.id,
      );

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
          error instanceof Error ? error.message : "Failed to fetch Hevy data",
      });
    }
  },
});
