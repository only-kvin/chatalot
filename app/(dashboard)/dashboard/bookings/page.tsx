import Link from "next/link";
import { createClient } from "@/lib/db/supabase-server";
import { getSessionUser } from "@/lib/db/auth";
import { requireFeaturePage } from "@/lib/dashboard-features";
import { formatLocalDateTime } from "@/lib/time";
import {
  describeEvent,
  formatShortLocal,
  isReassignment,
  SOURCE_LABEL,
  STATUS_LABEL,
  statusVariant,
  type BookingEvent,
  type BookingStatus,
} from "@/lib/bookings/labels";
import { PageHeader } from "@/components/dashboard/page-header";
import { Rating } from "@/components/dashboard/rating";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TABS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "pending", label: "To approve" },
  { id: "past", label: "Past" },
  { id: "cancelled", label: "Cancelled" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; staff?: string }>;
}) {
  const tenantId = await requireFeaturePage("bookings");
  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === params.tab) ? (params.tab as Tab) : "upcoming";

  const supabase = await createClient();
  const user = await getSessionUser();
  const now = new Date().toISOString();

  const { data: staff } = await supabase
    .from("staff")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .order("sort_order")
    .order("name");
  const staffNames = new Map((staff ?? []).map((p) => [p.id, p.name]));
  // "none" = bookings nobody has been given yet.
  const staffFilter = params.staff === "none" || staffNames.has(params.staff ?? "") ? params.staff : undefined;
  const tabHref = (id: Tab, staffId = staffFilter) => {
    const q = new URLSearchParams();
    if (id !== "upcoming") q.set("tab", id);
    if (staffId) q.set("staff", staffId);
    return q.size ? `/dashboard/bookings?${q}` : "/dashboard/bookings";
  };

  let query = supabase
    .from("bookings")
    .select("id, name, starts_at, status, source, created_at, contact_id, staff_id, review_rating, services(name)")
    .eq("tenant_id", tenantId)
    .limit(200);
  if (staffFilter === "none") query = query.is("staff_id", null);
  else if (staffFilter) query = query.eq("staff_id", staffFilter);
  if (tab === "upcoming") query = query.neq("status", "cancelled").gte("starts_at", now).order("starts_at");
  if (tab === "pending") query = query.eq("status", "pending").order("starts_at");
  if (tab === "past") query = query.neq("status", "cancelled").lt("starts_at", now).order("starts_at", { ascending: false });
  if (tab === "cancelled") query = query.eq("status", "cancelled").order("updated_at", { ascending: false });
  const { data: bookings } = await query;

  // Latest change per booking, for the "Last change" column.
  const ids = (bookings ?? []).map((b) => b.id);
  const { data: events } = ids.length
    ? await supabase
        .from("booking_events")
        .select("booking_id, type, actor, channel, details, created_by, created_at")
        .eq("tenant_id", tenantId)
        .in("booking_id", ids)
        .order("created_at", { ascending: false })
    : { data: [] };
  const latest = new Map<string, BookingEvent>();
  const rescheduled = new Set<string>();
  for (const e of events ?? []) {
    if (!latest.has(e.booking_id)) latest.set(e.booking_id, e);
    if (e.type === "rescheduled" && !isReassignment(e)) rescheduled.add(e.booking_id);
  }

  return (
    <div className="mx-auto max-w-6xl p-8">
      <PageHeader title="Bookings" description="Every booking, how it was made, and every change since." />

      <nav className="mb-4 flex gap-1 border-b" aria-label="Booking views">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {staffNames.size > 0 && (
        <nav className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Filter by staff">
          {[{ id: undefined, name: "Everyone" }, ...(staff ?? []), { id: "none", name: "Not assigned" }].map((p) => (
            <Link
              key={p.id ?? "all"}
              href={tabHref(tab, p.id)}
              aria-current={staffFilter === p.id ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1",
                staffFilter === p.id ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:border-foreground",
              )}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Service</TableHead>
            {staffNames.size > 0 && <TableHead>Staff</TableHead>}
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Booked via</TableHead>
            <TableHead>Last change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings?.map((b) => {
            const service = (b.services as unknown as { name: string } | null)?.name ?? "Unknown service";
            const last = latest.get(b.id);
            const needsOutcome = tab === "past" && b.status === "confirmed";
            return (
              <TableRow key={b.id}>
                <TableCell className="whitespace-nowrap">
                  <Link href={`/dashboard/bookings/${b.id}`} className="font-medium hover:underline">
                    {formatLocalDateTime(b.starts_at)}
                  </Link>
                  {rescheduled.has(b.id) && (
                    <Badge variant="outline" className="ml-2">
                      Moved
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{service}</TableCell>
                {staffNames.size > 0 && (
                  <TableCell className={b.staff_id ? "" : "text-muted-foreground"}>
                    {b.staff_id ? (staffNames.get(b.staff_id) ?? "—") : "Not assigned"}
                  </TableCell>
                )}
                <TableCell>
                  {b.contact_id ? (
                    <Link href={`/dashboard/customers/${b.contact_id}`} className="hover:underline">
                      {b.name}
                    </Link>
                  ) : (
                    b.name
                  )}
                </TableCell>
                <TableCell>
                  {needsOutcome ? (
                    <Badge variant="outline">Mark attended?</Badge>
                  ) : (
                    <Badge variant={statusVariant(b.status)}>{STATUS_LABEL[b.status as BookingStatus] ?? b.status}</Badge>
                  )}
                  {b.review_rating && <Rating value={b.review_rating} className="ml-2" />}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {SOURCE_LABEL[b.source] ?? b.source}
                  <div className="text-xs text-muted-foreground">{formatShortLocal(b.created_at)}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {last ? (
                    <>
                      {describeEvent(last, user?.id ?? null, staffNames)}
                      <div className="text-xs text-muted-foreground">{formatShortLocal(last.created_at)}</div>
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {!bookings?.length && (
            <TableRow>
              <TableCell colSpan={staffNames.size > 0 ? 7 : 6} className="text-center text-muted-foreground">
                {
                  {
                    upcoming: "No upcoming bookings.",
                    pending: "Nothing waiting for approval.",
                    past: "No past bookings.",
                    cancelled: "No cancelled bookings.",
                  }[tab]
                }
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
