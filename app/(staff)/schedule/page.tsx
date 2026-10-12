import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, MapPinIcon, PhoneIcon } from "lucide-react";
import { getSessionUser } from "@/lib/db/auth";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getStaffSeats } from "@/lib/staff/access";
import { addDays, formatLocalDate, formatLocalTime, localDateISO, localToUtcDate, todayLocalISO } from "@/lib/time";
import { canonicalPhone, formatPhone } from "@/lib/contacts/phone";
import { STATUS_LABEL, statusVariant, type BookingStatus } from "@/lib/bookings/labels";
import { addressText, BOOKING_PLACE_COLUMNS, mapsUrl, type BookingPlace } from "@/lib/bookings/place";
import { BRAND_NAME } from "@/lib/brand";
import { BrandSymbol } from "@/components/brand/symbol";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOutAction } from "./actions";

export const metadata: Metadata = { title: `Your schedule · ${BRAND_NAME}`, robots: { index: false } };

// A staff member's own schedule: one day in detail, then the next two weeks.
// Read with the service role, so every query below is filtered to the
// staff rows linked to this login (lib/staff/access.ts) and their business.

const AHEAD_DAYS = 14;

type Row = BookingPlace & {
  id: string;
  tenant_id: string;
  staff_id: string;
  name: string;
  phone: string;
  starts_at: string;
  ends_at: string;
  status: string;
  services: unknown;
};

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/schedule")}`);
  const seats = await getStaffSeats();
  if (!seats.length) redirect("/dashboard");

  const today = todayLocalISO();
  const raw = (await searchParams).date ?? "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today;

  const admin = createAdminClient();
  const staffIds = seats.map((s) => s.staffId);
  const tenantIds = [...new Set(seats.map((s) => s.tenantId))];
  const from = localToUtcDate(day, "00:00").toISOString();
  const until = localToUtcDate(addDays(day, AHEAD_DAYS + 1), "00:00").toISOString();
  const [{ data }, { data: timeOff }] = await Promise.all([
    admin
      .from("bookings")
      .select(`id, tenant_id, staff_id, name, phone, starts_at, ends_at, status, ${BOOKING_PLACE_COLUMNS}, services(name)`)
      .in("staff_id", staffIds)
      .in("tenant_id", tenantIds)
      .neq("status", "cancelled")
      .gte("starts_at", from)
      .lt("starts_at", until)
      .order("starts_at")
      .limit(300),
    admin
      .from("time_off")
      .select("id, staff_id, starts_at, ends_at, reason")
      .in("staff_id", staffIds)
      .in("tenant_id", tenantIds)
      .lt("starts_at", localToUtcDate(addDays(day, 1), "00:00").toISOString())
      .gt("ends_at", from)
      .order("starts_at"),
  ]);
  // A booking's tenant must match its staff row's tenant, so a staff id
  // can never surface another business's booking.
  const seatOf = new Map(seats.map((s) => [s.staffId, s]));
  const rows = ((data ?? []) as Row[]).filter((b) => seatOf.get(b.staff_id)?.tenantId === b.tenant_id);
  const todays = rows.filter((b) => localDateISO(new Date(b.starts_at)) === day);
  const later = rows.filter((b) => localDateISO(new Date(b.starts_at)) !== day);
  const laterByDay = new Map<string, Row[]>();
  for (const b of later) {
    const d = localDateISO(new Date(b.starts_at));
    laterByDay.set(d, [...(laterByDay.get(d) ?? []), b]);
  }
  const manyPlaces = tenantIds.length > 1;
  const first = seats[0]!;

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 pt-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandSymbol className="size-8" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{manyPlaces ? first.name : first.businessName || first.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-6 pb-16">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {day === today ? `Today, ${first.name.split(" ")[0]}` : formatLocalDate(day)}
          </h1>
          <p className="text-muted-foreground">
            {day === today ? formatLocalDate(day) : "Your bookings that day"}
          </p>
        </div>

        <section className="rounded-2xl border bg-card p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {todays.length} booking{todays.length === 1 ? "" : "s"}
            </h2>
            <nav className="flex items-center gap-1" aria-label="Choose a day">
              <DayLink date={addDays(day, -1)} label="Previous day" icon="prev" />
              {day !== today && (
                <Link href="/schedule" className="rounded-full px-3 py-1.5 text-sm font-medium hover:bg-muted">
                  Today
                </Link>
              )}
              <DayLink date={addDays(day, 1)} label="Next day" icon="next" />
            </nav>
          </div>

          {(timeOff ?? []).map((t) => (
            <p key={t.id} className="mb-2 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
              Time off {formatLocalTime(t.starts_at)}–{formatLocalTime(t.ends_at)}
              {t.reason ? ` · ${t.reason}` : ""}
            </p>
          ))}

          {todays.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">Nothing booked with you on this day.</p>
          ) : (
            <ol className="divide-y">
              {todays.map((b) => (
                <BookingRow key={b.id} b={b} place={manyPlaces ? seatOf.get(b.staff_id)?.businessName : undefined} detailed />
              ))}
            </ol>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Coming up</h2>
          {laterByDay.size === 0 && (
            <p className="text-sm text-muted-foreground">Nothing else in the next {AHEAD_DAYS} days.</p>
          )}
          {[...laterByDay].map(([d, list]) => (
            <div key={d} className="rounded-2xl border bg-card px-4 py-2 sm:px-6">
              <Link href={`/schedule?date=${d}`} className="block py-2 text-sm font-semibold hover:underline">
                {formatLocalDate(d)} · {list.length}
              </Link>
              <ol className="divide-y border-t">
                {list.map((b) => (
                  <BookingRow key={b.id} b={b} place={manyPlaces ? seatOf.get(b.staff_id)?.businessName : undefined} />
                ))}
              </ol>
            </div>
          ))}
        </section>

        <p className="text-center text-xs text-muted-foreground">
          To change a booking or your hours, ask the business owner. You&apos;ll get an email when a booking with you
          changes.
        </p>
      </main>
    </div>
  );
}

