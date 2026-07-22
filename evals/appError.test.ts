import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { errorText, parseAppError } from "../lib/app-error";

describe("parseAppError", () => {
  it("reads structured ConvexError data (survives prod redaction)", () => {
    const err = new ConvexError({ code: "CONFLICT", message: "Blocking conflicts found." });
    expect(parseAppError(err)).toEqual({
      code: "CONFLICT",
      message: "Blocking conflicts found.",
    });
  });

  it("ignores ConvexError data with an unknown code", () => {
    const err = new ConvexError({ code: "WeirdCode", message: "nope" });
    // Falls through to string matching, then UNKNOWN.
    expect(parseAppError(err).code).toBe("UNKNOWN");
  });

  it("parses legacy structured code strings", () => {
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

describe("errorText", () => {
  it("prefers the structured ConvexError message", () => {
    const err = new ConvexError({ code: "VALIDATION", message: "Title is required." });
    expect(errorText(err, "fallback")).toBe("Title is required.");
  });

  it("uses a meaningful raw Error message when unstructured", () => {
    expect(errorText(new Error("boom"), "fallback")).toBe("boom");
  });

  it("uses the caller fallback for non-error throwables", () => {
    expect(errorText(undefined, "Confirm failed")).toBe("Confirm failed");
  });
});
