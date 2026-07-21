"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Sparkles, Wand2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
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
import {
  SUGGESTION_AI_STATUSES,
  SUGGESTION_STATUSES,
} from "@/lib/constants";
import { useWeekRange } from "@/hooks/use-week-range";
import { errorText } from "@/lib/app-error";

export default function SuggestionsPage() {
  const suggestions = useQuery(api.suggestions.list, {});
  const draftJobs = useQuery(api.jobs.list, { status: "draft" });
  const createSuggestion = useMutation(api.suggestions.create);
  const greedySuggest = useMutation(api.packing.greedySuggest);
  const retry = useMutation(api.suggestions.retry);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const week = useWeekRange();
  const window = useMemo(
    () => ({ windowStartAt: week.from, windowEndAt: week.to }),
    [week.from, week.to],
  );

  async function runAi() {
    if (!draftJobs?.length) {
      setError("Add at least one draft job first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createSuggestion({
        jobIds: draftJobs.map((j) => j._id),
        ...window,
        preserveConfirmed: true,
      });
    } catch (err) {
      setError(errorText(err, "Suggestion failed"));
    } finally {
      setBusy(false);
    }
  }

  async function runGreedy() {
    if (!draftJobs?.length) {
      setError("Add at least one draft job first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await greedySuggest({
        jobIds: draftJobs.map((j) => j._id),
        ...window,
      });
    } catch (err) {
      setError(errorText(err, "Greedy pack failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Proposals only — nothing confirms until you approve. Use greedy pack
          without an OpenAI key.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={runGreedy}
            disabled={busy}
          >
            <Wand2 className="h-4 w-4" />
            Greedy pack
          </Button>
          <Button type="button" onClick={runAi} disabled={busy}>
            <Sparkles className="h-4 w-4" />
            {busy ? "Starting…" : "AI suggest"}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suggestion runs</CardTitle>
          <CardDescription>
            Open a run to review assignments, unscheduled reasons, and approve.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {suggestions === undefined ? (
            <Skeleton className="h-24 w-full" />
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No suggestion runs yet. Create draft jobs, then pack or AI-suggest.
            </p>
          ) : (
            suggestions.map((s) => {
              const statusMeta = SUGGESTION_STATUSES.find(
                (x) => x.value === s.status,
              );
              const aiMeta = SUGGESTION_AI_STATUSES.find(
                (x) => x.value === s.aiStatus,
              );
              return (
                <div
                  key={s._id}
                  className="space-y-2 rounded-md border px-3 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className={statusMeta?.badgeClass}
                      variant="outline"
                    >
                      {statusMeta?.label ?? s.status}
                    </Badge>
                    <Badge className={aiMeta?.badgeClass} variant="outline">
                      {aiMeta?.label ?? s.aiStatus}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {s.jobIds.length} job{s.jobIds.length === 1 ? "" : "s"} ·{" "}
                      {new Date(s.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {s.ownerNotes ? (
                    <p className="text-xs text-muted-foreground">{s.ownerNotes}</p>
                  ) : null}
                  {s.aiErrorMessage ? (
                    <p className="text-xs text-destructive">{s.aiErrorMessage}</p>
                  ) : null}
                  {s.assignments?.length ? (
                    <p className="text-xs text-muted-foreground">
                      {s.assignments.length} assignment
                      {s.assignments.length === 1 ? "" : "s"} proposed
                      {s.aiConfidence != null
                        ? ` · confidence ${(s.aiConfidence * 100).toFixed(0)}%`
                        : ""}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/dashboard/suggestions/${s._id}`}>
                        Open detail
                      </Link>
                    </Button>
                    {s.status === "pending" && s.aiStatus === "failed" ? (
                      <Button
                        size="sm"
                        type="button"
                        onClick={() =>
                          void retry({ suggestionId: s._id }).catch((err) =>
                            setError(errorText(err, "Retry failed")),
                          )
                        }
                      >
                        Retry AI
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
