import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Crew database schema.
 *
 * Multi-tenant from day one: every operational record carries a `companyId`
 * so a workspace's data stays isolated. Indexes match the access patterns the
 * app actually uses (board by range, job queue by status, crew roster, AI runs).
 *
 * String unions below mirror `types/index.ts`. Keep them in sync.
 */

// --- Reusable validators -----------------------------------------------------

/** Primary trade — shared vocabulary with SiteAssist / Echo where practical. */
export const serviceTypeValidator = v.union(
  v.literal("landscaping"),
  v.literal("roofing"),
  v.literal("hvac"),
  v.literal("plumbing"),
  v.literal("electrical"),
  v.literal("painting"),
  v.literal("fence_deck"),
  v.literal("concrete"),
  v.literal("pressure_washing"),
  v.literal("security_camera"),
  v.literal("general_contracting"),
  v.literal("other"),
);

export const userRoleValidator = v.union(
  v.literal("owner"),
  v.literal("member"),
);

export const skillValidator = v.union(
  v.literal("general_labor"),
  v.literal("crew_lead"),
  v.literal("equipment_operator"),
  v.literal("cdl_driver"),
  v.literal("irrigation"),
  v.literal("hardscape"),
  v.literal("softscape"),
  v.literal("tree_work"),
  v.literal("roofing_install"),
  v.literal("roofing_repair"),
  v.literal("hvac_install"),
  v.literal("hvac_service"),
  v.literal("plumbing_rough"),
  v.literal("plumbing_finish"),
  v.literal("electrical_rough"),
  v.literal("electrical_finish"),
  v.literal("painting_interior"),
  v.literal("painting_exterior"),
  v.literal("concrete_flatwork"),
  v.literal("fencing"),
  v.literal("deck_building"),
  v.literal("pressure_washing"),
  v.literal("low_voltage"),
  v.literal("customer_facing"),
  v.literal("other"),
);

export const certificationValidator = v.union(
  v.literal("osha_10"),
  v.literal("osha_30"),
  v.literal("first_aid"),
  v.literal("cpr"),
  v.literal("cdl"),
  v.literal("epa_608"),
  v.literal("electrical_license"),
  v.literal("plumbing_license"),
  v.literal("pesticide_applicator"),
  v.literal("fall_protection"),
  v.literal("confined_space"),
  v.literal("other"),
);

export const priorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("emergency"),
);

/** Overall job lifecycle. Placement detail lives on `schedules`. */
export const jobStatusValidator = v.union(
  v.literal("draft"),
  v.literal("scheduled"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("cancelled"),
);

export const jobSourceValidator = v.union(
  v.literal("manual"),
  v.literal("siteassist"),
  v.literal("echo"),
  v.literal("import"),
  v.literal("other"),
);

/** Calendar placement — AI only writes draft/proposed; owner confirms. */
export const scheduleStatusValidator = v.union(
  v.literal("draft"),
  v.literal("proposed"),
  v.literal("confirmed"),
  v.literal("cancelled"),
);

export const scheduleSourceValidator = v.union(
  v.literal("manual"),
  v.literal("ai_suggestion"),
  v.literal("greedy_pack"),
);

export const availabilityKindValidator = v.union(
  v.literal("unavailable"),
  v.literal("available"),
  v.literal("preferred"),
);

export const conflictTypeValidator = v.union(
  v.literal("overbooking"),
  v.literal("skill_mismatch"),
  v.literal("outside_availability"),
  v.literal("travel_risk"),
  v.literal("weather_risk"),
  v.literal("priority_violation"),
  v.literal("missing_certification"),
  v.literal("inactive_crew"),
  v.literal("double_booked_job"),
);

export const conflictSeverityValidator = v.union(
  v.literal("info"),
  v.literal("warning"),
  v.literal("error"),
);

/** Owner decision lifecycle for a suggestion run. */
export const suggestionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);

/** AI enrichment lifecycle — independent of owner decision status. */
export const suggestionAiStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
);

