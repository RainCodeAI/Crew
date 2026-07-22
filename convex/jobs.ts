import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertSameCompany, requireCurrentUser } from "./lib/tenant";
import { badRequest } from "./lib/errors";
import { assertJobStatusTransition } from "./lib/jobStatus";
import {
  clampListLimit,
  LIMITS,
  optionalTrimmedMax,
  requireMaxLength,
  requireNonEmpty,
  requirePositiveDuration,
} from "./lib/validation";
import { resolveTimeZone, weekRangeMonday } from "./lib/timezone";
import {
  certificationValidator,
  jobSourceValidator,
  jobStatusValidator,
  priorityValidator,
  serviceTypeValidator,
  skillValidator,
} from "./schema";

/** Dashboard pulse counts. */
export const dashboardStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const companyId = user.companyId;
    const company = await ctx.db.get(companyId);
    const tz = resolveTimeZone(company?.timezone);
    const { from: weekStart, to: weekEnd } = weekRangeMonday(Date.now(), tz);

    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();

    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_company_and_start", (q) =>
        q
          .eq("companyId", companyId)
          .gte("startAt", weekStart)
          .lt("startAt", weekEnd),
      )
      .collect();

    const conflicts = await ctx.db
      .query("conflicts")
      .withIndex("by_company_and_resolved", (q) =>
        q.eq("companyId", companyId).eq("isResolved", false),
      )
      .collect();

    const crew = await ctx.db
      .query("crewMembers")
      .withIndex("by_company_and_active", (q) =>
        q.eq("companyId", companyId).eq("isActive", true),
      )
      .collect();

    return {
      unscheduled: jobs.filter((j) => j.status === "draft").length,
      confirmedThisWeek: schedules.filter((s) => s.status === "confirmed")
        .length,
      openConflicts: conflicts.length,
      activeCrew: crew.length,
      totalJobs: jobs.length,
    };
  },
});

export const list = query({
  args: {
    status: v.optional(jobStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const limit = clampListLimit(args.limit, {
      default: LIMITS.listDefault,
      max: LIMITS.jobsListMax,
    });
    if (args.status) {
      return await ctx.db
        .query("jobs")
        .withIndex("by_company_and_status", (q) =>
          q.eq("companyId", user.companyId).eq("status", args.status!),
        )
        .take(limit);
    }
    return await ctx.db
      .query("jobs")
      .withIndex("by_company_and_created", (q) =>
        q.eq("companyId", user.companyId),
      )
      .order("desc")
      .take(limit);
  },
});

export const get = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const user = await requireCurrentUser(ctx);
    const job = await ctx.db.get(jobId);
    return assertSameCompany(job, user.companyId);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    customerName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    serviceType: serviceTypeValidator,
    description: v.optional(v.string()),
    estimatedDurationMinutes: v.number(),
    requiredSkills: v.array(skillValidator),
    requiredCertifications: v.optional(v.array(certificationValidator)),
    priority: priorityValidator,
    preferredStartAt: v.optional(v.number()),
    preferredEndAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    source: v.optional(jobSourceValidator),
    externalJobId: v.optional(v.string()),
    externalLeadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const title = requireMaxLength(
      requireNonEmpty(args.title, "Title"),
      LIMITS.title,
      "Title",
    );
    requirePositiveDuration(args.estimatedDurationMinutes);

    const now = Date.now();
    return await ctx.db.insert("jobs", {
      companyId: user.companyId,
      title,
      customerName: optionalTrimmedMax(
        args.customerName,
        LIMITS.name,
        "Customer name",
      ),
      phone: optionalTrimmedMax(args.phone, LIMITS.phone, "Phone"),
      email: optionalTrimmedMax(args.email, LIMITS.email, "Email"),
      address: optionalTrimmedMax(args.address, LIMITS.address, "Address"),
      serviceType: args.serviceType,
      description: optionalTrimmedMax(
        args.description,
        LIMITS.description,
        "Description",
      ),
      estimatedDurationMinutes: args.estimatedDurationMinutes,
      requiredSkills: args.requiredSkills.length
        ? args.requiredSkills
        : ["general_labor"],
      requiredCertifications: args.requiredCertifications,
      priority: args.priority,
      status: "draft",
      preferredStartAt: args.preferredStartAt,
      preferredEndAt: args.preferredEndAt,
      notes: optionalTrimmedMax(args.notes, LIMITS.notes, "Notes"),
      source: args.source ?? "manual",
      externalJobId: optionalTrimmedMax(
        args.externalJobId,
        LIMITS.short,
        "External job id",
      ),
      externalLeadId: optionalTrimmedMax(
        args.externalLeadId,
        LIMITS.short,
        "External lead id",
      ),
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    jobId: v.id("jobs"),
    title: v.optional(v.string()),
    customerName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    serviceType: v.optional(serviceTypeValidator),
    description: v.optional(v.string()),
    estimatedDurationMinutes: v.optional(v.number()),
    requiredSkills: v.optional(v.array(skillValidator)),
    requiredCertifications: v.optional(v.array(certificationValidator)),
    priority: v.optional(priorityValidator),
    status: v.optional(jobStatusValidator),
    preferredStartAt: v.optional(v.number()),
    preferredEndAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const job = await ctx.db.get(args.jobId);
    assertSameCompany(job, user.companyId);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) badRequest("Title is required.");
      patch.title = title;
    }
    if (args.customerName !== undefined) {
      patch.customerName = args.customerName.trim() || undefined;
    }
    if (args.phone !== undefined) patch.phone = args.phone.trim() || undefined;
    if (args.email !== undefined) patch.email = args.email.trim() || undefined;
    if (args.address !== undefined) {
      patch.address = args.address.trim() || undefined;
    }
    if (args.serviceType !== undefined) patch.serviceType = args.serviceType;
    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }
    if (args.estimatedDurationMinutes !== undefined) {
      if (args.estimatedDurationMinutes <= 0) {
        badRequest("Duration must be positive.");
      }
      patch.estimatedDurationMinutes = args.estimatedDurationMinutes;
    }
    if (args.requiredSkills !== undefined) {
      patch.requiredSkills = args.requiredSkills;
    }
    if (args.requiredCertifications !== undefined) {
      patch.requiredCertifications = args.requiredCertifications;
    }
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.status !== undefined) {
      assertJobStatusTransition(job!.status, args.status);
      patch.status = args.status;
    }
    if (args.preferredStartAt !== undefined) {
      patch.preferredStartAt = args.preferredStartAt;
    }
    if (args.preferredEndAt !== undefined) {
      patch.preferredEndAt = args.preferredEndAt;
    }
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;

    await ctx.db.patch(args.jobId, patch);
    return args.jobId;
  },
});
