import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  assertCanOwnerOverride,
  assertSameCompany,
  requireCurrentUser,
} from "./lib/tenant";
import {
  hasBlockingErrors,
  previewPlacementConflicts,
  recomputeConflictsForSchedule,
} from "./lib/conflicts";
import {
  assertSingleConfirmedSchedule,
  syncJobStatusFromSchedules,
} from "./lib/scheduleSync";
import { optionalTrimmedMax, requireTimeRange, LIMITS } from "./lib/validation";
import { badRequest, conflict } from "./lib/errors";

/** Max lookback so long jobs that started before `from` still appear (M10). */
const BOARD_START_PAD_MS = 30 * 24 * 60 * 60 * 1000;

/** Board payload for a date range — schedules, jobs, crew names, conflicts. */
export const boardForRange = query({
  args: {
    from: v.number(),
    to: v.number(),
  },
  handler: async (ctx, { from, to }) => {
    const user = await requireCurrentUser(ctx);
    // Overlap: start < to AND end > from (pad start for multi-day jobs).
    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_company_and_start", (q) =>
        q
          .eq("companyId", user.companyId)
          .gte("startAt", from - BOARD_START_PAD_MS)
          .lt("startAt", to),
      )
      .collect();

    const active = schedules
      .filter(
        (s) =>
          s.status !== "cancelled" && s.endAt > from && s.startAt < to,
      )
      .sort((a, b) => a.startAt - b.startAt);

    const jobIds = [...new Set(active.map((s) => s.jobId))];
    const jobs = (
      await Promise.all(jobIds.map((id) => ctx.db.get(id)))
    ).filter((j) => j != null);

    const jobsById: Record<string, (typeof jobs)[number]> = {};
    for (const j of jobs) {
      jobsById[j._id] = j;
    }

    const crewIds = [...new Set(active.flatMap((s) => s.crewMemberIds))];
    const crew = (
      await Promise.all(crewIds.map((id) => ctx.db.get(id)))
    ).filter((c) => c != null);
    const crewById: Record<string, (typeof crew)[number]> = {};
    for (const c of crew) {
      crewById[c._id] = c;
    }

    // L8: only conflicts for schedules visible on this board range.
    const activeIds = new Set(active.map((s) => s._id as string));
    const conflictsByScheduleId: Record<
      string,
      Array<{
        _id: Id<"conflicts">;
        scheduleId: Id<"schedules">;
        type: string;
        severity: string;
        message: string;
        isResolved: boolean;
      }>
    > = {};

    for (const s of active) {
      const rows = await ctx.db
        .query("conflicts")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", s._id))
        .collect();
      const open = rows.filter(
        (r) => !r.isResolved && activeIds.has(r.scheduleId),
      );
      if (open.length) {
        conflictsByScheduleId[s._id] = open.map((r) => ({
          _id: r._id,
          scheduleId: r.scheduleId,
          type: r.type,
          severity: r.severity,
          message: r.message,
          isResolved: r.isResolved,
        }));
      }
    }

    return {
      schedules: active,
      jobsById,
      crewById,
      conflictsByScheduleId,
    };
  },
});

export const listForJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const user = await requireCurrentUser(ctx);
    const job = await ctx.db.get(jobId);
    assertSameCompany(job, user.companyId);

    return await ctx.db
      .query("schedules")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .collect();
  },
});

/** Schedules produced by a suggestion run (for detail page). */
export const listForSuggestion = query({
  args: { suggestionId: v.id("scheduleSuggestions") },
  handler: async (ctx, { suggestionId }) => {
    const user = await requireCurrentUser(ctx);
    const suggestion = await ctx.db.get(suggestionId);
    assertSameCompany(suggestion, user.companyId);

    const schedules = (
      await ctx.db
        .query("schedules")
        .withIndex("by_suggestion", (q) => q.eq("suggestionId", suggestionId))
        .collect()
    )
      .filter((s) => s.status !== "cancelled")
      .sort((a, b) => a.startAt - b.startAt);

    const jobsById: Record<string, NonNullable<Awaited<ReturnType<typeof ctx.db.get>>>> = {};
    const crewById: Record<string, NonNullable<Awaited<ReturnType<typeof ctx.db.get>>>> = {};
    const conflictsByScheduleId: Record<
      string,
      Array<{
        _id: Id<"conflicts">;
        type: string;
        severity: string;
        message: string;
        isResolved: boolean;
      }>
    > = {};

    for (const s of schedules) {
      if (!jobsById[s.jobId]) {
        const job = await ctx.db.get(s.jobId);
        if (job) jobsById[s.jobId] = job;
      }
      for (const crewId of s.crewMemberIds) {
        if (!crewById[crewId]) {
          const member = await ctx.db.get(crewId);
          if (member) crewById[crewId] = member;
        }
      }
      const rows = await ctx.db
        .query("conflicts")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", s._id))
        .collect();
      conflictsByScheduleId[s._id] = rows
        .filter((r) => !r.isResolved)
        .map((r) => ({
          _id: r._id,
          type: r.type,
          severity: r.severity,
          message: r.message,
          isResolved: r.isResolved,
        }));
    }

    return { schedules, jobsById, crewById, conflictsByScheduleId };
  },
});

