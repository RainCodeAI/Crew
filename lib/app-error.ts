/**
 * Client-side parse of Convex/app errors.
 *
 * Backend functions throw `ConvexError({ code, message })` (see
 * `convex/lib/errors.ts`). Convex preserves that `data` payload on the client
 * in production, where a plain `Error`'s message is redacted to "Server Error".
 * We read `error.data` first and fall back to the legacy `CODE: message` string
 * form for any errors thrown before the migration.
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

/** Read a structured `{ code, message }` payload off a ConvexError, if present. */
function fromConvexData(
  err: unknown,
): { code: AppErrorCode; message: string } | null {
  if (!err || typeof err !== "object" || !("data" in err)) return null;
  const data = (err as { data: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const code = (data as { code?: unknown }).code;
  const message = (data as { message?: unknown }).message;
  if (
    typeof code === "string" &&
    typeof message === "string" &&
    KNOWN.has(code as AppErrorCode)
  ) {
    return { code: code as AppErrorCode, message };
  }
  return null;
}

export function parseAppError(err: unknown): {
  code: AppErrorCode;
  message: string;
} {
  const structured = fromConvexData(err);
  if (structured) return structured;

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

/**
 * Human-readable message for display in a catch block. Prefers the structured
 * ConvexError message; otherwise a meaningful raw `Error.message`; otherwise the
 * caller's fallback. Use this instead of `err instanceof Error ? err.message`,
 * which surfaces Convex's serialized wrapper text in production.
 */
export function errorText(
  err: unknown,
  fallback = "Something went wrong",
): string {
  const parsed = parseAppError(err);
  if (parsed.code !== "UNKNOWN") return parsed.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
