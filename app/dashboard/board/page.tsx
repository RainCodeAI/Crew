"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CalendarPlus, Check, Trash2, AlertTriangle } from "lucide-react";
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
import { AssignDialog } from "@/components/board/assign-dialog";
import {
  ConflictBadges,
  ConflictList,
  type ConflictRow,
} from "@/components/board/conflict-panel";
import { formatDayHeading, formatTimeRange } from "@/lib/date";
import { useWeekRange } from "@/hooks/use-week-range";
import {
  JOB_STATUS_MAP,
  PRIORITY_MAP,
  SCHEDULE_STATUS_MAP,
} from "@/lib/constants";

export default function BoardPage() {
  const range = useWeekRange();
  const me = useQuery(api.users.current, {});
  const isOwner = me?.role === "owner";
  const board = useQuery(api.schedules.boardForRange, range);
  const unscheduled = useQuery(api.jobs.list, { status: "draft" });
  const openConflicts = useQuery(api.schedules.listOpenConflicts, {});

  const confirm = useMutation(api.schedules.confirm);
  const cancel = useMutation(api.schedules.cancel);

  const [assignOpen, setAssignOpen] = useState(false);
  const [prefillJobId, setPrefillJobId] = useState<Id<"jobs"> | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const byDay = useMemo(() => {
    if (!board) return [];
    const map = new Map<string, typeof board.schedules>();
    for (const s of board.schedules) {
      const key = formatDayHeading(s.startAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.entries()];
  }, [board]);

  const selectedConflicts: ConflictRow[] = useMemo(() => {
    if (!board || !selectedScheduleId) return [];
    return (board.conflictsByScheduleId[selectedScheduleId] ??
      []) as ConflictRow[];
  }, [board, selectedScheduleId]);

  async function onConfirm(id: Id<"schedules">, override = false) {
    setBusyId(id);
    setActionError(null);
    try {
      await confirm({ scheduleId: id, ownerOverride: override || undefined });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onCancel(id: Id<"schedules">) {
    setBusyId(id);
    setActionError(null);
    try {
      await cancel({ scheduleId: id });
      if (selectedScheduleId === id) setSelectedScheduleId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Week list view. Assign jobs, confirm drafts, and clear conflicts
          before the crew rolls.
        </p>
        <Button
          type="button"
          onClick={() => {
            setPrefillJobId(null);
            setAssignOpen(true);
          }}
        >
          <CalendarPlus className="h-4 w-4" />
          Assign job
        </Button>
      </div>

      {actionError ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p>{actionError}</p>
            {isOwner &&
            selectedScheduleId &&
            actionError.includes("Blocking") ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                type="button"
                onClick={() =>
                  void onConfirm(
                    selectedScheduleId as Id<"schedules">,
                    true,
                  )
                }
              >
                Confirm with owner override
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {openConflicts && openConflicts.length > 0 ? (
        <Card className="border-orange-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Open conflicts ({openConflicts.length})
            </CardTitle>
            <CardDescription>
              Click a schedule on the board to inspect details.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Unscheduled</CardTitle>
            <CardDescription>Draft jobs waiting for a slot</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {unscheduled === undefined ? (
              <Skeleton className="h-20 w-full" />
            ) : unscheduled.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No draft jobs. Create one from Jobs.
              </p>
            ) : (
              unscheduled.map((job) => (
                <div
                  key={job._id}
                  className="rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{job.title}</span>
                    <Badge
                      className={PRIORITY_MAP[job.priority].badgeClass}
                      variant="outline"
                    >
                      {PRIORITY_MAP[job.priority].label}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {job.estimatedDurationMinutes} min
                    {job.address ? ` · ${job.address}` : ""}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    type="button"
                    onClick={() => {
                      setPrefillJobId(job._id);
                      setAssignOpen(true);
                    }}
                  >
                    Assign
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">This week</CardTitle>
            <CardDescription>
              Grouped by day — draft, proposed, and confirmed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {board === undefined ? (
              <Skeleton className="h-28 w-full" />
            ) : board.schedules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing scheduled this week yet. Assign a job or run a
                suggestion.
              </p>
            ) : (
              byDay.map(([day, items]) => (
                <div key={day} className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {day}
                  </h3>
                  {items.map((s) => {
                    const job = board.jobsById[s.jobId];
                    const conflicts = (board.conflictsByScheduleId[s._id] ??
                      []) as ConflictRow[];
                    const crewNames = s.crewMemberIds
                      .map((id) => board.crewById[id]?.name ?? "—")
                      .join(", ");
                    const selected = selectedScheduleId === s._id;
                    return (
                      <div
                        key={s._id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedScheduleId(s._id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setSelectedScheduleId(s._id);
                          }
                        }}
                        className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                          selected
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-medium">
                              {job?.title ?? "Job"}
                              {job ? (
                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                  {JOB_STATUS_MAP[job.status]?.label}
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatTimeRange(s.startAt, s.endAt)}
                              {crewNames ? ` · ${crewNames}` : " · no crew"}
                            </p>
                            <div className="mt-1.5">
                              <ConflictBadges conflicts={conflicts} />
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              className={
                                SCHEDULE_STATUS_MAP[s.status].badgeClass
                              }
                              variant="outline"
                            >
                              {SCHEDULE_STATUS_MAP[s.status].label}
                            </Badge>
                            {s.status !== "confirmed" ? (
                              <Button
                                size="sm"
                                type="button"
                                disabled={busyId === s._id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedScheduleId(s._id);
                                  void onConfirm(s._id);
                                }}
                              >
                                <Check className="h-3.5 w-3.5" />
                                Confirm
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              type="button"
                              disabled={busyId === s._id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void onCancel(s._id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {selectedScheduleId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conflicts for selection</CardTitle>
            <CardDescription>
              Deterministic checks — errors block confirm unless overridden.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConflictList conflicts={selectedConflicts} />
          </CardContent>
        </Card>
      ) : null}

      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        jobId={prefillJobId}
      />
    </div>
  );
}
