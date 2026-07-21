/**
 * Pure conflict evaluation used by unit tests and shared with conflicts.ts logic.
 * Keep in sync with evaluateScheduleConflicts behavior.
 */

export type PureConflictType =
  | "overbooking"
  | "skill_mismatch"
  | "outside_availability"
  | "travel_risk"
  | "weather_risk"
  | "priority_violation"
  | "missing_certification"
  | "inactive_crew"
  | "double_booked_job";

export type PureConflictSeverity = "info" | "warning" | "error";

export type PureConflictFinding = {
  type: PureConflictType;
  severity: PureConflictSeverity;
  message: string;
  crewMemberIds?: string[];
};

export type PureSchedule = {
  id: string;
  jobId: string;
  startAt: number;
  endAt: number;
  crewMemberIds: string[];
  status: "draft" | "proposed" | "confirmed" | "cancelled";
  travelMinutesEstimate?: number;
};

export type PureJob = {
  requiredSkills: string[];
  requiredCertifications?: string[];
  priority: "low" | "medium" | "high" | "emergency";
  preferredStartAt?: number;
  preferredEndAt?: number;
  weatherRisk?: "none" | "low" | "moderate" | "high" | "severe";
};

export type PureCrew = {
  id: string;
  name: string;
  skills: string[];
  certifications?: string[];
  isActive: boolean;
};

export type PureAvailability = {
  crewMemberId: string;
  kind: "unavailable" | "available" | "preferred";
  startAt: number;
  endAt: number;
};

function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function evaluateConflictsPure(args: {
  schedule: PureSchedule;
  job: PureJob | null;
  crew: PureCrew[];
  otherSchedules: PureSchedule[];
  availability: PureAvailability[];
}): PureConflictFinding[] {
  const { schedule, job, crew, otherSchedules, availability } = args;
  const findings: PureConflictFinding[] = [];
  if (schedule.status === "cancelled") return findings;

  const crewById = new Map(crew.map((c) => [c.id, c]));

  for (const id of schedule.crewMemberIds) {
    const member = crewById.get(id);
    if (!member) {
      findings.push({
        type: "inactive_crew",
        severity: "error",
        message: "Assigned crew member was not found.",
        crewMemberIds: [id],
      });
      continue;
    }
    if (!member.isActive) {
      findings.push({
        type: "inactive_crew",
        severity: "error",
        message: `${member.name} is inactive and cannot be scheduled.`,
        crewMemberIds: [id],
      });
    }
  }

  if (job) {
    const unionSkills = new Set(crew.flatMap((c) => c.skills));
    const missingSkills = job.requiredSkills.filter((s) => !unionSkills.has(s));
    if (missingSkills.length > 0) {
      findings.push({
        type: "skill_mismatch",
        severity: "error",
        message: `Missing required skills: ${missingSkills.join(", ")}.`,
        crewMemberIds: schedule.crewMemberIds,
      });
    }

    const requiredCerts = job.requiredCertifications ?? [];
    if (requiredCerts.length > 0) {
      const unionCerts = new Set(crew.flatMap((c) => c.certifications ?? []));
      const missingCerts = requiredCerts.filter((c) => !unionCerts.has(c));
      if (missingCerts.length > 0) {
        findings.push({
          type: "missing_certification",
          severity: "error",
          message: `Missing certifications: ${missingCerts.join(", ")}.`,
          crewMemberIds: schedule.crewMemberIds,
        });
      }
    }

    if (
      (job.priority === "emergency" || job.priority === "high") &&
      job.preferredStartAt != null &&
      job.preferredEndAt != null
    ) {
      if (
        schedule.startAt < job.preferredStartAt ||
        schedule.endAt > job.preferredEndAt
      ) {
        findings.push({
          type: "priority_violation",
          severity: "warning",
          message:
            "High-priority job is scheduled outside its preferred window.",
        });
      }
    }
  }

  for (const other of otherSchedules) {
    if (other.id === schedule.id) continue;
    if (other.status === "cancelled") continue;

    // Same job with another confirmed placement
    if (
      other.jobId === schedule.jobId &&
      (schedule.status === "confirmed" || schedule.status === "draft" || schedule.status === "proposed") &&
      other.status === "confirmed"
    ) {
      findings.push({
        type: "double_booked_job",
        severity: "error",
        message: "This job already has another confirmed schedule.",
      });
    }

    if (
      !intervalsOverlap(
        schedule.startAt,
        schedule.endAt,
        other.startAt,
        other.endAt,
      )
    ) {
      continue;
    }
    const shared = schedule.crewMemberIds.filter((id) =>
      other.crewMemberIds.includes(id),
    );
    if (shared.length > 0) {
      const hard =
        schedule.status === "confirmed" || other.status === "confirmed";
      findings.push({
        type: "overbooking",
        severity: hard ? "error" : "warning",
        message: hard
          ? "Crew member is double-booked against a confirmed schedule."
          : "Crew member has an overlapping draft/proposed placement.",
        crewMemberIds: shared,
      });
    }
  }

  for (const id of schedule.crewMemberIds) {
    const blocks = availability.filter(
      (a) =>
        a.crewMemberId === id &&
        a.kind === "unavailable" &&
        intervalsOverlap(schedule.startAt, schedule.endAt, a.startAt, a.endAt),
    );
    if (blocks.length > 0) {
      const member = crewById.get(id);
      findings.push({
        type: "outside_availability",
        severity: "error",
        message: `${member?.name ?? "Crew member"} is marked unavailable (PTO/block) during this slot.`,
        crewMemberIds: [id],
      });
    }
  }

  if (job?.weatherRisk === "high" || job?.weatherRisk === "severe") {
    findings.push({
      type: "weather_risk",
      severity: job.weatherRisk === "severe" ? "warning" : "info",
      message: `Weather risk on this job is ${job.weatherRisk}.`,
    });
  }

  if (
    schedule.travelMinutesEstimate != null &&
    schedule.travelMinutesEstimate > 60
  ) {
    findings.push({
      type: "travel_risk",
      severity: "info",
      message: `Estimated travel is ${schedule.travelMinutesEstimate} minutes — check geographic clustering.`,
    });
  }

  return findings;
}

