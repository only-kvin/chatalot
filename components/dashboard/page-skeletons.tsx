import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";

// Loading placeholders for dashboard routes (see each route's loading.tsx).
// Shapes mirror the real pages so content drops in without a layout jump.

const WIDTH = {
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
} as const;
type Width = keyof typeof WIDTH;

function Shell({ width, children }: { width: Width; children: React.ReactNode }) {
  return (
    <div role="status" aria-label="Loading" className={cn("mx-auto px-4 py-6 sm:p-8", WIDTH[width])}>
      {children}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="mb-8 flex flex-col gap-3">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
  );
}

export function ListSkeleton({ width = "4xl", rows = 6 }: { width?: Width; rows?: number }) {
  return (
    <Shell width={width}>
      <HeaderSkeleton />
      <div className="surface overflow-hidden rounded-2xl">
        <div className="flex gap-6 border-b px-5 py-3.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="ml-auto h-3 w-24" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-border/70 px-5 py-4 last:border-0">
            <Skeleton className="h-4 w-32" style={{ width: `${8 + ((i * 3) % 5)}rem` }} />
            <Skeleton className="h-4 w-40" style={{ width: `${10 + ((i * 7) % 6)}rem` }} />
            <Skeleton className="h-5.5 w-16 rounded-full" />
            <Skeleton className="ml-auto h-4 w-24" />
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function FormSkeleton({ width = "2xl" }: { width?: Width }) {
  return (
    <Shell width={width}>
      <HeaderSkeleton />
      <div className="surface flex flex-col gap-6 rounded-2xl p-6">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className={cn("w-full rounded-lg", i === 2 ? "h-24" : "h-9")} />
          </div>
        ))}
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
    </Shell>
  );
}

export function DetailSkeleton({ width = "3xl" }: { width?: Width }) {
  return (
    <Shell width={width}>
      <Skeleton className="mb-6 h-4 w-24" />
      <HeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="surface flex flex-col gap-3 rounded-2xl p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="surface flex flex-col gap-3 rounded-2xl p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <div className="surface mt-4 flex flex-col gap-4 rounded-2xl p-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
            <Skeleton className="h-12 rounded-2xl" style={{ width: `${40 + ((i * 13) % 30)}%` }} />
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function OverviewSkeleton() {
  return (
    <Shell width="6xl">
      <div className="mb-8 flex flex-col gap-3">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-9 w-72 max-w-full rounded-lg" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="surface flex h-40 flex-col gap-4 rounded-2xl p-5">
            <Skeleton className="size-10 rounded-xl" />
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-7 w-2/5 rounded-lg" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="surface flex flex-col gap-4 rounded-2xl p-5">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 4 }, (_, j) => (
              <div key={j} className="flex items-center gap-3">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Shell>
  );
}
