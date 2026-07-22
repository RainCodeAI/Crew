import { describe, expect, it } from "vitest";
import { isValidTimeZone, resolveTimeZone } from "../convex/lib/timezone";

describe("isValidTimeZone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimeZone("America/Denver")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone(" America/Chicago ")).toBe(true);
  });

  it("rejects blanks and typos", () => {
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("   ")).toBe(false);
    expect(isValidTimeZone("Amrica/Denver")).toBe(false);
    expect(isValidTimeZone("Mars/Phobos")).toBe(false);
  });

  it("resolveTimeZone still falls back for empty/invalid input", () => {
    expect(resolveTimeZone(undefined)).toBe("America/Chicago");
    expect(resolveTimeZone("nope/nope")).toBe("America/Chicago");
    expect(resolveTimeZone("Europe/London")).toBe("Europe/London");
  });
});
