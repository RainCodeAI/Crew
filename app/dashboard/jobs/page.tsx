"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  JOB_STATUSES,
  JOB_STATUS_MAP,
  PRIORITY_MAP,
  SERVICE_TYPES,
} from "@/lib/constants";
import type { JobStatus, Priority, ServiceType, Skill } from "@/types";
import { SkillPicker } from "@/components/forms/skill-picker";

export default function JobsPage() {
  const jobs = useQuery(api.jobs.list, {});
  const createJob = useMutation(api.jobs.create);
  const updateJob = useMutation(api.jobs.update);

  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [serviceType, setServiceType] =
    useState<ServiceType>("general_contracting");
  const [duration, setDuration] = useState("120");
  const [priority, setPriority] = useState<Priority>("medium");
  const [selectedSkills, setSelectedSkills] = useState<Skill[]>([
    "general_labor",
  ]);

  const filtered = useMemo(() => {
    if (!jobs) return [];
    return jobs.filter((j) => {
      if (statusFilter !== "all" && j.status !== statusFilter) return false;
      if (priorityFilter !== "all" && j.priority !== priorityFilter)
        return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${j.title} ${j.customerName ?? ""} ${j.address ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, statusFilter, priorityFilter, search]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createJob({
        title,
        customerName: customerName || undefined,
        address: address || undefined,
        serviceType,
        estimatedDurationMinutes: Number(duration) || 60,
        requiredSkills: selectedSkills.length
          ? selectedSkills
          : ["general_labor"],
        priority,
      });
      setTitle("");
      setCustomerName("");
      setAddress("");
      setDuration("120");
      setPriority("medium");
      setSelectedSkills(["general_labor"]);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Create work with skills, priority, and duration — schedule on the
          board.
        </p>
        <Button type="button" onClick={() => setOpen((v) => !v)}>
          <Plus className="h-4 w-4" />
          {open ? "Close" : "New job"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          placeholder="Search title, customer, address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as JobStatus | "all")
          }
        >
          <option value="all">All statuses</option>
          {JOB_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={priorityFilter}
          onChange={(e) =>
            setPriorityFilter(e.target.value as Priority | "all")
          }
        >
          <option value="all">All priorities</option>
          {(["low", "medium", "high", "emergency"] as Priority[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_MAP[p].label}
            </option>
          ))}
        </select>
      </div>

      {open ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New job</CardTitle>
            <CardDescription>
              Saved as draft first — assign on the board when ready.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Roof tear-off — 123 Oak St"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer">Customer</Label>
                <Input
                  id="customer"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="service">Service type</Label>
                <select
                  id="service"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={serviceType}
                  onChange={(e) =>
                    setServiceType(e.target.value as ServiceType)
                  }
                >
                  {SERVICE_TYPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={15}
                  step={15}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <select
                  id="priority"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                >
                  {(["low", "medium", "high", "emergency"] as Priority[]).map(
                    (p) => (
                      <option key={p} value={p}>
                        {PRIORITY_MAP[p].label}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <SkillPicker
                className="sm:col-span-2"
                label="Required skills"
                value={selectedSkills}
                onChange={setSelectedSkills}
              />
              {error ? (
                <p className="text-sm text-destructive sm:col-span-2">{error}</p>
              ) : null}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={saving || !title.trim()}>
                  {saving ? "Saving…" : "Create job"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Jobs {jobs ? `(${filtered.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {jobs === undefined ? (
            <Skeleton className="h-24 w-full" />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No jobs match. Create one or clear filters.
            </p>
          ) : (
            filtered.map((job) => (
              <div
                key={job._id}
                className="flex flex-col gap-2 rounded-md border px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium">{job.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {job.customerName || "No customer"}
                    {job.address ? ` · ${job.address}` : ""}
                    {` · ${job.estimatedDurationMinutes} min`}
                    {job.requiredSkills.length
                      ? ` · ${job.requiredSkills.slice(0, 3).join(", ")}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    className={JOB_STATUS_MAP[job.status].badgeClass}
                    variant="outline"
                  >
                    {JOB_STATUS_MAP[job.status].label}
                  </Badge>
                  <Badge
                    className={PRIORITY_MAP[job.priority].badgeClass}
                    variant="outline"
                  >
                    {PRIORITY_MAP[job.priority].label}
                  </Badge>
                  {job.status === "draft" ? (
                    <select
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                      value={job.status}
                      onChange={(e) =>
                        void updateJob({
                          jobId: job._id,
                          status: e.target.value as JobStatus,
                        })
                      }
                    >
                      {JOB_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
