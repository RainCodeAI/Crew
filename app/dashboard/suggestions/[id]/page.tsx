"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConflictList, type ConflictRow } from "@/components/board/conflict-panel";
import { formatTimeRange } from "@/lib/date";
import {
  SCHEDULE_STATUS_MAP,
  SUGGESTION_AI_STATUSES,
  SUGGESTION_STATUSES,
} from "@/lib/constants";
import { errorText } from "@/lib/app-error";

export default function SuggestionDetailPage() {
  const params = useParams();
  const suggestionId = params.id as Id<"scheduleSuggestions">;

  const me = useQuery(api.users.current, {});
  const isOwner = me?.role === "owner";
  const suggestion = useQuery(api.suggestions.get, { suggestionId });
  const run = useQuery(api.schedules.listForSuggestion, { suggestionId });

  const approve = useMutation(api.suggestions.approve);
  const reject = useMutation(api.suggestions.reject);
  const retry = useMutation(api.suggestions.retry);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionReady, setSelectionReady] = useState(false);
  const [ownerOverride, setOwnerOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const runSchedules = run?.schedules ?? [];
  const jobsById = run?.jobsById ?? {};
  const crewById = run?.crewById ?? {};

  useEffect(() => {
    if (runSchedules.length && !selectionReady) {
      setSelected(new Set(runSchedules.map((s) => s._id)));
      setSelectionReady(true);
    }
  }, [runSchedules, selectionReady]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onApprove(partial: boolean) {
    setBusy(true);
    setError(null);
    try {
      await approve({
        suggestionId,
        ownerOverride: ownerOverride || undefined,
        scheduleIds: partial
          ? ([...selected] as Id<"schedules">[])
          : undefined,
      });
    } catch (err) {
      setError(errorText(err, "Approve failed"));
    } finally {
      setBusy(false);
    }
  }

  if (suggestion === undefined) {
    return (
      <div className="mx-auto max-w-3xl">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (suggestion === null) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">Suggestion not found.</p>
        <Button asChild variant="outline">
          <Link href="/dashboard/suggestions">Back</Link>
        </Button>
      </div>
    );
  }

  const statusMeta = SUGGESTION_STATUSES.find(
    (x) => x.value === suggestion.status,
  );
  const aiMeta = SUGGESTION_AI_STATUSES.find(
    (x) => x.value === suggestion.aiStatus,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/suggestions">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Badge className={statusMeta?.badgeClass} variant="outline">
            {statusMeta?.label}
          </Badge>
          <Badge className={aiMeta?.badgeClass} variant="outline">
            {aiMeta?.label}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run summary</CardTitle>
          <CardDescription>
            Window{" "}
            {new Date(suggestion.windowStartAt).toLocaleDateString()} –{" "}
            {new Date(suggestion.windowEndAt).toLocaleDateString()}
            {suggestion.ownerNotes ? ` · ${suggestion.ownerNotes}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {suggestion.aiErrorMessage ? (
            <p className="text-destructive">{suggestion.aiErrorMessage}</p>
          ) : null}
          {suggestion.aiNotes?.length ? (
            <ul className="list-disc pl-5 text-muted-foreground">
              {suggestion.aiNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
          {suggestion.aiWarnings?.length ? (
            <ul className="list-disc pl-5 text-amber-700">
              {suggestion.aiWarnings.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
          {suggestion.aiConfidence != null ? (
            <p className="text-xs text-muted-foreground">
              Confidence {(suggestion.aiConfidence * 100).toFixed(0)}%
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proposed assignments</CardTitle>
          <CardDescription>
            Uncheck rows for partial approve (unchecked are cancelled).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {run === undefined ? (
            <Skeleton className="h-20 w-full" />
          ) : runSchedules.length === 0 && suggestion.assignments?.length ? (
            suggestion.assignments.map((a, i) => {
              const job = jobsById[a.jobId] as { title?: string } | undefined;
              const names = a.crewMemberIds
                .map((id) => {
                  const m = crewById[id] as { name?: string } | undefined;
                  return m?.name ?? id.slice(0, 6);
                })
                .join(", ");
              return (
                <div key={i} className="rounded-md border px-3 py-2 text-sm">
                  <p className="font-medium">{job?.title ?? a.jobId}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTimeRange(a.startAt, a.endAt)} · {names || "no crew"}
                  </p>
                  {a.rationale ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.rationale}
                    </p>
                  ) : null}
                </div>
              );
            })
          ) : runSchedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {suggestion.aiStatus === "processing" ||
              suggestion.aiStatus === "pending"
                ? "Waiting for packing / AI…"
                : "No proposed schedules."}
            </p>
          ) : (
            runSchedules.map((s) => {
              const job = jobsById[s.jobId] as { title?: string } | undefined;
              const names = s.crewMemberIds
                .map((id) => {
                  const m = crewById[id] as { name?: string } | undefined;
                  return m?.name ?? "—";
                })
                .join(", ");
              const conflicts = (run.conflictsByScheduleId[s._id] ??
                []) as ConflictRow[];
              return (
                <div key={s._id} className="rounded-md border px-3 py-2 text-sm">
                  <label className="flex items-start gap-2">
                    {suggestion.status === "pending" ? (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selected.has(s._id)}
                        onChange={() => toggle(s._id)}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {job?.title ?? "Job"}
                        </span>
                        <Badge
                          className={SCHEDULE_STATUS_MAP[s.status].badgeClass}
                          variant="outline"
                        >
                          {SCHEDULE_STATUS_MAP[s.status].label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeRange(s.startAt, s.endAt)} ·{" "}
                        {names || "no crew"}
                      </p>
                      {s.notes ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {s.notes}
                        </p>
                      ) : null}
                      {conflicts.length ? (
                        <div className="mt-2">
                          <ConflictList conflicts={conflicts} />
                        </div>
                      ) : null}
                    </div>
                  </label>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {suggestion.unscheduled?.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Could not schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {suggestion.unscheduled.map((u, i) => {
              const job = jobsById[u.jobId] as { title?: string } | undefined;
              return (
                <p key={i} className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {job?.title ?? u.jobId}
                  </span>
                  : {u.reason}
                </p>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {suggestion.status === "pending" ? (
        <div className="flex flex-col gap-3 rounded-md border p-4">
          {!isOwner ? (
            <p className="text-sm text-muted-foreground">
              Only workspace owners can approve, reject, or retry suggestions.
            </p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={ownerOverride}
                  onChange={(e) => setOwnerOverride(e.target.checked)}
                />
                Owner override hard conflicts
              </label>
              <div className="flex flex-wrap gap-2">
                {suggestion.aiStatus === "completed" ? (
                  <>
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => void onApprove(false)}
                    >
                      Approve all
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || selected.size === 0}
                      onClick={() => void onApprove(true)}
                    >
                      Approve selected ({selected.size})
                    </Button>
                  </>
                ) : null}
                {suggestion.aiStatus === "failed" ? (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void retry({ suggestionId }).catch((err) =>
                        setError(errorText(err, "Retry failed")),
                      )
                    }
                  >
                    Retry AI
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void reject({ suggestionId }).catch((err) =>
                      setError(errorText(err, "Reject failed")),
                    )
                  }
                >
                  Reject
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
