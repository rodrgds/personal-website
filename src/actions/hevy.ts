import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";

import { SimpleCache } from "../lib/cache";
import { getPersonalDataDirectus } from "../lib/personal-data/directus";

interface StoredRoutine extends Record<string, unknown> {
  id: string;
  folder_title: string | null;
  payload: Record<string, unknown>;
}

interface StoredWorkout extends Record<string, unknown> {
  id: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
}

interface HevyResult {
  routines: Record<string, unknown>[];
  stats: {
    workoutCount: number;
    recentWorkouts: Array<{
      title: string;
      startTime: string;
      endTime: string;
    }>;
  };
}

const hevyCache = new SimpleCache<HevyResult>(5 * 60 * 1000, 1);

function parseRoutinePayload(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object") {
    return payload as Record<string, unknown>;
  }
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

async function readHevyData(): Promise<HevyResult> {
  const directus = getPersonalDataDirectus();
  const routines = await directus.readAll<StoredRoutine>("routines", {
    fields: ["id", "folder_title", "payload"],
  });
  const currentRoutines = routines
    .filter((routine) => routine.folder_title?.toLowerCase() === "current")
    .map((routine) => parseRoutinePayload(routine.payload))
    .filter((routine) => typeof routine.id === "string");

  const recentWorkouts = await directus.request<StoredWorkout[]>(
    "/items/workouts",
    {
      query: {
        fields: "id,title,start_time,end_time",
        filter: { deleted_at: { _null: true } },
        sort: "-start_time",
        limit: 5,
      },
    },
  );
  const aggregate = await directus.request<
    Array<{ count?: { id?: number | string } }>
  >("/items/workouts", {
    query: {
      "aggregate[count]": "id",
      filter: { deleted_at: { _null: true } },
    },
  });

  return {
    routines: currentRoutines,
    stats: {
      workoutCount: Number(aggregate[0]?.count?.id ?? 0),
      recentWorkouts: recentWorkouts
        .filter((workout) => workout.start_time && workout.end_time)
        .map((workout) => ({
          title: workout.title ?? "Workout",
          startTime: workout.start_time as string,
          endTime: workout.end_time as string,
        })),
    },
  };
}

export const getHevyData = defineAction({
  input: z.object({ forceRefresh: z.boolean().optional() }),
  handler: async (input) => {
    if (input.forceRefresh) hevyCache.clear();
    try {
      return await hevyCache.getOrSet("hevy-data", readHevyData);
    } catch (error) {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to load stored Hevy data",
      });
    }
  },
});
