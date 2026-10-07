import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, localDateISO, localToUtcDate, weekdayOf } from "@/lib/time";

// When a service can be booked. The one place that decides it: the AI's
// check_availability, the booking widgets, the dashboard and rescheduling
// all ask here, so they can never disagree about whether 14:00 is free.
//
// Each staff member is a calendar with their own hours, time off and
// capacity; a business without staff is a single calendar. The database
// functions create_booking()/reschedule_booking() re-check capacity under a
// lock when the booking is actually made.

export type TimeWindow = { start_time: string; end_time: string };
export type DayException = { is_closed: boolean; start_time: string | null; end_time: string | null };
type Range = { start: number; end: number };

export type BookingRules = {
  // Minimum notice for a new booking.
  leadMinutes: number;
  // How many days ahead can be booked (today = day 0).
  horizonDays: number;
  // Start times are offered every this many minutes from opening.
  slotMinutes: number;
};

export type CalendarDay = {
  // null = the business's single calendar (no staff).
  staffId: string | null;
  capacity: number;
  // Weekly hours for this weekday.
  windows: TimeWindow[];
  // True when these are the staff member's own hours rather than the
  // business's; a special-hours day then narrows them instead of replacing them.
  ownHours: boolean;
  timeOff: Range[];
  // Blocked time (appointment + buffers) of bookings counting against this
  // calendar.
  bookings: Range[];
  // Bookings this calendar has today — "any available" goes to the least busy.
  bookedToday: number;
};

export type Slot = {
  time: string;
  // Calendars free at this time, best first. Empty = fully booked, shown
  // disabled so the customer can see the day is busy.
  staffIds: (string | null)[];
};

export type ServiceTiming = { durationMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number };

