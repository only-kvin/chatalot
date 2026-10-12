import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import { addDays, formatLocalDate, formatLocalTime, localDateISO, localToUtcDate, todayLocalISO, weekdayOf } from "@/lib/time";
import { STATUS_LABEL, type BookingStatus } from "@/lib/bookings/labels";
import { StaffAvatar } from "@/components/dashboard/staff-avatar";

// The bookings calendar: a day with a column per staff member, or a week
// with a column per day. Times are SA local; each hour is HOUR_PX tall.

const HOUR_PX = 60;
const MIN_HEIGHT_PX = 26;

export type CalendarView = "day" | "week";
type Staff = { id: string; name: string; avatar_url: string | null; active: boolean };
type Booking = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  source: string;
  staff_id: string | null;
  services: unknown;
};
type Block = { id: string; staff_id: string; starts_at: string; ends_at: string; reason: string };

// Minutes after local midnight.
function minutesOf(instant: string): number {
  const [h, m] = formatLocalTime(instant).split(":").map(Number);
  return h! * 60 + m!;
}

export function weekStart(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

const SHORT_DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric" });

type Placed<T> = T & { top: number; height: number; lane: number; lanes: number };

// Side by side when they overlap (a class, or a double-booked day), each
// cluster of overlapping items sharing its width.
function place<T extends { starts_at: string; ends_at: string }>(items: T[], startMin: number): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const out: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const c of cluster) c.lanes = lanes;
    out.push(...cluster);
    cluster = [];
    laneEnds.length = 0;
  };
  for (const item of sorted) {
    const s = minutesOf(item.starts_at);
    // A booking past midnight ends at the bottom of the day.
    const e = localDateISO(new Date(item.ends_at)) !== localDateISO(new Date(item.starts_at)) ? 24 * 60 : minutesOf(item.ends_at);
    if (s >= clusterEnd && cluster.length) flush();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = e;
    clusterEnd = Math.max(clusterEnd, e);
    cluster.push({
      ...item,
      top: ((s - startMin) / 60) * HOUR_PX,
      height: Math.max(((Math.max(e, s + 1) - s) / 60) * HOUR_PX, MIN_HEIGHT_PX),
      lane,
      lanes: 1,
    });
  }
  if (cluster.length) flush();
  return out;
}

const TONE: Record<string, string> = {
  confirmed: "bg-accent text-accent-foreground border-transparent",
  pending: "bg-tone-warn text-tone-warn-foreground border-dashed border-[color-mix(in_oklch,var(--warning),transparent_40%)]",
  completed: "bg-muted text-muted-foreground border-transparent",
  no_show: "bg-tone-bad text-tone-bad-foreground border-transparent",
};

