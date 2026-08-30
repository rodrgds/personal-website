import type { JsonValue } from "../json";
import { getPersonalDataDirectus } from "./directus";
import { SOURCE_LABELS, SYNC_SOURCES } from "./model";

// Directus field metadata is written back with a known shape; the read-side
// response keeps free-form JSON under `meta`/`schema`.
type DirectusFieldOptions = {
  interface?: string;
  required?: boolean;
  hidden?: boolean;
  readonly?: boolean;
  special?: string[];
};

type DirectusFieldSchema = {
  is_primary_key?: boolean;
  is_nullable?: boolean;
  is_indexed?: boolean;
  default_value?: JsonValue | null;
  max_length?: number | null;
};

interface FieldDefinition {
  field: string;
  type: string;
  meta?: DirectusFieldOptions;
  schema?: DirectusFieldSchema;
}

interface CollectionDefinition {
  collection: string;
  icon: string;
  note: string;
  fields: FieldDefinition[];
}

function primaryString(field = "id", maxLength = 128): FieldDefinition {
  return {
    field,
    type: "string",
    meta: { interface: "input", hidden: true, readonly: true },
    schema: {
      is_primary_key: true,
      is_nullable: false,
      max_length: maxLength,
    },
  };
}

function field(
  name: string,
  type: string,
  options: {
    required?: boolean;
    indexed?: boolean;
    hidden?: boolean;
    readonly?: boolean;
    interface?: string;
    defaultValue?: JsonValue;
    maxLength?: number;
    special?: string[];
  } = {},
): FieldDefinition {
  return {
    field: name,
    type,
    meta: {
      interface:
        options.interface ??
        (type === "json"
          ? "input-code"
          : type === "boolean"
            ? "boolean"
            : type === "text"
              ? "input-multiline"
              : type === "date" || type === "timestamp"
                ? "datetime"
                : "input"),
      required: options.required ?? false,
      hidden: options.hidden ?? false,
      readonly: options.readonly ?? false,
      special: options.special ?? (type === "json" ? ["cast-json"] : []),
    },
    schema: {
      is_nullable: !(options.required ?? false),
      is_indexed: options.indexed ?? false,
      default_value:
        options.defaultValue === undefined ? null : options.defaultValue,
      max_length: options.maxLength ?? null,
    },
  };
}

const dateCreated = field("date_created", "timestamp", {
  hidden: true,
  readonly: true,
  special: ["date-created", "cast-timestamp"],
});
const dateUpdated = field("date_updated", "timestamp", {
  hidden: true,
  readonly: true,
  special: ["date-updated", "cast-timestamp"],
});

