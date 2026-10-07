import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading shapes for each Overview section, sized like the real content so
// nothing jumps when it arrives.

export function KpisSkeleton() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="h-[156px] gap-3.5 px-5">
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="h-3 w-3/5" />
          <Skeleton className="h-[26px] w-2/5" />
        </Card>
      ))}
    </>
  );
}

export function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3.5">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 rounded-[14px]" />
      ))}
    </div>
  );
}

export function PeopleSkeleton({ rows = 3 }: { rows?: number }) {
  const widths = ["w-1/2", "w-2/5", "w-[55%]"];
  return (
    <div className="flex flex-col gap-3.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className={`h-3 ${widths[i % 3]}`} />
            <Skeleton className="h-2.5 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {["w-full", "w-[92%]", "w-[96%]", "w-[88%]"].map((w) => (
        <Skeleton key={w} className={`h-[18px] ${w}`} />
      ))}
    </div>
  );
}