function DayLink({ date, label, icon }: { date: string; label: string; icon: "prev" | "next" }) {
  const Icon = icon === "prev" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <Link
      href={`/schedule?date=${date}`}
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-full border hover:bg-muted"
    >
      <Icon className="size-4" />
    </Link>
  );
}

function BookingRow({ b, place, detailed = false }: { b: Row; place?: string; detailed?: boolean }) {
  const service = (b.services as { name: string } | null)?.name ?? "Booking";
  const phone = canonicalPhone(b.phone);
  const address = addressText(b);
  const maps = mapsUrl(b);
  const end = b.arrival_window_end ? null : formatLocalTime(b.ends_at);
  return (
    <li className="flex gap-4 py-3">
      <div className="w-14 shrink-0 font-semibold tabular-nums">
        {formatLocalTime(b.starts_at)}
        {detailed && end && <div className="text-xs font-normal text-muted-foreground">to {end}</div>}
        {b.arrival_window_end && (
          <div className="text-xs font-normal text-muted-foreground">to {formatLocalTime(b.arrival_window_end)}</div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{b.name}</span>
          <Badge variant={statusVariant(b.status)}>{STATUS_LABEL[b.status as BookingStatus] ?? b.status}</Badge>
        </div>
        <p className="text-muted-foreground">
          {service}
          {place ? ` · ${place}` : ""}
        </p>
        {detailed && (
          <>
            {phone && (
              <a href={`tel:${phone}`} className="inline-flex w-fit items-center gap-1 text-muted-foreground hover:text-foreground">
                <PhoneIcon className="size-3.5" aria-hidden /> {formatPhone(phone)}
              </a>
            )}
            {address && (
              <p className="flex items-start gap-1 text-muted-foreground">
                <MapPinIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  {address}
                  {maps && (
                    <>
                      {" · "}
                      <a href={maps} target="_blank" rel="noopener noreferrer" className="underline">
                        Maps
                      </a>
                    </>
                  )}
                </span>
              </p>
            )}
            {b.access_notes && <p className="text-muted-foreground">Access: {b.access_notes}</p>}
          </>
        )}
      </div>
    </li>
  );
}
