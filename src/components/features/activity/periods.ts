export type TimeRange = "week" | "month" | "quarter" | "year" | "all";
export type TimeGrain = "day" | "week" | "month" | "quarter" | "year";
export type ChartKind = "calendar" | "rows" | "columns";

export interface ActivityDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface ActivityWeek {
  days: ActivityDay[];
}

export interface ActivityPeriod {
  start: string;
  end: string;
}

export interface ActivityBucket {
  key: string;
  start: string;
  end: string;
  label: string;
  shortLabel: string;
  value: number;
  activeDays: number;
  /** Days of the bucket inside the selected period (today at most). */
  days: number;
}

interface BucketLabel {
  label: string;
  shortLabel: string;
}

export interface Option<T extends string> {
  value: T;
  label: string;
}

export const RANGE_OPTIONS: Array<Option<TimeRange>> = [
  { value: "week", label: "week" },
  { value: "month", label: "month" },
  { value: "quarter", label: "quarter" },
  { value: "year", label: "year" },
  { value: "all", label: "all" },
];

export const GRAIN_OPTIONS = {
  week: [{ value: "day", label: "day" }],
  month: [
    { value: "day", label: "day" },
    { value: "week", label: "week" },
  ],
  quarter: [
    { value: "week", label: "week" },
    { value: "month", label: "month" },
  ],
  year: [
    { value: "month", label: "month" },
    { value: "quarter", label: "quarter" },
  ],
  all: [
    { value: "month", label: "month" },
    { value: "quarter", label: "quarter" },
    { value: "year", label: "year" },
  ],
} satisfies Record<TimeRange, Array<Option<TimeGrain>>>;

export const DEFAULT_GRAIN = {
  week: "day",
  month: "day",
  quarter: "week",
  year: "month",
  all: "year",
} as const satisfies Record<TimeRange, TimeGrain>;

const longMonthFormatter = new Intl.DateTimeFormat("en", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});
const shortMonthFormatter = new Intl.DateTimeFormat("en", {
  timeZone: "UTC",
  month: "short",
});
const dayFormatter = new Intl.DateTimeFormat("en", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});
const weekdayFormatter = new Intl.DateTimeFormat("en", {
  timeZone: "UTC",
  weekday: "short",
});

