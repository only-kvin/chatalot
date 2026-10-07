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
  InboxIcon,
  UserRoundCogIcon,
  type LucideIcon,
} from "lucide-react";
import type { Feature, Features } from "@/lib/plans";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  // Extra words the "Jump to" search matches on.
  keywords?: string;
  // Gated pages; everything else is in every plan.
  feature?: Feature;
  // Shown muted with a lock; links to the feature's upgrade page.
  locked?: boolean;
};
export type NavGroup = { label: string | null; items: NavItem[] };

// Shared by the sidebar and the "Jump to" search.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/dashboard", label: "Overview", icon: LayoutDashboardIcon, exact: true, keywords: "home" }],
  },
  {
    label: "Inbox",
    items: [
      { href: "/dashboard/conversations", label: "Conversations", icon: MessageSquareIcon, keywords: "chats whatsapp transcripts take over" },
      { href: "/dashboard/messages", label: "Messages", icon: InboxIcon, keywords: "contact form", feature: "contact_form" },
      { href: "/dashboard/leads", label: "Leads", icon: UsersIcon, keywords: "csv export" },
      { href: "/dashboard/customers", label: "Customers", icon: ContactRoundIcon, keywords: "contacts clients" },
    ],
  },
  {
    label: "Schedule",
    items: [
      { href: "/dashboard/bookings", label: "Bookings", icon: CalendarIcon, keywords: "appointments calendar", feature: "bookings" },
      { href: "/dashboard/services", label: "Services", icon: BriefcaseIcon, keywords: "prices durations", feature: "bookings" },
      { href: "/dashboard/staff", label: "Staff", icon: UserRoundCogIcon, keywords: "team people", feature: "bookings" },
      { href: "/dashboard/availability", label: "Availability", icon: ClockIcon, keywords: "hours closures holidays", feature: "bookings" },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/dashboard/knowledge", label: "Knowledge", icon: BookOpenIcon, keywords: "faq answers policies" },
      { href: "/dashboard/widget", label: "Widgets", icon: MessageCircleIcon, keywords: "chat snippet install website" },
      { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon, keywords: "business domains booking page reviews" },
    ],
  },
];

// Platform admins also run the /admin area (tenants, WhatsApp numbers, usage),
// which isn't otherwise linked from anywhere.
export const ADMIN_ITEM: NavItem = { href: "/admin", label: "Admin", icon: ShieldIcon, keywords: "tenants usage" };

export function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

// The menu for a tenant's plan. A hidden feature (switched off by the
// platform admin) disappears. A locked one (not in their plan) collapses to a
// single muted item — "Bookings", not Bookings, Services, Staff and
// Availability each with a lock — that opens its upgrade page.
export function navForFeatures(groups: NavGroup[], features: Features): NavGroup[] {
  const lockedShown = new Set<Feature>();
  return groups
    .map((group) => ({
      ...group,
      items: group.items.flatMap((item): NavItem[] => {
        if (!item.feature || features[item.feature] === "on") return [item];
        if (features[item.feature] === "hidden" || lockedShown.has(item.feature)) return [];
        lockedShown.add(item.feature);
        return [{ ...item, href: `/dashboard/upgrade/${item.feature}`, exact: true, locked: true }];
      }),
    }))
    .filter((group) => group.items.length > 0);
}
