import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import type { AppErrorData } from "../convex/lib/errors";
import {
  assertUnderRateLimit,
  clampListLimit,
  requireHHMM,
  requireJobBatchSize,
  requireMaxLength,
  requireNonEmpty,
  requireOrderedWindow,
  requirePositiveDuration,
  requireTimeRange,
  validateWeeklyHours,
} from "../convex/lib/validation";

/**
 * Assert `fn` throws a structured ConvexError with the given code and a message
 * matching `messageRe`. Validation helpers now throw `ConvexError({code,message})`
 * so the payload survives Convex's production error redaction.
 */
function expectAppError(
  fn: () => unknown,
  code: AppErrorData["code"],
  messageRe: RegExp,
): void {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);
    const data = (err as ConvexError<AppErrorData>).data;
    expect(data.code).toBe(code);
    expect(data.message).toMatch(messageRe);
    return;
  }
  throw new Error("Expected function to throw, but it did not.");
}

describe("validation helpers", () => {
  it("requireNonEmpty trims and rejects blank", () => {
    expect(requireNonEmpty("  hello  ", "Title")).toBe("hello");
    expectAppError(
      () => requireNonEmpty("   ", "Title"),
      "VALIDATION",
      /Title is required/,
    );
  });

  it("requirePositiveDuration bounds", () => {
    expect(requirePositiveDuration(60)).toBe(60);
    expectAppError(() => requirePositiveDuration(0), "VALIDATION", /positive/);
    expectAppError(() => requirePositiveDuration(-1), "VALIDATION", /positive/);
  });

  it("requireTimeRange", () => {
    expectAppError(
      () => requireTimeRange(100, 50),
      "VALIDATION",
      /end must be after start/,
    );
    expect(() => requireTimeRange(1, 2)).not.toThrow();
  });

  it("requireJobBatchSize", () => {
    expectAppError(
      () => requireJobBatchSize(Array(41).fill("x")),
      "VALIDATION",
      /At most/,
    );
    expect(() => requireJobBatchSize(["a", "b"])).not.toThrow();
  });

  it("assertUnderRateLimit", () => {
    const now = Date.now();
    expectAppError(
      () =>
        assertUnderRateLimit([now, now - 1000], {
          max: 2,
          windowMs: 60_000,
          label: "tests",
        }),
      "RATE_LIMIT",
      /Too many/,
    );
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
    expectAppError(() => requireMaxLength("abc", 2, "X"), "VALIDATION", /at most 2/);
    expect(requireMaxLength("ab", 2, "X")).toBe("ab");
  });

  it("requireOrderedWindow", () => {
    // Both bounds absent or partial → no-op.
    expect(() => requireOrderedWindow(undefined, undefined)).not.toThrow();
    expect(() => requireOrderedWindow(100, undefined)).not.toThrow();
    expect(() => requireOrderedWindow(undefined, 100)).not.toThrow();
    expect(() => requireOrderedWindow(100, 200)).not.toThrow();
    expectAppError(
      () => requireOrderedWindow(200, 100, "Preferred window"),
      "VALIDATION",
      /end must be after start/,
    );
    expectAppError(
      () => requireOrderedWindow(Number.NaN, 100),
      "VALIDATION",
      /invalid/,
    );
  });

  it("requireHHMM", () => {
    expect(requireHHMM(" 08:30 ", "Workday start")).toBe("08:30");
    expect(requireHHMM("23:59", "X")).toBe("23:59");
    expectAppError(() => requireHHMM("8:30", "X"), "VALIDATION", /HH:mm/);
    expectAppError(() => requireHHMM("24:00", "X"), "VALIDATION", /HH:mm/);
    expectAppError(() => requireHHMM("noon", "X"), "VALIDATION", /HH:mm/);
  });

  it("validateWeeklyHours", () => {
    expectAppError(
      () => validateWeeklyHours([{ day: 7, start: "08:00", end: "17:00" }]),
      "VALIDATION",
      /day/,
    );
    expectAppError(
      () => validateWeeklyHours([{ day: 1, start: "8:00", end: "17:00" }]),
      "VALIDATION",
      /HH:mm/,
    );
    expect(() =>
      validateWeeklyHours([{ day: 1, start: "08:00", end: "17:00" }]),
    ).not.toThrow();
  });
});
