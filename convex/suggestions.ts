import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  assertCanOwnerOverride,
  assertSameCompany,
  requireCurrentUser,
  requireOwner,
} from "./lib/tenant";
import {
  hasBlockingErrors,
  recomputeConflictsForSchedule,
} from "./lib/conflicts";
import {
  assertSingleConfirmedSchedule,
  syncJobStatusFromSchedules,
} from "./lib/scheduleSync";
import {
  assertUnderRateLimit,
  clampListLimit,
  LIMITS,
  optionalTrimmedMax,
  requireJobBatchSize,
  requireNonEmptyIds,
  requireTimeRange,
} from "./lib/validation";
import {
  suggestedAssignmentValidator,
  unscheduledJobReasonValidator,
} from "./schema";

/** Max suggestion runs per company per rolling hour. */
const SUGGESTION_RATE_MAX = 20;
const SUGGESTION_RATE_WINDOW_MS = 60 * 60 * 1000;

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const limit = clampListLimit(args.limit, {
      default: LIMITS.listDefault,
      max: LIMITS.suggestionsListMax,
    });
    return await ctx.db
      .query("scheduleSuggestions")
      .withIndex("by_company_and_created", (q) =>
        q.eq("companyId", user.companyId),
      )
      .order("desc")
      .take(limit);
  },
});

export const get = query({
  args: { suggestionId: v.id("scheduleSuggestions") },
  handler: async (ctx, { suggestionId }) => {
    const user = await requireCurrentUser(ctx);
    const row = await ctx.db.get(suggestionId);
    return assertSameCompany(row, user.companyId);
  },
});

/**
 * Create a suggestion run (save-first) and schedule the AI action.
 * Status stays `pending` until owner approves/rejects.
 */
