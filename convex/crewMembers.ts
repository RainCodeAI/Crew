import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { assertSameCompany, requireCurrentUser } from "./lib/tenant";
import { badRequest } from "./lib/errors";
import {
  LIMITS,
  optionalTrimmedMax,
  requireMaxLength,
  requireNonEmpty,
  validateWeeklyHours,
} from "./lib/validation";
import {
  certificationValidator,
  skillValidator,
  weeklyHoursBlockValidator,
} from "./schema";

const DEFAULT_WEEKLY_HOURS = [1, 2, 3, 4, 5].map((day) => ({
  day,
  start: "08:00",
  end: "17:00",
}));

/**
 * Hide pay + contact PII from non-owner callers (M9). Members need the roster,
 * skills, and availability for the board, but not rates, notes, or contact info.
 * Sensitive fields are already optional, so nulling them keeps the return type.
 */
function redactCrewForRole(
  member: Doc<"crewMembers">,
  isOwner: boolean,
): Doc<"crewMembers"> {
  if (isOwner) return member;
  return {
    ...member,
    hourlyRate: undefined,
    notes: undefined,
    phone: undefined,
    email: undefined,
  };
}

/** List crew members for the caller's company. */
export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const isOwner = user.role === "owner";
    const rows = args.activeOnly
      ? await ctx.db
          .query("crewMembers")
          .withIndex("by_company_and_active", (q) =>
            q.eq("companyId", user.companyId).eq("isActive", true),
          )
          .collect()
      : await ctx.db
          .query("crewMembers")
          .withIndex("by_company", (q) => q.eq("companyId", user.companyId))
          .collect();

    return rows
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => redactCrewForRole(m, isOwner));
  },
});

export const get = query({
  args: { memberId: v.id("crewMembers") },
  handler: async (ctx, { memberId }) => {
    const user = await requireCurrentUser(ctx);
    const member = await ctx.db.get(memberId);
    assertSameCompany(member, user.companyId);
    return redactCrewForRole(member!, user.role === "owner");
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    roleLabel: v.optional(v.string()),
    skills: v.array(skillValidator),
    certifications: v.optional(v.array(certificationValidator)),
    hourlyRate: v.optional(v.number()),
    defaultWeeklyHours: v.optional(v.array(weeklyHoursBlockValidator)),
    homeZip: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const name = requireMaxLength(
      requireNonEmpty(args.name, "Name"),
      LIMITS.name,
      "Name",
    );
    if (!args.skills.length) {
      badRequest("At least one skill is required.");
    }
    if (args.defaultWeeklyHours) {
      validateWeeklyHours(args.defaultWeeklyHours);
    }

    const now = Date.now();
    return await ctx.db.insert("crewMembers", {
      companyId: user.companyId,
      name,
      email: optionalTrimmedMax(args.email, LIMITS.email, "Email"),
      phone: optionalTrimmedMax(args.phone, LIMITS.phone, "Phone"),
      roleLabel: optionalTrimmedMax(args.roleLabel, LIMITS.short, "Role"),
      skills: args.skills,
      certifications: args.certifications,
      hourlyRate: args.hourlyRate,
      defaultWeeklyHours: args.defaultWeeklyHours ?? DEFAULT_WEEKLY_HOURS,
      homeZip: optionalTrimmedMax(args.homeZip, LIMITS.short, "Home zip"),
      notes: optionalTrimmedMax(args.notes, LIMITS.notes, "Notes"),
      isActive: true,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    memberId: v.id("crewMembers"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    roleLabel: v.optional(v.string()),
    skills: v.optional(v.array(skillValidator)),
    certifications: v.optional(v.array(certificationValidator)),
    hourlyRate: v.optional(v.number()),
    defaultWeeklyHours: v.optional(v.array(weeklyHoursBlockValidator)),
    homeZip: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const member = await ctx.db.get(args.memberId);
    assertSameCompany(member, user.companyId);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      patch.name = requireMaxLength(
        requireNonEmpty(args.name, "Name"),
        LIMITS.name,
        "Name",
      );
    }
    if (args.email !== undefined) {
      patch.email = optionalTrimmedMax(args.email, LIMITS.email, "Email");
    }
    if (args.phone !== undefined) {
      patch.phone = optionalTrimmedMax(args.phone, LIMITS.phone, "Phone");
    }
    if (args.roleLabel !== undefined) {
      patch.roleLabel = optionalTrimmedMax(
        args.roleLabel,
        LIMITS.short,
        "Role",
      );
    }
    if (args.skills !== undefined) {
      if (!args.skills.length) badRequest("At least one skill is required.");
      patch.skills = args.skills;
    }
    if (args.certifications !== undefined) {
      patch.certifications = args.certifications;
    }
    if (args.hourlyRate !== undefined) patch.hourlyRate = args.hourlyRate;
    if (args.defaultWeeklyHours !== undefined) {
      validateWeeklyHours(args.defaultWeeklyHours);
      patch.defaultWeeklyHours = args.defaultWeeklyHours;
    }
    if (args.homeZip !== undefined) {
      patch.homeZip = optionalTrimmedMax(args.homeZip, LIMITS.short, "Home zip");
    }
    if (args.notes !== undefined) {
      patch.notes = optionalTrimmedMax(args.notes, LIMITS.notes, "Notes");
    }
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    await ctx.db.patch(args.memberId, patch);
    return args.memberId;
  },
});
