import Link from "next/link";
import {
  UsersIcon,
  MessageSquareIcon,
  BookOpenIcon,
  CalendarIcon,
  BriefcaseIcon,
  ClockIcon,
  MessageCircleIcon,
  SettingsIcon,
  ContactRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";

const SECTIONS: { href: string; title: string; description: string; icon: LucideIcon }[] = [
  {
    href: "/dashboard/customers",
    title: "Customers",
    description: "Everyone who has contacted you, with their chats, leads and bookings in one place.",
    icon: ContactRoundIcon,
  },
  {
    href: "/dashboard/leads",
    title: "Leads",
    description: "See who your AI receptionist has captured, and update their status.",
    icon: UsersIcon,
  },
  {
    href: "/dashboard/conversations",
    title: "Conversations",
    description: "Read transcripts and take over from the AI when needed.",
    icon: MessageSquareIcon,
  },
  {
    href: "/dashboard/knowledge",
    title: "Knowledge base",
    description:
      "Manage the FAQs, services, prices and policies your AI receptionist answers from.",
    icon: BookOpenIcon,
  },
  {
    href: "/dashboard/bookings",
    title: "Bookings",
    description: "See appointments your AI receptionist has booked, and update their status.",
    icon: CalendarIcon,
  },
  {
    href: "/dashboard/services",
    title: "Services",
    description: "What your AI receptionist can book appointments for, and how long each takes.",
    icon: BriefcaseIcon,
  },
  {
    href: "/dashboard/availability",
    title: "Availability",
    description: "Weekly open hours and one-off closures for bookings.",
    icon: ClockIcon,
  },
  {
    href: "/dashboard/widget",
    title: "Widget",
    description: "Appearance, install snippet, and a live preview of your chat widget.",
    icon: MessageCircleIcon,
  },
  {
    href: "/dashboard/settings",
    title: "Settings",
    description: "Business info the AI receptionist uses, and which websites can load your widget.",
    icon: SettingsIcon,
  },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <PageHeader title="Overview" description="Jump into any section below, or use the sidebar." />
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Card key={s.href} className="relative transition-shadow hover:shadow-md">
            <Link href={s.href} className="absolute inset-0" aria-label={s.title}>
              <span className="sr-only">{s.title}</span>
            </Link>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <s.icon className="size-4 text-zinc-400" />
                {s.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-zinc-600 dark:text-zinc-400">
              {s.description}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
