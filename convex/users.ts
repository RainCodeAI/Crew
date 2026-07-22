import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./lib/tenant";
import { appError, unauthorized } from "./lib/errors";
import { LIMITS, optionalTrimmedMax, requireMaxLength } from "./lib/validation";

/**
 * User + workspace provisioning.
 * Clerk owns authentication; Convex owns user/company rows.
 */

/**
 * How long an invite code stays valid after it is generated/rotated (L15).
 * A leaked or forgotten code stops working after this window; owners refresh
 * via `companies.rotateInviteCode`.
 */
const INVITE_CODE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

/** The signed-in user joined with their company. `null` until provisioned. */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const company = await ctx.db.get(user.companyId);
    if (!company) return { ...user, company: null };
    return { ...user, company };
  },
});

/**
 * Resolve display name: Clerk identity first, client args only as fallback (L1).
 */
function resolveName(
  identity: {
    name?: string | null;
    nickname?: string | null;
    email?: string | null;
  },
  clientName?: string,
): string {
  const fromClerk = (
    identity.name ||
    identity.nickname ||
    identity.email ||
    ""
  ).trim();
  if (fromClerk) {
    return requireMaxLength(fromClerk, LIMITS.name, "Name");
  }
  const fromClient = clientName?.trim();
  if (fromClient) {
    return requireMaxLength(fromClient, LIMITS.name, "Name");
  }
  return "New user";
}

/**
 * Idempotently provision the current Clerk user. Safe to call on every app
 * load. Creates a personal company on first sign-in unless inviteCode is set.
 */
export const store = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    /** Join an existing workspace instead of creating one (new users only). */
    inviteCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      unauthorized("Called `users.store` without authentication.");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity!.subject))
      .unique();

    // Clerk first; client only fills gaps (L1).
    const name = resolveName(identity!, args.name);
    const email =
      optionalTrimmedMax(
        identity!.email || args.email,
        LIMITS.email,
        "Email",
      ) ?? "";

    if (existing) {
      // Only patch from Clerk-sourced fields, never client-only spoof of known identity.
      const clerkName = (
        identity!.name ||
        identity!.nickname ||
        identity!.email ||
        ""
      ).trim();
      const clerkEmail = (identity!.email || "").trim();
      const nextName = clerkName
        ? requireMaxLength(clerkName, LIMITS.name, "Name")
        : existing.name;
      const nextEmail = clerkEmail
        ? requireMaxLength(clerkEmail, LIMITS.email, "Email")
        : existing.email;
      if (existing.name !== nextName || existing.email !== nextEmail) {
        await ctx.db.patch(existing._id, { name: nextName, email: nextEmail });
      }
      return existing._id;
    }

    const now = Date.now();
    const code = args.inviteCode?.trim().toUpperCase();

    if (code) {
      const company = await ctx.db
        .query("companies")
        .withIndex("by_invite_code", (q) => q.eq("inviteCode", code))
        .unique();
      if (!company) {
        appError("VALIDATION", "Invalid invite code.");
      }
      const rotatedAt = company!.inviteCodeRotatedAt;
      if (!rotatedAt || now - rotatedAt > INVITE_CODE_TTL_MS) {
        appError(
          "VALIDATION",
          "This invite code has expired. Ask a workspace owner for a new one.",
        );
      }
      return await ctx.db.insert("users", {
        clerkUserId: identity!.subject,
        companyId: company!._id,
        name,
        email,
        role: "member",
        createdAt: now,
      });
    }

    // Create company + owner. Guard concurrent double-create (M12).
    const companyId = await ctx.db.insert("companies", {
      name: name ? `${name}'s Company` : "My Company",
      timezone: "America/Chicago",
      defaultWorkdayStart: "08:00",
      defaultWorkdayEnd: "17:00",
      strictConflictPolicy: true,
      allowAiPii: false,
      createdAt: now,
      updatedAt: now,
    });

    // Re-check after insert in case another request won the race.
    const raced = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity!.subject))
      .unique();
    if (raced) {
      await ctx.db.delete(companyId);
      return raced._id;
    }

    return await ctx.db.insert("users", {
      clerkUserId: identity!.subject,
      companyId,
      name,
      email,
      role: "owner",
      createdAt: now,
    });
  },
});
