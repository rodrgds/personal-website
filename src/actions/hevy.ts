import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";

import { fetchUpstream, parseUpstreamJson } from "../lib/upstream";
import { hevyDataCache } from "./cache";

const hevySetSchema = z.looseObject({
  index: z.number(),
  type: z.string(),
  weight_kg: z.number().nullable().optional(),
  reps: z.number().nullable().optional(),
  distance_meters: z.number().nullable().optional(),
  duration_seconds: z.number().nullable().optional(),
  rpe: z.number().nullable().optional(),
});

const hevyRoutineSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  folder_id: z.number().nullable().optional(),
  exercises: z
    .array(
      z.looseObject({
        exercise_template_id: z.string(),
        title: z.string(),
        notes: z.string().nullable().optional(),
        sets: z.array(hevySetSchema),
        rest_seconds: z.number().nullable().optional(),
      }),
    )
    .default([]),
});

const folderPageSchema = z.object({
  page: z.number().int().positive(),
  page_count: z.number().int().nonnegative(),
  routine_folders: z.array(
    z.looseObject({ id: z.number(), title: z.string() }),
  ),
});
const routinePageSchema = z.object({
  page: z.number().int().positive(),
  page_count: z.number().int().nonnegative(),
  routines: z.array(hevyRoutineSchema),
});
const workoutCountSchema = z.object({
  workout_count: z.number().int().nonnegative(),
});
const workoutsSchema = z.object({
  workouts: z.array(
    z.looseObject({
      title: z.string(),
      start_time: z.string(),
      end_time: z.string(),
    }),
  ),
});

type HevyResult = {
  routines: z.infer<typeof hevyRoutineSchema>[];
  stats: {
    workoutCount: number;
    recentWorkouts: Array<{
      title: string;
      startTime: string;
      endTime: string;
    }>;
  };
};

export const getHevyData = defineAction({
  input: z.object({
    forceRefresh: z.boolean().optional(),
  }),
  handler: async (_input) => {
    const cacheKey = "hevy-all-data";

    const cached = hevyDataCache.get(cacheKey) as HevyResult | null;
    if (cached) return cached;

    const HEVY_API_KEY = import.meta.env.HEVY_API_KEY;
    if (!HEVY_API_KEY) {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Hevy API key not configured",
      });
    }

    try {
      return (await hevyDataCache.getOrSet(cacheKey, async () => {
        let allFolders: z.infer<typeof folderPageSchema>["routine_folders"] =
          [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const response = await fetchUpstream(
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

          const data = await parseUpstreamJson(
            response,
            folderPageSchema,
            "Hevy",
          );
          allFolders = allFolders.concat(data.routine_folders);
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

        let allRoutines: z.infer<typeof hevyRoutineSchema>[] = [];
        page = 1;
        hasMore = true;

        while (hasMore) {
          const response = await fetchUpstream(
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

          const data = await parseUpstreamJson(
            response,
            routinePageSchema,
            "Hevy",
          );
          allRoutines = allRoutines.concat(data.routines);
          hasMore = data.page < data.page_count;
          page++;
        }

        const currentRoutines = allRoutines.filter(
          (routine) => routine.folder_id === currentFolder.id,
        );

        const countResponse = await fetchUpstream(
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

        const countData = await parseUpstreamJson(
          countResponse,
          workoutCountSchema,
          "Hevy",
        );

        const workoutsResponse = await fetchUpstream(
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

        const workoutsData = await parseUpstreamJson(
          workoutsResponse,
          workoutsSchema,
          "Hevy",
        );
        const recentWorkouts = workoutsData.workouts
          .slice(0, 5)
          .map((workout) => ({
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

        return result;
      })) as HevyResult;
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
