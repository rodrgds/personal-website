// Decides when something is new enough to wear the "new" badge.

/** How long anything counts as new after it starts or is published. */
export const NEW_FOR_DAYS = 75;

const DAY_MS = 86_400_000;

/** Accepts a Date, an ISO date, or a CV-style "YYYY-MM" month. */
export function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  const month = value.match(/^(\d{4})-(\d{2})$/);
  if (month) return new Date(Number(month[1]), Number(month[2]) - 1, 1);
  return new Date(value);
}

export function isRecent(
  value: Date | string | undefined,
  now = new Date(),
  days = NEW_FOR_DAYS,
): boolean {
  if (!value) return false;
  const time = toDate(value).getTime();
  if (Number.isNaN(time)) return false;
  const age = now.getTime() - time;
  return age >= -DAY_MS * 31 && age <= days * DAY_MS;
}
