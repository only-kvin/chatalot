"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboardIcon,
  UsersIcon,
  MessageSquareIcon,
  BookOpenIcon,
  CalendarIcon,
  BriefcaseIcon,
  ClockIcon,
  MessageCircleIcon,
  SettingsIcon,
  ShieldIcon,
  ContactRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { NotificationsBell } from "./notifications-bell";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboardIcon, exact: true },
  { href: "/dashboard/customers", label: "Customers", icon: ContactRoundIcon },
  { href: "/dashboard/leads", label: "Leads", icon: UsersIcon },
  { href: "/dashboard/conversations", label: "Conversations", icon: MessageSquareIcon },
  { href: "/dashboard/knowledge", label: "Knowledge", icon: BookOpenIcon },
  { href: "/dashboard/bookings", label: "Bookings", icon: CalendarIcon },
  { href: "/dashboard/services", label: "Services", icon: BriefcaseIcon },
  { href: "/dashboard/availability", label: "Availability", icon: ClockIcon },
  { href: "/dashboard/widget", label: "Widget", icon: MessageCircleIcon },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

// Platform admins also run the /admin area (tenants, WhatsApp numbers, usage),
// which isn't otherwise linked from anywhere.
const ADMIN_ITEM: NavItem = { href: "/admin", label: "Admin", icon: ShieldIcon };

export function DashboardNav({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard"
      className={cn(
        // Horizontal scroll strip on mobile, fixed sidebar from md up.
        "flex shrink-0 gap-1 overflow-x-auto border-b bg-white p-2 dark:bg-zinc-950",
        "md:sticky md:top-0 md:h-screen md:w-56 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:p-4",
      )}
    >
      <div className="flex shrink-0 items-center md:justify-between md:pb-4 md:pl-2">
        <span className="hidden text-sm font-semibold tracking-tight md:block">ChatAlot</span>
        <NotificationsBell />
      </div>
      {(isPlatformAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS).map((item) => {
        const active = isActive(pathname, item.href, item.exact);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-150",
              active
                ? "bg-muted text-foreground"
                : "text-zinc-500 hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
