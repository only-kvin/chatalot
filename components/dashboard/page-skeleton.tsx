import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Generic page placeholder shown by loading.tsx the instant a link is clicked,
// while the server fetches the real page: a heading, then a card of rows.
export function PageSkeleton({ width = "max-w-5xl" }: { width?: string }) {
  return (
    <div role="status" aria-label="Loading" className={`mx-auto ${width} p-8`}>
      <div className="mb-6 flex flex-col gap-2.5">
        <Skeleton className="h-[30px] w-48" />
        <Skeleton className="h-3.5 w-72 max-w-full" />
      </div>
      <Card className="px-5">
        <div className="flex flex-col gap-3.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 rounded-[14px]" />
          ))}
        </div>
      </Card>
    </div>
  );
}
