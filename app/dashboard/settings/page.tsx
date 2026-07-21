"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SERVICE_TYPES } from "@/lib/constants";
import type { ServiceType } from "@/types";

export default function SettingsPage() {
  const me = useQuery(api.users.current, {});
  const update = useMutation(api.companies.update);
  const rotateInvite = useMutation(api.companies.rotateInviteCode);
  const isOwner = me?.role === "owner";

  const [name, setName] = useState("");
  const [primaryTrade, setPrimaryTrade] = useState<ServiceType | "">("");
  const [timezone, setTimezone] = useState("");
  const [originZip, setOriginZip] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [strictConflicts, setStrictConflicts] = useState(true);
  const [allowAiPii, setAllowAiPii] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.company) return;
    setName(me.company.name ?? "");
    setPrimaryTrade(me.company.primaryTrade ?? "");
    setTimezone(me.company.timezone ?? "");
    setOriginZip(me.company.originZip ?? "");
    setPhone(me.company.phone ?? "");
    setEmail(me.company.email ?? "");
    setStrictConflicts(me.company.strictConflictPolicy !== false);
    setAllowAiPii(me.company.allowAiPii === true);
    setInviteCode(me.company.inviteCode ?? null);
  }, [me?.company]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isOwner) {
      setMessage("Only workspace owners can update company settings.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await update({
        name,
        primaryTrade: primaryTrade || undefined,
        timezone: timezone || undefined,
        originZip: originZip || undefined,
        phone: phone || undefined,
        email: email || undefined,
        strictConflictPolicy: strictConflicts,
        allowAiPii,
      });
      setMessage("Saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Company profile</CardTitle>
          <CardDescription>
            Workspace identity, timezone for packing, and AI privacy. Owners
            only can edit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {me === undefined ? (
            <Skeleton className="h-40 w-full" />
          ) : me === null ? (
            <p className="text-sm text-muted-foreground">
              Provisioning workspace…
            </p>
          ) : (
            <form onSubmit={onSave} className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="company-name">Company name</Label>
                <Input
                  id="company-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={!isOwner}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trade">Primary trade</Label>
                <select
                  id="trade"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-50"
                  value={primaryTrade}
                  disabled={!isOwner}
                  onChange={(e) =>
                    setPrimaryTrade(e.target.value as ServiceType | "")
                  }
                >
                  <option value="">Select…</option>
                  {SERVICE_TYPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tz">Timezone (IANA)</Label>
                  <Input
                    id="tz"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="America/Chicago"
                    disabled={!isOwner}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used for week stats and greedy packing workdays.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zip">Origin zip</Label>
                  <Input
                    id="zip"
                    value={originZip}
                    onChange={(e) => setOriginZip(e.target.value)}
                    placeholder="For travel heuristics"
                    disabled={!isOwner}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={!isOwner}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!isOwner}
                  />
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={strictConflicts}
                  disabled={!isOwner}
                  onChange={(e) => setStrictConflicts(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Strict conflict policy</span>
                  <span className="block text-xs text-muted-foreground">
                    Block confirm when hard conflicts exist unless an owner
                    overrides.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={allowAiPii}
                  disabled={!isOwner}
                  onChange={(e) => setAllowAiPii(e.target.checked)}
                />
                <span>
                  <span className="font-medium">
                    Allow AI to use customer/crew PII
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Off by default. When off, OpenAI only receives ids, skills,
                    times, and priority — not names, addresses, or rates.
                  </span>
                </span>
              </label>

              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                Signed in as {me.name} ({me.email || "no email"}) · role{" "}
                <span className="capitalize">{me.role}</span>
                {!isOwner ? (
                  <span className="mt-1 block text-amber-700 dark:text-amber-300">
                    You are a member — settings are view-only.
                  </span>
                ) : null}
              </div>
              {message ? (
                <p className="text-sm text-muted-foreground">{message}</p>
              ) : null}
              <Button type="submit" disabled={saving || !isOwner}>
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {me && isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team invite</CardTitle>
            <CardDescription>
              Share a link so a new Clerk user joins this workspace as a member
              instead of creating their own company.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {inviteCode ? (
              <p className="break-all rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
                {typeof window !== "undefined"
                  ? `${window.location.origin}/sign-up?invite=${inviteCode}`
                  : `/sign-up?invite=${inviteCode}`}
              </p>
            ) : (
              <p className="text-muted-foreground">
                No invite code yet. Generate one to invite dispatchers.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void rotateInvite({})
                  .then((code) => {
                    setInviteCode(code);
                    setMessage("Invite code updated.");
                  })
                  .catch((err) =>
                    setMessage(
                      err instanceof Error ? err.message : "Invite failed",
                    ),
                  )
              }
            >
              {inviteCode ? "Rotate invite code" : "Generate invite code"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
