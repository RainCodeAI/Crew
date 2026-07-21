import { describe, expect, it } from "vitest";
import {
  sanitizeCrewForAi,
  sanitizeJobsForAi,
  sanitizeUnavailableForAi,
} from "../convex/lib/aiPrivacy";

describe("AI PII redaction", () => {
  it("strips address and uses generic titles when allowPii is false", () => {
    const out = sanitizeJobsForAi(
      [
        {
          id: "j1",
          title: "Smith roof — 123 Oak St",
          durationMinutes: 120,
          requiredSkills: ["roofing_install"],
          priority: "high",
          address: "123 Oak St",
          serviceType: "roofing",
        },
      ],
      false,
    );
    expect(out[0].address).toBeUndefined();
    expect(out[0].title).not.toMatch(/Smith|Oak/);
    expect(out[0].id).toBe("j1");
    expect(out[0].requiredSkills).toEqual(["roofing_install"]);
  });

  it("keeps identifying fields when allowPii is true", () => {
    const out = sanitizeJobsForAi(
      [
        {
          id: "j1",
          title: "Smith roof",
          durationMinutes: 60,
          requiredSkills: [],
          priority: "low",
          address: "123 Oak",
        },
      ],
      true,
    );
    expect(out[0].title).toBe("Smith roof");
    expect(out[0].address).toBe("123 Oak");
  });

  it("redacts crew names and rates by default", () => {
    const out = sanitizeCrewForAi(
      [
        {
          id: "c1",
          name: "Alex Realname",
          skills: ["general_labor"],
          isActive: true,
          hourlyRate: 45,
          roleLabel: "Foreman",
        },
      ],
      false,
    );
    expect(out[0].name).toBe("Foreman");
    expect(out[0].hourlyRate).toBeUndefined();
  });

  it("strips unavailability free-text reasons by default", () => {
    const out = sanitizeUnavailableForAi(
      [
        {
          crewMemberId: "c1",
          startAt: 1,
          endAt: 2,
          reason: "surgery at Memorial Hospital",
        },
      ],
      false,
    );
    expect(out[0].reason).toBeUndefined();
  });
});
