/**
 * Shared input validation for Convex mutations.
 * Uses structured CODE: message errors where helpful.
 */

import { appError, rateLimited } from "./errors";

export const LIMITS = {
  title: 200,
  name: 120,
  notes: 4000,
  description: 8000,
  address: 300,
  email: 200,
  phone: 40,
  short: 80,
  listDefault: 50,
  listMax: 200,
  jobsListMax: 200,
  suggestionsListMax: 100,
  assignmentArrayMax: 80,
  stringArrayItem: 500,
} as const;

export function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) appError("VALIDATION", `${label} is required.`);
  return trimmed;
}

export function requireMaxLength(
  value: string,
  max: number,
  label: string,
): string {
  if (value.length > max) {
    appError("VALIDATION", `${label} must be at most ${max} characters.`);
  }
  return value;
}

export function optionalTrimmedMax(
  value: string | undefined,
  max: number,
  label: string,
): string | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  if (!t) return undefined;
  return requireMaxLength(t, max, label);
}

export function requirePositiveDuration(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    appError("VALIDATION", "Duration must be a positive number of minutes.");
  }
  if (minutes > 24 * 60 * 14) {
    appError("VALIDATION", "Duration is unreasonably long (max 14 days).");
  }
  return minutes;
}

export function requireTimeRange(
  startAt: number,
  endAt: number,
  label = "Time range",
): void {
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) {
    appError("VALIDATION", `${label} is invalid.`);
  }
  if (endAt <= startAt) {
    appError("VALIDATION", `${label}: end must be after start.`);
  }
  const maxSpan = 1000 * 60 * 60 * 24 * 31; // 31 days
  if (endAt - startAt > maxSpan) {
    appError("VALIDATION", `${label} cannot exceed 31 days.`);
  }
}

export function requireNonEmptyIds<T extends string>(
  ids: T[],
  label: string,
): T[] {
  if (!ids.length) appError("VALIDATION", `Select at least one ${label}.`);
  return ids;
}

/** Cap batch sizes to protect the action payload and packer. */
export function requireJobBatchSize(ids: string[], max = 40): void {
  if (ids.length > max) {
    appError("VALIDATION", `At most ${max} jobs per suggestion run.`);
  }
}

/** Clamp client-provided list limits. */
export function clampListLimit(
  limit: number | undefined,
  opts: { default: number; max: number },
): number {
  if (limit === undefined || !Number.isFinite(limit)) return opts.default;
  const n = Math.floor(limit);
  if (n < 1) return opts.default;
  return Math.min(n, opts.max);
}

/** Simple sliding-window rate limit using createdAt timestamps. */
export function assertUnderRateLimit(
  recentTimestamps: number[],
  opts: { max: number; windowMs: number; label: string },
): void {
  const cutoff = Date.now() - opts.windowMs;
  const count = recentTimestamps.filter((t) => t >= cutoff).length;
  if (count >= opts.max) {
    rateLimited(
      `Too many ${opts.label} in a short period. Wait a few minutes and try again.`,
    );
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validate weekly hours blocks (day 0–6, HH:mm). */
export function validateWeeklyHours(
  blocks: Array<{ day: number; start: string; end: string }>,
): void {
  for (const b of blocks) {
    if (!Number.isInteger(b.day) || b.day < 0 || b.day > 6) {
      throw new Error("Weekly hours day must be 0 (Sunday) through 6 (Saturday).");
    }
    if (!HHMM.test(b.start) || !HHMM.test(b.end)) {
      throw new Error("Weekly hours must use HH:mm (24h) format.");
    }
  }
}
