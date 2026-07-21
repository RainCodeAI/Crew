/**
 * Client-side parse of Convex/app errors (`CODE: message`).
 */

export type AppErrorCode =
  | "AUTH"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMIT"
  | "UNKNOWN";

const KNOWN = new Set<AppErrorCode>([
  "AUTH",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION",
  "CONFLICT",
  "RATE_LIMIT",
]);

export function parseAppError(err: unknown): {
  code: AppErrorCode;
  message: string;
} {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Something went wrong";

  const m = raw.match(
    /^(AUTH|FORBIDDEN|NOT_FOUND|VALIDATION|CONFLICT|RATE_LIMIT):\s*([\s\S]*)$/,
  );
  if (m && KNOWN.has(m[1] as AppErrorCode)) {
    return { code: m[1] as AppErrorCode, message: m[2] || raw };
  }
  return { code: "UNKNOWN", message: raw };
}