export const weatherRiskLevelValidator = v.union(
  v.literal("none"),
  v.literal("low"),
  v.literal("moderate"),
  v.literal("high"),
  v.literal("severe"),
);

/**
 * One block of default weekly hours (0 = Sunday … 6 = Saturday).
 * Times are local "HH:mm" 24h in the company timezone.
 */
export const weeklyHoursBlockValidator = v.object({
  day: v.number(),
  start: v.string(),
  end: v.string(),
});

/** One AI-proposed assignment (stored on the suggestion run for audit). */
export const suggestedAssignmentValidator = v.object({
  jobId: v.id("jobs"),
  startAt: v.number(),
  endAt: v.number(),
  crewMemberIds: v.array(v.id("crewMembers")),
  rationale: v.optional(v.string()),
});

export const unscheduledJobReasonValidator = v.object({
  jobId: v.id("jobs"),
  reason: v.string(),
});

// --- Schema ------------------------------------------------------------------

export default defineSchema({
  /** A trades business / workspace. The tenant boundary. */
  companies: defineTable({
    name: v.string(),
    primaryTrade: v.optional(serviceTypeValidator),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    timezone: v.optional(v.string()),
    /** Home / shop zip for travel heuristics. */
    originZip: v.optional(v.string()),
    /** Default day bounds used when crew weekly hours are empty. */
    defaultWorkdayStart: v.optional(v.string()),
    defaultWorkdayEnd: v.optional(v.string()),
    notificationEmail: v.optional(v.string()),
    notificationsEnabled: v.optional(v.boolean()),
    /**
     * When true, skill mismatches and overbooking block confirm unless
     * `schedules.ownerOverride` is set. Default treat as true in app logic.
     */
    strictConflictPolicy: v.optional(v.boolean()),
    /**
     * When true, AI prompts may include site addresses, customer/crew names,
     * and rates. Default false — schedule structure only (ids + skills + times).
     */
    allowAiPii: v.optional(v.boolean()),
    /**
     * Short code for members to join this workspace (owners regenerate).
     * Looked up via `by_invite_code`.
     */
    inviteCode: v.optional(v.string()),
    inviteCodeRotatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_invite_code", ["inviteCode"]),

  /** A person who signs in with Clerk (owners / dispatchers / crew leads). */
  users: defineTable({
    clerkUserId: v.string(),
    companyId: v.id("companies"),
    name: v.string(),
    email: v.string(),
    role: userRoleValidator,
    createdAt: v.number(),
  })
    .index("by_clerk_id", ["clerkUserId"])
    .index("by_company", ["companyId"]),

  /**
   * Schedulable crew member.
   * Skills/certs/rate/default hours drive matching and conflict checks.
   */
  crewMembers: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    /** Display role, e.g. "Foreman", "Installer" (not Clerk role). */
    roleLabel: v.optional(v.string()),
    skills: v.array(skillValidator),
    certifications: v.optional(v.array(certificationValidator)),
    hourlyRate: v.optional(v.number()),
    defaultWeeklyHours: v.optional(v.array(weeklyHoursBlockValidator)),
    homeZip: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.boolean(),
    userId: v.optional(v.id("users")),
    externalTeamMemberId: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_company_and_active", ["companyId", "isActive"])
    .index("by_user", ["userId"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["companyId", "isActive"],
    }),

  /**
   * Work to place on the calendar. Scheduling detail is on `schedules`.
   * Optional external ids support SiteAssist / Echo linking without a shared DB.
   */
  jobs: defineTable({
    companyId: v.id("companies"),
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
    status: jobStatusValidator,
    preferredStartAt: v.optional(v.number()),
    preferredEndAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    source: v.optional(jobSourceValidator),
    externalJobId: v.optional(v.string()),
    externalLeadId: v.optional(v.string()),
    weatherRisk: v.optional(weatherRiskLevelValidator),
    travelMinutesEstimate: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_company_and_status", ["companyId", "status"])
    .index("by_company_and_priority", ["companyId", "priority"])
    .index("by_company_and_created", ["companyId", "createdAt"])
    .index("by_company_and_window", ["companyId", "preferredStartAt"])
    .index("by_external_job", ["companyId", "externalJobId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["companyId", "status"],
    }),

  /**
   * A calendar placement: when a job runs and which crew are assigned.
   * AI writes draft/proposed rows; confirmed rows are the operational truth.
   */
  schedules: defineTable({
    companyId: v.id("companies"),
    jobId: v.id("jobs"),
    startAt: v.number(),
    endAt: v.number(),
    crewMemberIds: v.array(v.id("crewMembers")),
    status: scheduleStatusValidator,
    source: scheduleSourceValidator,
    suggestionId: v.optional(v.id("scheduleSuggestions")),
    notes: v.optional(v.string()),
    ownerOverride: v.optional(v.boolean()),
    weatherRisk: v.optional(weatherRiskLevelValidator),
    travelMinutesEstimate: v.optional(v.number()),
    confirmedBy: v.optional(v.id("users")),
    confirmedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_company_and_start", ["companyId", "startAt"])
    .index("by_company_and_status", ["companyId", "status"])
    .index("by_job", ["jobId"])
    .index("by_suggestion", ["suggestionId"])
    .index("by_status_and_start", ["status", "startAt"]),

  /**
   * One-off availability overrides for a crew member (PTO, OT, prefs).
   * Default weekly hours live on `crewMembers.defaultWeeklyHours`.
   */
  availability: defineTable({
    companyId: v.id("companies"),
    crewMemberId: v.id("crewMembers"),
    kind: availabilityKindValidator,
    startAt: v.number(),
    endAt: v.number(),
    reason: v.optional(v.string()),
    allDay: v.optional(v.boolean()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_company", ["companyId"])
    .index("by_crew_member", ["crewMemberId"])
    .index("by_company_and_start", ["companyId", "startAt"])
    .index("by_crew_member_and_start", ["crewMemberId", "startAt"]),

  /**
   * Batch AI schedule suggestion run.
   * Save-first: row exists before OpenAI; drafts applied only on success.
   * Owner decision: pending → approved | rejected.
   * AI lifecycle: aiStatus pending → processing → completed | failed.
   */
  scheduleSuggestions: defineTable({
    companyId: v.id("companies"),
    status: suggestionStatusValidator,
    aiStatus: suggestionAiStatusValidator,
    windowStartAt: v.number(),
    windowEndAt: v.number(),
    jobIds: v.array(v.id("jobs")),
    preserveConfirmed: v.optional(v.boolean()),
    ownerNotes: v.optional(v.string()),

    assignments: v.optional(v.array(suggestedAssignmentValidator)),
    unscheduled: v.optional(v.array(unscheduledJobReasonValidator)),
    aiNotes: v.optional(v.array(v.string())),
    aiWarnings: v.optional(v.array(v.string())),
    aiConfidence: v.optional(v.number()),
    aiProcessedAt: v.optional(v.number()),
    aiGenerationAttempts: v.optional(v.number()),
    aiErrorMessage: v.optional(v.string()),

    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_company_and_status", ["companyId", "status"])
    .index("by_company_and_ai_status", ["companyId", "aiStatus"])
    .index("by_company_and_created", ["companyId", "createdAt"]),

  /**
   * Persisted conflict findings for board badges and history.
   * Recomputed after schedule/availability mutations.
   */
  conflicts: defineTable({
    companyId: v.id("companies"),
    scheduleId: v.id("schedules"),
    jobId: v.optional(v.id("jobs")),
    crewMemberIds: v.optional(v.array(v.id("crewMembers"))),
    type: conflictTypeValidator,
    severity: conflictSeverityValidator,
    message: v.string(),
    isResolved: v.boolean(),
    resolvedBy: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_company", ["companyId"])
    .index("by_schedule", ["scheduleId"])
    .index("by_job", ["jobId"])
    .index("by_company_and_severity", ["companyId", "severity"])
    .index("by_company_and_resolved", ["companyId", "isResolved"]),
});
