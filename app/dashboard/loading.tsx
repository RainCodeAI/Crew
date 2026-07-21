import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}
