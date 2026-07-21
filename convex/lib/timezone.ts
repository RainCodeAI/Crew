/**
 * Company-timezone helpers (no date-fns dependency).
 * Wall-clock math uses Intl; conversions use a short iterative search.
 */

export const DEFAULT_TIMEZONE = "America/Chicago";

export type ZonedParts = {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
};

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function resolveTimeZone(tz?: string | null): string {
  if (!tz || !tz.trim()) return DEFAULT_TIMEZONE;
  try {
    // Throws RangeError for invalid IANA zones in modern engines.
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Calendar parts of an instant in a given IANA timezone. */
export function getZonedParts(ms: number, timeZone: string): ZonedParts {
  const tz = resolveTimeZone(timeZone);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = dtf.formatToParts(new Date(ms));
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";

  const weekdayStr = get("weekday");
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour") === "24" ? "0" : get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_MAP[weekdayStr] ?? 0,
  };
}

/**
 * Convert a wall-clock time in `timeZone` to a UTC epoch ms.
 * Handles DST by refining an initial guess.
 */
export function zonedWallTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): number {
  const tz = resolveTimeZone(timeZone);
  // Initial guess: treat as UTC wall time, then correct offset.
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 4; i++) {
    const p = getZonedParts(guess, tz);
    const asUtc = Date.UTC(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      p.second,
    );
    const target = Date.UTC(year, month - 1, day, hour, minute, second);
    const diff = target - asUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return guess;
}

/** Start of the calendar day (00:00) containing `ms` in `timeZone`. */
export function startOfZonedDay(ms: number, timeZone: string): number {
  const p = getZonedParts(ms, timeZone);
  return zonedWallTimeToUtc(timeZone, p.year, p.month, p.day, 0, 0, 0);
}

/** Add calendar days in a timezone (noon pivot reduces DST edge issues). */
export function addZonedDays(
  ms: number,
  days: number,
  timeZone: string,
): number {
  const p = getZonedParts(ms, timeZone);
  const base = zonedWallTimeToUtc(timeZone, p.year, p.month, p.day, 12, 0, 0);
  const next = base + days * 24 * 60 * 60 * 1000;
  const np = getZonedParts(next, timeZone);
  return zonedWallTimeToUtc(timeZone, np.year, np.month, np.day, 0, 0, 0);
}

/**
 * Monday 00:00 → next Monday 00:00 in `timeZone` for the week containing `ms`.
 */
export function weekRangeMonday(
  ms: number,
  timeZone: string,
): { from: number; to: number } {
  const start = startOfZonedDay(ms, timeZone);
  const p = getZonedParts(start, timeZone);
  const diffToMonday = p.weekday === 0 ? -6 : 1 - p.weekday;
  const monday = addZonedCalendarDays(start, diffToMonday, timeZone);
  const nextMonday = addZonedCalendarDays(monday, 7, timeZone);
  return { from: monday, to: nextMonday };
}

/** Add N calendar days keeping local midnight. */
export function addZonedCalendarDays(
  dayStartMs: number,
  days: number,
  timeZone: string,
): number {
  const p = getZonedParts(dayStartMs, timeZone);
  // Iterate day-by-day for correctness near DST (small N).
  if (Math.abs(days) <= 14) {
    let cur = dayStartMs;
    const step = days >= 0 ? 1 : -1;
    for (let i = 0; i < Math.abs(days); i++) {
      // Jump ~36h then snap to start of that day
      const probe = cur + step * 36 * 60 * 60 * 1000;
      cur = startOfZonedDay(probe, timeZone);
    }
    return cur;
  }
  // Large jumps: approximate then snap
  const approx = dayStartMs + days * 24 * 60 * 60 * 1000;
  return startOfZonedDay(approx, timeZone);
}

/** List each zoned midnight from windowStart through last day intersecting windowEnd. */
export function eachZonedDay(
  windowStart: number,
  windowEnd: number,
  timeZone: string,
): number[] {
  const days: number[] = [];
  let cur = startOfZonedDay(windowStart, timeZone);
  const last = startOfZonedDay(windowEnd - 1, timeZone);
  let guard = 0;
  while (cur <= last && guard < 400) {
    days.push(cur);
    cur = addZonedCalendarDays(cur, 1, timeZone);
    guard++;
  }
  return days;
}

/** Wall-clock HH:mm on a zoned calendar day → UTC ms. */
export function atZonedTime(
  dayStartMs: number,
  hm: string,
  timeZone: string,
): number {
  const p = getZonedParts(dayStartMs, timeZone);
  const [hStr, mStr] = hm.split(":");
  const hour = Number(hStr) || 0;
  const minute = Number(mStr) || 0;
  return zonedWallTimeToUtc(timeZone, p.year, p.month, p.day, hour, minute, 0);
}
