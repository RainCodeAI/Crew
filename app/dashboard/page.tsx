"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  CalendarDays,
  Hammer,
  Sparkles,
  Sun,
  UsersRound,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Owner overview — pulse counts + shortcuts into board, jobs, and crew.
 */
export default function DashboardOverviewPage() {
  const stats = useQuery(api.jobs.dashboardStats, {});

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Welcome to Crew</h2>
        <p className="text-sm text-muted-foreground">
          Plan the week, assign the right people, and clear conflicts before
          they hit the field.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Unscheduled jobs"
          value={stats?.unscheduled}
          loading={stats === undefined}
        />
        <StatCard
          label="Confirmed this week"
          value={stats?.confirmedThisWeek}
          loading={stats === undefined}
        />
        <StatCard
          label="Open conflicts"
          value={stats?.openConflicts}
          loading={stats === undefined}
          emphasis
        />
        <StatCard
          label="Active crew"
          value={stats?.activeCrew}
          loading={stats === undefined}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" />
              Schedule board
            </CardTitle>
            <CardDescription>
              Week list view of placements and the unscheduled queue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/board">
                Open board <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              AI suggestions
            </CardTitle>
            <CardDescription>
              Propose crews and times for a set of jobs — always review before
              confirm.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard/suggestions">
                Review suggestions <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Hammer className="h-4 w-4 text-primary" />
              Jobs
            </CardTitle>
            <CardDescription>
              Create work with duration, skills, priority, and preferred dates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard/jobs">
                Manage jobs <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersRound className="h-4 w-4 text-primary" />
              Crew roster
            </CardTitle>
            <CardDescription>
              Skills, certifications, rates, and default weekly availability.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard/crew">
                Manage crew <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sun className="h-4 w-4 text-primary" />
              My day
            </CardTitle>
            <CardDescription>
              Field-friendly list of today&apos;s confirmed and proposed work.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard/my-day">
                Open my day <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  emphasis,
}: {
  label: string;
  value: string | number | undefined;
  loading?: boolean;
  emphasis?: boolean;
}) {
  return (
    <Card className={emphasis ? "border-orange-200/80" : undefined}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">
          {loading ? <Skeleton className="h-9 w-12" /> : (value ?? "—")}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
