import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireCurrentUser, assertSameCompany } from "./lib/tenant";

/**
 * "My day" — confirmed (and proposed) schedules for a crew member today.
 * - If crewMemberId provided: dispatcher preview
 * - Else: crew member linked to current user via crewMembers.userId
 */
export const list = query({
  args: {
    crewMemberId: v.optional(v.id("crewMembers")),
    from: v.number(),
    to: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);

    let memberId = args.crewMemberId;
    if (!memberId) {
      const linked = await ctx.db
        .query("crewMembers")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .unique();
      if (!linked || linked.companyId !== user.companyId) {
        return {
          member: null,
          schedules: [] as never[],
          jobsById: {} as Record<string, never>,
        };
      }
      memberId = linked._id;
    }

    const member = await ctx.db.get(memberId);
    assertSameCompany(member, user.companyId);

    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_company_and_start", (q) =>
        q
          .eq("companyId", user.companyId)
          .gte("startAt", args.from)
          .lt("startAt", args.to),
      )
      .collect();

    const mine = schedules
      .filter(
        (s) =>
          s.status !== "cancelled" &&
          s.crewMemberIds.includes(memberId!),
      )
      .sort((a, b) => a.startAt - b.startAt);

    const jobsById: Record<string, NonNullable<Awaited<ReturnType<typeof ctx.db.get>>>> = {};
    for (const s of mine) {
      if (!jobsById[s.jobId]) {
        const job = await ctx.db.get(s.jobId);
        if (job) jobsById[s.jobId] = job;
      }
    }

    return {
      member,
      schedules: mine,
      jobsById,
    };
  },
});
