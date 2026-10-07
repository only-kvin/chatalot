"use client"

import * as React from "react"
import { cn } from "cn"

type Option<T extends string> = { value: T; label: string; icon?: React.ReactNode }

// iOS-style segmented control: a white pill slides under the selected option.
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
}: {
  options: readonly Option<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  "aria-label": string
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("motion-snap relative grid rounded-xl bg-muted p-[3px]", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-[3px] left-[3px] rounded-[9px] bg-raised shadow-[0_1px_2px_rgb(0_0_0/0.1),0_4px_10px_-4px_rgb(0_0_0/0.18)] transition-transform duration-[380ms] ease-[cubic-bezier(.34,1.25,.64,1)]"
        style={{
          width: `calc((100% - 6px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 flex min-h-9 items-center justify-center gap-1.5 rounded-[9px] text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              "[&_svg]:size-3.5 [&_svg]:transition-transform [&_svg]:duration-450 [&_svg]:ease-[cubic-bezier(.34,1.4,.64,1)]",
              selected
                ? "font-semibold text-foreground [&_svg]:-rotate-20 [&_svg]:scale-110"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export { SegmentedControl }
