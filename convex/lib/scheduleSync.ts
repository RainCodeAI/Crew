/**
 * Keep job.status loosely in sync with schedule rows after mutations.
 */

import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { conflict } from "./errors";

/**
 * After schedule create/confirm/cancel:
 * - any confirmed schedule → job at least `scheduled` (if draft)
 * - no non-cancelled schedules → job `scheduled` back to `draft`
 * Does not touch completed/cancelled/in_progress jobs (manual lifecycle).
 */
export async function syncJobStatusFromSchedules(
  ctx: MutationCtx,
  jobId: Id<"jobs">,
): Promise<void> {
  const job = await ctx.db.get(jobId);
  if (!job) return;
  if (
    job.status === "completed" ||
    job.status === "cancelled" ||
    job.status === "in_progress"
  ) {
    return;
  }

  const schedules = await ctx.db
    .query("schedules")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .collect();

  const active = schedules.filter((s) => s.status !== "cancelled");
  const hasConfirmed = active.some((s) => s.status === "confirmed");
  const now = Date.now();

  if (hasConfirmed && job.status === "draft") {
    await ctx.db.patch(jobId, { status: "scheduled", updatedAt: now });
    return;
  }

  if (active.length === 0 && job.status === "scheduled") {
    await ctx.db.patch(jobId, { status: "draft", updatedAt: now });
  }
}

/**
 * Block a second confirmed schedule for the same job (M5).
 * @param exceptScheduleId skip this id when checking (current row).
 */
export async function assertSingleConfirmedSchedule(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  jobId: Id<"jobs">,
  exceptScheduleId?: Id<"schedules">,
): Promise<void> {
  const schedules = await ctx.db
    .query("schedules")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .collect();

  const otherConfirmed = schedules.find(
    (s) =>
      s.status === "confirmed" &&
      s.companyId === companyId &&
      s._id !== exceptScheduleId,
  );

  if (otherConfirmed) {
    conflict(
      "This job already has a confirmed schedule. Cancel or update it before confirming another.",
    );
  }
}
