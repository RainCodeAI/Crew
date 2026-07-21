"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  LayoutDashboard,
  Sun,
  UsersRound,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/board", label: "Board", icon: CalendarDays },
  { href: "/dashboard/my-day", label: "My day", icon: Sun },
  { href: "/dashboard/crew", label: "Crew", icon: UsersRound },
  { href: "/dashboard/suggestions", label: "AI", icon: Sparkles },
];

/** Bottom tab bar for owner dashboard on small screens. */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="flex border-t bg-card md:hidden">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact
          ? pathname === href
          : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
