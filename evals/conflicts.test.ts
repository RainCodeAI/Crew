import { describe, expect, it } from "vitest";
import {
  evaluateConflictsPure,
  findCrewDoubleBookings,
  hasBlockingErrorsPure,
} from "../convex/lib/conflicts.pure";
import { greedyPackSchedule } from "../convex/lib/scheduling";

const baseSchedule = {
  id: "s1",
  jobId: "j1",
  startAt: 1_000,
  endAt: 2_000,
  crewMemberIds: ["c1"],
  status: "confirmed" as const,
};

const baseCrew = {
  id: "c1",
  name: "Alex",
  skills: ["roofing_install", "general_labor"],
  isActive: true,
};

describe("evaluateConflictsPure", () => {
  it("flags skill mismatch", () => {
    const findings = evaluateConflictsPure({
      schedule: baseSchedule,
      job: {
        requiredSkills: ["electrical_finish"],
        priority: "medium",
      },
      crew: [baseCrew],
      otherSchedules: [],
      availability: [],
    });
    expect(findings.some((f) => f.type === "skill_mismatch")).toBe(true);
    expect(hasBlockingErrorsPure(findings)).toBe(true);
  });

  it("flags overbooking against confirmed schedule", () => {
    const findings = evaluateConflictsPure({
      schedule: baseSchedule,
      job: { requiredSkills: ["general_labor"], priority: "medium" },
      crew: [baseCrew],
      otherSchedules: [
        {
          id: "s2",
          jobId: "j2",
          startAt: 1_500,
          endAt: 2_500,
          crewMemberIds: ["c1"],
          status: "confirmed",
        },
      ],
      availability: [],
    });
    expect(findings.some((f) => f.type === "overbooking")).toBe(true);
    expect(
      findings.find((f) => f.type === "overbooking")?.severity,
    ).toBe("error");
  });

  it("flags PTO / unavailability", () => {
    const findings = evaluateConflictsPure({
      schedule: baseSchedule,
      job: { requiredSkills: ["general_labor"], priority: "medium" },
      crew: [baseCrew],
      otherSchedules: [],
      availability: [
        {
          crewMemberId: "c1",
          kind: "unavailable",
          startAt: 500,
          endAt: 3_000,
        },
      ],
    });
    expect(findings.some((f) => f.type === "outside_availability")).toBe(true);
  });

  it("flags inactive crew", () => {
    const findings = evaluateConflictsPure({
      schedule: baseSchedule,
      job: null,
      crew: [{ ...baseCrew, isActive: false }],
      otherSchedules: [],
      availability: [],
    });
    expect(findings.some((f) => f.type === "inactive_crew")).toBe(true);
  });

  it("allows owner override of blocking errors", () => {
    const findings = evaluateConflictsPure({
      schedule: baseSchedule,
      job: { requiredSkills: ["electrical_finish"], priority: "high" },
      crew: [baseCrew],
      otherSchedules: [],
      availability: [],
    });
    expect(hasBlockingErrorsPure(findings, true)).toBe(false);
  });
});

describe("findCrewDoubleBookings", () => {
  it("detects a crew member booked on two overlapping schedules", () => {
    const doubles = findCrewDoubleBookings([
      { id: "s1", startAt: 1_000, endAt: 3_000, crewMemberIds: ["c1", "c2"] },
      { id: "s2", startAt: 2_000, endAt: 4_000, crewMemberIds: ["c2", "c3"] },
    ]);
    expect(doubles).toHaveLength(1);
    expect(doubles[0]).toMatchObject({
      scheduleAId: "s1",
      scheduleBId: "s2",
      crewMemberId: "c2",
    });
  });

  it("ignores non-overlapping times and disjoint crews", () => {
    expect(
      findCrewDoubleBookings([
        { id: "s1", startAt: 1_000, endAt: 2_000, crewMemberIds: ["c1"] },
        // same crew, but abutting (no overlap)
        { id: "s2", startAt: 2_000, endAt: 3_000, crewMemberIds: ["c1"] },
        // overlaps s1 but different crew
        { id: "s3", startAt: 1_500, endAt: 2_500, crewMemberIds: ["c9"] },
      ]),
    ).toHaveLength(0);
  });

  it("reports one entry per shared crew member across a pair", () => {
    const doubles = findCrewDoubleBookings([
      { id: "s1", startAt: 0, endAt: 10, crewMemberIds: ["c1", "c2"] },
      { id: "s2", startAt: 5, endAt: 15, crewMemberIds: ["c1", "c2"] },
    ]);
    expect(doubles).toHaveLength(2);
  });
});

describe("greedyPackSchedule", () => {
  it("places a job with matching crew (UTC company timezone)", () => {
    // 2026-07-13 is a Monday
    const monday = Date.UTC(2026, 6, 13, 0, 0, 0);
    const friday = Date.UTC(2026, 6, 18, 0, 0, 0);

    const result = greedyPackSchedule({
      timeZone: "UTC",
      jobs: [
        {
          id: "j1",
          title: "Install",
          durationMinutes: 120,
          requiredSkills: ["roofing_install"],
          priority: "high",
        },
      ],
      crew: [
        {
          id: "c1",
          name: "Alex",
          skills: ["roofing_install"],
          isActive: true,
          defaultWeeklyHours: [1, 2, 3, 4, 5].map((day) => ({
            day,
            start: "08:00",
            end: "17:00",
          })),
        },
      ],
      windowStartAt: monday,
      windowEndAt: friday,
    });

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].crewMemberIds).toEqual(["c1"]);
    expect(result.unscheduled).toHaveLength(0);
  });

  it("leaves unscheduled when no skill match", () => {
    const monday = Date.UTC(2026, 6, 13, 0, 0, 0);
    const result = greedyPackSchedule({
      timeZone: "UTC",
      jobs: [
        {
          id: "j1",
          title: "Electrical",
          durationMinutes: 60,
          requiredSkills: ["electrical_finish"],
          priority: "medium",
        },
      ],
      crew: [
        {
          id: "c1",
          name: "Alex",
          skills: ["general_labor"],
          isActive: true,
        },
      ],
      windowStartAt: monday,
      windowEndAt: Date.UTC(2026, 6, 20, 0, 0, 0),
    });
    expect(result.assignments).toHaveLength(0);
    expect(result.unscheduled[0]?.reason).toMatch(/skills/i);
  });
});
