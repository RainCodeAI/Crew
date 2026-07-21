/**
 * Lightweight structured errors for Convex functions.
 * Format: `CODE: human-readable message` so clients can parse without a custom protocol.
 */

export type AppErrorCode =
  | "AUTH"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMIT";

export function appError(code: AppErrorCode, message: string): never {
  throw new Error(`${code}: ${message}`);
}

export function notFound(message = "Not found"): never {
  appError("NOT_FOUND", message);
}

export function badRequest(message: string): never {
  appError("VALIDATION", message);
}

export function unauthorized(message?: string): never {
  appError(
    "AUTH",
    message ??
      "Not authenticated. Call the `users.store` mutation after sign-in.",
  );
}

export function forbidden(message: string): never {
  appError("FORBIDDEN", message);
}

export function conflict(message: string): never {
  appError("CONFLICT", message);
}

export function rateLimited(message: string): never {
  appError("RATE_LIMIT", message);
}

/** Coerce unknown catch values to a safe string for logs / aiErrorMessage. */
export function errorMessage(
  err: unknown,
  fallback = "Something went wrong",
): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}
