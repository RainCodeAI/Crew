/** Local datetime helpers for forms and board labels. */

/** Format epoch ms → value for `<input type="datetime-local" />`. */
export function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse datetime-local string → epoch ms (local timezone). */
export function fromDatetimeLocalValue(value: string): number {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) throw new Error("Invalid date/time");
  return t;
}

/** Start of local day for a Date. */
export function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday 00:00 local → next Monday 00:00 for the week containing `d`. */
export function weekRangeContaining(d = new Date()): { from: number; to: number } {
  const start = startOfLocalDay(d);
  const day = start.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { from: start.getTime(), to: end.getTime() };
}

/** Today local [start, end). */
export function todayRange(): { from: number; to: number } {
  const start = startOfLocalDay();
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.getTime(), to: end.getTime() };
}

export function formatDayHeading(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTimeRange(startAt: number, endAt: number): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  return `${new Date(startAt).toLocaleTimeString(undefined, opts)} – ${new Date(endAt).toLocaleTimeString(undefined, opts)}`;
}

/** Default start: next weekday 8:00 AM local. */
export function defaultAssignStart(): number {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  if (d.getHours() < 8) d.setHours(8);
  if (d.getHours() >= 17) {
    d.setDate(d.getDate() + 1);
    d.setHours(8);
  }
  // Skip Sunday → Monday, Saturday → Monday
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
    d.setHours(8);
  }
  return d.getTime();
}
