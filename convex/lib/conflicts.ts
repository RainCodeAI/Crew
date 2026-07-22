/**
 * Deterministic conflict detection for schedules.
 *
 * Pure evaluation lives in `conflicts.pure.ts` (unit-tested).
 * This module adapts Convex docs ↔ pure types and persists findings.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { ConflictSeverity, ConflictType } from "../../types";
import {
  evaluateConflictsPure,
  hasBlockingErrorsPure,
  type PureConflictFinding,
  type PureCrew,
  type PureJob,
  type PureSchedule,
} from "./conflicts.pure";
import { MAX_TIME_RANGE_MS } from "./validation";

/**
 * Fetch company schedules whose interval can overlap `[startAt, endAt)`, using
 * the `by_company_and_start` index rather than scanning the whole table.
 *
 * The lower bound reaches back {@link MAX_TIME_RANGE_MS} because a schedule can
 * be up to that long: one that *started* before `startAt` but is still running
 * would be missed by a naive `startAt >= startAt` query (M6/M8). Exact overlap
 * is decided by the caller / pure evaluator.
 */
async function collectSchedulesInRange(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  startAt: number,
  endAt: number,
): Promise<Doc<"schedules">[]> {
  return await ctx.db
    .query("schedules")
    .withIndex("by_company_and_start", (q) =>
      q
        .eq("companyId", companyId)
        .gte("startAt", startAt - MAX_TIME_RANGE_MS)
        .lt("startAt", endAt),
    )
    .collect();
}

export type ConflictFinding = {
  type: ConflictType;
  severity: ConflictSeverity;
  message: string;
  crewMemberIds?: Id<"crewMembers">[];
};

function toPureSchedule(
  s: Pick<
    Doc<"schedules">,
    | "_id"
    | "jobId"
    | "startAt"
    | "endAt"
    | "crewMemberIds"
    | "status"
    | "travelMinutesEstimate"
  >,
): PureSchedule {
  return {
    id: s._id,
    jobId: s.jobId,
    startAt: s.startAt,
    endAt: s.endAt,
    crewMemberIds: s.crewMemberIds as string[],
    status: s.status,
    travelMinutesEstimate: s.travelMinutesEstimate,
  };
}

function toPureJob(job: Doc<"jobs"> | null): PureJob | null {
  if (!job) return null;
  return {
    requiredSkills: job.requiredSkills,
    requiredCertifications: job.requiredCertifications,
    priority: job.priority,
    preferredStartAt: job.preferredStartAt,
    preferredEndAt: job.preferredEndAt,
    weatherRisk: job.weatherRisk,
  };
}

function toPureCrew(c: Doc<"crewMembers">): PureCrew {
  return {
    id: c._id,
    name: c.name,
    skills: c.skills,
    certifications: c.certifications,
    isActive: c.isActive,
  };
}

function fromPure(f: PureConflictFinding): ConflictFinding {
  return {
    type: f.type,
    severity: f.severity,
    message: f.message,
    crewMemberIds: f.crewMemberIds as Id<"crewMembers">[] | undefined,
  };
}

/**
 * Evaluate hard/soft conflicts for one schedule against related docs.
 * Thin wrapper over the pure evaluator — keep all rule logic there.
 */
export function evaluateScheduleConflicts(args: {
  schedule: Pick<
    Doc<"schedules">,
    | "_id"
    | "jobId"
    | "startAt"
    | "endAt"
    | "crewMemberIds"
    | "status"
    | "ownerOverride"
    | "travelMinutesEstimate"
  >;
  job: Doc<"jobs"> | null;
  crew: Doc<"crewMembers">[];
  otherSchedules: Doc<"schedules">[];
  availability: Doc<"availability">[];
}): ConflictFinding[] {
  const pure = evaluateConflictsPure({
    schedule: toPureSchedule(args.schedule),
    job: toPureJob(args.job),
    crew: args.crew.map(toPureCrew),
    otherSchedules: args.otherSchedules.map(toPureSchedule),
    availability: args.availability.map((a) => ({
      crewMemberId: a.crewMemberId as string,
      kind: a.kind,
      startAt: a.startAt,
      endAt: a.endAt,
    })),
  });
  return pure.map(fromPure);
}

/**
 * Replace stored conflicts for a schedule with freshly evaluated findings.
 */
