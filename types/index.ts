/**
 * Shared application types for Crew.
 *
 * These string-literal unions and interfaces are the single source of truth
 * for the app's domain vocabulary and are referenced from both the Convex
 * schema validators and the React UI. Keep in sync with `convex/schema.ts`.
 *
 * Full document shapes come from Convex-generated `Doc<>` / `Id<>` under
 * `convex/_generated` once `npx convex dev` (or codegen) has been run.
 */

// --- Service / org vocabulary ------------------------------------------------

export type ServiceType =
  | "landscaping"
  | "roofing"
  | "hvac"
  | "plumbing"
  | "electrical"
  | "painting"
  | "fence_deck"
  | "concrete"
  | "pressure_washing"
  | "security_camera"
  | "general_contracting"
  | "other";

export type UserRole = "owner" | "member";

/** Common trade skills used for matching jobs ↔ crew. */
export type Skill =
  | "general_labor"
  | "crew_lead"
  | "equipment_operator"
  | "cdl_driver"
  | "irrigation"
  | "hardscape"
  | "softscape"
  | "tree_work"
  | "roofing_install"
  | "roofing_repair"
  | "hvac_install"
  | "hvac_service"
  | "plumbing_rough"
  | "plumbing_finish"
  | "electrical_rough"
  | "electrical_finish"
  | "painting_interior"
  | "painting_exterior"
  | "concrete_flatwork"
  | "fencing"
  | "deck_building"
  | "pressure_washing"
  | "low_voltage"
  | "customer_facing"
  | "other";

/** Safety / compliance credentials that may be required on a job. */
export type Certification =
  | "osha_10"
  | "osha_30"
  | "first_aid"
  | "cpr"
  | "cdl"
  | "epa_608"
  | "electrical_license"
  | "plumbing_license"
  | "pesticide_applicator"
  | "fall_protection"
  | "confined_space"
  | "other";

// --- Priority ----------------------------------------------------------------

export type Priority = "low" | "medium" | "high" | "emergency";

// --- Jobs --------------------------------------------------------------------

/**
 * Operational lifecycle of a job (work item).
 * Scheduling detail lives on `schedules`.
 */
export type JobStatus =
  | "draft"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

/** Where a job originated for future cross-product linking. */
export type JobSource = "manual" | "siteassist" | "echo" | "import" | "other";

// --- Schedules ---------------------------------------------------------------

/**
 * Lifecycle of a calendar placement for a job.
 * AI lands as draft/proposed; only owner action → confirmed.
 */
export type ScheduleStatus = "draft" | "proposed" | "confirmed" | "cancelled";

/** How the schedule row was created. */
export type ScheduleSource = "manual" | "ai_suggestion" | "greedy_pack";

// --- Availability ------------------------------------------------------------

export type AvailabilityKind = "unavailable" | "available" | "preferred";

/**
 * One block of default weekly hours (0 = Sunday … 6 = Saturday).
 * Times are local "HH:mm" 24h in the company timezone.
 */
export interface WeeklyHoursBlock {
  day: number;
  start: string;
  end: string;
}

// --- Conflicts ---------------------------------------------------------------

export type ConflictType =
  | "overbooking"
  | "skill_mismatch"
  | "outside_availability"
  | "travel_risk"
  | "weather_risk"
  | "priority_violation"
  | "missing_certification"
  | "inactive_crew"
  | "double_booked_job";

export type ConflictSeverity = "info" | "warning" | "error";

// --- AI suggestions ----------------------------------------------------------

/**
 * Owner decision lifecycle for a batch suggestion run.
 * AI progress is tracked separately via {@link SuggestionAiStatus}.
 */
export type SuggestionStatus = "pending" | "approved" | "rejected";

/** AI enrichment lifecycle — suggestion row is durable when pending. */
export type SuggestionAiStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

/** One assignment inside an AI proposal (before or after apply). */
export interface SuggestedAssignment {
  jobId: string;
  startAt: number;
  endAt: number;
  crewMemberIds: string[];
  rationale?: string;
}

export interface UnscheduledJobReason {
  jobId: string;
  reason: string;
}

/**
 * Shape returned by the AI schedule-suggestion action.
 * Mirrors `convex/ai.ts` + `suggestions.applyAiResult`.
 */
export interface ScheduleAiSuggestion {
  assignments: SuggestedAssignment[];
  unscheduled: UnscheduledJobReason[];
  notes: string[];
  confidence: number;
  warnings: string[];
  generatedAt: number;
}

// --- Weather / travel (enrichment stubs) -------------------------------------

export type WeatherRiskLevel = "none" | "low" | "moderate" | "high" | "severe";

// --- Form / filter convenience types -----------------------------------------

export interface CompanyFormValues {
  name: string;
  primaryTrade: ServiceType;
  phone: string;
  email: string;
  timezone: string;
  originZip: string;
  notificationEmail: string;
  defaultWorkdayStart: string;
  defaultWorkdayEnd: string;
}

export interface CrewMemberFormValues {
  name: string;
  email: string;
  phone: string;
  roleLabel: string;
  skills: Skill[];
  certifications: Certification[];
  hourlyRate: number | "";
  defaultWeeklyHours: WeeklyHoursBlock[];
  homeZip: string;
  notes: string;
  isActive: boolean;
}

export interface JobFormValues {
  title: string;
  customerName: string;
  phone: string;
  email: string;
  address: string;
  serviceType: ServiceType;
  description: string;
  estimatedDurationMinutes: number;
  requiredSkills: Skill[];
  requiredCertifications: Certification[];
  priority: Priority;
  preferredStartAt?: number;
  preferredEndAt?: number;
  notes: string;
  status: JobStatus;
}

export interface ScheduleFormValues {
  jobId: string;
  startAt: number;
  endAt: number;
  crewMemberIds: string[];
  notes: string;
  ownerOverride: boolean;
}

export interface JobListFilters {
  status?: JobStatus | "all";
  priority?: Priority | "all";
  serviceType?: ServiceType | "all";
  search?: string;
  fromPreferredAt?: number;
  toPreferredAt?: number;
}

export interface BoardFilters {
  from: number;
  to: number;
  crewMemberId?: string | "all";
  showUnscheduled?: boolean;
  conflictOnly?: boolean;
}

export interface SuggestionListFilters {
  status?: SuggestionStatus | "all";
  fromCreatedAt?: number;
  toCreatedAt?: number;
}

export interface SuggestScheduleInput {
  jobIds: string[];
  windowStartAt: number;
  windowEndAt: number;
  preserveConfirmed?: boolean;
  notes?: string;
}
