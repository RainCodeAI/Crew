import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

export function CrewLogo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Users className="h-4 w-4" aria-hidden="true" />
      </span>
      {showWordmark ? <span>{APP_NAME}</span> : null}
    </span>
  );
}