export function hasBlockingErrorsPure(
  findings: PureConflictFinding[],
  ownerOverride?: boolean,
): boolean {
  if (ownerOverride) return false;
  return findings.some((f) => f.severity === "error");
}

export type CrewDoubleBooking = {
  scheduleAId: string;
  scheduleBId: string;
  crewMemberId: string;
};

/**
 * Find crew members double-booked *within a set of schedules being confirmed
 * together*. Two proposed placements overlapping on the same crew member are
 * only "warning" severity in {@link evaluateConflictsPure} (neither is confirmed
 * yet), so confirming a whole AI/pack batch could otherwise create overlapping
 * confirmed schedules. Callers treat any result here as a blocking conflict.
 */
export function findCrewDoubleBookings(
  schedules: Array<{
    id: string;
    startAt: number;
    endAt: number;
    crewMemberIds: string[];
  }>,
): CrewDoubleBooking[] {
  const out: CrewDoubleBooking[] = [];
  for (let i = 0; i < schedules.length; i++) {
    for (let j = i + 1; j < schedules.length; j++) {
      const a = schedules[i];
      const b = schedules[j];
      if (!intervalsOverlap(a.startAt, a.endAt, b.startAt, b.endAt)) continue;
      const bCrew = new Set(b.crewMemberIds);
      for (const crewMemberId of a.crewMemberIds) {
        if (bCrew.has(crewMemberId)) {
          out.push({ scheduleAId: a.id, scheduleBId: b.id, crewMemberId });
        }
      }
    }
  }
  return out;
}
