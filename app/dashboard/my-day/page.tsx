"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { MapPin } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTimeRange, todayRange } from "@/lib/date";
import { PRIORITY_MAP, SCHEDULE_STATUS_MAP } from "@/lib/constants";

/**
 * Mobile-friendly day list for a crew member.
 * Dispatchers can preview any roster member; linked users see themselves.
 */
export default function MyDayPage() {
  const range = useMemo(() => todayRange(), []);
  const crew = useQuery(api.crewMembers.list, { activeOnly: true });
  const [crewMemberId, setCrewMemberId] = useState<string>("");

  const day = useQuery(api.myDay.list, {
    from: range.from,
    to: range.to,
    crewMemberId: crewMemberId
      ? (crewMemberId as Id<"crewMembers">)
      : undefined,
  });

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h2 className="text-xl font-semibold">My day</h2>
        <p className="text-sm text-muted-foreground">
          Confirmed and proposed work for today — large cards for on-site use.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="crew-pick">
          Crew member
        </label>
        <select
          id="crew-pick"
          className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-base sm:text-sm"
          value={crewMemberId}
          onChange={(e) => setCrewMemberId(e.target.value)}
        >
          <option value="">Linked to my account (if any)</option>
          {(crew ?? []).map((m) => (
            <option key={m._id} value={m._id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {day === undefined ? (
        <Skeleton className="h-40 w-full" />
      ) : !day.member ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No crew member selected</CardTitle>
            <CardDescription>
              Pick someone from the roster, or link your Clerk user to a crew
              profile later.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <p className="text-sm font-medium">
            {day.member.name}
            <span className="ml-2 font-normal text-muted-foreground">
              {new Date(range.from).toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </span>
          </p>

          {day.schedules.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No jobs on the board for today.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {day.schedules.map((s) => {
                const job = day.jobsById[s.jobId] as
                  | {
                      title?: string;
                      address?: string;
                      priority?: keyof typeof PRIORITY_MAP;
                      customerName?: string;
                      notes?: string;
                    }
                  | undefined;
                return (
                  <Card key={s._id} className="shadow-sm">
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-lg">
                          {job?.title ?? "Job"}
                        </CardTitle>
                        <Badge
                          className={SCHEDULE_STATUS_MAP[s.status].badgeClass}
                          variant="outline"
                        >
                          {SCHEDULE_STATUS_MAP[s.status].label}
                        </Badge>
                        {job?.priority ? (
                          <Badge
                            className={PRIORITY_MAP[job.priority].badgeClass}
                            variant="outline"
                          >
                            {PRIORITY_MAP[job.priority].label}
                          </Badge>
                        ) : null}
                      </div>
                      <CardDescription className="text-base font-medium text-foreground">
                        {formatTimeRange(s.startAt, s.endAt)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {job?.address ? (
                        <p className="flex items-start gap-2">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>{job.address}</span>
                        </p>
                      ) : null}
                      {job?.customerName ? (
                        <p className="text-muted-foreground">
                          Customer: {job.customerName}
                        </p>
                      ) : null}
                      {s.notes ? (
                        <p className="rounded-md bg-muted/50 px-3 py-2 text-muted-foreground">
                          {s.notes}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
