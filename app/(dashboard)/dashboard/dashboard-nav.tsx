"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircleIcon } from "lucide-react";
import { cn } from "cn";
import { NotificationsBell } from "./notifications-bell";
import { CommandMenu } from "./command-menu";
import { ThemeSwitcher } from "@/components/dashboard/theme-switcher";
import { ADMIN_ITEM, NAV_GROUPS, isActive, type NavGroup, type NavItem } from "./nav-items";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href, item.exact);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/nav flex min-h-10 shrink-0 items-center gap-2.5 rounded-xl px-3 text-sm font-medium whitespace-nowrap",
        "transition-[background-color,color,box-shadow,transform] duration-200 ease-(--ease-out) active:scale-[0.98]",
        active
          ? "bg-card text-foreground shadow-[inset_0_1px_0_var(--surface-highlight),0_1px_2px_oklch(0.2_0.02_286/6%),0_4px_12px_-4px_var(--surface-shadow)] ring-1 ring-border/60"
          : "text-muted-foreground hover:bg-primary/[0.07] hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-[18px] shrink-0 transition-transform duration-200 ease-(--ease-out) group-hover/nav:translate-x-px group-hover/nav:scale-105 motion-reduce:transform-none",
          active && "text-primary dark:text-indigo-300",
        )}
      />
      {item.label}
    </Link>
  );
}

export function DashboardNav({
  isPlatformAdmin,
  tenantName,
}: {
  isPlatformAdmin: boolean;
  tenantName: string | null;
}) {
  const pathname = usePathname();
  const groups: NavGroup[] = isPlatformAdmin
    ? [...NAV_GROUPS, { label: "Platform", items: [ADMIN_ITEM] }]
    : NAV_GROUPS;

  return (
    <nav
      aria-label="Dashboard"
      className={cn(
        // Top bar + horizontal scroll strip on mobile, fixed sidebar from md up.
        "z-30 flex shrink-0 flex-col gap-3 border-b border-sidebar-border bg-sidebar p-3 backdrop-blur-xl",
        "md:sticky md:top-0 md:h-screen md:w-64 md:gap-5 md:overflow-y-auto md:border-r md:border-b-0 md:px-3.5 md:py-5",
      )}
    >
      <div className="flex items-center gap-2.5 md:px-1.5">
        <div className="icon-tile size-9 shrink-0 rounded-[10px] bg-[linear-gradient(145deg,#6D67F5_0%,#3F35C4_100%)]">
          <MessageCircleIcon className="size-[18px]" strokeWidth={2.2} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-bold tracking-tight">ChatAlot</span>
          {tenantName && <span className="truncate text-xs text-muted-foreground">{tenantName}</span>}
        </div>
        <NotificationsBell />
        <div className="md:hidden">
          <ThemeSwitcher compact />
        </div>
      </div>

      <div className="hidden md:block">
        <CommandMenu isPlatformAdmin={isPlatformAdmin} />
      </div>

      <div className="-mx-3 flex gap-1 overflow-x-auto px-3 [scrollbar-width:none] md:mx-0 md:flex-col md:gap-5 md:overflow-visible md:px-0">
        {groups.map((group, gi) => (
          <div key={group.label ?? gi} className="flex shrink-0 gap-1 md:flex-col md:gap-0.5">
            {group.label && (
              <span className="hidden px-3 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/80 uppercase md:block">
                {group.label}
              </span>
            )}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-auto hidden flex-col gap-2 md:flex">
        <span className="px-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/80 uppercase">
          Appearance
        </span>
        <ThemeSwitcher />
      </div>
    </nav>
  );
}
