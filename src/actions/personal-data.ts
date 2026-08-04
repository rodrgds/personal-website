import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";

import { SimpleCache } from "../lib/cache";
import { getPersonalDataDirectus } from "../lib/personal-data/directus";
import {
  ACTIVITY_SOURCES,
  ACTIVITY_THRESHOLDS,
  type ActivityDayRow,
  type ActivitySource,
  type MetricSummaryRow,
} from "../lib/personal-data/model";
import { buildActivityCalendar } from "./activity";

interface ActivityResult {
  contributions: ReturnType<typeof buildActivityCalendar>;
  total: number;
  startYear: number;
}

const activityCache = new SimpleCache<ActivityResult>(5 * 60 * 1000, 12);

async function readActivity(source: ActivitySource): Promise<ActivityResult> {
  const directus = getPersonalDataDirectus();
  const summary = await directus.readOne<MetricSummaryRow>(
    "metric_summaries",
    source,
  );
  const rows = await directus.readAll<ActivityDayRow>("activity_days", {
    fields: ["date", "value"],
    filter: { metric: { _eq: source } },
    sort: ["date"],
  });
  const daily = new Map(rows.map((row) => [row.date, row.value]));
  const startYear = summary?.start_date
    ? new Date(`${summary.start_date}T00:00:00Z`).getUTCFullYear()
    : new Date().getUTCFullYear();

  return {
    contributions: buildActivityCalendar(
      daily,
      startYear,
      ACTIVITY_THRESHOLDS[source],
    ),
    total: summary?.total_value ?? 0,
    startYear,
  };
}

export const getActivityData = defineAction({
  input: z.object({
    source: z.enum(ACTIVITY_SOURCES),
    forceRefresh: z.boolean().optional(),
  }),
  handler: async (input) => {
    const cacheKey = `activity:${input.source}`;
    if (!input.forceRefresh) {
      const cached = activityCache.get(cacheKey);
      if (cached) return cached;
    }

    try {
      const result = await activityCache.getOrSet(cacheKey, () =>
        readActivity(input.source),
      );
      return result;
    } catch (error) {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to load stored activity data",
      });
    }
  },
});