export async function BookingsCalendar({
  supabase,
  tenantId,
  view,
  date,
  staff,
  staffFilter,
  hrefFor,
  listHref,
}: {
  supabase: SupabaseClient;
  tenantId: string;
  view: CalendarView;
  date: string;
  staff: Staff[];
  staffFilter: string | undefined;
  hrefFor: (view: CalendarView, date: string) => string;
  listHref: string;
}) {
  const days = view === "day" ? [date] : Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i));
  const from = localToUtcDate(days[0]!, "00:00").toISOString();
  const until = localToUtcDate(addDays(days.at(-1)!, 1), "00:00").toISOString();

  let bookingsQuery = supabase
    .from("bookings")
    .select("id, name, starts_at, ends_at, status, source, staff_id, services(name)")
    .eq("tenant_id", tenantId)
    .neq("status", "cancelled")
    .gte("starts_at", from)
    .lt("starts_at", until)
    .order("starts_at")
    .limit(1000);
  if (staffFilter === "none") bookingsQuery = bookingsQuery.is("staff_id", null);
  else if (staffFilter) bookingsQuery = bookingsQuery.eq("staff_id", staffFilter);
  let blocksQuery = supabase
    .from("time_off")
    .select("id, staff_id, starts_at, ends_at, reason")
    .eq("tenant_id", tenantId)
    .lt("starts_at", until)
    .gt("ends_at", from);
  if (staffFilter && staffFilter !== "none") blocksQuery = blocksQuery.eq("staff_id", staffFilter);
  const [{ data: bookingRows }, { data: blockRows }] = await Promise.all([
    bookingsQuery,
    staffFilter === "none" ? Promise.resolve({ data: [] as Block[] }) : blocksQuery,
  ]);
  const bookings = (bookingRows ?? []) as Booking[];
  const blocks = (blockRows ?? []) as Block[];
  const names = new Map(staff.map((p) => [p.id, p.name]));

  // Columns: staff for a day (plus "Not assigned" when needed), days for a week.
  type Column = { key: string; label: string; sub: string; avatar?: Staff; bookings: Booking[]; blocks: Block[]; day: string };
  let columns: Column[];
  if (view === "day") {
    // Inactive people only when they still have bookings that day.
    const shownStaff =
      staffFilter === "none"
        ? []
        : staff.filter((p) => (!staffFilter || p.id === staffFilter) && (p.active || bookings.some((b) => b.staff_id === p.id)));
    const unassigned = bookings.filter((b) => !b.staff_id || !names.has(b.staff_id));
    columns = shownStaff.map((p) => ({
      key: p.id,
      label: p.name,
      sub: "",
      avatar: p,
      bookings: bookings.filter((b) => b.staff_id === p.id),
      blocks: blocks.filter((t) => t.staff_id === p.id),
      day: date,
    }));
    if (unassigned.length || columns.length === 0) {
      columns.push({
        key: "none",
        label: staff.length ? "Not assigned" : "Bookings",
        sub: "",
        bookings: unassigned,
        blocks: [],
        day: date,
      });
    }
    for (const c of columns) c.sub = `${c.bookings.length} booking${c.bookings.length === 1 ? "" : "s"}`;
  } else {
    columns = days.map((d) => {
      const list = bookings.filter((b) => localDateISO(new Date(b.starts_at)) === d);
      return {
        key: d,
        label: SHORT_DAY.format(localToUtcDate(d, "12:00")),
        sub: `${list.length || "No"} booking${list.length === 1 ? "" : "s"}`,
        bookings: list,
        // Only one person's time off makes sense across a week.
        blocks: staffFilter ? blocks.filter((t) => localDateISO(new Date(t.starts_at)) <= d && localDateISO(new Date(t.ends_at)) >= d) : [],
        day: d,
      };
    });
  }

  // Hours shown: 08:00–18:00, stretched to fit anything earlier or later.
  const starts = bookings.map((b) => minutesOf(b.starts_at));
  const ends = bookings.map((b) =>
    localDateISO(new Date(b.ends_at)) !== localDateISO(new Date(b.starts_at)) ? 24 * 60 : minutesOf(b.ends_at),
  );
  const firstHour = Math.min(8, ...starts.map((m) => Math.floor(m / 60)));
  const lastHour = Math.max(18, ...ends.map((m) => Math.ceil(m / 60)));
  const startMin = firstHour * 60;
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const gridHeight = hours.length * HOUR_PX;

  const today = todayLocalISO();
  const nowMin = minutesOf(new Date().toISOString());
  const step = view === "day" ? 1 : 7;
  const title = view === "day" ? formatLocalDate(date) : `Week of ${formatLocalDate(days[0]!)}`;
  const minCol = view === "day" ? "minmax(170px,1fr)" : "minmax(120px,1fr)";

  // Clip a time-off block to the column's day.
  function clipToDay(t: Block, day: string): Block {
    const dayStart = localToUtcDate(day, "00:00").toISOString();
    const dayEnd = new Date(localToUtcDate(addDays(day, 1), "00:00").getTime() - 60_000).toISOString();
    return { ...t, starts_at: t.starts_at < dayStart ? dayStart : t.starts_at, ends_at: t.ends_at > dayEnd ? dayEnd : t.ends_at };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={hrefFor(view, addDays(date, -step))}
            aria-label={view === "day" ? "Previous day" : "Previous week"}
            className="flex size-9 items-center justify-center rounded-full border bg-card hover:bg-muted"
          >
            <ChevronLeftIcon className="size-4" />
          </Link>
          <h2 className="font-heading text-xl font-bold tracking-tight">{title}</h2>
          <Link
            href={hrefFor(view, addDays(date, step))}
            aria-label={view === "day" ? "Next day" : "Next week"}
            className="flex size-9 items-center justify-center rounded-full border bg-card hover:bg-muted"
          >
            <ChevronRightIcon className="size-4" />
          </Link>
          {!days.includes(today) && (
            <Link href={hrefFor(view, today)} className="rounded-full px-3 py-1.5 text-sm font-medium hover:bg-muted">
              Today
            </Link>
          )}
        </div>
        <ViewToggle current={view} hrefs={{ day: hrefFor("day", date), week: hrefFor("week", date), list: listHref }} />
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <div className="grid min-w-fit" style={{ gridTemplateColumns: `56px repeat(${columns.length}, ${minCol})` }}>
          {/* Column headers */}
          <div className="sticky left-0 z-20 border-b bg-card" />
          {columns.map((c) => (
            <div key={c.key} className={cn("flex items-center gap-2.5 border-b border-l px-3 py-2.5", c.day === today && view === "week" && "bg-accent/50")}>
              {c.avatar && <StaffAvatar name={c.avatar.name} url={c.avatar.avatar_url} className="size-8 text-xs" />}
              <div className="min-w-0">
                {view === "week" ? (
                  <Link href={hrefFor("day", c.day)} className="block truncate text-sm font-semibold hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <p className="truncate text-sm font-semibold">{c.label}</p>
                )}
                <p className="text-xs text-muted-foreground">{c.sub}</p>
              </div>
            </div>
          ))}

          {/* Hour labels */}
          <div className="sticky left-0 z-10 bg-card" style={{ height: gridHeight }}>
            {hours.map((h) => (
              <div key={h} className="relative border-t first:border-t-0" style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-2 bg-card px-0.5 text-[11px] text-muted-foreground tabular-nums">
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {/* Columns */}
          {columns.map((c) => (
            <div key={c.key} className="relative border-l" style={{ height: gridHeight }}>
              {hours.map((h) => (
                <div key={h} className="border-t first:border-t-0" style={{ height: HOUR_PX }} />
              ))}

              {place(c.blocks.map((t) => clipToDay(t, c.day)), startMin).map((t) => (
                <div
                  key={`off-${t.id}`}
                  className="absolute inset-x-1 overflow-hidden rounded-lg bg-[repeating-linear-gradient(135deg,var(--muted),var(--muted)_6px,transparent_6px,transparent_12px)] px-2 py-1 text-xs text-muted-foreground"
                  style={{ top: t.top, height: t.height }}
                >
                  <p className="font-medium">{t.reason || "Time off"}</p>
                </div>
              ))}

              {place(c.bookings, startMin).map((b) => {
                const service = (b.services as { name: string } | null)?.name ?? "Booking";
                const short = b.height < 44;
                return (
                  <Link
                    key={b.id}
                    href={`/dashboard/bookings/${b.id}`}
                    title={`${formatLocalTime(b.starts_at)}–${formatLocalTime(b.ends_at)} · ${b.name} · ${service} · ${STATUS_LABEL[b.status as BookingStatus] ?? b.status}`}
                    className={cn(
                      "absolute overflow-hidden rounded-lg border px-2 py-1 text-xs transition-shadow hover:z-10 hover:shadow-overlay focus-visible:z-10",
                      TONE[b.status] ?? TONE.confirmed,
                    )}
                    style={{
                      top: b.top,
                      height: b.height,
                      left: `calc(${(b.lane / b.lanes) * 100}% + 4px)`,
                      width: `calc(${100 / b.lanes}% - 8px)`,
                    }}
                  >
                    <p className={cn("flex items-center justify-between gap-1 font-semibold tabular-nums", short && "truncate")}>
                      <span className="truncate">
                        {formatLocalTime(b.starts_at)}
                        {!short && `–${formatLocalTime(b.ends_at)}`}
                        {short && ` ${b.name}`}
                      </span>
                      {b.source !== "team" && !short && <span className="shrink-0 font-medium opacity-70">AI</span>}
                    </p>
                    {!short && (
                      <>
                        <p className="truncate text-[13px] font-semibold">{b.name}</p>
                        <p className="truncate opacity-80">
                          {service}
                          {view === "week" && b.staff_id && names.get(b.staff_id) ? ` · ${names.get(b.staff_id)}` : ""}
                        </p>
                      </>
                    )}
                  </Link>
                );
              })}

              {c.day === today && nowMin >= startMin && nowMin <= lastHour * 60 && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-[5] border-t-2 border-destructive"
                  style={{ top: ((nowMin - startMin) / 60) * HOUR_PX }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-accent" /> Confirmed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-tone-warn" /> To approve
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-muted" /> Attended
        </span>
        <span>&ldquo;AI&rdquo; = booked by the AI or online · red line = now</span>
      </p>
    </div>
  );
}

// Day / Week / List, shared with the day list (day-view.tsx).
export function ViewToggle({ current, hrefs }: { current: CalendarView | "list"; hrefs: Record<CalendarView | "list", string> }) {
  return (
    <div className="flex rounded-full bg-muted p-1 text-sm" role="group" aria-label="Calendar view">
      {(["day", "week", "list"] as const).map((v) => (
        <Link
          key={v}
          href={hrefs[v]}
          aria-current={current === v ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-1.5 font-medium capitalize",
            current === v ? "bg-card text-foreground shadow-raised" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v}
        </Link>
      ))}
    </div>
  );
}