export const PERSONAL_DATA_SCHEMA: CollectionDefinition[] = [
  {
    collection: "data_sources",
    icon: "sync",
    note: "Import cursors and health. Credentials stay in the service environment.",
    fields: [
      primaryString("id", 32),
      field("label", "string", { required: true, maxLength: 64 }),
      field("cursor", "string", { maxLength: 255 }),
      field("state", "json"),
      field("status", "string", {
        required: true,
        defaultValue: "pending",
        maxLength: 24,
      }),
      field("last_synced_at", "timestamp"),
      field("last_success_at", "timestamp"),
      field("last_error", "text"),
      field("records_synced", "integer", {
        required: true,
        defaultValue: 0,
      }),
      dateCreated,
      dateUpdated,
    ],
  },
  {
    collection: "sync_runs",
    icon: "history",
    note: "One audit record for each provider import attempt.",
    fields: [
      primaryString("id", 64),
      field("source", "string", { required: true, indexed: true }),
      field("mode", "string", { required: true }),
      field("status", "string", { required: true, indexed: true }),
      field("started_at", "timestamp", { required: true, indexed: true }),
      field("finished_at", "timestamp"),
      field("records_seen", "integer", { defaultValue: 0 }),
      field("records_written", "integer", { defaultValue: 0 }),
      field("cursor_before", "string", { maxLength: 255 }),
      field("cursor_after", "string", { maxLength: 255 }),
      field("error", "text"),
    ],
  },
  {
    collection: "activity_days",
    icon: "calendar_month",
    note: "Sparse daily values used by the public activity calendar.",
    fields: [
      primaryString("id", 128),
      field("metric", "string", { required: true, indexed: true }),
      field("date", "date", { required: true, indexed: true }),
      field("value", "integer", { required: true }),
      field("source", "string", { required: true }),
      dateUpdated,
    ],
  },
  {
    collection: "metric_summaries",
    icon: "analytics",
    note: "Public totals and start dates, separate from raw provider rows.",
    fields: [
      primaryString("id", 32),
      field("label", "string", { required: true }),
      field("unit", "string", { required: true }),
      field("total_unit", "string", { required: true }),
      field("total_value", "integer", { required: true }),
      field("start_date", "date", { required: true }),
      field("updated_at", "timestamp", { required: true }),
      field("public", "boolean", { required: true, defaultValue: true }),
    ],
  },
  {
    collection: "music_scrobbles",
    icon: "music_note",
    note: "Normalized Last.fm history with deterministic duplicate protection.",
    fields: [
      primaryString("id", 64),
      field("source_id", "string", { indexed: true, maxLength: 128 }),
      field("played_at", "timestamp", { required: true, indexed: true }),
      field("uts", "integer", { required: true, indexed: true }),
      field("artist", "string", { required: true }),
      field("artist_mbid", "string", { maxLength: 64 }),
      field("track", "string", { required: true }),
      field("track_mbid", "string", { maxLength: 64 }),
      field("album", "string"),
      field("album_mbid", "string", { maxLength: 64 }),
      field("url", "text"),
      field("image_url", "text"),
      dateCreated,
    ],
  },
  {
    collection: "workouts",
    icon: "fitness_center",
    note: "Hevy workouts, including the original exercise payload and tombstones.",
    fields: [
      primaryString("id", 64),
      field("title", "string"),
      field("routine_id", "string", { indexed: true, maxLength: 64 }),
      field("description", "text"),
      field("start_time", "timestamp", { indexed: true }),
      field("end_time", "timestamp"),
      field("created_at", "timestamp"),
      field("updated_at", "timestamp"),
      field("deleted_at", "timestamp", { indexed: true }),
      field("duration_minutes", "integer"),
      field("payload", "json"),
      dateCreated,
      dateUpdated,
    ],
  },
  {
    collection: "routines",
    icon: "format_list_bulleted",
    note: "Hevy routines and their folder membership.",
    fields: [
      primaryString("id", 64),
      field("title", "string", { required: true }),
      field("folder_id", "integer", { indexed: true }),
      field("folder_title", "string", { indexed: true }),
      field("updated_at", "timestamp"),
      field("payload", "json", { required: true }),
      dateCreated,
      dateUpdated,
    ],
  },
  {
    collection: "exercise_templates",
    icon: "exercise",
    note: "Hevy exercise metadata used to map workout exercises to muscle groups.",
    fields: [
      primaryString("id", 64),
      field("title", "string", { required: true }),
      field("primary_muscle_group", "string", {
        required: true,
        indexed: true,
        maxLength: 32,
      }),
      field("secondary_muscle_groups", "json", { required: true }),
      field("is_custom", "boolean", {
        required: true,
        defaultValue: false,
      }),
      dateCreated,
      dateUpdated,
    ],
  },
  {
    collection: "health_days",
    icon: "directions_walk",
    note: "Daily phone health aggregates received from the private ingestion API.",
    fields: [
      primaryString("id", 64),
      field("date", "date", { required: true, indexed: true }),
      field("timezone", "string", { required: true, maxLength: 64 }),
      field("observed_at", "timestamp", { required: true }),
      field("steps", "integer"),
      field("sleep_minutes", "integer"),
      field("active_minutes", "integer"),
      field("source", "string", { required: true }),
      dateCreated,
      dateUpdated,
    ],
  },
  {
    collection: "sleep_sessions",
    icon: "bedtime",
    note: "Health Connect sleep sessions, attributed to the day they ended.",
    fields: [
      primaryString("id", 96),
      field("date", "date", { required: true, indexed: true }),
      field("session_end_time", "timestamp", {
        required: true,
        indexed: true,
      }),
      field("duration_seconds", "integer", { required: true }),
      field("observed_at", "timestamp", { required: true }),
      field("source", "string", { required: true }),
      dateCreated,
      dateUpdated,
    ],
  },
];

interface CollectionMetadata {
  collection: string;
}

interface FieldMetadata {
  collection: string;
  field: string;
  type: string;
  meta?: { special?: string[] | null };
}

export async function applyPersonalDataSchema(): Promise<void> {
  const directus = getPersonalDataDirectus();
  const collections =
    await directus.request<CollectionMetadata[]>("/collections");
  const existingCollections = new Set(
    collections.map((entry) => entry.collection),
  );

  for (const definition of PERSONAL_DATA_SCHEMA) {
    if (!existingCollections.has(definition.collection)) {
      const [primaryKey, ...remainingFields] = definition.fields;
      await directus.request("/collections", {
        method: "POST",
        body: JSON.stringify({
          collection: definition.collection,
          meta: {
            accountability: "none",
            icon: definition.icon,
            note: definition.note,
          },
          schema: {},
          fields: [primaryKey, ...remainingFields],
        }),
      });
      existingCollections.add(definition.collection);
      continue;
    }

    const existingFields = await directus.request<FieldMetadata[]>(
      `/fields/${definition.collection}`,
    );
    const names = new Set(existingFields.map((entry) => entry.field));
    for (const missingField of definition.fields.filter(
      (entry) => !names.has(entry.field),
    )) {
      await directus.request(`/fields/${definition.collection}`, {
        method: "POST",
        body: JSON.stringify(missingField),
      });
    }

    for (const jsonField of definition.fields.filter(
      (entry) => entry.type === "json",
    )) {
      const current = existingFields.find(
        (entry) => entry.field === jsonField.field,
      );
      if (!current?.meta?.special?.includes("cast-json")) {
        await directus.request(
          `/fields/${definition.collection}/${jsonField.field}`,
          {
            method: "PATCH",
            body: JSON.stringify({ meta: { special: ["cast-json"] } }),
          },
        );
      }
    }
  }

  await directus.upsertMany(
    "data_sources",
    SYNC_SOURCES.map((source) => ({
      id: source,
      label: SOURCE_LABELS[source],
      cursor: null,
      state: null,
      status: "pending",
      last_synced_at: null,
      last_success_at: null,
      last_error: null,
      records_synced: 0,
    })),
    true,
  );
}
