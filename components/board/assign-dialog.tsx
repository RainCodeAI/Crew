"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  defaultAssignStart,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/date";
import { ConflictList, type ConflictRow } from "@/components/board/conflict-panel";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill job when assigning from unscheduled queue. */
  jobId?: Id<"jobs"> | null;
};

export function AssignDialog({ open, onOpenChange, jobId }: Props) {
  const me = useQuery(api.users.current, {});
  const isOwner = me?.role === "owner";
  const draftJobs = useQuery(api.jobs.list, { status: "draft" });
  const allJobs = useQuery(api.jobs.list, {});
  const crew = useQuery(api.crewMembers.list, { activeOnly: true });
  const createSchedule = useMutation(api.schedules.create);

  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [startLocal, setStartLocal] = useState(() =>
    toDatetimeLocalValue(defaultAssignStart()),
  );
  const [durationMin, setDurationMin] = useState("120");
  const [crewIds, setCrewIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [ownerOverride, setOwnerOverride] = useState(false);
  const [confirmOnSave, setConfirmOnSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jobOptions = useMemo(() => {
    const map = new Map<string, NonNullable<typeof allJobs>[number]>();
    for (const j of allJobs ?? []) map.set(j._id, j);
    for (const j of draftJobs ?? []) map.set(j._id, j);
    return [...map.values()].filter(
      (j) => j.status === "draft" || j.status === "scheduled",
    );
  }, [allJobs, draftJobs]);

  const previewArgs = useMemo(() => {
    if (!selectedJobId || !startLocal) return "skip" as const;
    try {
      const startAt = fromDatetimeLocalValue(startLocal);
      const endAt = startAt + (Number(durationMin) || 60) * 60 * 1000;
      return {
        jobId: selectedJobId as Id<"jobs">,
        startAt,
        endAt,
        crewMemberIds: crewIds as Id<"crewMembers">[],
      };
    } catch {
      return "skip" as const;
    }
  }, [selectedJobId, startLocal, durationMin, crewIds]);

  const preview = useQuery(
    api.schedules.previewConflicts,
    open && previewArgs !== "skip" ? previewArgs : "skip",
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setOwnerOverride(false);
    setConfirmOnSave(false);
    setNotes("");
    if (jobId) {
      setSelectedJobId(jobId);
      const job = jobOptions.find((j) => j._id === jobId);
      if (job) setDurationMin(String(job.estimatedDurationMinutes));
    } else if (!selectedJobId && jobOptions[0]) {
      setSelectedJobId(jobOptions[0]._id);
      setDurationMin(String(jobOptions[0].estimatedDurationMinutes));
    }
    setStartLocal(toDatetimeLocalValue(defaultAssignStart()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jobId]);

  function toggleCrew(id: string) {
    setCrewIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedJobId) {
      setError("Select a job.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const startAt = fromDatetimeLocalValue(startLocal);
      const endAt = startAt + (Number(durationMin) || 60) * 60 * 1000;
      await createSchedule({
        jobId: selectedJobId as Id<"jobs">,
        startAt,
        endAt,
        crewMemberIds: crewIds as Id<"crewMembers">[],
        notes: notes || undefined,
        ownerOverride: isOwner && ownerOverride ? true : undefined,
        confirm: confirmOnSave,
      });
      onOpenChange(false);
      setCrewIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign to board</DialogTitle>
          <DialogDescription>
            Place a job on the calendar. Conflicts are checked on save.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="job">Job</Label>
            <select
              id="job"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={selectedJobId}
              onChange={(e) => {
                setSelectedJobId(e.target.value);
                const job = jobOptions.find((j) => j._id === e.target.value);
                if (job) setDurationMin(String(job.estimatedDurationMinutes));
              }}
              required
            >
              <option value="">Select job…</option>
              {jobOptions.map((j) => (
                <option key={j._id} value={j._id}>
                  {j.title} ({j.status})
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="start">Start</Label>
              <Input
                id="start"
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dur">Duration (min)</Label>
              <Input
                id="dur"
                type="number"
                min={15}
                step={15}
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Crew</Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
              {crew === undefined ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : crew.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No active crew. Add people under Crew first.
                </p>
              ) : (
                crew.map((m) => (
                  <label
                    key={m._id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={crewIds.includes(m._id)}
                      onChange={() => toggleCrew(m._id)}
                    />
                    <span>
                      {m.name}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {m.skills.slice(0, 2).join(", ")}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmOnSave}
              onChange={(e) => setConfirmOnSave(e.target.checked)}
            />
            Confirm immediately (otherwise save as draft)
          </label>

          {isOwner ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={ownerOverride}
                onChange={(e) => setOwnerOverride(e.target.checked)}
              />
              Owner override hard conflicts (use sparingly)
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">
              Hard conflict override is limited to workspace owners.
            </p>
          )}

          {preview && preview.length > 0 ? (
            <div className="rounded-md border border-amber-200/80 bg-amber-50/50 p-3 dark:bg-amber-950/20">
              <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                Preview conflicts ({preview.length})
              </p>
              <ConflictList conflicts={preview as ConflictRow[]} />
            </div>
          ) : preview && preview.length === 0 && selectedJobId ? (
            <p className="text-xs text-muted-foreground">
              No conflicts detected for this placement.
            </p>
          ) : null}

          {error ? (
            <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : confirmOnSave ? "Confirm assign" : "Save draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
