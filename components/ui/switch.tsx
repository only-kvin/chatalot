import * as React from "react"
import { cn } from "cn"

// iOS-style switch. It's a real checkbox underneath (role="switch"), so it
// works inside plain <form>s with `name`/`defaultChecked`, and as a
// controlled input with `checked`/`onChange`. The knob springs across,
// stretches while pressed, and the track fades to green.
function Switch({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <span className={cn("motion-snap relative inline-flex h-[31px] w-[51px] shrink-0", className)}>
      <input
        type="checkbox"
        role="switch"
        data-slot="switch"
        className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-full bg-track shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] transition-colors duration-250 outline-none checked:bg-[#34c759] focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_1px_1px_rgb(0_0_0/0.16)] transition-[transform,width] duration-[320ms,180ms] ease-[cubic-bezier(.34,1.4,.64,1)] peer-checked:translate-x-5 peer-active:w-[31px] peer-checked:peer-active:translate-x-4"
      />
    </span>
  )
}

export { Switch }
