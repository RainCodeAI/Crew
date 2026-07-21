/**
 * Shared UI-facing constants for Crew.
 * Canonical string values stay in sync with `convex/schema.ts` and `types/`.
 */

import type {
  ConflictSeverity,
  ConflictType,
  JobStatus,
  Priority,
  ScheduleStatus,
  ServiceType,
  Skill,
  SuggestionAiStatus,
  SuggestionStatus,
} from "@/types";

export const APP_NAME = "Crew";
export const APP_TAGLINE = "Smart scheduling for the trades";
export const APP_DESCRIPTION =
  "Schedule jobs, assign the right crew, detect conflicts, and get AI-powered placement suggestions — without the calendar Tetris.";

/** Indigo accent used in theme + meta theme-color (#6366f1). */
export const BRAND_COLOR = "#6366f1";

export const DEFAULT_APP_URL = "https://crew.raincode.ai";

export const SERVICE_TYPES: { value: ServiceType; label: string }[] = [
  { value: "landscaping", label: "Landscaping" },
  { value: "roofing", label: "Roofing" },
  { value: "hvac", label: "HVAC" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "painting", label: "Painting" },
  { value: "fence_deck", label: "Fence & Deck" },
  { value: "concrete", label: "Concrete" },
  { value: "pressure_washing", label: "Pressure Washing" },
  { value: "security_camera", label: "Security & Camera Installation" },
  { value: "general_contracting", label: "General Contracting" },
  { value: "other", label: "Other" },
];

export const SERVICE_TYPE_MAP = Object.fromEntries(
  SERVICE_TYPES.map((s) => [s.value, s]),
) as Record<ServiceType, (typeof SERVICE_TYPES)[number]>;

export const PRIORITIES: {
  value: Priority;
  label: string;
  badgeClass: string;
}[] = [
  {
    value: "low",
    label: "Low",
    badgeClass: "bg-slate-100 text-slate-600 ring-slate-500/20",
  },
  {
    value: "medium",
    label: "Medium",
    badgeClass: "bg-amber-100 text-amber-700 ring-amber-600/20",
  },
  {
    value: "high",
    label: "High",
    badgeClass: "bg-orange-100 text-orange-700 ring-orange-600/20",
  },
  {
    value: "emergency",
    label: "Emergency",
    badgeClass: "bg-red-100 text-red-700 ring-red-600/20",
  },
];

export const PRIORITY_MAP = Object.fromEntries(
  PRIORITIES.map((p) => [p.value, p]),
) as Record<Priority, (typeof PRIORITIES)[number]>;

export const JOB_STATUSES: {
  value: JobStatus;
  label: string;
  badgeClass: string;
}[] = [
  {
    value: "draft",
    label: "Draft",
    badgeClass: "bg-slate-100 text-slate-600 ring-slate-500/20",
  },
  {
    value: "scheduled",
    label: "Scheduled",
    badgeClass: "bg-indigo-100 text-indigo-700 ring-indigo-600/20",
  },
  {
    value: "in_progress",
    label: "In progress",
    badgeClass: "bg-sky-100 text-sky-700 ring-sky-600/20",
  },
  {
    value: "completed",
    label: "Completed",
    badgeClass: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  },
  {
    value: "cancelled",
    label: "Cancelled",
    badgeClass: "bg-slate-100 text-slate-500 ring-slate-400/20",
  },
];

export const JOB_STATUS_MAP = Object.fromEntries(
  JOB_STATUSES.map((s) => [s.value, s]),
) as Record<JobStatus, (typeof JOB_STATUSES)[number]>;

export const SCHEDULE_STATUSES: {
  value: ScheduleStatus;
  label: string;
  badgeClass: string;
}[] = [
  {
    value: "draft",
    label: "Draft",
    badgeClass: "bg-slate-100 text-slate-600 ring-slate-500/20",
  },
  {
    value: "proposed",
    label: "Proposed",
    badgeClass: "bg-violet-100 text-violet-700 ring-violet-600/20",
  },
  {
    value: "confirmed",
    label: "Confirmed",
    badgeClass: "bg-indigo-100 text-indigo-700 ring-indigo-600/20",
  },
  {
    value: "cancelled",
    label: "Cancelled",
    badgeClass: "bg-slate-100 text-slate-500 ring-slate-400/20",
  },
];

