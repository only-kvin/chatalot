import * as React from "react"
import { cn } from "cn"

// Shimmering placeholder. Size it like the content it stands in for, so
// nothing jumps when the real content arrives.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden className={cn("skeleton rounded-lg", className)} {...props} />
}

export { Skeleton }
