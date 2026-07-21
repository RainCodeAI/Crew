/**
 * Allowed job status transitions (manual updates).
 * Schedule-driven helpers live in scheduleSync.ts.
 */

import type { JobStatus } from "../../types";
import { appError } from "./errors";

const ALLOWED: Record<JobStatus, readonly JobStatus[]> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["draft", "in_progress", "completed", "cancelled"],
  in_progress: ["scheduled", "completed", "cancelled"],
  completed: ["cancelled"],
  cancelled: ["draft"],
};

export function assertJobStatusTransition(
  from: JobStatus,
  to: JobStatus,
): void {
  if (from === to) return;
  const allowed = ALLOWED[from];
  if (!allowed.includes(to)) {
    appError(
      "VALIDATION",
      `Cannot change job status from "${from}" to "${to}".`,
    );
  }
}
