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

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  // Extra words the ⌘K menu matches on.
  keywords?: string;
};

export type NavGroup = { label: string | null; items: NavItem[] };

// Grouped by what the owner is doing: answering people, running the diary,
// or setting things up.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/dashboard", label: "Overview", icon: LayoutDashboardIcon, exact: true, keywords: "home dashboard" }],
  },
  {
    label: "Inbox",
    items: [
      { href: "/dashboard/conversations", label: "Conversations", icon: MessageSquareIcon, keywords: "chats transcripts whatsapp take over" },
      { href: "/dashboard/messages", label: "Messages", icon: InboxIcon, keywords: "contact form enquiries" },
      { href: "/dashboard/leads", label: "Leads", icon: UsersIcon, keywords: "prospects csv export" },
      { href: "/dashboard/customers", label: "Customers", icon: ContactRoundIcon, keywords: "clients contacts people" },
    ],
  },
  {
    label: "Schedule",
    items: [
      { href: "/dashboard/bookings", label: "Bookings", icon: CalendarIcon, keywords: "appointments calendar diary" },
      { href: "/dashboard/services", label: "Services", icon: BriefcaseIcon, keywords: "treatments prices duration" },
      { href: "/dashboard/staff", label: "Staff", icon: UserRoundCogIcon, keywords: "team stylists employees" },
      { href: "/dashboard/availability", label: "Availability", icon: ClockIcon, keywords: "hours open closed holidays" },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/dashboard/knowledge", label: "Knowledge", icon: BookOpenIcon, keywords: "faq answers policies ai" },
      { href: "/dashboard/widget", label: "Widgets", icon: MessageCircleIcon, keywords: "chat widget install snippet website" },
      { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon, keywords: "business info domains" },
    ],
  },
];

// Platform admins also run the /admin area (tenants, WhatsApp numbers, usage),
// which isn't otherwise linked from anywhere.
export const ADMIN_ITEM: NavItem = { href: "/admin", label: "Admin", icon: ShieldIcon, keywords: "tenants usage platform" };

export function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}
