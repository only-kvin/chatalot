import { cn } from "cn"

// Placeholder block with a shimmer (globals.css .skeleton). Size it to match
// the content it stands in for so nothing jumps when the real data arrives.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden className={cn("skeleton", className)} {...props} />
}

export { Skeleton }
