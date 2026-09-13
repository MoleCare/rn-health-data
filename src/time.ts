/**
 * Local calendar arithmetic. Days are advanced with setDate, never by adding
 * 24 hours of milliseconds: the days the clocks change are 23 or 25 hours long.
 */

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function atHour(date: Date, hour: number): Date {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** `YYYY-MM-DD` in local time. */
export function localDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

export const isValidDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

export interface Interval {
  readonly start: string;
  readonly end: string;
}

/**
 * Total length of a set of time intervals, counting overlaps once. Phones and
 * watches (and several apps) often write overlapping samples for the same
 * night; adding them up would count that time twice.
 */
export function mergedDurationMs(intervals: readonly Interval[]): number {
  const spans = intervals
    .map(({ start, end }): [number, number] => [
      new Date(start).getTime(),
      new Date(end).getTime(),
    ])
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let current: [number, number] | null = null;
  for (const [s, e] of spans) {
    if (current === null || s > current[1]) {
      if (current !== null) {
        total += current[1] - current[0];
      }
      current = [s, e];
    } else if (e > current[1]) {
      current[1] = e;
    }
  }
  if (current !== null) {
    total += current[1] - current[0];
  }
  return total;
}
