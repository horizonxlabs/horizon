import { cn } from "@/lib/utils";

// Loading placeholder. Compose per layout, e.g.:
//   <Skeleton className="h-4 w-40" />        (text line)
//   <Skeleton className="h-9 w-9 rounded-full" />  (avatar)
//   <Skeleton className="h-32 w-full rounded-xl" /> (card)
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-200/80", className)} aria-hidden="true" />;
}
