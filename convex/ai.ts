"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import OpenAI from "openai";
import {
  buildSuggestScheduleSystemPrompt,
  buildSuggestScheduleUserPrompt,
  parseScheduleSuggestionJson,
} from "./lib/prompts";
import {
  sanitizeCrewForAi,
  sanitizeJobsForAi,
  sanitizeUnavailableForAi,
} from "./lib/aiPrivacy";
import type { Id } from "./_generated/dataModel";

/**
 * OpenAI schedule suggestion action.
 * Never the sole home of job/schedule data — suggestions table is save-first.
 * PII is redacted unless company.allowAiPii is true.
 */
export const suggestSchedule = internalAction({
  args: { suggestionId: v.id("scheduleSuggestions") },
  handler: async (ctx, { suggestionId }) => {
    await ctx.runMutation(internal.suggestions.markProcessing, {
      suggestionId,
    });

    const snapshot = await ctx.runQuery(internal.suggestions.getSnapshot, {
      suggestionId,
    });

    if (!snapshot?.suggestion || !snapshot.company) {
      await ctx.runMutation(internal.suggestions.applyAiFailure, {
        suggestionId,
        message: "Suggestion not found.",
      });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.suggestions.applyAiFailure, {
        suggestionId,
        message:
          "OpenAI is not configured. Set OPENAI_API_KEY on the Convex deployment. Manual scheduling still works.",
      });
      return;
    }

    const { suggestion, company, jobs, crew, schedules, availability } =
      snapshot;

    const allowPii = company.allowAiPii === true;
    const preserveConfirmed = suggestion.preserveConfirmed !== false;

    const confirmedJobIds = new Set(
      schedules
        .filter((s) => s.status === "confirmed")
        .map((s) => s.jobId as string),
    );

    const busy = schedules
      .filter((s) =>
        preserveConfirmed
          ? s.status === "confirmed" || s.status === "proposed"
          : s.status === "proposed",
      )
      .flatMap((s) =>
        s.crewMemberIds.map((crewMemberId) => ({
          crewMemberId,
          startAt: s.startAt,
          endAt: s.endAt,
          status: s.status,
        })),
      );

    // L6: do not ask the model to reschedule already-confirmed jobs.
    const jobsForAi = jobs.filter(
      (j) =>
        j &&
        (!preserveConfirmed || !confirmedJobIds.has(j._id as string)),
    );

    const rawJobs = jobsForAi.flatMap((j) =>
      j
        ? [
            {
              id: j._id as string,
              title: j.title,
              durationMinutes: j.estimatedDurationMinutes,
              requiredSkills: j.requiredSkills,
              requiredCertifications: j.requiredCertifications,
              priority: j.priority,
              address: j.address,
              preferredStartAt: j.preferredStartAt,
              preferredEndAt: j.preferredEndAt,
              serviceType: j.serviceType,
            },
          ]
        : [],
    );

    const rawCrew = crew.map((c) => ({
      id: c._id as string,
      name: c.name,
      skills: c.skills,
      certifications: c.certifications,
      hourlyRate: c.hourlyRate,
      isActive: c.isActive,
      roleLabel: c.roleLabel,
    }));

    const rawUnavailable = availability
      .filter((a) => a.kind === "unavailable")
      .map((a) => ({
        crewMemberId: a.crewMemberId as string,
        startAt: a.startAt,
        endAt: a.endAt,
        reason: a.reason,
      }));

    const promptInput = {
      companyName: allowPii ? company.name : "Company",
      primaryTrade: company.primaryTrade,
      timezone: company.timezone,
      originZip: allowPii ? company.originZip : undefined,
      windowStartAt: suggestion.windowStartAt,
      windowEndAt: suggestion.windowEndAt,
      jobs: sanitizeJobsForAi(rawJobs, allowPii),
      crew: sanitizeCrewForAi(rawCrew, allowPii),
      busy,
      unavailable: sanitizeUnavailableForAi(rawUnavailable, allowPii),
      privacyNote: allowPii
        ? "PII included by company setting allowAiPii."
        : "PII redacted: use ids only; titles are labels.",
    };

    try {
      const client = new OpenAI({ apiKey });
      const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

      const completion = await client.chat.completions.create({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSuggestScheduleSystemPrompt() },
          {
            role: "user",
            content: buildSuggestScheduleUserPrompt(promptInput),
          },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("Empty model response");
      }

      const parsed = parseScheduleSuggestionJson(content);
      const jobIdSet = new Set(
        jobsForAi.flatMap((j) => (j ? [j._id as string] : [])),
      );
      const crewIdSet = new Set(crew.map((c) => c._id as string));

      const winStart = suggestion.windowStartAt;
      const winEnd = suggestion.windowEndAt;

      const assignments = parsed.assignments
        .filter((a) => jobIdSet.has(a.jobId))
        .map((a) => ({
          jobId: a.jobId as Id<"jobs">,
          startAt: a.startAt,
          endAt: a.endAt,
          crewMemberIds: a.crewMemberIds
            .filter((id) => crewIdSet.has(id))
            .map((id) => id as Id<"crewMembers">),
          rationale: a.rationale,
        }))
        .filter(
          (a) =>
            Number.isFinite(a.startAt) &&
            Number.isFinite(a.endAt) &&
            a.endAt > a.startAt &&
            a.startAt >= winStart &&
            a.endAt <= winEnd,
        );

      const unscheduled = parsed.unscheduled
        .filter((u) => jobIdSet.has(u.jobId))
        .map((u) => ({
          jobId: u.jobId as Id<"jobs">,
          reason: u.reason,
        }));

      const skippedConfirmed = jobs
        .filter((j) => j && confirmedJobIds.has(j._id as string))
        .map((j) => ({
          jobId: j!._id as Id<"jobs">,
          reason: "Already has a confirmed schedule (preserveConfirmed)",
        }));

      await ctx.runMutation(internal.suggestions.applyAiResult, {
        suggestionId,
        assignments,
        unscheduled: [...unscheduled, ...skippedConfirmed],
        notes: parsed.notes,
        warnings: [
          ...parsed.warnings,
          ...(allowPii ? [] : ["AI ran with PII redacted (company setting)."]),
          ...(skippedConfirmed.length
            ? [
                `Skipped ${skippedConfirmed.length} already-confirmed job(s).`,
              ]
            : []),
        ],
        confidence: parsed.confidence,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "AI suggestion failed";
      console.error("suggestSchedule failed", {
        suggestionId,
        companyId: suggestion.companyId,
        message,
      });
      await ctx.runMutation(internal.suggestions.applyAiFailure, {
        suggestionId,
        message,
      });
    }
  },
});