export const create = mutation({
  args: {
    jobIds: v.array(v.id("jobs")),
    windowStartAt: v.number(),
    windowEndAt: v.number(),
    preserveConfirmed: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    requireNonEmptyIds(args.jobIds, "job");
    requireJobBatchSize(args.jobIds);
    requireTimeRange(args.windowStartAt, args.windowEndAt, "Suggestion window");

    const recent = await ctx.db
      .query("scheduleSuggestions")
      .withIndex("by_company_and_created", (q) =>
        q.eq("companyId", user.companyId),
      )
      .order("desc")
      .take(SUGGESTION_RATE_MAX);
    assertUnderRateLimit(
      recent.map((r) => r.createdAt),
      {
        max: SUGGESTION_RATE_MAX,
        windowMs: SUGGESTION_RATE_WINDOW_MS,
        label: "suggestion runs",
      },
    );

    for (const jobId of args.jobIds) {
      const job = await ctx.db.get(jobId);
      assertSameCompany(job, user.companyId);
    }

    const now = Date.now();
    const suggestionId = await ctx.db.insert("scheduleSuggestions", {
      companyId: user.companyId,
      status: "pending",
      aiStatus: "pending",
      windowStartAt: args.windowStartAt,
      windowEndAt: args.windowEndAt,
      jobIds: args.jobIds,
      preserveConfirmed: args.preserveConfirmed ?? true,
      ownerNotes: optionalTrimmedMax(args.notes, LIMITS.notes, "Notes"),
      aiGenerationAttempts: 0,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.ai.suggestSchedule, {
      suggestionId,
    });

    return suggestionId;
  },
});

/** Retry a failed AI run only (owners). Rate-limited. */
export const retry = mutation({
  args: { suggestionId: v.id("scheduleSuggestions") },
  handler: async (ctx, { suggestionId }) => {
    const user = await requireOwner(ctx);
    const row = await ctx.db.get(suggestionId);
    assertSameCompany(row, user.companyId);

    if (row!.status !== "pending") {
      throw new Error("Only pending suggestions can be retried.");
    }
    if (row!.aiStatus !== "failed") {
      throw new Error("Only failed AI runs can be retried.");
    }

    const recent = await ctx.db
      .query("scheduleSuggestions")
      .withIndex("by_company_and_created", (q) =>
        q.eq("companyId", user.companyId),
      )
      .order("desc")
      .take(SUGGESTION_RATE_MAX);
    assertUnderRateLimit(
      recent.map((r) => r.createdAt),
      {
        max: SUGGESTION_RATE_MAX,
        windowMs: SUGGESTION_RATE_WINDOW_MS,
        label: "suggestion runs",
      },
    );

    await ctx.db.patch(suggestionId, {
      aiStatus: "pending",
      aiErrorMessage: undefined,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.ai.suggestSchedule, {
      suggestionId,
    });
    return suggestionId;
  },
});

/**
 * Approve: promote draft/proposed schedules from this run to confirmed.
 * Owners only. Optional `scheduleIds` = partial approve (must be non-empty).
 *
 * Validates all targets for blocking conflicts *before* writing, then applies
 * confirms, then cancels unselected drafts (H3).
 */
export const approve = mutation({
  args: {
    suggestionId: v.id("scheduleSuggestions"),
    ownerOverride: v.optional(v.boolean()),
    /** When set, only confirm these schedule ids from the run (non-empty). */
    scheduleIds: v.optional(v.array(v.id("schedules"))),
  },
  handler: async (ctx, args) => {
    const user = await requireOwner(ctx);
    assertCanOwnerOverride(user, args.ownerOverride);

    const suggestion = await ctx.db.get(args.suggestionId);
    assertSameCompany(suggestion, user.companyId);

    if (suggestion!.status !== "pending") {
      throw new Error("Suggestion is not pending review.");
    }
    if (suggestion!.aiStatus !== "completed") {
      throw new Error("AI has not completed successfully yet.");
    }

    if (args.scheduleIds !== undefined && args.scheduleIds.length === 0) {
      throw new Error(
        "Select at least one assignment to approve, or use Approve all.",
      );
    }

    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_suggestion", (q) =>
        q.eq("suggestionId", args.suggestionId),
      )
      .collect();

    const byId = new Map(schedules.map((s) => [s._id as string, s]));

    // Partial: every provided id must belong to this suggestion (same company).
    if (args.scheduleIds) {
      for (const id of args.scheduleIds) {
        const s = byId.get(id);
        if (!s || s.companyId !== user.companyId) {
          throw new Error("One or more selected schedules are invalid.");
        }
      }
    }

    const toConfirm = args.scheduleIds
      ? args.scheduleIds
          .map((id) => byId.get(id)!)
          .filter((s) => s.status !== "cancelled")
      : schedules.filter((s) => s.status !== "cancelled");

    if (toConfirm.length === 0) {
      throw new Error("No schedules available to confirm.");
    }

    const company = await ctx.db.get(user.companyId);
    const strict = company?.strictConflictPolicy !== false;
    const override = args.ownerOverride === true;

    // Preflight: single-confirmed-job rule + conflicts (no writes until clean).
    for (const schedule of toConfirm) {
      await assertSingleConfirmedSchedule(
        ctx,
        user.companyId,
        schedule.jobId,
        schedule._id,
      );
      const findings = await recomputeConflictsForSchedule(ctx, schedule._id);
      if (strict && hasBlockingErrors(findings, override || schedule.ownerOverride)) {
        throw new Error(
          `Blocking conflicts on schedule for job ${schedule.jobId}. Fix them or use owner override.`,
        );
      }
    }

    const now = Date.now();
    const confirmSet = new Set(toConfirm.map((s) => s._id as string));

    for (const schedule of toConfirm) {
      await ctx.db.patch(schedule._id, {
        status: "confirmed",
        confirmedBy: user._id,
        confirmedAt: now,
        ownerOverride: override || schedule.ownerOverride,
        updatedAt: now,
      });
      await syncJobStatusFromSchedules(ctx, schedule.jobId);
    }

    // Partial only: cancel unselected draft/proposed rows after successful confirms.
    if (args.scheduleIds) {
      for (const schedule of schedules) {
        if (confirmSet.has(schedule._id)) continue;
        if (schedule.status === "confirmed" || schedule.status === "cancelled") {
          continue;
        }
        await ctx.db.patch(schedule._id, {
          status: "cancelled",
          updatedAt: now,
        });
        await recomputeConflictsForSchedule(ctx, schedule._id);
        await syncJobStatusFromSchedules(ctx, schedule.jobId);
      }
    }

    await ctx.db.patch(args.suggestionId, {
      status: "approved",
      reviewedBy: user._id,
      reviewedAt: now,
      updatedAt: now,
    });

    return args.suggestionId;
  },
});

/** Reject: cancel draft schedules from this run; keep jobs unscheduled. Owners. */
export const reject = mutation({
  args: { suggestionId: v.id("scheduleSuggestions") },
  handler: async (ctx, { suggestionId }) => {
    const user = await requireOwner(ctx);
    const suggestion = await ctx.db.get(suggestionId);
    assertSameCompany(suggestion, user.companyId);

    if (suggestion!.status !== "pending") {
      throw new Error("Suggestion is not pending review.");
    }

    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_suggestion", (q) => q.eq("suggestionId", suggestionId))
      .collect();

    const now = Date.now();
    for (const schedule of schedules) {
      if (schedule.status === "confirmed") continue;
      await ctx.db.patch(schedule._id, {
        status: "cancelled",
        updatedAt: now,
      });
      await recomputeConflictsForSchedule(ctx, schedule._id);
      await syncJobStatusFromSchedules(ctx, schedule.jobId);
    }

    await ctx.db.patch(suggestionId, {
      status: "rejected",
      reviewedBy: user._id,
      reviewedAt: now,
      updatedAt: now,
    });

    return suggestionId;
  },
});

// --- Internal mutations used by the AI action --------------------------------

export const markProcessing = internalMutation({
  args: { suggestionId: v.id("scheduleSuggestions") },
  handler: async (ctx, { suggestionId }) => {
    const row = await ctx.db.get(suggestionId);
    if (!row) return;
    await ctx.db.patch(suggestionId, {
      aiStatus: "processing",
      aiGenerationAttempts: (row.aiGenerationAttempts ?? 0) + 1,
      updatedAt: Date.now(),
    });
  },
});

export const applyAiResult = internalMutation({
  args: {
    suggestionId: v.id("scheduleSuggestions"),
    assignments: v.array(suggestedAssignmentValidator),
    unscheduled: v.array(unscheduledJobReasonValidator),
    notes: v.array(v.string()),
    warnings: v.array(v.string()),
    confidence: v.number(),
  },
  handler: async (ctx, args) => {
    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) return;

    // Clear prior draft schedules from this run
    const existing = await ctx.db
      .query("schedules")
      .withIndex("by_suggestion", (q) =>
        q.eq("suggestionId", args.suggestionId),
      )
      .collect();
    for (const s of existing) {
      if (s.status !== "confirmed") {
        await ctx.db.patch(s._id, {
          status: "cancelled",
          updatedAt: Date.now(),
        });
      }
    }

    const now = Date.now();
    const allowedJobs = new Set(suggestion.jobIds as Id<"jobs">[]);

    for (const a of args.assignments) {
      if (!allowedJobs.has(a.jobId)) continue;
      const job = await ctx.db.get(a.jobId);
      if (!job || job.companyId !== suggestion.companyId) continue;
      if (a.endAt <= a.startAt) continue;

      const validCrew: Id<"crewMembers">[] = [];
      for (const crewId of a.crewMemberIds) {
        const member = await ctx.db.get(crewId);
        if (member && member.companyId === suggestion.companyId && member.isActive) {
          validCrew.push(crewId);
        }
      }

      const scheduleId = await ctx.db.insert("schedules", {
        companyId: suggestion.companyId,
        jobId: a.jobId,
        startAt: a.startAt,
        endAt: a.endAt,
        crewMemberIds: validCrew,
        status: "proposed",
        source: "ai_suggestion",
        suggestionId: args.suggestionId,
        notes: a.rationale,
        createdBy: suggestion.createdBy,
        createdAt: now,
        updatedAt: now,
      });

      await recomputeConflictsForSchedule(ctx, scheduleId);
    }

    await ctx.db.patch(args.suggestionId, {
      status: "pending",
      aiStatus: "completed",
      assignments: args.assignments,
      unscheduled: args.unscheduled,
      aiNotes: args.notes,
      aiWarnings: args.warnings,
      aiConfidence: args.confidence,
      aiProcessedAt: now,
      aiErrorMessage: undefined,
      updatedAt: now,
    });
  },
});

