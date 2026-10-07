import * as React from "react"
import { cn } from "cn"

// An iOS-style switch built on a native checkbox, so it works in plain
// <form> server actions (name/defaultChecked) as well as controlled.
// Styles live in globals.css (.switch).
function Switch({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      role="switch"
      data-slot="switch"
      className={cn("switch", className)}
      {...props}
    />
  )
}

export { Switch }
