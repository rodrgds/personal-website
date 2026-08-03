export interface ActivityDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface ActivityWeek {
  days: ActivityDay[];
}

export function getActivityLevel(
  count: number,
  thresholds: [number, number, number],
): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= thresholds[0]) return 1;
  if (count <= thresholds[1]) return 2;
  if (count <= thresholds[2]) return 3;
  return 4;
}

export function buildActivityCalendar(
  dailyCounts: Map<string, number>,
  startYear: number,
  thresholds: [number, number, number],
): ActivityWeek[] {
  const firstDate = new Date(Date.UTC(startYear, 0, 1));
  firstDate.setUTCDate(firstDate.getUTCDate() - firstDate.getUTCDay());

  const lastDate = new Date();
  const cursor = new Date(firstDate);
  const weeks: ActivityWeek[] = [];

  while (cursor <= lastDate) {
    const days: ActivityDay[] = [];

    for (let day = 0; day < 7; day++) {
      const date = cursor.toISOString().slice(0, 10);
      const count = dailyCounts.get(date) ?? 0;

      days.push({
        date,
        count,
        level: getActivityLevel(count, thresholds),
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    weeks.push({ days });
  }

  return weeks;
}
