import { createHash, timingSafeEqual } from "node:crypto";

import type { APIRoute } from "astro";
import { z } from "astro/zod";

import { getPersonalDataDirectus } from "../../../lib/personal-data/directus";
import { refreshHealthProjections } from "../../../lib/personal-data/projections";
import type { JsonObject } from "../../../lib/json";

export const prerender = false;

const MAX_BODY_BYTES = 128 * 1_024;
const MAX_BACKFILL_DAYS = 400;
const MAX_SLEEP_SESSIONS = 800;
const MAX_REQUESTS_PER_MINUTE = 30;
const rateLimits = new Map<string, { count: number; resetAt: number }>();

const macroDroidPayloadSchema = z
  .object({
    date: z.iso.date(),
    timezone: z.string().min(1).max(64).optional().default("Europe/Lisbon"),
    observed_at: z.iso.datetime({ offset: true }),
    steps: z.number().int().min(0).max(200_000).optional(),
    sleep_minutes: z.number().int().min(0).max(1_440).optional(),
    active_minutes: z.number().int().min(0).max(1_440).optional(),
  })
  .refine(
    (payload) =>
      payload.steps !== undefined ||
      payload.sleep_minutes !== undefined ||
      payload.active_minutes !== undefined,
    { message: "At least one daily measurement is required" },
  );

const healthConnectIntervalSchema = z.object({
  start_time: z.iso.datetime({ offset: true }),
  end_time: z.iso.datetime({ offset: true }),
});

const healthConnectWebhookSchema = z
  .object({
    timestamp: z.iso.datetime({ offset: true }),
    app_version: z.string().min(1).max(64),
    steps: z
      .array(
        healthConnectIntervalSchema.extend({
          count: z.number().int().min(0).max(200_000),
        }),
      )
      .max(MAX_BACKFILL_DAYS)
      .optional(),
    sleep: z
      .array(
        z.object({
          session_end_time: z.iso.datetime({ offset: true }),
          duration_seconds: z.number().int().min(1).max(86_400),
        }),
      )
      .max(MAX_SLEEP_SESSIONS)
      .optional(),
  })
  .refine(
    (payload) =>
      (payload.steps?.length ?? 0) > 0 || (payload.sleep?.length ?? 0) > 0,
    { message: "At least one steps or sleep record is required" },
  );

interface NormalizedHealthDay {
  date: string;
  timezone: string;
  observed_at: string;
  steps?: number;
  sleep_minutes?: number;
  active_minutes?: number;
  source: "macrodroid" | "health_connect";
}

interface StoredHealthDay extends JsonObject {
  id: string;
  date: string;
  timezone: string;
  observed_at: string;
  steps: number | null;
  sleep_minutes: number | null;
  active_minutes: number | null;
  source: string;
}

interface StoredSleepSession extends JsonObject {
  id: string;
  date: string;
  session_end_time: string;
  duration_seconds: number;
  observed_at: string;
  source: "health_connect";
}

interface NormalizedHealthConnectPayload {
  days: NormalizedHealthDay[];
  sleepSessions: StoredSleepSession[];
}

