import { describe, expect, it } from "vitest";
import { parseAppError } from "../lib/app-error";

describe("parseAppError", () => {
  it("parses structured codes", () => {
    expect(parseAppError(new Error("FORBIDDEN: no access"))).toEqual({
      code: "FORBIDDEN",
      message: "no access",
    });
    expect(parseAppError("RATE_LIMIT: slow down")).toEqual({
      code: "RATE_LIMIT",
      message: "slow down",
    });
  });

  it("falls back to UNKNOWN", () => {
    expect(parseAppError(new Error("plain"))).toEqual({
      code: "UNKNOWN",
      message: "plain",
    });
  });
});
