"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Hammer,
  LayoutDashboard,
  Settings,
  Sparkles,
  Sun,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CrewLogo } from "@/components/brand/crew-logo";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/board", label: "Schedule board", icon: CalendarDays },
  { href: "/dashboard/jobs", label: "Jobs", icon: Hammer },
  { href: "/dashboard/crew", label: "Crew", icon: UsersRound },
  { href: "/dashboard/suggestions", label: "AI suggestions", icon: Sparkles },
  { href: "/dashboard/my-day", label: "My day", icon: Sun },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
      <div className="flex h-16 items-center border-b px-6">
        <CrewLogo />
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact
            ? pathname === href
            : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4 text-xs text-muted-foreground">
        Schedule jobs. Assign the right crew.
      </div>
    </aside>
  );
}
