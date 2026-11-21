import type { ActivitySource } from "../../../lib/personal-data/model";

export type { ActivitySource };

export interface Metric {
  /** Button label and the word in the window's command. */
  label: string;
  /** What one unit of a daily value counts. Duration metrics count minutes. */
  unit: string;
  /** Duration metrics read as time: "7h 32m slept". */
  verb: string | null;
  /** The lifetime total's noun, from the stored summary. */
  totalUnit: string;
  /** Where the data comes from, and its public page if there is one. */
  service: string;
  href: string | null;
  colour: string;
}

const USERNAME = "rodrgds";

export const METRIC_ORDER: ActivitySource[] = [
  "github",
  "hevy",
  "leetcode",
  "steps",
  "sleep",
  "music",
  "tv",
  "posts",
];

export const METRICS = {
  github: {
    label: "code",
    unit: "contributions",
    verb: null,
    totalUnit: "contributions",
    service: "github",
    href: `https://github.com/${USERNAME}`,
    colour: "var(--tc-host)",
  },
  hevy: {
    label: "workouts",
    unit: "minutes",
    verb: "trained",
    totalUnit: "trained",
    service: "hevy",
    href: null,
    colour: "var(--tc-path)",
  },
  leetcode: {
    label: "problems",
    unit: "submissions",
    verb: null,
    totalUnit: "problems solved",
    service: "leetcode",
    href: `https://leetcode.com/u/${USERNAME}`,
    colour: "var(--tc-date)",
  },
  steps: {
    label: "steps",
    unit: "steps",
    verb: null,
    totalUnit: "steps",
    service: "phone",
    href: null,
    colour: "var(--flexoki-cyan)",
  },
  sleep: {
    label: "sleep",
    unit: "minutes",
    verb: "slept",
    totalUnit: "slept",
    service: "health connect",
    href: null,
    colour: "var(--flexoki-blue)",
  },
  music: {
    label: "music",
    unit: "scrobbles",
    verb: null,
    totalUnit: "scrobbles",
    service: "last.fm",
    href: "https://url.rgo.pt/music",
    colour: "var(--flexoki-magenta)",
  },
  tv: {
    label: "tv",
    unit: "films and episodes",
    verb: null,
    totalUnit: "films and episodes",
    service: "wetrakr",
    href: "https://url.rgo.pt/movies",
    colour: "var(--flexoki-red)",
  },
  posts: {
    label: "posts",
    unit: "posts",
    verb: null,
    totalUnit: "posts",
    service: "openpost",
    href: null,
    colour: "var(--tc-tag)",
  },
} as const satisfies Record<ActivitySource, Metric>;

export function isActivitySource(
  value: string | null,
): value is ActivitySource {
  return METRIC_ORDER.some((source) => source === value);
}

const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const compactFormat = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0 || hours >= 100) return `${formatNumber(hours)}h`;
  return `${formatNumber(hours)}h ${rest}m`;
}

/** The bare amount: "412", "7h 32m". */
export function formatAmount(source: ActivitySource, value: number): string {
  if (METRICS[source].verb) return formatDuration(value);
  return formatNumber(value);
}

/** A short amount for tight columns: "1.2K", "7.5h". */
export function formatCompact(source: ActivitySource, value: number): string {
  if (METRICS[source].verb) {
    if (value < 60) return `${Math.round(value)}m`;
    return `${compactFormat.format(value / 60)}h`;
  }
  if (value < 10_000) return formatNumber(value);
  return compactFormat.format(value).toLowerCase();
}

/** The amount with what it counts: "412 contributions", "7h 32m slept". */
export function formatValue(source: ActivitySource, value: number): string {
  const metric = METRICS[source];
  return `${formatAmount(source, value)} ${metric.verb ?? metric.unit}`;
}

export function formatLifetime(source: ActivitySource, total: number): string {
  return `${formatAmount(source, total)} ${METRICS[source].totalUnit}`;
}
