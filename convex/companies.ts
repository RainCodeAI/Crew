import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireCurrentUser, requireOwner } from "./lib/tenant";
import { appError, notFound } from "./lib/errors";
import { isValidTimeZone, resolveTimeZone } from "./lib/timezone";
import {
  LIMITS,
  optionalTrimmedMax,
  requireHHMM,
  requireMaxLength,
} from "./lib/validation";
import { serviceTypeValidator } from "./schema";

function randomInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return out;
}

/** Authenticated company for the signed-in workspace. */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    return await ctx.db.get(user.companyId);
  },
});

/** Update company profile fields — owners only. */
export const update = mutation({
  args: {
    name: v.optional(v.string()),
    primaryTrade: v.optional(serviceTypeValidator),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    timezone: v.optional(v.string()),
    originZip: v.optional(v.string()),
    defaultWorkdayStart: v.optional(v.string()),
    defaultWorkdayEnd: v.optional(v.string()),
    notificationEmail: v.optional(v.string()),
    notificationsEnabled: v.optional(v.boolean()),
    strictConflictPolicy: v.optional(v.boolean()),
    allowAiPii: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireOwner(ctx);
    const company = await ctx.db.get(user.companyId);
    if (!company) notFound();

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      patch.name =
        requireMaxLength(args.name.trim() || company.name, LIMITS.title, "Name");
    }
    if (args.primaryTrade !== undefined) patch.primaryTrade = args.primaryTrade;
    if (args.phone !== undefined) {
      patch.phone = optionalTrimmedMax(args.phone, LIMITS.phone, "Phone");
    }
    if (args.email !== undefined) {
      patch.email = optionalTrimmedMax(args.email, LIMITS.email, "Email");
    }
    if (args.timezone !== undefined) {
      const tz = args.timezone.trim();
      if (tz && !isValidTimeZone(tz)) {
        appError(
          "VALIDATION",
          `"${args.timezone}" is not a valid IANA time zone (e.g. America/Denver).`,
        );
      }
      patch.timezone = resolveTimeZone(tz);
    }
    if (args.originZip !== undefined) {
      patch.originZip = optionalTrimmedMax(
        args.originZip,
        LIMITS.short,
        "Origin zip",
      );
    }
    if (args.defaultWorkdayStart !== undefined) {
      patch.defaultWorkdayStart = requireHHMM(
        args.defaultWorkdayStart,
        "Workday start",
      );
    }
    if (args.defaultWorkdayEnd !== undefined) {
      patch.defaultWorkdayEnd = requireHHMM(
        args.defaultWorkdayEnd,
        "Workday end",
      );
    }
    // If both bounds are being set (or one against the stored other), start < end.
    {
      const start =
        (patch.defaultWorkdayStart as string | undefined) ??
        company.defaultWorkdayStart;
      const end =
        (patch.defaultWorkdayEnd as string | undefined) ??
        company.defaultWorkdayEnd;
      if (start && end && start >= end) {
        appError("VALIDATION", "Workday end must be after workday start.");
      }
    }
    if (args.notificationEmail !== undefined) {
      patch.notificationEmail = optionalTrimmedMax(
        args.notificationEmail,
        LIMITS.email,
        "Notification email",
      );
    }
    if (args.notificationsEnabled !== undefined) {
      patch.notificationsEnabled = args.notificationsEnabled;
    }
    if (args.strictConflictPolicy !== undefined) {
      patch.strictConflictPolicy = args.strictConflictPolicy;
    }
    if (args.allowAiPii !== undefined) {
      patch.allowAiPii = args.allowAiPii;
    }

    await ctx.db.patch(user.companyId, patch);
    return user.companyId;
  },
});

/** Generate or rotate invite code so members can join this workspace. */
export const rotateInviteCode = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireOwner(ctx);
    const code = randomInviteCode();
    await ctx.db.patch(user.companyId, {
      inviteCode: code,
      inviteCodeRotatedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return code;
  },
});