const MINUTE_MS = 60_000;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHMM(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

// The windows a calendar actually works on the day, after a special-hours
// exception: it replaces the business's hours, and narrows a staff member's own.
function effectiveWindows(cal: CalendarDay, exception: DayException | null): Range[] {
  const weekly = cal.windows.map((w) => ({ start: timeToMinutes(w.start_time), end: timeToMinutes(w.end_time) }));
  if (!exception?.start_time || !exception.end_time) return weekly;
  const special = { start: timeToMinutes(exception.start_time), end: timeToMinutes(exception.end_time) };
  if (!cal.ownHours) return [special];
  return weekly
    .map((w) => ({ start: Math.max(w.start, special.start), end: Math.min(w.end, special.end) }))
    .filter((w) => w.start < w.end);
}

const overlaps = (a: Range, b: Range) => a.start < b.end && a.end > b.start;

// Pure: every start time on `dateISO` that falls in someone's working hours,
// with the calendars free to take it. Times before the minimum notice or
// beyond the horizon aren't returned at all.
export function computeSlots(p: {
  dateISO: string;
  now: Date;
  rules: BookingRules;
  service: ServiceTiming;
  exception: DayException | null;
  calendars: CalendarDay[];
}): Slot[] {
  const today = localDateISO(p.now);
  if (p.dateISO < today || p.dateISO > addDays(today, p.rules.horizonDays)) return [];
  if (p.exception?.is_closed) return [];

  const earliest = p.now.getTime() + p.rules.leadMinutes * MINUTE_MS;
  const { durationMinutes, bufferBeforeMinutes, bufferAfterMinutes } = p.service;
  const working = p.calendars.map((cal) => ({ cal, windows: effectiveWindows(cal, p.exception) }));

  const times = new Set<number>();
  for (const { windows } of working) {
    for (const w of windows) {
      for (let m = w.start; m + durationMinutes <= w.end; m += p.rules.slotMinutes) times.add(m);
    }
  }

  const slots: Slot[] = [];
  for (const minutes of [...times].sort((a, b) => a - b)) {
    const time = minutesToHHMM(minutes);
    const start = localToUtcDate(p.dateISO, time).getTime();
    if (start < earliest) continue;
    const appointment = { start, end: start + durationMinutes * MINUTE_MS };
    const blocked = {
      start: appointment.start - bufferBeforeMinutes * MINUTE_MS,
      end: appointment.end + bufferAfterMinutes * MINUTE_MS,
    };

    const free = working
      .filter(({ cal, windows }) => {
        const inHours = windows.some((w) => minutes >= w.start && minutes + durationMinutes <= w.end);
        if (!inHours || cal.timeOff.some((t) => overlaps(t, appointment))) return false;
        return cal.bookings.filter((b) => overlaps(b, blocked)).length < cal.capacity;
      })
      .map(({ cal }) => cal);
    // Stable sort keeps the staff's display order between equally busy people.
    free.sort((a, b) => a.bookedToday - b.bookedToday);
    slots.push({ time, staffIds: free.map((c) => c.staffId) });
  }
  return slots;
}

// ---------------------------------------------------------------------------
// Loading from the database.
// ---------------------------------------------------------------------------

export type AvailabilityQuery = {
  serviceId: string;
  // A specific staff member; omitted = anyone who offers the service.
  staffId?: string | null;
  fromDate: string;
  toDate: string;
  // When rescheduling: ignore the booking being moved, so its own current
  // time doesn't block the slots around it.
  excludeBookingId?: string;
  // The team can book at short notice and beyond the horizon customers get.
  forTeam?: boolean;
  now?: Date;
};

export type Availability = {
  service: { id: string; name: string } & ServiceTiming;
  days: { date: string; slots: Slot[] }[];
};

// Longest range one call may ask for (a month view plus a bit).
export const MAX_RANGE_DAYS = 42;

export async function getAvailability(
  client: SupabaseClient,
  tenantId: string,
  q: AvailabilityQuery,
): Promise<Availability | null> {
  const now = q.now ?? new Date();
  const dates: string[] = [];
  for (let d = q.fromDate; d <= q.toDate && dates.length < MAX_RANGE_DAYS; d = addDays(d, 1)) dates.push(d);
  if (!dates.length) return null;

  // Bookings can straddle midnight, so look a day either side.
  const rangeStart = localToUtcDate(addDays(dates[0], -1), "00:00").toISOString();
  const rangeEnd = localToUtcDate(addDays(dates[dates.length - 1], 2), "00:00").toISOString();

  const [serviceRes, configRes, staffRes, staffServicesRes, rulesRes, exceptionsRes, timeOffRes, bookingsRes] =
    await Promise.all([
      client
        .from("services")
        .select("id, name, duration_minutes, buffer_before_min, buffer_after_min")
        .eq("tenant_id", tenantId)
        .eq("id", q.serviceId)
        .eq("active", true)
        .maybeSingle(),
      client
        .from("agent_configs")
        .select("booking_lead_time_minutes, booking_horizon_days, slot_minutes")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      client
        .from("staff")
        .select("id, max_concurrent")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      client.from("staff_services").select("staff_id").eq("tenant_id", tenantId).eq("service_id", q.serviceId),
      client.from("availability_rules").select("staff_id, weekday, start_time, end_time").eq("tenant_id", tenantId),
      client
        .from("availability_exceptions")
        .select("date, is_closed, start_time, end_time")
        .eq("tenant_id", tenantId)
        .gte("date", dates[0])
        .lte("date", dates[dates.length - 1]),
      client
        .from("time_off")
        .select("staff_id, starts_at, ends_at")
        .eq("tenant_id", tenantId)
        .lt("starts_at", rangeEnd)
        .gt("ends_at", rangeStart),
      (q.excludeBookingId
        ? client.from("bookings").select("staff_id, starts_at, block_start, block_end").neq("id", q.excludeBookingId)
        : client.from("bookings").select("staff_id, starts_at, block_start, block_end")
      )
        .eq("tenant_id", tenantId)
        .neq("status", "cancelled")
        .lt("block_start", rangeEnd)
        .gt("block_end", rangeStart),
    ]);
  for (const r of [serviceRes, configRes, staffRes, staffServicesRes, rulesRes, exceptionsRes, timeOffRes, bookingsRes]) {
    if (r.error) throw r.error;
  }
  const service = serviceRes.data;
  if (!service) return null;

  const config = configRes.data;
  const rules: BookingRules = q.forTeam
    ? { leadMinutes: 0, horizonDays: 3650, slotMinutes: config?.slot_minutes ?? 15 }
    : {
        leadMinutes: config?.booking_lead_time_minutes ?? 60,
        horizonDays: config?.booking_horizon_days ?? 60,
        slotMinutes: config?.slot_minutes ?? 15,
      };

  // Who can take this service: the staff linked to it, or every active
  // staff member when none are linked. No staff at all = one calendar.
  const activeStaff = staffRes.data ?? [];
  const linked = new Set((staffServicesRes.data ?? []).map((s) => s.staff_id));
  let staff: { id: string | null; capacity: number }[] =
    activeStaff.length === 0
      ? [{ id: null, capacity: 1 }]
      : activeStaff.filter((s) => linked.size === 0 || linked.has(s.id)).map((s) => ({ id: s.id, capacity: s.max_concurrent }));
  if (q.staffId) staff = staff.filter((s) => s.id === q.staffId);

  const allRules = rulesRes.data ?? [];
  const hasOwnHours = new Set(allRules.filter((r) => r.staff_id).map((r) => r.staff_id));
  const exceptions = new Map((exceptionsRes.data ?? []).map((e) => [e.date, e]));
  const toRange = (s: string, e: string) => ({ start: new Date(s).getTime(), end: new Date(e).getTime() });
  const bookings = bookingsRes.data ?? [];
  const timing: ServiceTiming = {
    durationMinutes: service.duration_minutes,
    bufferBeforeMinutes: service.buffer_before_min,
    bufferAfterMinutes: service.buffer_after_min,
  };

  const days = dates.map((date) => {
    const weekday = weekdayOf(date);
    const calendars: CalendarDay[] = staff.map((s) => {
      const own = s.id !== null && hasOwnHours.has(s.id);
      // Bookings with no staff member count against everyone (they predate
      // the business adding staff); see private.overlapping_bookings().
      const mine = bookings.filter((b) => s.id === null || b.staff_id === null || b.staff_id === s.id);
      return {
        staffId: s.id,
        capacity: s.capacity,
        windows: allRules.filter((r) => r.weekday === weekday && r.staff_id === (own ? s.id : null)),
        ownHours: own,
        timeOff: (timeOffRes.data ?? []).filter((t) => t.staff_id === s.id).map((t) => toRange(t.starts_at, t.ends_at)),
        bookings: mine.map((b) => toRange(b.block_start, b.block_end)),
        bookedToday: mine.filter((b) => localDateISO(new Date(b.starts_at)) === date).length,
      };
    });
    return {
      date,
      slots: computeSlots({ dateISO: date, now, rules, service: timing, exception: exceptions.get(date) ?? null, calendars }),
    };
  });

  return { service: { id: service.id, name: service.name, ...timing }, days };
}

// The bookable start times on one day, with anyone free — what the AI offers.
export async function getOpenSlots(
  client: SupabaseClient,
  tenantId: string,
  serviceId: string,
  dateISO: string,
  options: { excludeBookingId?: string; forTeam?: boolean } = {},
): Promise<{ durationMinutes: number; slots: string[] } | null> {
  const availability = await getAvailability(client, tenantId, {
    serviceId,
    fromDate: dateISO,
    toDate: dateISO,
    ...options,
  });
  if (!availability) return null;
  return {
    durationMinutes: availability.service.durationMinutes,
    slots: availability.days[0].slots.filter((s) => s.staffIds.length > 0).map((s) => s.time),
  };
}
