import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";

import { SimpleCache } from "../lib/cache";
import {
  HEVY_MUSCLE_GROUPS,
  HEVY_MUSCLE_LABELS,
  isHevyMuscleGroup,
  muscleTrainingLevel,
  type HevyMuscleGroup,
  type MuscleTraining,
} from "../lib/hevy-muscles";
import {
  isJsonObject,
  isJsonString,
  parseJson,
  type JsonObject,
  type JsonValue,
} from "../lib/json";
import {
  DirectusError,
  getPersonalDataDirectus,
  type PersonalDataDirectus,
} from "../lib/personal-data/directus";

const MUSCLE_PERIOD_DAYS = 84;

interface StoredRoutine extends JsonObject {
  id: string;
  folder_title: string | null;
  payload: JsonObject | string;
}

interface StoredWorkout extends JsonObject {
  id: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
}

interface StoredWorkoutPayload extends JsonObject {
  payload: JsonObject | string;
}

interface StoredExerciseTemplate extends JsonObject {
  id: string;
  primary_muscle_group: string;
  secondary_muscle_groups: JsonValue;
}

interface MuscleStats {
  available: boolean;
  muscles: MuscleTraining[];
}

interface HevyResult {
  routines: JsonObject[];
  stats: {
    workoutCount: number;
    recentWorkouts: Array<{
      title: string;
      startTime: string;
      endTime: string;
    }>;
    musclePeriodDays: number;
    muscleDataAvailable: boolean;
    muscles: MuscleTraining[];
  };
}

const hevyCache = new SimpleCache<HevyResult>(5 * 60 * 1000, 1);

/** Routine payloads are stored as JSON objects; older rows may hold text. */
function parseRoutinePayload(payload: JsonObject | string): JsonObject {
  if (isJsonObject(payload)) return payload;

  const parsed = parseJson(payload);
  return isJsonObject(parsed) ? parsed : {};
}

function readObjects(value: JsonValue | undefined): JsonObject[] {
  return Array.isArray(value) ? value.filter(isJsonObject) : [];
}

function readStrings(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter(isJsonString) : [];
}

function parseWorkoutPayload(payload: JsonObject | string): JsonObject {
  if (isJsonObject(payload)) return payload;

  const parsed = parseJson(payload);
  return isJsonObject(parsed) ? parsed : {};
}

function musclePeriodStart(now = new Date()): Date {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (MUSCLE_PERIOD_DAYS - 1));
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function aggregateMuscleTraining(
  workouts: StoredWorkoutPayload[],
  templates: StoredExerciseTemplate[],
): MuscleTraining[] {
  const templateMuscles = new Map<
    string,
    { primary: HevyMuscleGroup | null; secondary: HevyMuscleGroup[] }
  >();

  for (const template of templates) {
    templateMuscles.set(template.id, {
      primary: isHevyMuscleGroup(template.primary_muscle_group)
        ? template.primary_muscle_group
        : null,
      secondary: readStrings(template.secondary_muscle_groups).filter(
        isHevyMuscleGroup,
      ),
    });
  }

  const exposures = new Map<HevyMuscleGroup, number>();
  const workoutCounts = new Map<HevyMuscleGroup, number>();

  for (const workout of workouts) {
    const workoutExposure = new Map<HevyMuscleGroup, number>();
    const payload = parseWorkoutPayload(workout.payload);

    for (const exercise of readObjects(payload.exercises)) {
      const templateId = exercise.exercise_template_id;
      if (!isJsonString(templateId)) continue;

      const muscles = templateMuscles.get(templateId);
      if (!muscles) continue;

      if (muscles.primary) workoutExposure.set(muscles.primary, 1);
      for (const secondary of muscles.secondary) {
        workoutExposure.set(
          secondary,
          Math.max(workoutExposure.get(secondary) ?? 0, 0.5),
        );
      }
    }

    for (const [group, exposure] of workoutExposure) {
      exposures.set(group, (exposures.get(group) ?? 0) + exposure);
      workoutCounts.set(group, (workoutCounts.get(group) ?? 0) + 1);
    }
  }

  const maximumExposure = Math.max(0, ...exposures.values());

  return HEVY_MUSCLE_GROUPS.map((group) => {
    const exposure = exposures.get(group) ?? 0;
    return {
      group,
      label: HEVY_MUSCLE_LABELS[group],
      exposure,
      workouts: workoutCounts.get(group) ?? 0,
      level: muscleTrainingLevel(exposure, maximumExposure),
    };
  });
}

async function readMuscleStats(
  directus: PersonalDataDirectus,
): Promise<MuscleStats> {
  const muscleWorkouts = await directus.readAll<StoredWorkoutPayload>(
    "workouts",
    {
      fields: ["payload"],
      filter: {
        deleted_at: { _null: true },
        start_time: { _gte: musclePeriodStart().toISOString() },
      },
    },
  );

  try {
    const templates = await directus.readAll<StoredExerciseTemplate>(
      "exercise_templates",
      {
        fields: ["id", "primary_muscle_group", "secondary_muscle_groups"],
      },
    );
    return {
      available: templates.length > 0,
      muscles: aggregateMuscleTraining(muscleWorkouts, templates),
    };
  } catch (error) {
    if (
      error instanceof DirectusError &&
      (error.status === 403 || error.status === 404)
    ) {
      return {
        available: false,
        muscles: aggregateMuscleTraining([], []),
      };
    }
    throw error;
  }
}

async function readHevyData(): Promise<HevyResult> {
  const directus = getPersonalDataDirectus();
  const routines = await directus.readAll<StoredRoutine>("routines", {
    fields: ["id", "folder_title", "payload"],
  });
  const currentRoutines = routines
    .filter((routine) => routine.folder_title?.toLowerCase() === "current")
    .map((routine) => parseRoutinePayload(routine.payload))
    .filter((routine) => isJsonString(routine.id));

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
  const muscleStats = await readMuscleStats(directus);

  return {
    routines: currentRoutines,
    stats: {
      workoutCount: Number(aggregate[0]?.count?.id ?? 0),
      recentWorkouts: recentWorkouts.flatMap((workout) => {
        if (!workout.start_time || !workout.end_time) return [];
        return [
          {
            title: workout.title ?? "Workout",
            startTime: workout.start_time,
            endTime: workout.end_time,
          },
        ];
      }),
      musclePeriodDays: MUSCLE_PERIOD_DAYS,
      muscleDataAvailable: muscleStats.available,
      muscles: muscleStats.muscles,
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
