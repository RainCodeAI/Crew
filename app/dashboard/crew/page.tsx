"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
import type { Skill } from "@/types";
import { fromDatetimeLocalValue } from "@/lib/date";
import { SkillPicker } from "@/components/forms/skill-picker";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CrewPage() {
  const members = useQuery(api.crewMembers.list, {});
  const createMember = useMutation(api.crewMembers.create);
  const updateMember = useMutation(api.crewMembers.update);
  const createAvailability = useMutation(api.availability.create);
  const removeAvailability = useMutation(api.availability.remove);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [skills, setSkills] = useState<Skill[]>(["general_labor"]);
  const [hourlyRate, setHourlyRate] = useState("");
  const [weekDays, setWeekDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [dayStart, setDayStart] = useState("08:00");
  const [dayEnd, setDayEnd] = useState("17:00");

  // PTO form
  const [ptoStart, setPtoStart] = useState("");
  const [ptoEnd, setPtoEnd] = useState("");
  const [ptoReason, setPtoReason] = useState("PTO");

  const availability = useQuery(
    api.availability.listForMember,
    expandedId
      ? { crewMemberId: expandedId as Id<"crewMembers"> }
      : "skip",
  );

  function toggleWeekDay(d: number) {
    setWeekDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const defaultWeeklyHours = weekDays.map((day) => ({
        day,
        start: dayStart,
        end: dayEnd,
      }));
      await createMember({
        name,
        roleLabel: roleLabel || undefined,
        phone: phone || undefined,
        skills: skills.length ? skills : ["general_labor"],
        hourlyRate: hourlyRate ? Number(hourlyRate) : undefined,
        defaultWeeklyHours,
      });
      setName("");
      setRoleLabel("");
      setPhone("");
      setHourlyRate("");
      setSkills(["general_labor"]);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add crew member");
    } finally {
      setSaving(false);
    }
  }

  async function onAddPto(memberId: Id<"crewMembers">) {
    if (!ptoStart || !ptoEnd) return;
    setError(null);
    try {
      await createAvailability({
        crewMemberId: memberId,
        kind: "unavailable",
        startAt: fromDatetimeLocalValue(ptoStart),
        endAt: fromDatetimeLocalValue(ptoEnd),
        reason: ptoReason || "Unavailable",
      });
      setPtoStart("");
      setPtoEnd("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add PTO");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Skills, weekly hours, rates, and PTO drive matching and conflicts.
        </p>
        <Button type="button" onClick={() => setOpen((v) => !v)}>
          <Plus className="h-4 w-4" />
          {open ? "Close" : "Add member"}
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {open ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add crew member</CardTitle>
            <CardDescription>
              Default hours apply when packing and checking availability.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role label</Label>
                <Input
                  id="role"
                  value={roleLabel}
                  onChange={(e) => setRoleLabel(e.target.value)}
                  placeholder="Foreman, installer…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rate">Hourly rate</Label>
                <Input
                  id="rate"
                  type="number"
                  min={0}
                  step={0.5}
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                />
              </div>
              <SkillPicker
                className="sm:col-span-2"
                value={skills}
                onChange={setSkills}
              />
              <div className="space-y-2 sm:col-span-2">
                <Label>Default work days</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS.map((label, d) => {
                    const on = weekDays.includes(d);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleWeekDay(d)}
                        className={`rounded-md px-2 py-1 text-xs ring-1 ring-inset ${
                          on
                            ? "bg-primary/10 text-primary ring-primary/30"
                            : "bg-muted text-muted-foreground ring-border"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ws">Workday start</Label>
                <Input
                  id="ws"
                  type="time"
                  value={dayStart}
                  onChange={(e) => setDayStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="we">Workday end</Label>
                <Input
                  id="we"
                  type="time"
                  value={dayEnd}
                  onChange={(e) => setDayEnd(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={saving || !name.trim()}>
                  {saving ? "Saving…" : "Add to roster"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roster</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {members === undefined ? (
            <Skeleton className="h-24 w-full" />
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No crew members yet.
            </p>
          ) : (
            members.map((m) => {
              const expanded = expandedId === m._id;
              return (
                <div key={m._id} className="rounded-md border">
                  <button
                    type="button"
                    className="flex w-full flex-col gap-2 px-3 py-3 text-left text-sm sm:flex-row sm:items-center sm:justify-between"
                    onClick={() =>
                      setExpandedId(expanded ? null : m._id)
                    }
                  >
                    <div>
                      <p className="font-medium">
                        {m.name}
                        {m.roleLabel ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {m.roleLabel}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.skills.slice(0, 5).join(", ")}
                        {m.hourlyRate != null ? ` · $${m.hourlyRate}/hr` : ""}
                        {m.defaultWeeklyHours?.length
                          ? ` · ${m.defaultWeeklyHours.length}d/wk`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={m.isActive ? "default" : "secondary"}>
                        {m.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void updateMember({
                            memberId: m._id,
                            isActive: !m.isActive,
                          });
                        }}
                      >
                        {m.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </button>

                  {expanded ? (
                    <div className="space-y-3 border-t px-3 py-3 text-sm">
                      <p className="text-xs font-medium text-muted-foreground">
                        Availability / PTO
                      </p>
                      {availability === undefined ? (
                        <Skeleton className="h-10 w-full" />
                      ) : availability.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No overrides.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {availability.map((a) => (
                            <li
                              key={a._id}
                              className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs"
                            >
                              <span>
                                {a.kind}:{" "}
                                {new Date(a.startAt).toLocaleString()} →{" "}
                                {new Date(a.endAt).toLocaleString()}
                                {a.reason ? ` (${a.reason})` : ""}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                type="button"
                                onClick={() =>
                                  void removeAvailability({
                                    availabilityId: a._id,
                                  })
                                }
                              >
                                Remove
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Unavailable from</Label>
                          <Input
                            type="datetime-local"
                            value={ptoStart}
                            onChange={(e) => setPtoStart(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Until</Label>
                          <Input
                            type="datetime-local"
                            value={ptoEnd}
                            onChange={(e) => setPtoEnd(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs">Reason</Label>
                          <Input
                            value={ptoReason}
                            onChange={(e) => setPtoReason(e.target.value)}
                          />
                        </div>
                        <Button
                          size="sm"
                          type="button"
                          onClick={() => void onAddPto(m._id)}
                        >
                          Add unavailability
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
