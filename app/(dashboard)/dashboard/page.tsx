import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SECTIONS = [
  {
    href: "/dashboard/leads",
    title: "Leads",
    description: "See who your AI receptionist has captured, and update their status.",
  },
  {
    href: "/dashboard/conversations",
    title: "Conversations",
    description: "Read transcripts and take over from the AI when needed.",
  },
  {
    href: "/dashboard/knowledge",
    title: "Knowledge base",
    description:
      "Manage the FAQs, services, prices and policies your AI receptionist answers from.",
  },
  {
    href: "/dashboard/bookings",
    title: "Bookings",
    description: "See appointments your AI receptionist has booked, and update their status.",
  },
  {
    href: "/dashboard/services",
    title: "Services",
    description: "What your AI receptionist can book appointments for, and how long each takes.",
  },
  {
    href: "/dashboard/availability",
    title: "Availability",
    description: "Weekly open hours and one-off closures for bookings.",
  },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <div className="flex flex-col gap-4">
        {SECTIONS.map((s) => (
          <Card key={s.href}>
            <CardHeader>
              <CardTitle>
                <Link href={s.href} className="hover:underline">
                  {s.title} →
                </Link>
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