function lower(value: string): string {
  return value.toLowerCase();
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function dateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dateAt(year: number, month: number, day = 1): Date {
  return new Date(Date.UTC(year, month, day));
}

function minDate(left: string, right: string): string {
  return left < right ? left : right;
}

function maxDate(left: string, right: string): string {
  return left > right ? left : right;
}

export function addDays(value: string, amount: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateString(date);
}

function addMonths(value: string, amount: number): string {
  const date = parseDate(value);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return dateString(date);
}

export function daysBetween(start: string, end: string): number {
  return Math.round(
    (parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000,
  );
}

export function todayInTimeZone(timeZone = "Europe/Lisbon"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function naturalPeriod(
  range: Exclude<TimeRange, "all">,
  anchor: string,
): ActivityPeriod {
  const date = parseDate(anchor);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  if (range === "week") {
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    const start = addDays(anchor, -mondayOffset);
    return { start, end: addDays(start, 6) };
  }
  if (range === "month") {
    return {
      start: dateString(dateAt(year, month)),
      end: dateString(dateAt(year, month + 1, 0)),
    };
  }
  if (range === "quarter") {
    const quarterMonth = Math.floor(month / 3) * 3;
    return {
      start: dateString(dateAt(year, quarterMonth)),
      end: dateString(dateAt(year, quarterMonth + 3, 0)),
    };
  }
  return {
    start: dateString(dateAt(year, 0)),
    end: dateString(dateAt(year + 1, 0, 0)),
  };
}

export function getPeriod(
  range: TimeRange,
  anchor: string,
  earliest: string,
  today: string,
): ActivityPeriod {
  if (range === "all") return { start: earliest, end: today };
  const period = naturalPeriod(range, anchor);
  return {
    start: maxDate(period.start, earliest),
    end: minDate(period.end, today),
  };
}

export function shiftAnchor(
  range: Exclude<TimeRange, "all">,
  anchor: string,
  direction: -1 | 1,
): string {
  if (range === "week") return addDays(anchor, 7 * direction);
  if (range === "month") return addMonths(anchor, direction);
  if (range === "quarter") return addMonths(anchor, 3 * direction);
  return addMonths(anchor, 12 * direction);
}

export function isLatestPeriod(
  range: TimeRange,
  anchor: string,
  today: string,
): boolean {
  if (range === "all") return true;
  return (
    naturalPeriod(range, anchor).start === naturalPeriod(range, today).start
  );
}

export function canMoveBackward(
  range: TimeRange,
  anchor: string,
  earliest: string,
): boolean {
  if (range === "all") return false;
  return naturalPeriod(range, shiftAnchor(range, anchor, -1)).end >= earliest;
}

export function previousComparablePeriod(
  range: TimeRange,
  period: ActivityPeriod,
  earliest: string,
): ActivityPeriod | null {
  if (range === "all") return null;
  const previous = naturalPeriod(range, shiftAnchor(range, period.start, -1));
  if (previous.end < earliest) return null;
  const elapsedDays = daysBetween(period.start, period.end);
  return {
    start: maxDate(previous.start, earliest),
    end: minDate(previous.end, addDays(previous.start, elapsedDays)),
  };
}

export function formatPeriodLabel(
  range: TimeRange,
  period: ActivityPeriod,
): string {
  const start = parseDate(period.start);
  const end = parseDate(period.end);
  if (range === "week") {
    const startLabel = dayFormatter.format(start);
    const endLabel = new Intl.DateTimeFormat("en", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(end);
    return lower(`${startLabel} – ${endLabel}`);
  }
  if (range === "month") return lower(longMonthFormatter.format(start));
  if (range === "quarter") {
    return `q${Math.floor(start.getUTCMonth() / 3) + 1} ${start.getUTCFullYear()}`;
  }
  if (range === "year") return String(start.getUTCFullYear());
  const firstYear = start.getUTCFullYear();
  const lastYear = end.getUTCFullYear();
  return firstYear === lastYear
    ? String(firstYear)
    : `${firstYear} – ${lastYear}`;
}

function bucketStart(date: string, grain: TimeGrain): string {
  const parsed = parseDate(date);
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  if (grain === "day") return date;
  if (grain === "week") {
    return addDays(date, -((parsed.getUTCDay() + 6) % 7));
  }
  if (grain === "month") return dateString(dateAt(year, month));
  if (grain === "quarter") {
    return dateString(dateAt(year, Math.floor(month / 3) * 3));
  }
  return dateString(dateAt(year, 0));
}

function bucketEnd(start: string, grain: TimeGrain): string {
  const parsed = parseDate(start);
  if (grain === "day") return start;
  if (grain === "week") return addDays(start, 6);
  if (grain === "month") {
    return dateString(
      dateAt(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0),
    );
  }
  if (grain === "quarter") {
    return dateString(
      dateAt(parsed.getUTCFullYear(), parsed.getUTCMonth() + 3, 0),
    );
  }
  return dateString(dateAt(parsed.getUTCFullYear() + 1, 0, 0));
}

function bucketLabels(
  start: string,
  grain: TimeGrain,
  range: TimeRange,
): BucketLabel {
  const date = parseDate(start);
  const shortYear = `’${String(date.getUTCFullYear()).slice(2)}`;
  if (grain === "day") {
    const weekday = lower(weekdayFormatter.format(date));
    return {
      label: `${weekday}, ${lower(dayFormatter.format(date))}`,
      shortLabel:
        range === "week"
          ? `${weekday} ${date.getUTCDate()}`
          : String(date.getUTCDate()),
    };
  }
  if (grain === "week") {
    return {
      label: `week of ${lower(dayFormatter.format(date))}`,
      shortLabel: lower(dayFormatter.format(date)),
    };
  }
  if (grain === "month") {
    const month = lower(shortMonthFormatter.format(date));
    return {
      label: lower(longMonthFormatter.format(date)),
      shortLabel: range === "all" ? `${month} ${shortYear}` : month,
    };
  }
  if (grain === "quarter") {
    const quarter = `q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    return {
      label: `${quarter} ${date.getUTCFullYear()}`,
      shortLabel: range === "all" ? `${quarter} ${shortYear}` : quarter,
    };
  }
  return {
    label: String(date.getUTCFullYear()),
    shortLabel: String(date.getUTCFullYear()),
  };
}

export function aggregateActivity(
  days: ActivityDay[],
  grain: TimeGrain,
  range: TimeRange,
): ActivityBucket[] {
  const buckets = new Map<string, ActivityBucket>();
  for (const day of days) {
    const start = bucketStart(day.date, grain);
    const existing = buckets.get(start);
    if (existing) {
      existing.value += day.count;
      existing.days += 1;
      if (day.count > 0) existing.activeDays += 1;
      continue;
    }
    const labels = bucketLabels(start, grain, range);
    buckets.set(start, {
      key: start,
      start,
      end: bucketEnd(start, grain),
      label: labels.label,
      shortLabel: labels.shortLabel,
      value: day.count,
      activeDays: day.count > 0 ? 1 : 0,
      days: 1,
    });
  }
  return [...buckets.values()].sort((left, right) =>
    left.start.localeCompare(right.start),
  );
}

/** A month by day reads as a calendar; long series as columns; the rest as rows. */
export function chooseChartKind(
  range: TimeRange,
  grain: TimeGrain,
  bucketCount: number,
): ChartKind {
  if (range === "month" && grain === "day") return "calendar";
  if (bucketCount > 24) return "columns";
  return "rows";
}

export function selectDays(
  days: ActivityDay[],
  period: ActivityPeriod,
): ActivityDay[] {
  return days.filter(
    (day) => day.date >= period.start && day.date <= period.end,
  );
}

export function flattenActivityWeeks(
  weeks: ActivityWeek[],
  startYear: number,
  today: string,
): ActivityDay[] {
  const start = `${startYear}-01-01`;
  const unique = new Map<string, ActivityDay>();
  for (const week of weeks) {
    for (const day of week.days) {
      if (day.date >= start && day.date <= today) unique.set(day.date, day);
    }
  }
  return [...unique.values()].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}
