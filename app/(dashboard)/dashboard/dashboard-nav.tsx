"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LockIcon } from "lucide-react";
import { cn } from "cn";
import { BRAND_NAME } from "@/lib/brand";
import { BrandSymbol } from "@/components/brand/symbol";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import type { Theme } from "@/components/theme/theme";
import type { Features } from "@/lib/plans";
import { NotificationsBell } from "./notifications-bell";
import { JumpTo } from "./jump-to";
import { ADMIN_ITEM, NAV_GROUPS, isActive, navForFeatures, type NavItem } from "./nav-items";

export function DashboardNav({
  isPlatformAdmin,
  businessName,
  userEmail,
  needsYou,
  theme,
  features,
}: {
  isPlatformAdmin: boolean;
  businessName: string;
  userEmail: string;
  // Conversations the team has taken over: shown as a count on Conversations.
  needsYou: number;
  theme: Theme;
  features: Features;
}) {
  const pathname = usePathname();
  const planGroups = navForFeatures(NAV_GROUPS, features);
  const groups = isPlatformAdmin ? [...planGroups, { label: "Platform", items: [ADMIN_ITEM] }] : planGroups;
  const allItems = groups.flatMap((g) => g.items);

  const link = (item: NavItem, compact = false) => {
    const active = isActive(pathname, item);
    const count = item.href === "/dashboard/conversations" && needsYou > 0 ? needsYou : null;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group/nav flex min-h-10 shrink-0 items-center gap-2.5 rounded-[10px] px-3 text-sm font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-200 active:scale-[.98]",
          active
            ? "bg-raised text-foreground shadow-raised"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
          item.locked && !active && "opacity-70",
          compact && "min-h-9",
        )}
      >
        <item.icon
          className={cn(
            "size-[18px] shrink-0 transition-transform duration-200 ease-[cubic-bezier(.2,.8,.2,1)] group-hover/nav:translate-x-px group-hover/nav:scale-105",
            active && "text-primary",
          )}
        />
        <span className="flex-1">{item.label}</span>
        {item.locked && <LockIcon className="size-3.5 shrink-0" aria-label="Not on your plan" />}
        {count !== null && (
          <span
            className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white"
            aria-label={`${count} need you`}
          >
            {count}
          </span>
        )}
      </Link>
    );
  };

  const initials = (businessName || userEmail).replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <>
      {/* Mobile: brand bar plus a horizontal strip of every page. */}
      <nav aria-label="Dashboard" className="sticky top-0 z-30 border-b bg-sidebar backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-between px-4 pt-3">
          <Brand businessName={businessName} />
          <NotificationsBell />
        </div>
        <div className="flex gap-1 overflow-x-auto p-2 [scrollbar-width:none]">{allItems.map((item) => link(item, true))}</div>
      </nav>

      {/* Desktop sidebar. */}
      <nav
        aria-label="Dashboard"
        className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-sidebar-border bg-sidebar px-3.5 py-5 backdrop-blur-xl md:flex"
      >
        <div className="flex items-center justify-between gap-2 pl-2">
          <Brand businessName={businessName} />
          <NotificationsBell />
        </div>

        <JumpTo items={allItems} />

        {groups.map((group, i) => (
          <div key={group.label ?? i} className="flex flex-col gap-0.5">
            {group.label && (
              <span className="px-3 pb-1.5 text-[11px] font-semibold tracking-[.08em] text-muted-foreground/90 uppercase">
                {group.label}
              </span>
            )}
            {group.items.map((item) => link(item))}
          </div>
        ))}

        <div className="mt-auto flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <span className="px-1 text-[11px] font-semibold tracking-[.08em] text-muted-foreground/90 uppercase">
              Appearance
            </span>
            <ThemeSwitcher serverTheme={theme} />
          </div>
          <div className="flex items-center gap-2.5 rounded-[14px] bg-white/70 p-2.5 shadow-[0_0_0_1px_var(--border)] dark:bg-white/[0.04]">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-135 from-[#fbcfe8] to-[#c4b5fd] text-[13px] font-semibold text-[#3b0764]">
              {initials || "?"}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[13px] font-semibold">{userEmail}</span>
              <span className="text-xs text-muted-foreground">{isPlatformAdmin ? "Platform admin" : "Team"}</span>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}

function Brand({ businessName }: { businessName: string }) {
  return (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
      <BrandSymbol className="size-[34px]" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-heading text-[17px] leading-none font-bold tracking-[-0.03em] lowercase">{BRAND_NAME}</span>
        <span className="truncate text-xs text-muted-foreground">{businessName}</span>
      </span>
    </Link>
  );
}
