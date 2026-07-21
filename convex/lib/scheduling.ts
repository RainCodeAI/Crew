/**
 * Deterministic greedy packing — works without OpenAI.
 * Same conceptual output as AI suggestions so the board stays usable offline.
 *
 * All wall-clock placement uses the company IANA timezone (not server local).
 */

import {
  atZonedTime,
  eachZonedDay,
  getZonedParts,
  resolveTimeZone,
} from "./timezone";

export type PackJob = {
  id: string;
  title: string;
  durationMinutes: number;
  requiredSkills: string[];
  priority: "low" | "medium" | "high" | "emergency";
  preferredStartAt?: number;
  preferredEndAt?: number;
};

export type PackCrew = {
  id: string;
  name: string;
  skills: string[];
  isActive: boolean;
  /** Optional: default Mon–Fri hours applied when packing. */
  defaultWeeklyHours?: Array<{ day: number; start: string; end: string }>;
};

export type BusyInterval = {
  crewMemberId: string;
  startAt: number;
  endAt: number;
};

export type UnavailableBlock = {
  crewMemberId: string;
  startAt: number;
  endAt: number;
};

export type PackAssignment = {
  jobId: string;
  startAt: number;
  endAt: number;
  crewMemberIds: string[];
  rationale: string;
};

export type PackResult = {
  assignments: PackAssignment[];
  unscheduled: Array<{ jobId: string; reason: string }>;
};

const PRIORITY_RANK: Record<PackJob["priority"], number> = {
  emergency: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

function defaultHoursForDay(
  crew: PackCrew,
  dayOfWeek: number,
): { start: string; end: string } | null {
  const blocks = crew.defaultWeeklyHours;
  if (blocks?.length) {
    const hit = blocks.find((b) => b.day === dayOfWeek);
    return hit ? { start: hit.start, end: hit.end } : null;
  }
  // Mon–Fri 08:00–17:00 default
  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    return { start: "08:00", end: "17:00" };
  }
  return null;
}

function crewFree(
  crewId: string,
  startAt: number,
  endAt: number,
  busy: BusyInterval[],
  unavailable: UnavailableBlock[],
): boolean {
  for (const b of busy) {
    if (b.crewMemberId !== crewId) continue;
    if (overlaps(startAt, endAt, b.startAt, b.endAt)) return false;
  }
  for (const u of unavailable) {
    if (u.crewMemberId !== crewId) continue;
    if (overlaps(startAt, endAt, u.startAt, u.endAt)) return false;
  }
  return true;
}

function skillsCovered(required: string[], crewSkills: string[]): boolean {
  if (!required.length) return true;
  const set = new Set(crewSkills);
  return required.every((s) => set.has(s));
}

/**
 * Greedy pack: sort by priority, place earliest feasible slot with a skilled crew.
 * Slot step = 30 minutes. Times interpreted in `timeZone`.
 */
export function greedyPackSchedule(args: {
  jobs: PackJob[];
  crew: PackCrew[];
  windowStartAt: number;
  windowEndAt: number;
  busy?: BusyInterval[];
  unavailable?: UnavailableBlock[];
  slotStepMinutes?: number;
  /** IANA timezone for workday walls (defaults America/Chicago). */
  timeZone?: string;
}): PackResult {
  const {
    jobs,
    crew,
    windowStartAt,
    windowEndAt,
    busy = [],
    unavailable = [],
    slotStepMinutes = 30,
    timeZone: tzArg,
  } = args;

  const timeZone = resolveTimeZone(tzArg);
  const activeCrew = crew.filter((c) => c.isActive);
  const workingBusy = [...busy];
  const assignments: PackAssignment[] = [];
  const unscheduled: Array<{ jobId: string; reason: string }> = [];

  const ordered = [...jobs].sort((a, b) => {
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    const aw = a.preferredStartAt ?? windowStartAt;
    const bw = b.preferredStartAt ?? windowStartAt;
    return aw - bw;
  });

  for (const job of ordered) {
    const durationMs = Math.max(15, job.durationMinutes) * 60 * 1000;
    const winStart = Math.max(
      windowStartAt,
      job.preferredStartAt ?? windowStartAt,
    );
    const winEnd = Math.min(windowEndAt, job.preferredEndAt ?? windowEndAt);

    if (winEnd - winStart < durationMs) {
      unscheduled.push({
        jobId: job.id,
        reason: "Preferred/window shorter than job duration",
      });
      continue;
    }

    const skilled = activeCrew.filter((c) =>
      skillsCovered(job.requiredSkills, c.skills),
    );
    if (!skilled.length) {
      unscheduled.push({
        jobId: job.id,
        reason: "No active crew covers required skills",
      });
      continue;
    }

    let placed: PackAssignment | null = null;
    const days = eachZonedDay(winStart, winEnd, timeZone);

    outer: for (const dayMs of days) {
      const dow = getZonedParts(dayMs, timeZone).weekday;
      for (const member of skilled) {
        const hours = defaultHoursForDay(member, dow);
        if (!hours) continue;

        let slot = Math.max(winStart, atZonedTime(dayMs, hours.start, timeZone));
        const dayEnd = Math.min(winEnd, atZonedTime(dayMs, hours.end, timeZone));

        while (slot + durationMs <= dayEnd) {
          const endAt = slot + durationMs;
          if (crewFree(member.id, slot, endAt, workingBusy, unavailable)) {
            placed = {
              jobId: job.id,
              startAt: slot,
              endAt,
              crewMemberIds: [member.id],
              rationale: `Greedy pack: ${member.name} earliest free slot (${job.priority})`,
            };
            break outer;
          }
          slot += slotStepMinutes * 60 * 1000;
        }
      }
    }

    if (placed) {
      assignments.push(placed);
      for (const id of placed.crewMemberIds) {
        workingBusy.push({
          crewMemberId: id,
          startAt: placed.startAt,
          endAt: placed.endAt,
        });
      }
    } else {
      unscheduled.push({
        jobId: job.id,
        reason: "No free skilled crew slot in window",
      });
    }
  }

  return { assignments, unscheduled };
}