export const applyAiFailure = internalMutation({
  args: {
    suggestionId: v.id("scheduleSuggestions"),
    message: v.string(),
  },
  handler: async (ctx, { suggestionId, message }) => {
    const row = await ctx.db.get(suggestionId);
    if (!row) return;
    await ctx.db.patch(suggestionId, {
      aiStatus: "failed",
      aiErrorMessage: message,
      updatedAt: Date.now(),
    });
  },
});

/** Load snapshot for the AI action (internal). */
export const getSnapshot = internalQuery({
  args: { suggestionId: v.id("scheduleSuggestions") },
  handler: async (ctx, { suggestionId }) => {
    const suggestion = await ctx.db.get(suggestionId);
    if (!suggestion) return null;

    const company = await ctx.db.get(suggestion.companyId);
    const jobs = (
      await Promise.all(suggestion.jobIds.map((id) => ctx.db.get(id)))
    ).filter((j) => j != null && j.companyId === suggestion.companyId);

    const crew = await ctx.db
      .query("crewMembers")
      .withIndex("by_company", (q) => q.eq("companyId", suggestion.companyId))
      .collect();

    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_company_and_start", (q) =>
        q
          .eq("companyId", suggestion.companyId)
          .gte("startAt", suggestion.windowStartAt - 86400000)
          .lt("startAt", suggestion.windowEndAt + 86400000),
      )
      .collect();

    const availability = await ctx.db
      .query("availability")
      .withIndex("by_company", (q) => q.eq("companyId", suggestion.companyId))
      .collect();

    return {
      suggestion,
      company,
      jobs,
      crew,
      schedules: schedules.filter((s) => s.status !== "cancelled"),
      availability: availability.filter(
        (a) =>
          a.endAt >= suggestion.windowStartAt &&
          a.startAt <= suggestion.windowEndAt,
      ),
    };
  },
});
