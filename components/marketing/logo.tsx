import Link from "next/link";
import { cn } from "cn";
import { BRAND_NAME } from "@/lib/brand";
import { BrandLockup } from "@/components/brand/symbol";

// The same mark as the dashboard sidebar, so the site and the app match.
export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <Link
      href="/"
      aria-label={`${BRAND_NAME} home`}
      className={cn("flex shrink-0 items-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}
    >
      <BrandLockup name={BRAND_NAME} onDark={inverted} />
    </Link>
  );
}
