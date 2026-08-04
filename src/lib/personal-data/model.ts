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

export interface DataSourceRow extends Record<string, unknown> {
  id: string;
  label: string;
  cursor: string | null;
  state: Record<string, unknown> | null;
  status: "pending" | "running" | "healthy" | "error";
  last_synced_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  records_synced: number;
}

export interface ActivityDayRow extends Record<string, unknown> {
  id: string;
  metric: ActivitySource;
  date: string;
  value: number;
  source: string;
}

export interface MetricSummaryRow extends Record<string, unknown> {
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

export const ACTIVITY_THRESHOLDS: Record<
  ActivitySource,
  [number, number, number]
> = {
  github: [3, 6, 9],
  hevy: [30, 60, 90],
  leetcode: [1, 3, 5],
  steps: [3_000, 7_000, 10_000],
  sleep: [360, 420, 480],
  music: [5, 15, 30],
};

export const SOURCE_LABELS: Record<SyncSource, string> = {
  github: "GitHub",
  hevy: "Hevy",
  leetcode: "LeetCode",
  lastfm: "Last.fm",
};
