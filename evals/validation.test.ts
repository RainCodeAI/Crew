import { describe, expect, it } from "vitest";
import {
  assertUnderRateLimit,
  clampListLimit,
  requireJobBatchSize,
  requireMaxLength,
  requireNonEmpty,
  requirePositiveDuration,
  requireTimeRange,
  validateWeeklyHours,
} from "../convex/lib/validation";

describe("validation helpers", () => {
  it("requireNonEmpty trims and rejects blank", () => {
    expect(requireNonEmpty("  hello  ", "Title")).toBe("hello");
    expect(() => requireNonEmpty("   ", "Title")).toThrow(
      /VALIDATION:.*Title is required/,
    );
  });

  it("requirePositiveDuration bounds", () => {
    expect(requirePositiveDuration(60)).toBe(60);
    expect(() => requirePositiveDuration(0)).toThrow(/VALIDATION:.*positive/);
    expect(() => requirePositiveDuration(-1)).toThrow(/VALIDATION:.*positive/);
  });

  it("requireTimeRange", () => {
    expect(() => requireTimeRange(100, 50)).toThrow(
      /VALIDATION:.*end must be after start/,
    );
    expect(() => requireTimeRange(1, 2)).not.toThrow();
  });

  it("requireJobBatchSize", () => {
    expect(() => requireJobBatchSize(Array(41).fill("x"))).toThrow(
      /VALIDATION:.*At most/,
    );
    expect(() => requireJobBatchSize(["a", "b"])).not.toThrow();
  });

  it("assertUnderRateLimit", () => {
    const now = Date.now();
    expect(() =>
      assertUnderRateLimit([now, now - 1000], {
        max: 2,
        windowMs: 60_000,
        label: "tests",
      }),
    ).toThrow(/RATE_LIMIT:.*Too many/);
    expect(() =>
      assertUnderRateLimit([now - 120_000], {
        max: 2,
        windowMs: 60_000,
        label: "tests",
      }),
    ).not.toThrow();
  });

  it("clampListLimit", () => {
    expect(clampListLimit(undefined, { default: 50, max: 200 })).toBe(50);
    expect(clampListLimit(9999, { default: 50, max: 200 })).toBe(200);
    expect(clampListLimit(10, { default: 50, max: 200 })).toBe(10);
  });

  it("requireMaxLength", () => {
    expect(() => requireMaxLength("abc", 2, "X")).toThrow(
      /VALIDATION:.*at most 2/,
    );
    expect(requireMaxLength("ab", 2, "X")).toBe("ab");
  });

  it("validateWeeklyHours", () => {
    expect(() =>
      validateWeeklyHours([{ day: 7, start: "08:00", end: "17:00" }]),
    ).toThrow(/day/);
    expect(() =>
      validateWeeklyHours([{ day: 1, start: "8:00", end: "17:00" }]),
    ).toThrow(/HH:mm/);
    expect(() =>
      validateWeeklyHours([{ day: 1, start: "08:00", end: "17:00" }]),
    ).not.toThrow();
  });
});
