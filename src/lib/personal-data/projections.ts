import type { PersonalDataDirectus } from "./directus";
import type { ActivityDayRow, ActivitySource, MetricSummaryRow } from "./model";
import { getSleepSecondsByDate, type SleepSessionInterval } from "./sleep";

interface ProjectionDefinition {
  label: string;
  unit: string;
  totalUnit: string;
  source: string;
}

const PROJECTION_DEFINITIONS = {
  github: {
    label: "Code",
    unit: "contributions",
    totalUnit: "contributions",
    source: "github",
  },
  hevy: {
    label: "Workouts",
    unit: "minutes",
    totalUnit: "minutes",
    source: "hevy",
  },
  leetcode: {
    label: "Problems",
    unit: "submissions",
    totalUnit: "problems",
    source: "leetcode",
  },
  steps: {
    label: "Steps",
    unit: "steps",
    totalUnit: "steps",
    source: "phone",
  },
  sleep: {
    label: "Sleep",
    unit: "minutes",
    totalUnit: "minutes",
    source: "health_connect",
  },
  music: {
    label: "Music",
    unit: "scrobbles",
    totalUnit: "scrobbles",
    source: "lastfm",
  },
} satisfies Record<ActivitySource, ProjectionDefinition>;

function firstDate(dailyValues: Map<string, number>): string {
  return (
    [...dailyValues.keys()].sort()[0] ?? new Date().toISOString().slice(0, 10)
  );
}

export async function refreshActivityProjection(
  directus: PersonalDataDirectus,
  metric: ActivitySource,
  dailyValues: Map<string, number>,
  totalValue: number,
  startDate = firstDate(dailyValues),
): Promise<number> {
  const definition = PROJECTION_DEFINITIONS[metric];
  const desired = [...dailyValues.entries()]
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .map(([date, value]): ActivityDayRow => ({
      id: `${metric}:${date}`,
      metric,
      date,
      value: Math.round(value),
      source: definition.source,
    }));

  const current = await directus.readAll<ActivityDayRow>("activity_days", {
    fields: ["id"],
    filter: { metric: { _eq: metric } },
  });
  const desiredIds = new Set(desired.map((row) => row.id));
  for (const stale of current.filter((row) => !desiredIds.has(row.id))) {
    await directus.deleteOne("activity_days", stale.id);
  }

  const dayResult = await directus.upsertMany("activity_days", desired);
  const summary: MetricSummaryRow = {
    id: metric,
    label: definition.label,
    unit: definition.unit,
    total_unit: definition.totalUnit,
    total_value: Math.max(0, Math.round(totalValue)),
    start_date: startDate,
    updated_at: new Date().toISOString(),
    public: true,
  };
  const summaryResult = await directus.upsertMany("metric_summaries", [
    summary,
  ]);

  return (
    dayResult.created +
    dayResult.updated +
    summaryResult.created +
    summaryResult.updated
  );
}

export async function refreshHealthProjections(
  directus: PersonalDataDirectus,
): Promise<number> {
  const rows = await directus.readAll<{
    date: string;
    steps: number | null;
    sleep_minutes: number | null;
  }>("health_days", {
    fields: ["date", "steps", "sleep_minutes"],
    sort: ["date"],
  });
  const sleepSessions = await directus.readAll<SleepSessionInterval>(
    "sleep_sessions",
    {
      fields: ["date", "session_end_time", "duration_seconds"],
      sort: ["date"],
    },
  );

  const steps = new Map<string, number>();
  const sleep = new Map<string, number>();
  const sessionSleep = getSleepSecondsByDate(sleepSessions);
  for (const row of rows) {
    if (row.steps !== null && row.steps >= 0) steps.set(row.date, row.steps);
    if (row.sleep_minutes !== null && row.sleep_minutes >= 0) {
      sleep.set(row.date, row.sleep_minutes);
    }
  }
  // Raw Health Connect sessions are authoritative when both collectors have a
  // value for the same wake-up day.
  for (const [date, seconds] of sessionSleep) {
    sleep.set(date, seconds / 60);
  }

  const legacyDistanceDays = await directus.readAll<{ id: string }>(
    "activity_days",
    {
      fields: ["id"],
      filter: { metric: { _eq: "distance" } },
    },
  );
  if (legacyDistanceDays.length > 0) {
    await directus.deleteMany(
      "activity_days",
      legacyDistanceDays.map((row) => row.id),
    );
  }
  const legacyDistanceSummary = await directus.readOne<{ id: string }>(
    "metric_summaries",
    "distance",
    ["id"],
  );
  if (legacyDistanceSummary) {
    await directus.deleteOne("metric_summaries", legacyDistanceSummary.id);
  }

  return (
    (await refreshActivityProjection(
      directus,
      "steps",
      steps,
      [...steps.values()].reduce((total, value) => total + value, 0),
    )) +
    (await refreshActivityProjection(
      directus,
      "sleep",
      sleep,
      [...sleep.values()].reduce((total, value) => total + value, 0),
    )) +
    legacyDistanceDays.length +
    (legacyDistanceSummary ? 1 : 0)
  );
}