/**
 * Preview conflicts for a placement before writing (assign dialog).
 */
export const previewConflicts = query({
  args: {
    jobId: v.id("jobs"),
    startAt: v.number(),
    endAt: v.number(),
    crewMemberIds: v.array(v.id("crewMembers")),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const job = await ctx.db.get(args.jobId);
    assertSameCompany(job, user.companyId);
    requireTimeRange(args.startAt, args.endAt, "Schedule");

    const missingCrewIds: Id<"crewMembers">[] = [];
    const crew = [];
    for (const id of args.crewMemberIds) {
      const member = await ctx.db.get(id);
      if (!member || member.companyId !== user.companyId) {
        missingCrewIds.push(id);
        continue;
      }
      crew.push(member);
    }

    const pad = 24 * 60 * 60 * 1000;
    const otherSchedules = (
      await ctx.db
        .query("schedules")
        .withIndex("by_company_and_start", (q) =>
          q
            .eq("companyId", user.companyId)
            .gte("startAt", args.startAt - pad)
            .lt("startAt", args.endAt + pad),
        )
        .collect()
    ).filter((s) => s.status !== "cancelled");

    const availability = (
      await ctx.db
        .query("availability")
        .withIndex("by_company", (q) => q.eq("companyId", user.companyId))
        .collect()
    ).filter(
      (a) =>
        a.startAt < args.endAt + pad && a.endAt > args.startAt - pad,
    );

    return previewPlacementConflicts({
      startAt: args.startAt,
      endAt: args.endAt,
      crewMemberIds: crew.map((c) => c._id),
      job,
      crew,
      otherSchedules,
      availability,
      missingCrewIds,
    });
  },
});

