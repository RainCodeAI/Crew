"use client";

import { Badge } from "@/components/ui/badge";
import { CONFLICT_SEVERITIES, CONFLICT_TYPES } from "@/lib/constants";
import type { ConflictSeverity, ConflictType } from "@/types";

export type ConflictRow = {
  _id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  message: string;
  isResolved: boolean;
};

export function ConflictBadges({ conflicts }: { conflicts: ConflictRow[] }) {
  if (!conflicts.length) return null;
  const errors = conflicts.filter((c) => c.severity === "error").length;
  const warnings = conflicts.filter((c) => c.severity === "warning").length;
  const info = conflicts.filter((c) => c.severity === "info").length;

  return (
    <div className="flex flex-wrap gap-1">
      {errors > 0 ? (
        <Badge className="bg-red-100 text-red-700 ring-red-600/20" variant="outline">
          {errors} error{errors === 1 ? "" : "s"}
        </Badge>
      ) : null}
      {warnings > 0 ? (
        <Badge
          className="bg-amber-100 text-amber-700 ring-amber-600/20"
          variant="outline"
        >
          {warnings} warn
        </Badge>
      ) : null}
      {info > 0 && !errors && !warnings ? (
        <Badge className="bg-slate-100 text-slate-600 ring-slate-500/20" variant="outline">
          {info} note
        </Badge>
      ) : null}
    </div>
  );
}

export function ConflictList({ conflicts }: { conflicts: ConflictRow[] }) {
  if (!conflicts.length) {
    return (
      <p className="text-sm text-muted-foreground">No open conflicts.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {conflicts.map((c) => {
        const sev = CONFLICT_SEVERITIES.find((s) => s.value === c.severity);
        const type = CONFLICT_TYPES.find((t) => t.value === c.type);
        return (
          <li
            key={c._id}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <Badge className={sev?.badgeClass} variant="outline">
                {sev?.label ?? c.severity}
              </Badge>
              <span className="text-xs font-medium text-muted-foreground">
                {type?.label ?? c.type}
              </span>
            </div>
            <p>{c.message}</p>
          </li>
        );
      })}
    </ul>
  );
}