export async function recomputeConflictsForSchedule(
  ctx: MutationCtx,
  scheduleId: Id<"schedules">,
): Promise<ConflictFinding[]> {
  const schedule = await ctx.db.get(scheduleId);
  if (!schedule) return [];

  const job = await ctx.db.get(schedule.jobId);
  const crew = (
    await Promise.all(schedule.crewMemberIds.map((id) => ctx.db.get(id)))
  ).filter((c): c is Doc<"crewMembers"> => c != null);

  const inRange = await collectSchedulesInRange(
    ctx,
    schedule.companyId,
    schedule.startAt,
    schedule.endAt,
  );

  // The same-job "double_booked" check must see a job's other confirmed
  // schedule even if it falls outside the overlap window, so pull those by job
  // and merge (deduped) with the time-bounded overlap candidates.
  const sameJob = await ctx.db
    .query("schedules")
    .withIndex("by_job", (q) => q.eq("jobId", schedule.jobId))
    .collect();
  const seen = new Set(inRange.map((s) => s._id as string));
  const otherSchedules = [
    ...inRange,
    ...sameJob.filter((s) => !seen.has(s._id as string)),
  ];

  const pad = 24 * 60 * 60 * 1000;
  const availability = await ctx.db
    .query("availability")
    .withIndex("by_company", (q) => q.eq("companyId", schedule.companyId))
    .collect();

  const findings = evaluateScheduleConflicts({
    schedule,
    job,
    crew,
    otherSchedules,
    availability: availability.filter(
      (a) =>
        a.startAt < schedule.endAt + pad && a.endAt > schedule.startAt - pad,
    ),
  });

  const existing = await ctx.db
    .query("conflicts")
    .withIndex("by_schedule", (q) => q.eq("scheduleId", scheduleId))
    .collect();

  // Preserve soft-dismissals: if a prior row of the same type was resolved, keep it resolved.
  const resolvedTypes = new Set(
    existing.filter((r) => r.isResolved).map((r) => r.type),
  );

  for (const row of existing) {
    await ctx.db.delete(row._id);
  }

  const now = Date.now();
  for (const f of findings) {
    const wasResolved = resolvedTypes.has(f.type);
    await ctx.db.insert("conflicts", {
      companyId: schedule.companyId,
      scheduleId,
      jobId: schedule.jobId,
      crewMemberIds: f.crewMemberIds,
      type: f.type,
      severity: f.severity,
      message: f.message,
      isResolved: wasResolved,
      resolvedAt: wasResolved ? now : undefined,
      createdAt: now,
    });
  }

  return findings;
}

/**
 * Recompute conflicts for every non-cancelled schedule overlapping `[startAt,
 * endAt)` for a company. Use after a schedule is cancelled, moved, or replaced:
 * a peer's stored findings (e.g. "double-booked against schedule X") go stale
 * when X changes, and are only refreshed when the peer itself is recomputed (M5).
 *
 * `exceptIds` skips schedules the caller has already recomputed directly.
 */
export async function recomputeConflictsForWindow(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  startAt: number,
  endAt: number,
  exceptIds: Id<"schedules">[] = [],
): Promise<void> {
  const skip = new Set<string>(exceptIds);
  const candidates = await collectSchedulesInRange(
    ctx,
    companyId,
    startAt,
    endAt,
  );
  for (const s of candidates) {
    if (skip.has(s._id)) continue;
    if (s.status === "cancelled") continue;
    // Exact overlap with the affected window.
    if (s.startAt < endAt && s.endAt > startAt) {
      await recomputeConflictsForSchedule(ctx, s._id);
    }
  }
}

/** True if any unresolved error-severity conflicts exist for the schedule. */
export function hasBlockingErrors(
  findings: ConflictFinding[],
  ownerOverride?: boolean,
): boolean {
  return hasBlockingErrorsPure(findings, ownerOverride);
}

/**
 * Preview conflicts for a hypothetical placement (no writes).
 * Used by assign UI and packing validation.
 */
export function previewPlacementConflicts(args: {
  startAt: number;
  endAt: number;
  crewMemberIds: Id<"crewMembers">[];
  job: Doc<"jobs"> | null;
  crew: Doc<"crewMembers">[];
  otherSchedules: Doc<"schedules">[];
  availability: Doc<"availability">[];
  /** Fake id for self-exclusion in pure eval. */
  provisionalId?: string;
  /** Ids requested but not found (cross-tenant / deleted). */
  missingCrewIds?: Id<"crewMembers">[];
}): ConflictFinding[] {
  const schedule = {
    _id: (args.provisionalId ?? "provisional") as Id<"schedules">,
    jobId: (args.job?._id ?? ("provisional-job" as Id<"jobs">)),
    startAt: args.startAt,
    endAt: args.endAt,
    crewMemberIds: args.crewMemberIds,
    status: "draft" as const,
    ownerOverride: undefined,
    travelMinutesEstimate: undefined,
  };

  const findings = evaluateScheduleConflicts({
    schedule,
    job: args.job,
    crew: args.crew,
    otherSchedules: args.otherSchedules,
    availability: args.availability,
  });

  for (const id of args.missingCrewIds ?? []) {
    findings.push({
      type: "inactive_crew",
      severity: "error",
      message: "Assigned crew member was not found or is not in this company.",
      crewMemberIds: [id],
    });
  }

  return findings;
}