export const create = mutation({
  args: {
    jobId: v.id("jobs"),
    startAt: v.number(),
    endAt: v.number(),
    crewMemberIds: v.array(v.id("crewMembers")),
    notes: v.optional(v.string()),
    ownerOverride: v.optional(v.boolean()),
    /** When true, create as confirmed after conflict check. Default draft. */
    confirm: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    assertCanOwnerOverride(user, args.ownerOverride);

    const job = await ctx.db.get(args.jobId);
    assertSameCompany(job, user.companyId);

    requireTimeRange(args.startAt, args.endAt, "Schedule");

    for (const crewId of args.crewMemberIds) {
      const member = await ctx.db.get(crewId);
      assertSameCompany(member, user.companyId);
    }

    const now = Date.now();
    if (args.confirm) {
      await assertSingleConfirmedSchedule(ctx, user.companyId, args.jobId);
    }

    // Always insert as draft first; promote only after conflict check.
    const scheduleId = await ctx.db.insert("schedules", {
      companyId: user.companyId,
      jobId: args.jobId,
      startAt: args.startAt,
      endAt: args.endAt,
      crewMemberIds: args.crewMemberIds,
      status: "draft",
      source: "manual",
      notes: optionalTrimmedMax(args.notes, LIMITS.notes, "Notes"),
      ownerOverride: args.ownerOverride,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    const findings = await recomputeConflictsForSchedule(ctx, scheduleId);
    const company = await ctx.db.get(user.companyId);
    const strict = company?.strictConflictPolicy !== false;

    if (
      args.confirm &&
      strict &&
      hasBlockingErrors(findings, args.ownerOverride)
    ) {
      conflict(
        "Blocking conflicts found. Fix them or set ownerOverride to confirm (owners only).",
      );
    }

    if (args.confirm) {
      await ctx.db.patch(scheduleId, {
        status: "confirmed",
        confirmedBy: user._id,
        confirmedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    await syncJobStatusFromSchedules(ctx, args.jobId);
    return scheduleId;
  },
});

export const update = mutation({
  args: {
    scheduleId: v.id("schedules"),
    startAt: v.optional(v.number()),
    endAt: v.optional(v.number()),
    crewMemberIds: v.optional(v.array(v.id("crewMembers"))),
    notes: v.optional(v.string()),
    ownerOverride: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    assertCanOwnerOverride(user, args.ownerOverride);

    const schedule = await ctx.db.get(args.scheduleId);
    assertSameCompany(schedule, user.companyId);

    if (schedule!.status === "cancelled") {
      badRequest("Cannot update a cancelled schedule.");
    }

    const startAt = args.startAt ?? schedule!.startAt;
    const endAt = args.endAt ?? schedule!.endAt;
    if (endAt <= startAt) badRequest("End must be after start.");

    if (args.crewMemberIds) {
      for (const crewId of args.crewMemberIds) {
        const member = await ctx.db.get(crewId);
        assertSameCompany(member, user.companyId);
      }
    }

    const patch: Record<string, unknown> = {
      startAt,
      endAt,
      updatedAt: Date.now(),
    };
    if (args.crewMemberIds !== undefined) {
      patch.crewMemberIds = args.crewMemberIds;
    }
    if (args.notes !== undefined) {
      patch.notes = optionalTrimmedMax(args.notes, LIMITS.notes, "Notes");
    }
    if (args.ownerOverride !== undefined) {
      patch.ownerOverride = args.ownerOverride;
    }

    await ctx.db.patch(args.scheduleId, patch);
    const findings = await recomputeConflictsForSchedule(ctx, args.scheduleId);

    // H4: editing an already-confirmed schedule must not silently move it into
    // a hard conflict (double-book, inactive crew, PTO). Members cannot pass
    // ownerOverride (guarded above), so this also keeps them from bypassing it.
    if (schedule!.status === "confirmed") {
      const company = await ctx.db.get(user.companyId);
      const strict = company?.strictConflictPolicy !== false;
      const override = args.ownerOverride ?? schedule!.ownerOverride;
      if (strict && hasBlockingErrors(findings, override)) {
        conflict(
          "This change would put a confirmed schedule into a blocking conflict. Adjust the time or crew, or use owner override.",
        );
      }
    }

    return args.scheduleId;
  },
});

export const confirm = mutation({
  args: {
    scheduleId: v.id("schedules"),
    ownerOverride: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    assertCanOwnerOverride(user, args.ownerOverride);

    const schedule = await ctx.db.get(args.scheduleId);
    assertSameCompany(schedule, user.companyId);

    if (schedule!.status === "cancelled") {
      badRequest("Cannot confirm a cancelled schedule.");
    }
    if (schedule!.status === "confirmed") return args.scheduleId;

    await assertSingleConfirmedSchedule(
      ctx,
      user.companyId,
      schedule!.jobId,
      args.scheduleId,
    );

    if (args.ownerOverride) {
      await ctx.db.patch(args.scheduleId, {
        ownerOverride: true,
        updatedAt: Date.now(),
      });
    }

    const findings = await recomputeConflictsForSchedule(ctx, args.scheduleId);
    const company = await ctx.db.get(user.companyId);
    const strict = company?.strictConflictPolicy !== false;
    const override = args.ownerOverride || schedule!.ownerOverride;

    if (strict && hasBlockingErrors(findings, override)) {
      conflict(
        "Blocking conflicts found. Fix them or confirm with ownerOverride (owners only).",
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.scheduleId, {
      status: "confirmed",
      confirmedBy: user._id,
      confirmedAt: now,
      updatedAt: now,
    });

    await syncJobStatusFromSchedules(ctx, schedule!.jobId);
    return args.scheduleId;
  },
});

export const cancel = mutation({
  args: { scheduleId: v.id("schedules") },
  handler: async (ctx, { scheduleId }) => {
    const user = await requireCurrentUser(ctx);
    const schedule = await ctx.db.get(scheduleId);
    assertSameCompany(schedule, user.companyId);

    await ctx.db.patch(scheduleId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
    await recomputeConflictsForSchedule(ctx, scheduleId);
    await syncJobStatusFromSchedules(ctx, schedule!.jobId);
    return scheduleId;
  },
});

/** Soft-dismiss a conflict (owners/members); preserved across recompute of same type. */
export const dismissConflict = mutation({
  args: { conflictId: v.id("conflicts") },
  handler: async (ctx, { conflictId }) => {
    const user = await requireCurrentUser(ctx);
    const row = await ctx.db.get(conflictId);
    assertSameCompany(row, user.companyId);
    if (row!.severity === "error") {
      badRequest(
        "Hard conflicts cannot be dismissed. Fix the schedule or use owner override on confirm.",
      );
    }
    await ctx.db.patch(conflictId, {
      isResolved: true,
      resolvedBy: user._id,
      resolvedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return conflictId;
  },
});

/** List open conflicts for the company (board badges). */
export const listOpenConflicts = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    return await ctx.db
      .query("conflicts")
      .withIndex("by_company_and_resolved", (q) =>
        q.eq("companyId", user.companyId).eq("isResolved", false),
      )
      .collect();
  },
});

export const getConflictsForSchedule = query({
  args: { scheduleId: v.id("schedules") },
  handler: async (ctx, { scheduleId }) => {
    const user = await requireCurrentUser(ctx);
    const schedule = await ctx.db.get(scheduleId);
    assertSameCompany(schedule, user.companyId);
    return await ctx.db
      .query("conflicts")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", scheduleId))
      .collect();
  },
});

/** Internal helper type export for suggestions module. */
export type ScheduleId = Id<"schedules">;
