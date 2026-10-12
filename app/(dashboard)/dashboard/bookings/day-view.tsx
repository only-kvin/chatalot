import Link from "next/link";
import { MapPinIcon } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, formatLocalDate, formatLocalTime, localToUtcDate } from "@/lib/time";
import { canonicalPhone, formatPhone } from "@/lib/contacts/phone";
import { STATUS_LABEL, statusVariant, type BookingStatus } from "@/lib/bookings/labels";
import { formatRand, timeRangeLabel } from "@/lib/bookings/price-label";
import { addressText, BOOKING_PLACE_COLUMNS, mapsUrl, type BookingPlace } from "@/lib/bookings/place";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ViewToggle } from "./calendar";

// One day's bookings in time order, call-outs with their address, a Maps
// link and access notes, so the owner can plan the route. No route
// optimisation: the order is simply by arrival time.

type Row = BookingPlace & {
  id: string;
  name: string;
  phone: string;
  starts_at: string;
  status: string;
  staff_id: string | null;
  services: unknown;
};

export async function DayView({
  supabase,
  tenantId,
  date,
  staffFilter,
  staffNames,
  hrefFor,
  viewHrefs,
}: {
  supabase: SupabaseClient;
  tenantId: string;
  date: string;
  staffFilter: string | undefined;
  staffNames: Map<string, string>;
  hrefFor: (date: string) => string;
  viewHrefs: Record<"day" | "week" | "list", string>;
}) {
  let query = supabase
    .from("bookings")
    .select(`id, name, phone, starts_at, status, staff_id, ${BOOKING_PLACE_COLUMNS}, services(name)`)
    .eq("tenant_id", tenantId)
    .neq("status", "cancelled")
    .gte("starts_at", localToUtcDate(date, "00:00").toISOString())
    .lt("starts_at", localToUtcDate(addDays(date, 1), "00:00").toISOString())
    .order("starts_at");
  if (staffFilter === "none") query = query.is("staff_id", null);
  else if (staffFilter) query = query.eq("staff_id", staffFilter);
  const { data } = await query;
  const rows = (data ?? []) as Row[];
  const callouts = rows.filter((r) => r.location === "customer").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{formatLocalDate(date)}</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} booking{rows.length === 1 ? "" : "s"}
            {callouts > 0 && `, ${callouts} call-out${callouts === 1 ? "" : "s"}`}, in order of arrival
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={hrefFor(addDays(date, -1))} className="rounded-full border bg-card px-3 py-1.5 hover:bg-muted">
            ← Previous day
          </Link>
          <Link href={hrefFor(addDays(date, 1))} className="rounded-full border bg-card px-3 py-1.5 hover:bg-muted">
            Next day →
          </Link>
          <ViewToggle current="list" hrefs={viewHrefs} />
        </div>
      </div>

      {rows.length === 0 && <p className="py-8 text-center text-muted-foreground">Nothing booked on this day.</p>}

      <ol className="flex flex-col gap-3">
        {rows.map((b, i) => {
          const service = (b.services as { name: string } | null)?.name ?? "Booking";
          const address = addressText(b);
          const maps = mapsUrl(b);
          const start = formatLocalTime(b.starts_at);
          return (
            <li key={b.id}>
              <Card>
                <CardContent className="flex flex-col gap-2 pt-6 sm:flex-row sm:gap-4">
                  <div className="flex items-baseline gap-2 sm:block sm:w-24 sm:shrink-0">
                    <p className="text-xs text-muted-foreground">Stop {i + 1}</p>
                    <p className="font-semibold tabular-nums">
                      {timeRangeLabel(start, b.arrival_window_end ? formatLocalTime(b.arrival_window_end) : null)}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/dashboard/bookings/${b.id}`} className="font-medium hover:underline">
                        {service} · {b.name}
                      </Link>
                      <Badge variant={statusVariant(b.status)}>{STATUS_LABEL[b.status as BookingStatus] ?? b.status}</Badge>
                      {b.outside_service_area && <Badge variant="warning">Outside listed area</Badge>}
                    </div>
                    {address ? (
                      <p className="flex items-start gap-1">
                        <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span>
                          {address}
                          {maps && (
                            <>
                              {" · "}
                              <a href={maps} target="_blank" rel="noopener noreferrer" className="underline">
                                Open in Maps
                              </a>
                            </>
                          )}
                        </span>
                      </p>
                    ) : (
                      <p className="text-muted-foreground">At your place</p>
                    )}
                    {b.access_notes && <p className="text-muted-foreground">Access: {b.access_notes}</p>}
                    <p className="text-muted-foreground">
                      {formatPhone(canonicalPhone(b.phone)) || b.phone}
                      {b.callout_fee_cents ? ` · call-out fee ${formatRand(b.callout_fee_cents)}` : ""}
                      {b.staff_id && staffNames.get(b.staff_id) ? ` · ${staffNames.get(b.staff_id)}` : ""}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
