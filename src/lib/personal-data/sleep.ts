import type { JsonObject } from "../json";

export interface SleepSessionInterval extends JsonObject {
  date: string;
  session_end_time: string;
  duration_seconds: number;
}

interface SleepInterval {
  startTime: number;
  endTime: number;
}

const MILLISECONDS_PER_SECOND = 1_000;

export function getSleepSessionStartTime(
  session: Pick<SleepSessionInterval, "session_end_time" | "duration_seconds">,
): string {
  const endTime = new Date(session.session_end_time).getTime();
  return new Date(
    endTime - session.duration_seconds * MILLISECONDS_PER_SECOND,
  ).toISOString();
}

/** Count elapsed sleep once when providers or syncs report overlapping data. */
export function getSleepSecondsByDate(
  sessions: SleepSessionInterval[],
): Map<string, number> {
  const intervalsByDate = new Map<string, SleepInterval[]>();
  for (const session of sessions) {
    const endTime = new Date(session.session_end_time).getTime();
    const startTime =
      endTime - session.duration_seconds * MILLISECONDS_PER_SECOND;
    const intervals = intervalsByDate.get(session.date) ?? [];
    intervals.push({ startTime, endTime });
    intervalsByDate.set(session.date, intervals);
  }

  const totals = new Map<string, number>();
  for (const [date, intervals] of intervalsByDate) {
    intervals.sort(
      (left, right) =>
        left.startTime - right.startTime || left.endTime - right.endTime,
    );
    const first = intervals[0];
    if (!first) continue;

    let mergedStart = first.startTime;
    let mergedEnd = first.endTime;
    let totalMilliseconds = 0;
    for (const interval of intervals.slice(1)) {
      if (interval.startTime <= mergedEnd) {
        mergedEnd = Math.max(mergedEnd, interval.endTime);
        continue;
      }

      totalMilliseconds += mergedEnd - mergedStart;
      mergedStart = interval.startTime;
      mergedEnd = interval.endTime;
    }
    totalMilliseconds += mergedEnd - mergedStart;
    totals.set(date, totalMilliseconds / MILLISECONDS_PER_SECOND);
  }
  return totals;
}
