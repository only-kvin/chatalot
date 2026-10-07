import { cn } from "cn";

// A staff member's photo, or their initials when there's none.
export function StaffAvatar({ name, url, className }: { name: string; url: string | null; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  return url ? (
    // Owner-supplied link on any host, so not next/image (which needs each
    // host allow-listed in next.config).
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={cn("size-10 shrink-0 rounded-full object-cover", className)} />
  ) : (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground",
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}
