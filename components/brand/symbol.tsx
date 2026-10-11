import { cn } from "cn";

// The Bookfront symbol: an open doorway on a counter, its top bitten into a
// crescent moon ("open, even after hours"). Drawn in the theme's primary
// colours, so it is the green tile in light mode and the mint tile in dark
// mode. `onDark` forces the mint version on dark surfaces in light mode
// (e.g. the marketing footer). Static files live in public/brand/.
export function BrandSymbol({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  const tile = onDark ? "#5fc7a9" : "var(--primary)";
  const ink = onDark ? "#0c1412" : "var(--primary-foreground)";
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="8" fill={tile} />
      <path d="M10 24V15a6 6 0 0 1 12 0v9z" fill={ink} />
      <circle cx="21.5" cy="10.5" r="4.6" fill={tile} />
      <rect x="6" y="24" width="20" height="3" rx="1.5" fill={ink} />
    </svg>
  );
}

// Symbol plus the lowercase wordmark in Bricolage Grotesque, as on the canvas.
export function BrandLockup({ name, className, onDark = false }: { name: string; className?: string; onDark?: boolean }) {
  return (
    <span className={cn("flex shrink-0 items-center gap-2.5", className)}>
      <BrandSymbol onDark={onDark} />
      <span className={cn("font-heading text-[22px] leading-none font-bold tracking-[-0.03em] lowercase", onDark && "text-[#ecf1ef]")}>
        {name}
      </span>
    </span>
  );
}