export const SCHEDULE_STATUS_MAP = Object.fromEntries(
  SCHEDULE_STATUSES.map((s) => [s.value, s]),
) as Record<ScheduleStatus, (typeof SCHEDULE_STATUSES)[number]>;

export const SUGGESTION_STATUSES: {
  value: SuggestionStatus;
  label: string;
  badgeClass: string;
}[] = [
  {
    value: "pending",
    label: "Pending review",
    badgeClass: "bg-amber-100 text-amber-700 ring-amber-600/20",
  },
  {
    value: "approved",
    label: "Approved",
    badgeClass: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  },
  {
    value: "rejected",
    label: "Rejected",
    badgeClass: "bg-slate-100 text-slate-500 ring-slate-400/20",
  },
];

export const SUGGESTION_AI_STATUSES: {
  value: SuggestionAiStatus;
  label: string;
  badgeClass: string;
}[] = [
  {
    value: "pending",
    label: "AI pending",
    badgeClass: "bg-slate-100 text-slate-600 ring-slate-500/20",
  },
  {
    value: "processing",
    label: "AI running",
    badgeClass: "bg-sky-100 text-sky-700 ring-sky-600/20",
  },
  {
    value: "completed",
    label: "AI ready",
    badgeClass: "bg-indigo-100 text-indigo-700 ring-indigo-600/20",
  },
  {
    value: "failed",
    label: "AI failed",
    badgeClass: "bg-red-100 text-red-700 ring-red-600/20",
  },
];

export const CONFLICT_TYPES: { value: ConflictType; label: string }[] = [
  { value: "overbooking", label: "Overbooking" },
  { value: "skill_mismatch", label: "Skill mismatch" },
  { value: "outside_availability", label: "Availability / PTO" },
  { value: "travel_risk", label: "Travel / geography" },
  { value: "weather_risk", label: "Weather impact" },
  { value: "priority_violation", label: "Priority / urgency" },
  { value: "missing_certification", label: "Missing certification" },
  { value: "inactive_crew", label: "Inactive crew" },
  { value: "double_booked_job", label: "Job already scheduled" },
];

export const CONFLICT_SEVERITIES: {
  value: ConflictSeverity;
  label: string;
  badgeClass: string;
}[] = [
  {
    value: "info",
    label: "Info",
    badgeClass: "bg-slate-100 text-slate-600 ring-slate-500/20",
  },
  {
    value: "warning",
    label: "Warning",
    badgeClass: "bg-amber-100 text-amber-700 ring-amber-600/20",
  },
  {
    value: "error",
    label: "Error",
    badgeClass: "bg-red-100 text-red-700 ring-red-600/20",
  },
];

export const SKILLS: { value: Skill; label: string }[] = [
  { value: "general_labor", label: "General labor" },
  { value: "crew_lead", label: "Crew lead" },
  { value: "equipment_operator", label: "Equipment operator" },
  { value: "cdl_driver", label: "CDL driver" },
  { value: "irrigation", label: "Irrigation" },
  { value: "hardscape", label: "Hardscape" },
  { value: "softscape", label: "Softscape" },
  { value: "tree_work", label: "Tree work" },
  { value: "roofing_install", label: "Roofing install" },
  { value: "roofing_repair", label: "Roofing repair" },
  { value: "hvac_install", label: "HVAC install" },
  { value: "hvac_service", label: "HVAC service" },
  { value: "plumbing_rough", label: "Plumbing rough" },
  { value: "plumbing_finish", label: "Plumbing finish" },
  { value: "electrical_rough", label: "Electrical rough" },
  { value: "electrical_finish", label: "Electrical finish" },
  { value: "painting_interior", label: "Painting interior" },
  { value: "painting_exterior", label: "Painting exterior" },
  { value: "concrete_flatwork", label: "Concrete flatwork" },
  { value: "fencing", label: "Fencing" },
  { value: "deck_building", label: "Deck building" },
  { value: "pressure_washing", label: "Pressure washing" },
  { value: "low_voltage", label: "Low voltage" },
  { value: "customer_facing", label: "Customer facing" },
  { value: "other", label: "Other" },
];
