/**
 * Prompt construction for Crew AI schedule suggestions.
 * Keep model I/O contracts here so `convex/ai.ts` stays thin.
 */

export type SuggestSchedulePromptInput = {
  companyName: string;
  primaryTrade?: string;
  timezone?: string;
  originZip?: string;
  windowStartAt: number;
  windowEndAt: number;
  jobs: Array<{
    id: string;
    title: string;
    durationMinutes: number;
    requiredSkills: string[];
    requiredCertifications?: string[];
    priority: string;
    address?: string;
    preferredStartAt?: number;
    preferredEndAt?: number;
  }>;
  crew: Array<{
    id: string;
    name: string;
    skills: string[];
    certifications?: string[];
    hourlyRate?: number;
    isActive: boolean;
  }>;
  busy: Array<{
    crewMemberId: string;
    startAt: number;
    endAt: number;
    status: string;
  }>;
  unavailable: Array<{
    crewMemberId: string;
    startAt: number;
    endAt: number;
    reason?: string;
  }>;
  privacyNote?: string;
};

export function buildSuggestScheduleSystemPrompt(): string {
  return [
    "You are a scheduling assistant for a trades contracting business.",
    "Propose concrete job placements (start/end epoch ms, crew member ids) inside the given window.",
    "Hard rules: do not double-book the same crew member; respect unavailability; cover required skills when possible.",
    "Soft rules: prefer preferred windows, higher priority earlier, cluster geography when addresses allow, lower cost when tied.",
    "Never invent job ids or crew member ids. Only use ids from the user payload.",
    "Return ONLY valid JSON matching the schema. No markdown.",
  ].join(" ");
}

export function buildSuggestScheduleUserPrompt(
  input: SuggestSchedulePromptInput,
): string {
  return JSON.stringify(
    {
      instruction:
        "Propose assignments for as many jobs as feasible. List unscheduled jobs with reasons.",
      company: {
        name: input.companyName,
        primaryTrade: input.primaryTrade ?? null,
        timezone: input.timezone ?? null,
        originZip: input.originZip ?? null,
      },
      window: {
        startAt: input.windowStartAt,
        endAt: input.windowEndAt,
      },
      jobs: input.jobs,
      crew: input.crew.filter((c) => c.isActive),
      existingBusyIntervals: input.busy,
      unavailableBlocks: input.unavailable,
      privacy: input.privacyNote ?? null,
      outputSchema: {
        assignments: [
          {
            jobId: "string",
            startAt: "number epoch ms",
            endAt: "number epoch ms",
            crewMemberIds: ["string"],
            rationale: "string optional",
          },
        ],
        unscheduled: [{ jobId: "string", reason: "string" }],
        notes: ["string"],
        warnings: ["string"],
        confidence: "number 0-1",
      },
    },
    null,
    2,
  );
}

export type ParsedScheduleSuggestion = {
  assignments: Array<{
    jobId: string;
    startAt: number;
    endAt: number;
    crewMemberIds: string[];
    rationale?: string;
  }>;
  unscheduled: Array<{ jobId: string; reason: string }>;
  notes: string[];
  warnings: string[];
  confidence: number;
};

const MAX_ASSIGNMENTS = 80;
const MAX_NOTES = 20;
const MAX_STR = 500;

function clip(s: string, max = MAX_STR): string {
  return s.length > max ? s.slice(0, max) : s;
}

export function parseScheduleSuggestionJson(
  raw: string,
): ParsedScheduleSuggestion {
  if (raw.length > 200_000) {
    throw new Error("AI response too large");
  }
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  const data = JSON.parse(cleaned) as ParsedScheduleSuggestion;

  if (!Array.isArray(data.assignments)) {
    throw new Error("AI response missing assignments array");
  }

  return {
    assignments: data.assignments.slice(0, MAX_ASSIGNMENTS).map((a) => ({
      jobId: String(a.jobId),
      startAt: Number(a.startAt),
      endAt: Number(a.endAt),
      crewMemberIds: (a.crewMemberIds ?? []).slice(0, 20).map(String),
      rationale: a.rationale ? clip(String(a.rationale)) : undefined,
    })),
    unscheduled: Array.isArray(data.unscheduled)
      ? data.unscheduled.slice(0, MAX_ASSIGNMENTS).map((u) => ({
          jobId: String(u.jobId),
          reason: clip(String(u.reason ?? "Unspecified")),
        }))
      : [],
    notes: Array.isArray(data.notes)
      ? data.notes.slice(0, MAX_NOTES).map((n) => clip(String(n)))
      : [],
    warnings: Array.isArray(data.warnings)
      ? data.warnings.slice(0, MAX_NOTES).map((n) => clip(String(n)))
      : [],
    confidence:
      typeof data.confidence === "number" && !Number.isNaN(data.confidence)
        ? Math.min(1, Math.max(0, data.confidence))
        : 0.5,
  };
}
