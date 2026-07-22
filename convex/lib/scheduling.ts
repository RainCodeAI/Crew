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

/**
 * Smallest deterministic set of members whose combined skills cover `required`.
 * Greedy set cover: repeatedly take the member adding the most still-needed
 * skills, ties broken by id for stable output. Returns `[]` if the given members
 * cannot cover the requirement (caller keeps scanning). When `required` is empty
 * a job still needs someone, so one member is returned.
 */
function pickMinimalCover(required: string[], members: PackCrew[]): PackCrew[] {
  if (!members.length) return [];
  if (!required.length) return [members[0]!];

  const need = new Set(required);
  const pool = [...members].sort((a, b) => a.id.localeCompare(b.id));
  const team: PackCrew[] = [];

  while (need.size) {
    let best: PackCrew | null = null;
    let bestCover = 0;
    for (const m of pool) {
      if (team.includes(m)) continue;
      let cover = 0;
      for (const s of m.skills) if (need.has(s)) cover++;
      if (cover > bestCover) {
        bestCover = cover;
        best = m;
      }
    }
    if (!best) break; // no remaining member covers an outstanding skill
    team.push(best);
    for (const s of best.skills) need.delete(s);
  }

  return need.size ? [] : team;
}

/**
 * Greedy pack: sort by priority, then place each job in the earliest slot where
 * a qualified crew is all simultaneously free. A job whose required skills no
 * single person holds can be staffed by a multi-person crew (union of skills).
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

    // Crew who could contribute at least one required skill (all active crew for
    // a job with no listed skills). A job is packable when their *combined*
    // skills cover the requirement; the packer may staff a multi-person crew.
    const relevantCrew = job.requiredSkills.length
      ? activeCrew.filter((c) =>
          c.skills.some((s) => job.requiredSkills.includes(s)),
        )
      : activeCrew;

    const unionSkills = new Set(relevantCrew.flatMap((c) => c.skills));
    const coverable = job.requiredSkills.every((s) => unionSkills.has(s));
    if (!relevantCrew.length || !coverable) {
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

      // Each relevant member's working bounds (UTC ms) for this day.
      const working = relevantCrew.flatMap((member) => {
        const hours = defaultHoursForDay(member, dow);
        if (!hours) return [];
        return [
          {
            member,
            start: atZonedTime(dayMs, hours.start, timeZone),
            end: atZonedTime(dayMs, hours.end, timeZone),
          },
        ];
      });
      if (!working.length) continue;

      const gridStart = Math.max(
        winStart,
        Math.min(...working.map((w) => w.start)),
      );
      const gridEnd = Math.min(winEnd, Math.max(...working.map((w) => w.end)));

      let slot = gridStart;
      while (slot + durationMs <= gridEnd) {
        const endAt = slot + durationMs;
        // Members whose own hours cover this slot and who are free right now.
        const availableNow = working
          .filter(
            (w) =>
              w.start <= slot &&
              endAt <= w.end &&
              crewFree(w.member.id, slot, endAt, workingBusy, unavailable),
          )
          .map((w) => w.member);

        const team = pickMinimalCover(job.requiredSkills, availableNow);
        if (team.length) {
          const names = team.map((m) => m.name).join(" + ");
          placed = {
            jobId: job.id,
            startAt: slot,
            endAt,
            crewMemberIds: team.map((m) => m.id),
            rationale:
              team.length === 1
                ? `Greedy pack: ${names} earliest free slot (${job.priority})`
                : `Greedy pack: ${names} together cover the required skills (${job.priority})`,
          };
          break outer;
        }
        slot += slotStepMinutes * 60 * 1000;
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
        reason: "No time slot where a qualified crew is all available",
      });
    }
  }

  return { assignments, unscheduled };
}
