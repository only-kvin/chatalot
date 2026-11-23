import Link from "next/link";
import { createClient } from "@/lib/db/supabase-server";
import { requireFeaturePage } from "@/lib/dashboard-features";
import { formatLocalDateTime } from "@/lib/time";
import { formatRand } from "@/lib/bookings/price-label";
import { cn } from "cn";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageFrame } from "@/components/dashboard/page-frame";
import { STATUS_BADGE } from "./labels";

// Dashboard → Events: upcoming (soonest first) and past, with tickets taken.

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tenantId = await requireFeaturePage("events");
  const past = (await searchParams).tab === "past";
  const supabase = await createClient();
  const now = new Date().toISOString();

  let q = supabase.from("events").select("id, title, starts_at, status, capacity, price_cents").eq("tenant_id", tenantId).limit(200);
  q = past ? q.lt("starts_at", now).order("starts_at", { ascending: false }) : q.gte("starts_at", now).order("starts_at");
  const { data: events } = await q;
  const ids = (events ?? []).map((e) => e.id);
  const { data: signups } = ids.length
    ? await supabase.from("event_signups").select("event_id, quantity, payment_status, payment_due_at").eq("tenant_id", tenantId).eq("status", "confirmed").in("event_id", ids)
    : { data: [] };
  // Tickets taken, as on the website: paid holds that ran out don't count.
  const taken = new Map<string, number>();
  for (const s of signups ?? []) {
    if (s.payment_status === "awaiting" && s.payment_due_at && s.payment_due_at < now) continue;
    taken.set(s.event_id, (taken.get(s.event_id) ?? 0) + s.quantity);
  }

  return (
    <div className={pageFrame("wide")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Events" description="Upcoming events on your website, with posters and sign-ups." />
        <Link href="/dashboard/events/new" className={buttonVariants()}>
          New event
        </Link>
      </div>
      <nav className="mb-4 flex gap-1 border-b" aria-label="Events">
        {[
          { href: "/dashboard/events", label: "Upcoming", on: !past },
          { href: "/dashboard/events?tab=past", label: "Past", on: past },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.on ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", t.on ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Tickets</TableHead>
            <TableHead>Price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(events ?? []).map((e) => {
            const badge = STATUS_BADGE[e.status] ?? STATUS_BADGE.draft;
            const n = taken.get(e.id) ?? 0;
            return (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap">{formatLocalDateTime(e.starts_at)}</TableCell>
                <TableCell>
                  <Link href={`/dashboard/events/${e.id}`} className="font-medium hover:underline">
                    {e.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </TableCell>
                <TableCell className="tabular-nums">{e.capacity ? `${n} / ${e.capacity}` : n}</TableCell>
                <TableCell>{e.price_cents ? formatRand(e.price_cents) : "Free"}</TableCell>
              </TableRow>
            );
          })}
          {!events?.length && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                {past ? "No past events." : "No upcoming events. Create one to show it on your website."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
