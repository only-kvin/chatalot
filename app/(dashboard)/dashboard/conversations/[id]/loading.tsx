import { Skeleton } from "@/components/ui/skeleton";

// Placeholder for the chat pane only, so opening a conversation keeps the
// inbox list on screen instead of falling back to the dashboard-wide skeleton.
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex h-[calc(100dvh-9rem)] min-h-[420px] flex-col overflow-hidden rounded-2xl border bg-card md:h-full md:min-h-0"
    >
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56 max-w-full" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-5">
        <Skeleton className="h-10 w-2/5 rounded-2xl" />
        <Skeleton className="h-14 w-3/5 self-end rounded-2xl" />
        <Skeleton className="h-10 w-1/3 rounded-2xl" />
        <Skeleton className="h-14 w-1/2 self-end rounded-2xl" />
      </div>
    </div>
  );
}
