import { createHash, randomUUID } from "node:crypto";

import { getPersonalDataDirectus, type PersonalDataDirectus } from "./directus";
import type { DataSourceRow, SyncMode, SyncResult, SyncSource } from "./model";
import { SOURCE_LABELS, SYNC_SOURCES } from "./model";
import { refreshActivityProjection } from "./projections";

const GITHUB_GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const LEETCODE_GRAPHQL_ENDPOINT = "https://leetcode.com/graphql";
const HEVY_API_ENDPOINT = "https://api.hevyapp.com/v1";
const LASTFM_API_ENDPOINT = "https://ws.audioscrobbler.com/2.0/";
const USERNAME = "rodrgds";

interface ImportResult extends SyncResult {
  state?: Record<string, unknown> | null;
}

function readEnv(name: string): string | undefined {
  return (
    process.env[name] ??
    (import.meta.env as Record<string, string | undefined>)[name]
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function requestJson<T>(
  input: string | URL,
  init: RequestInit = {},
  retries = 2,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const details = (await response.text()).slice(0, 500);
        throw new Error(
          `Upstream request failed (${response.status}): ${details}`,
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function githubGraphql(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await requestJson<Record<string, unknown>>(
    GITHUB_GRAPHQL_ENDPOINT,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  const errors = asRecords(response.errors);
  if (errors.length > 0) {
    throw new Error(`GitHub GraphQL error: ${asString(errors[0].message)}`);
  }
  return asRecord(response.data);
}

async function importGithub(
  directus: PersonalDataDirectus,
  mode: SyncMode,
): Promise<ImportResult> {
  const token = requireEnv("GITHUB_ACCESS_TOKEN");
  const userData = await githubGraphql(
    token,
    `query($username: String!) { user(login: $username) { createdAt } }`,
    { username: USERNAME },
  );
  const createdAt = asString(asRecord(userData.user).createdAt);
  if (!createdAt) throw new Error("Configured GitHub user was not found");

  const startYear = new Date(createdAt).getUTCFullYear();
  const currentYear = new Date().getUTCFullYear();
  const daily = new Map<string, number>();
  let total = 0;

  for (let year = startYear; year <= currentYear; year++) {
    const data = await githubGraphql(
      token,
      `query($username: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $username) {
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar {
              totalContributions
              weeks { contributionDays { date contributionCount } }
            }
          }
        }
      }`,
      {
        username: USERNAME,
        from: `${year}-01-01T00:00:00Z`,
        to: `${year}-12-31T23:59:59Z`,
      },
    );
    const calendar = asRecord(
      asRecord(
        asRecord(asRecord(data.user).contributionsCollection)
          .contributionCalendar,
      ),
    );
    total += asNumber(calendar.totalContributions);
    for (const week of asRecords(calendar.weeks)) {
      for (const day of asRecords(week.contributionDays)) {
        const date = asString(day.date);
        const count = asNumber(day.contributionCount);
        if (date && count > 0) daily.set(date, count);
      }
    }
  }

  const written = await refreshActivityProjection(
    directus,
    "github",
    daily,
    total,
    createdAt.slice(0, 10),
  );
  return {
    source: "github",
    mode,
    seen: daily.size,
    written,
    cursor: new Date().toISOString(),
  };
}

async function importLeetcode(
  directus: PersonalDataDirectus,
  mode: SyncMode,
): Promise<ImportResult> {
  const response = await requestJson<Record<string, unknown>>(
    LEETCODE_GRAPHQL_ENDPOINT,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "rgo.pt personal data importer",
      },
      body: JSON.stringify({
        query: `query getUserProfile($username: String!) {
          matchedUser(username: $username) {
            submissionCalendar
            submitStatsGlobal { acSubmissionNum { difficulty count } }
          }
        }`,
        variables: { username: USERNAME },
      }),
    },
  );
  const errors = asRecords(response.errors);
  if (errors.length > 0) {
    throw new Error(`LeetCode GraphQL error: ${asString(errors[0].message)}`);
  }
  const user = asRecord(asRecord(response.data).matchedUser);
  const rawCalendar = asString(user.submissionCalendar);
  if (!rawCalendar) throw new Error("LeetCode submission calendar is missing");

  const daily = new Map<string, number>();
  for (const [timestamp, rawCount] of Object.entries(
    JSON.parse(rawCalendar) as Record<string, unknown>,
  )) {
    const date = new Date(asNumber(timestamp) * 1_000)
      .toISOString()
      .slice(0, 10);
    const count = asNumber(rawCount);
    if (count > 0) daily.set(date, count);
  }
  const stats = asRecords(asRecord(user.submitStatsGlobal).acSubmissionNum);
  const total = asNumber(
    stats.find((entry) => entry.difficulty === "All")?.count,
  );
  const startDate = [...daily.keys()].sort()[0];
  const written = await refreshActivityProjection(
    directus,
    "leetcode",
    daily,
    total,
    startDate,
  );
  return {
    source: "leetcode",
    mode,
    seen: daily.size,
    written,
    cursor: new Date().toISOString(),
  };
}

function hevyHeaders(apiKey: string): HeadersInit {
  return { Accept: "application/json", "api-key": apiKey };
}

async function readHevyPages(
  path: string,
  itemField: string,
  apiKey: string,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let page = 1;
  let pageCount = 1;
  while (page <= pageCount) {
    const joiner = path.includes("?") ? "&" : "?";
    const response = await requestJson<Record<string, unknown>>(
      `${HEVY_API_ENDPOINT}${path}${joiner}page=${page}&pageSize=10`,
      { headers: hevyHeaders(apiKey) },
    );
    items.push(...asRecords(response[itemField]));
    pageCount = Math.max(1, asNumber(response.page_count));
    page += 1;
  }
  return items;
}

function normalizeWorkout(
  workout: Record<string, unknown>,
): Record<string, unknown> & { id: string } {
  const startTime = asString(workout.start_time) || null;
  const endTime = asString(workout.end_time) || null;
  const start = startTime ? new Date(startTime).getTime() : Number.NaN;
  const end = endTime ? new Date(endTime).getTime() : Number.NaN;
  return {
    id: asString(workout.id),
    title: asString(workout.title) || null,
    routine_id: asString(workout.routine_id) || null,
    description: asString(workout.description) || null,
    start_time: startTime,
    end_time: endTime,
    created_at: asString(workout.created_at) || null,
    updated_at: asString(workout.updated_at) || null,
    deleted_at: null,
    duration_minutes:
      Number.isFinite(start) && Number.isFinite(end) && end > start
        ? Math.round((end - start) / 60_000)
        : null,
    payload: workout,
  };
}

async function importHevy(
  directus: PersonalDataDirectus,
  mode: SyncMode,
  source: DataSourceRow,
): Promise<ImportResult> {
  const apiKey = requireEnv("HEVY_API_KEY");
  const folders = await readHevyPages(
    "/routine_folders",
    "routine_folders",
    apiKey,
  );
  const folderTitles = new Map(
    folders.map((folder) => [asNumber(folder.id), asString(folder.title)]),
  );
  const routines = await readHevyPages("/routines", "routines", apiKey);
  const routineRows = routines
    .filter((routine) => asString(routine.id))
    .map((routine) => ({
      id: asString(routine.id),
      title: asString(routine.title) || "Untitled routine",
      folder_id:
        routine.folder_id === null ? null : asNumber(routine.folder_id),
      folder_title:
        routine.folder_id === null
          ? null
          : (folderTitles.get(asNumber(routine.folder_id)) ?? null),
      updated_at: asString(routine.updated_at) || null,
      payload: routine,
    }));
  const routineResult = await directus.upsertMany("routines", routineRows);
  const storedRoutineIds = await directus.readAll<{ id: string }>("routines", {
    fields: ["id"],
  });
  const currentRoutineIds = new Set(routineRows.map((routine) => routine.id));
  const staleRoutines = storedRoutineIds.filter(
    (routine) => !currentRoutineIds.has(routine.id),
  );
  for (const staleRoutine of staleRoutines) {
    await directus.deleteOne("routines", staleRoutine.id);
  }

  let workoutRows: Array<Record<string, unknown> & { id: string }> = [];
  let deletedRows: Array<Record<string, unknown> & { id: string }> = [];
  if (mode === "full" || !source.cursor) {
    const workouts = await readHevyPages("/workouts", "workouts", apiKey);
    workoutRows = workouts
      .map(normalizeWorkout)
      .filter((workout) => workout.id);

    const currentIds = new Set(workoutRows.map((workout) => workout.id));
    const stored = await directus.readAll<{
      id: string;
      deleted_at: string | null;
    }>("workouts", { fields: ["id", "deleted_at"] });
    const deletedAt = new Date().toISOString();
    deletedRows = stored
      .filter((workout) => !workout.deleted_at && !currentIds.has(workout.id))
      .map((workout) => ({ id: workout.id, deleted_at: deletedAt }));
  } else {
    const cursor = new Date(source.cursor).getTime();
    const since = new Date(
      Number.isFinite(cursor) ? cursor - 5 * 60_000 : 0,
    ).toISOString();
    const events = await readHevyPages(
      `/workouts/events?since=${encodeURIComponent(since)}`,
      "events",
      apiKey,
    );
    for (const event of events) {
      if (event.type === "updated") {
        const normalized = normalizeWorkout(asRecord(event.workout));
        if (normalized.id) workoutRows.push(normalized);
      } else if (event.type === "deleted") {
        const id = asString(event.id);
        if (id) {
          deletedRows.push({
            id,
            deleted_at: asString(event.deleted_at) || new Date().toISOString(),
          });
        }
      }
    }
  }

  const workoutResult = await directus.upsertMany("workouts", workoutRows);
  const deletedResult = await directus.upsertMany("workouts", deletedRows);

  const storedWorkouts = await directus.readAll<{
    start_time: string | null;
    duration_minutes: number | null;
    deleted_at: string | null;
  }>("workouts", {
    fields: ["start_time", "duration_minutes", "deleted_at"],
    filter: { deleted_at: { _null: true } },
  });
  const daily = new Map<string, number>();
  let totalMinutes = 0;
  for (const workout of storedWorkouts) {
    if (!workout.start_time || !workout.duration_minutes) continue;
    const date = workout.start_time.slice(0, 10);
    totalMinutes += workout.duration_minutes;
    daily.set(date, (daily.get(date) ?? 0) + workout.duration_minutes);
  }
  const writtenProjection = await refreshActivityProjection(
    directus,
    "hevy",
    daily,
    totalMinutes,
  );
  const written =
    routineResult.created +
    routineResult.updated +
    staleRoutines.length +
    workoutResult.created +
    workoutResult.updated +
    deletedResult.created +
    deletedResult.updated +
    writtenProjection;
  return {
    source: "hevy",
    mode,
    seen: routineRows.length + workoutRows.length + deletedRows.length,
    written,
    cursor: new Date().toISOString(),
  };
}

function lastfmTrackId(track: Record<string, unknown>, uts: number): string {
  const artist =
    asString(asRecord(track.artist).name) || asString(track.artist);
  const album = asString(asRecord(track.album)["#text"]);
  return createHash("sha256")
    .update(["lastfm", uts, artist, asString(track.name), album].join("\0"))
    .digest("hex");
}

function lastfmImage(track: Record<string, unknown>): string | null {
  const images = asRecords(track.image);
  const preferred =
    images.find((image) => image.size === "extralarge") ??
    images.find((image) => image.size === "large") ??
    images.at(-1);
  return asString(preferred?.["#text"]) || null;
}

async function lastfmRequest(
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = new URL(LASTFM_API_ENDPOINT);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("api_key", requireEnv("LASTFM_API_KEY"));
  url.searchParams.set("format", "json");
  return requestJson<Record<string, unknown>>(url);
}

async function importLastfm(
  directus: PersonalDataDirectus,
  mode: SyncMode,
  source: DataSourceRow,
): Promise<ImportResult> {
  const username = requireEnv("LASTFM_USERNAME");
  const baseParams: Record<string, string> = {
    method: "user.getRecentTracks",
    user: username,
    limit: "200",
    extended: "1",
  };
  if (mode === "incremental" && source.cursor) {
    const overlap = Math.max(0, asNumber(source.cursor) - 24 * 60 * 60);
    baseParams.from = String(overlap);
  }

  const rows: Array<Record<string, unknown> & { id: string }> = [];
  let nowPlaying: Record<string, unknown> | null = null;
  let page = 1;
  let pageCount = 1;
  let newestUts = asNumber(source.cursor);
  while (page <= pageCount) {
    const response = await lastfmRequest({ ...baseParams, page: String(page) });
    const recent = asRecord(response.recenttracks);
    pageCount = Math.max(1, asNumber(asRecord(recent["@attr"]).totalPages));
    for (const track of asRecords(recent.track)) {
      const attributes = asRecord(track["@attr"]);
      if (attributes.nowplaying === "true") {
        if (!nowPlaying) {
          nowPlaying = {
            name: asString(track.name),
            url: asString(track.url),
            artist: asRecord(track.artist),
            album: asRecord(track.album),
            image: track.image,
            "@attr": { nowplaying: "true" },
          };
        }
        continue;
      }
      const uts = asNumber(asRecord(track.date).uts);
      if (!uts) continue;
      newestUts = Math.max(newestUts, uts);
      const artist = asRecord(track.artist);
      const album = asRecord(track.album);
      rows.push({
        id: lastfmTrackId(track, uts),
        source_id: null,
        played_at: new Date(uts * 1_000).toISOString(),
        uts,
        artist: asString(artist.name) || asString(track.artist),
        artist_mbid: asString(artist.mbid) || null,
        track: asString(track.name),
        track_mbid: asString(track.mbid) || null,
        album: asString(album["#text"]) || null,
        album_mbid: asString(album.mbid) || null,
        url: asString(track.url) || null,
        image_url: lastfmImage(track),
      });
    }
    page += 1;
  }

  const uniqueRows = [...new Map(rows.map((row) => [row.id, row])).values()];
  const upsert = await directus.upsertMany("music_scrobbles", uniqueRows, true);
  const stored = await directus.readAll<{ uts: number }>("music_scrobbles", {
    fields: ["uts"],
  });
  const daily = new Map<string, number>();
  for (const scrobble of stored) {
    const date = new Date(scrobble.uts * 1_000).toISOString().slice(0, 10);
    daily.set(date, (daily.get(date) ?? 0) + 1);
  }

  const userResponse = await lastfmRequest({
    method: "user.getInfo",
    user: username,
  });
  const user = asRecord(userResponse.user);
  const registeredUts = asNumber(asRecord(user.registered).unixtime);
  const startDate = registeredUts
    ? new Date(registeredUts * 1_000).toISOString().slice(0, 10)
    : [...daily.keys()].sort()[0];
  const total = Math.max(asNumber(user.playcount), stored.length);
  const projectionWrites = await refreshActivityProjection(
    directus,
    "music",
    daily,
    total,
    startDate,
  );
  return {
    source: "lastfm",
    mode,
    seen: uniqueRows.length,
    written: upsert.created + projectionWrites,
    cursor: newestUts ? String(newestUts) : source.cursor,
    state: {
      nowPlaying,
      nowPlayingCheckedAt: new Date().toISOString(),
      registeredUts: registeredUts || null,
    },
  };
}

async function importSource(
  sourceName: SyncSource,
  mode: SyncMode,
  directus: PersonalDataDirectus,
  source: DataSourceRow,
): Promise<ImportResult> {
  switch (sourceName) {
    case "github":
      return importGithub(directus, mode);
    case "hevy":
      return importHevy(directus, mode, source);
    case "leetcode":
      return importLeetcode(directus, mode);
    case "lastfm":
      return importLastfm(directus, mode, source);
  }
}

export async function syncPersonalDataSource(
  sourceName: SyncSource,
  requestedMode: SyncMode = "incremental",
): Promise<SyncResult> {
  const directus = getPersonalDataDirectus();
  const source = await directus.readOne<DataSourceRow>(
    "data_sources",
    sourceName,
  );
  if (!source) throw new Error(`Missing Directus source row: ${sourceName}`);

  const mode = !source.cursor ? "full" : requestedMode;
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  await directus.createMany("sync_runs", [
    {
      id: runId,
      source: sourceName,
      mode,
      status: "running",
      started_at: startedAt,
      finished_at: null,
      records_seen: 0,
      records_written: 0,
      cursor_before: source.cursor,
      cursor_after: null,
      error: null,
    },
  ]);
  await directus.updateOne("data_sources", sourceName, {
    status: "running",
    last_synced_at: startedAt,
    last_error: null,
  });

  try {
    const result = await importSource(sourceName, mode, directus, source);
    const finishedAt = new Date().toISOString();
    await directus.updateOne("sync_runs", runId, {
      status: "success",
      finished_at: finishedAt,
      records_seen: result.seen,
      records_written: result.written,
      cursor_after: result.cursor,
    });
    await directus.updateOne("data_sources", sourceName, {
      status: "healthy",
      cursor: result.cursor,
      state: result.state ?? source.state,
      last_success_at: finishedAt,
      last_error: null,
      records_synced: asNumber(source.records_synced) + result.written,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finishedAt = new Date().toISOString();
    await directus.updateOne("sync_runs", runId, {
      status: "error",
      finished_at: finishedAt,
      error: message.slice(0, 4_000),
    });
    await directus.updateOne("data_sources", sourceName, {
      status: "error",
      last_error: message.slice(0, 4_000),
    });
    throw error;
  }
}

export async function syncAllPersonalData(
  mode: SyncMode = "incremental",
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const source of SYNC_SOURCES) {
    results.push(await syncPersonalDataSource(source, mode));
  }
  return results;
}

export function formatSyncResult(result: SyncResult): string {
  return `${SOURCE_LABELS[result.source]}: ${result.seen} seen, ${result.written} written (${result.mode})`;
}