function json<TBody extends object>(body: TBody, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function authorized(request: Request, expectedKey: string): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const suppliedHash = createHash("sha256").update(supplied).digest();
  const expectedHash = createHash("sha256").update(expectedKey).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

function withinRateLimit(clientAddress: string): boolean {
  const now = Date.now();
  const current = rateLimits.get(clientAddress);
  if (!current || current.resetAt <= now) {
    rateLimits.set(clientAddress, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= MAX_REQUESTS_PER_MINUTE;
}

function dateInTimeZone(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function normalizeHealthConnectWebhook(
  payload: z.infer<typeof healthConnectWebhookSchema>,
  timezone: string,
): NormalizedHealthConnectPayload {
  const days = new Map<string, NormalizedHealthDay>();
  const getDay = (startTime: string): NormalizedHealthDay => {
    const date = dateInTimeZone(startTime, timezone);
    const existing = days.get(date);
    if (existing) return existing;
    const day: NormalizedHealthDay = {
      date,
      timezone,
      observed_at: payload.timestamp,
      source: "health_connect",
    };
    days.set(date, day);
    return day;
  };

  for (const record of payload.steps ?? []) {
    const day = getDay(record.start_time);
    day.steps = (day.steps ?? 0) + record.count;
  }
  const sleepSessions = new Map<string, StoredSleepSession>();
  for (const record of payload.sleep ?? []) {
    const id = `health-connect-sleep:${createHash("sha256")
      .update(record.session_end_time)
      .digest("hex")
      .slice(0, 48)}`;
    sleepSessions.set(id, {
      id,
      date: dateInTimeZone(record.session_end_time, timezone),
      session_end_time: record.session_end_time,
      duration_seconds: record.duration_seconds,
      observed_at: payload.timestamp,
      source: "health_connect",
    });
  }

  return {
    days: [...days.values()].sort((left, right) =>
      left.date.localeCompare(right.date),
    ),
    sleepSessions: [...sleepSessions.values()].sort((left, right) =>
      left.session_end_time.localeCompare(right.session_end_time),
    ),
  };
}

async function handleRequest(
  request: Request,
  clientAddress: string,
): Promise<Response> {
  const expectedKey = import.meta.env.PERSONAL_DATA_API_KEY;
  if (!expectedKey) return json({ error: "Ingestion is not configured" }, 503);
  if (!withinRateLimit(clientAddress)) {
    return json({ error: "Too many requests" }, 429);
  }
  if (!authorized(request, expectedKey)) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "Content-Type must be application/json" }, 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return json({ error: "Request body is too large" }, 413);
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return json({ error: "Request body is too large" }, 413);
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }
  const macroDroidPayload = macroDroidPayloadSchema.safeParse(rawPayload);
  const healthConnectPayload = healthConnectWebhookSchema.safeParse(rawPayload);
  if (!macroDroidPayload.success && !healthConnectPayload.success) {
    return json(
      {
        error: "Invalid health payload",
        details: [
          ...macroDroidPayload.error.issues.map((issue) => issue.message),
          ...healthConnectPayload.error.issues.map((issue) => issue.message),
        ],
      },
      400,
    );
  }

  let payloads: NormalizedHealthDay[];
  let sleepSessions: StoredSleepSession[] = [];
  const isMacroDroid = macroDroidPayload.success;
  if (macroDroidPayload.success) {
    payloads = [{ ...macroDroidPayload.data, source: "macrodroid" }];
  } else if (healthConnectPayload.success) {
    const requestUrl = new URL(request.url);
    const timezone = requestUrl.searchParams.get("timezone") ?? "Europe/Lisbon";
    if (timezone.length > 64) {
      return json({ error: "Invalid timezone" }, 400);
    }
    try {
      dateInTimeZone(healthConnectPayload.data.timestamp, timezone);
    } catch {
      return json({ error: "Invalid timezone" }, 400);
    }
    const normalized = normalizeHealthConnectWebhook(
      healthConnectPayload.data,
      timezone,
    );
    payloads = normalized.days;
    sleepSessions = normalized.sleepSessions;
  } else {
    return json({ error: "Invalid health payload" }, 400);
  }

  const directus = getPersonalDataDirectus();
  const rows: StoredHealthDay[] = [];
  const ignored: Array<{ id: string; observed_at: string }> = [];
  const ids = payloads.map((payload) => `macrodroid:${payload.date}`);
  const currentRows =
    ids.length > 0
      ? await directus.readAll<StoredHealthDay>("health_days", {
          filter: { id: { _in: ids } },
          limit: MAX_BACKFILL_DAYS,
        })
      : [];
  const currentById = new Map(currentRows.map((row) => [row.id, row]));

  for (const payload of payloads) {
    // Keep the original ID stable so switching the phone-side collector does
    // not create a second row for a date that MacroDroid already uploaded.
    const id = `macrodroid:${payload.date}`;
    const current = currentById.get(id);
    if (
      current &&
      new Date(payload.observed_at).getTime() <
        new Date(current.observed_at).getTime()
    ) {
      if (isMacroDroid) {
        return json(
          {
            error: "A newer reading already exists for this date",
            observed_at: current.observed_at,
          },
          409,
        );
      }
      ignored.push({ id, observed_at: current.observed_at });
      continue;
    }

    rows.push({
      id,
      date: payload.date,
      timezone: payload.timezone,
      observed_at: payload.observed_at,
      steps: payload.steps ?? current?.steps ?? null,
      sleep_minutes: payload.sleep_minutes ?? current?.sleep_minutes ?? null,
      active_minutes: payload.active_minutes ?? current?.active_minutes ?? null,
      source: payload.source,
    });
  }

  const result =
    rows.length > 0
      ? await directus.upsertMany("health_days", rows)
      : { created: 0, updated: 0, skipped: 0 };
  const sleepResult =
    sleepSessions.length > 0
      ? await directus.upsertMany("sleep_sessions", sleepSessions)
      : { created: 0, updated: 0, skipped: 0 };
  if (rows.length > 0 || sleepSessions.length > 0) {
    await refreshHealthProjections(directus);
  }

  if (!isMacroDroid) {
    return json(
      {
        ok: true,
        accepted_days: rows.length,
        accepted_sleep_sessions: sleepSessions.length,
        ignored,
        days: result,
        sleep_sessions: sleepResult,
      },
      200,
    );
  }

  const id = rows[0]?.id;

  return json(
    {
      ok: true,
      id,
      created: result.created === 1,
      updated: result.updated === 1,
      unchanged: result.skipped === 1,
    },
    result.created === 1 ? 201 : 200,
  );
}

export const POST: APIRoute = ({ request, clientAddress }) =>
  handleRequest(request, clientAddress);

export const PUT = POST;
