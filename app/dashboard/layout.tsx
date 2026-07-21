import { ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

/** Dashboard requires Clerk + Convex at runtime — never static-prerender. */
export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
