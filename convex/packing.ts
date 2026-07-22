import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireCurrentUser, assertSameCompany } from "./lib/tenant";
import { greedyPackSchedule } from "./lib/scheduling";
import { recomputeConflictsForSchedule } from "./lib/conflicts";
import { resolveTimeZone } from "./lib/timezone";
import {
  assertUnderRateLimit,
  MAX_TIME_RANGE_MS,
  requireJobBatchSize,
  requireNonEmptyIds,
  requireTimeRange,
} from "./lib/validation";
import { badRequest } from "./lib/errors";

const PACK_RATE_MAX = 30;
const PACK_RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Deterministic (no OpenAI) pack for selected draft jobs into proposed schedules.
 * Creates a scheduleSuggestions audit row + proposed schedules.
 */
export const greedySuggest = mutation({
  args: {
    jobIds: v.array(v.id("jobs")),
    windowStartAt: v.number(),
    windowEndAt: v.number(),
    /** Skip jobs that already have a confirmed schedule in-window (default true). */
    preserveConfirmed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    requireNonEmptyIds(args.jobIds, "job");
    requireJobBatchSize(args.jobIds);
    requireTimeRange(args.windowStartAt, args.windowEndAt, "Pack window");
    const preserveConfirmed = args.preserveConfirmed !== false;

    const recent = await ctx.db
      .query("scheduleSuggestions")
      .withIndex("by_company_and_created", (q) =>
        q.eq("companyId", user.companyId),
      )
      .order("desc")
      .take(PACK_RATE_MAX);
    assertUnderRateLimit(
      recent.map((r) => r.createdAt),
      {
        max: PACK_RATE_MAX,
        windowMs: PACK_RATE_WINDOW_MS,
        label: "pack / suggestion runs",
      },
    );

    const jobs = [];
    for (const jobId of args.jobIds) {
      const job = await ctx.db.get(jobId);
      assertSameCompany(job, user.companyId);
      jobs.push(job!);
    }

    const crew = await ctx.db
      .query("crewMembers")
      .withIndex("by_company", (q) => q.eq("companyId", user.companyId))
      .collect();

    const existing = await ctx.db
      .query("schedules")
      .withIndex("by_company_and_start", (q) =>
        q
          .eq("companyId", user.companyId)
          .gte("startAt", args.windowStartAt - MAX_TIME_RANGE_MS)
          .lt("startAt", args.windowEndAt + 86400000),
      )
      .collect();

    const confirmedJobIds = new Set(
      existing
        .filter((s) => s.status === "confirmed")
        .map((s) => s.jobId as string),
    );

    // L6: do not re-pack jobs that already have a confirmed placement.
    const packableJobs = preserveConfirmed
      ? jobs.filter((j) => !confirmedJobIds.has(j._id))
      : jobs;

    const busy = existing
      .filter((s) =>
        preserveConfirmed
          ? s.status === "confirmed" || s.status === "proposed"
          : s.status === "proposed",
      )
      .flatMap((s) =>
        s.crewMemberIds.map((crewMemberId) => ({
          crewMemberId: crewMemberId as string,
          startAt: s.startAt,
          endAt: s.endAt,
        })),
      );

    const availability = await ctx.db
      .query("availability")
      .withIndex("by_company", (q) => q.eq("companyId", user.companyId))
      .collect();

    const unavailable = availability
      .filter((a) => a.kind === "unavailable")
      .map((a) => ({
        crewMemberId: a.crewMemberId as string,
        startAt: a.startAt,
        endAt: a.endAt,
      }));

    const company = await ctx.db.get(user.companyId);
    const companyHours =
      company?.defaultWorkdayStart && company?.defaultWorkdayEnd
        ? [1, 2, 3, 4, 5].map((day) => ({
            day,
            start: company.defaultWorkdayStart!,
            end: company.defaultWorkdayEnd!,
          }))
        : undefined;

    if (!packableJobs.length) {
      badRequest(
        "All selected jobs already have confirmed schedules in this window.",
      );
    }

    const packed = greedyPackSchedule({
      jobs: packableJobs.map((j) => ({
        id: j._id as string,
        title: j.title,
        durationMinutes: j.estimatedDurationMinutes,
        requiredSkills: j.requiredSkills,
        priority: j.priority,
        preferredStartAt: j.preferredStartAt,
        preferredEndAt: j.preferredEndAt,
      })),
      crew: crew.map((c) => ({
        id: c._id as string,
        name: c.name,
        skills: c.skills,
        isActive: c.isActive,
        defaultWeeklyHours: c.defaultWeeklyHours?.length
          ? c.defaultWeeklyHours
          : companyHours,
      })),
      windowStartAt: args.windowStartAt,
      windowEndAt: args.windowEndAt,
      busy,
      unavailable,
      timeZone: resolveTimeZone(company?.timezone),
    });

    const skippedConfirmed = jobs
      .filter((j) => confirmedJobIds.has(j._id))
      .map((j) => ({
        jobId: j._id,
        reason: "Already has a confirmed schedule (preserveConfirmed)",
      }));

    const now = Date.now();
    const suggestionId = await ctx.db.insert("scheduleSuggestions", {
      companyId: user.companyId,
      status: "pending",
      aiStatus: "completed",
      windowStartAt: args.windowStartAt,
      windowEndAt: args.windowEndAt,
      jobIds: packableJobs.map((j) => j._id),
      preserveConfirmed,
      ownerNotes: "Greedy pack (no AI)",
      assignments: packed.assignments.map((a) => ({
        jobId: a.jobId as Id<"jobs">,
        startAt: a.startAt,
        endAt: a.endAt,
        crewMemberIds: a.crewMemberIds as Id<"crewMembers">[],
        rationale: a.rationale,
      })),
      unscheduled: [
        ...packed.unscheduled.map((u) => ({
          jobId: u.jobId as Id<"jobs">,
          reason: u.reason,
        })),
        ...skippedConfirmed,
      ],
      aiNotes: ["Generated by deterministic greedy packer"],
      aiWarnings: skippedConfirmed.length
        ? [`Skipped ${skippedConfirmed.length} already-confirmed job(s).`]
        : [],
      aiConfidence: 0.6,
      aiProcessedAt: now,
      aiGenerationAttempts: 0,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    for (const a of packed.assignments) {
      const scheduleId = await ctx.db.insert("schedules", {
        companyId: user.companyId,
        jobId: a.jobId as Id<"jobs">,
        startAt: a.startAt,
        endAt: a.endAt,
        crewMemberIds: a.crewMemberIds as Id<"crewMembers">[],
        status: "proposed",
        source: "greedy_pack",
        suggestionId,
        notes: a.rationale,
        createdBy: user._id,
        createdAt: now,
        updatedAt: now,
      });
      await recomputeConflictsForSchedule(ctx, scheduleId);
    }

    return suggestionId;
  },
});
