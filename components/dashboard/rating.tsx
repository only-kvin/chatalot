import { StarIcon } from "lucide-react";
import { cn } from "cn";
import { LOW_RATING_MAX } from "@/lib/bookings/rating";

// A customer's 1-5 answer to a review request; low scores in red.
export function Rating({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-sm font-medium",
        value <= LOW_RATING_MAX ? "text-red-600" : "text-amber-600",
        className,
      )}
      title={`Rated ${value} out of 5`}
    >
      <StarIcon className="size-3.5 fill-current" aria-hidden />
      <span aria-hidden>{value}/5</span>
      <span className="sr-only">Rated {value} out of 5</span>
    </span>
  );
}
