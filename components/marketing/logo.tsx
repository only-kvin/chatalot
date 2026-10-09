import Link from "next/link";
import { MessageCircleIcon } from "lucide-react";
import { cn } from "cn";
import { BRAND_NAME } from "@/lib/brand";

// The same mark as the dashboard sidebar, so the site and the app match.
export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <Link
      href="/"
      aria-label={`${BRAND_NAME} home`}
      className={cn("flex shrink-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}
    >
      <span className="flex size-[32px] items-center justify-center rounded-[10px] bg-linear-145 from-[#6d67f5] to-[#3f35c4] shadow-[0_1px_0_rgb(255_255_255/0.35)_inset,0_6px_14px_-4px_rgb(67_56_202/0.55)]">
        <MessageCircleIcon className="size-[17px] text-white" strokeWidth={2.2} aria-hidden />
      </span>
      <span className={cn("text-[16px] leading-none font-bold tracking-[-0.01em]", inverted && "text-white")}>
        {BRAND_NAME}
      </span>
    </Link>
  );
}
