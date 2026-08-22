import type { JsonObject } from "../json";

export const ACTIVITY_SOURCES = [
  "github",
  "hevy",
  "leetcode",
  "steps",
  "sleep",
  "music",
] as const;

export const SYNC_SOURCES = ["github", "hevy", "leetcode", "lastfm"] as const;

export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];
export type SyncSource = (typeof SYNC_SOURCES)[number];
export type SyncMode = "incremental" | "full";

export interface DataSourceRow extends JsonObject {
  id: string;
  label: string;
  cursor: string | null;
  state: JsonObject | null;
  status: "pending" | "running" | "healthy" | "error";
  last_synced_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  records_synced: number;
}

export interface ActivityDayRow extends JsonObject {
  id: string;
  metric: ActivitySource;
  date: string;
  value: number;
  source: string;
}

export interface MetricSummaryRow extends JsonObject {
  id: ActivitySource;
  label: string;
  unit: string;
  total_unit: string;
  total_value: number;
  start_date: string;
  updated_at: string;
  public: boolean;
}

export interface SyncResult {
  source: SyncSource;
  mode: SyncMode;
  seen: number;
  written: number;
  cursor: string | null;
}

export const ACTIVITY_THRESHOLDS = {
  github: [3, 6, 9],
  hevy: [30, 60, 90],
  leetcode: [1, 3, 5],
  steps: [3_000, 7_000, 10_000],
  sleep: [360, 420, 480],
  music: [5, 15, 30],
} as const satisfies Record<ActivitySource, [number, number, number]>;

export const SOURCE_LABELS = {
  github: "GitHub",
  hevy: "Hevy",
  leetcode: "LeetCode",
  lastfm: "Last.fm",
} as const satisfies Record<SyncSource, string>;
