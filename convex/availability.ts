import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertSameCompany, requireCurrentUser } from "./lib/tenant";
import { badRequest } from "./lib/errors";
import { availabilityKindValidator } from "./schema";

export const listForMember = query({
  args: {
    crewMemberId: v.id("crewMembers"),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const member = await ctx.db.get(args.crewMemberId);
    assertSameCompany(member, user.companyId);

    const rows = await ctx.db
      .query("availability")
      .withIndex("by_crew_member", (q) =>
        q.eq("crewMemberId", args.crewMemberId),
      )
      .collect();

    return rows.filter((r) => {
      if (args.from != null && r.endAt < args.from) return false;
      if (args.to != null && r.startAt > args.to) return false;
      return true;
    });
  },
});

export const create = mutation({
  args: {
    crewMemberId: v.id("crewMembers"),
    kind: availabilityKindValidator,
    startAt: v.number(),
    endAt: v.number(),
    reason: v.optional(v.string()),
    allDay: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const member = await ctx.db.get(args.crewMemberId);
    assertSameCompany(member, user.companyId);

    if (args.endAt <= args.startAt) {
      badRequest("End must be after start.");
    }

    const now = Date.now();
    return await ctx.db.insert("availability", {
      companyId: user.companyId,
      crewMemberId: args.crewMemberId,
      kind: args.kind,
      startAt: args.startAt,
      endAt: args.endAt,
      reason: args.reason?.trim() || undefined,
      allDay: args.allDay,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { availabilityId: v.id("availability") },
  handler: async (ctx, { availabilityId }) => {
    const user = await requireCurrentUser(ctx);
    const row = await ctx.db.get(availabilityId);
    assertSameCompany(row, user.companyId);
    await ctx.db.delete(availabilityId);
    return availabilityId;
  },
});
