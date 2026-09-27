import type { SupabaseClient } from "@supabase/supabase-js";

// Every tenant is a South African business, so tenant-local time is hardcoded
// to Africa/Johannesburg (UTC+2, year-round — no DST) rather than stored
// per-tenant. If ChatAlot ever serves a tenant outside SA, this becomes a
// per-tenant column and every call site below needs the tenant's offset.
const TENANT_TZ_OFFSET = "+02:00";
const SLOT_GRANULARITY_MINUTES = 15;
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHMM(mins: number): string {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// A calendar date's day-of-week doesn't depend on timezone, so this is safe
// to compute directly from the date components (no offset conversion needed).
export function weekdayOf(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// The local calendar date (Africa/Johannesburg) that a given instant falls on.
export function localDateISO(date: Date): string {
  return new Date(date.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Converts a local date + "HH:MM" into the UTC instant it represents.
export function localToUtcDate(dateISO: string, hhmm: string): Date {
  return new Date(`${dateISO}T${hhmm}:00${TENANT_TZ_OFFSET}`);
}

// Local (SA) midnight at the start of the day that `date` falls on, as a UTC instant.
export function startOfLocalDay(date: Date): Date {
  return localToUtcDate(localDateISO(date), "00:00");
}

export function todayLocalISO(): string {
  return localDateISO(new Date());
}

// "2026-09-24 (Thursday)" — fed into the agent's system prompt so it can
// resolve relative dates like "tomorrow" or "Friday".
export function todayLocalLabel(): string {
  const dateISO = todayLocalISO();
  return `${dateISO} (${WEEKDAY_NAMES[weekdayOf(dateISO)]})`;
}

export type AvailabilityWindow = { start_time: string; end_time: string };
export type AvailabilityExceptionRow = {
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
};
export type ExistingBookingRow = { starts_at: string; ends_at: string };

// Pure slot computation — no DB access, so it's directly unit-testable.
// Returns available local start times ("HH:MM") on `dateISO` for a service of
// `durationMinutes`, at 15-minute granularity, excluding anything that
// overlaps an existing booking, doesn't fit before the window closes, or has
// already passed (relative to `now`).
export function computeOpenSlots(params: {
  dateISO: string;
  rules: AvailabilityWindow[];
  exception: AvailabilityExceptionRow | null;
  existingBookings: ExistingBookingRow[];
  durationMinutes: number;
  now?: Date;
}): string[] {
  const { dateISO, rules, exception, existingBookings, durationMinutes } = params;
  const now = params.now ?? new Date();

  let windows: AvailabilityWindow[];
  if (exception) {
    if (exception.is_closed) return [];
    windows =
      exception.start_time && exception.end_time
        ? [{ start_time: exception.start_time, end_time: exception.end_time }]
        : rules;
  } else {
    windows = rules;
  }

  const bookingRanges = existingBookings.map((b) => ({
    start: new Date(b.starts_at).getTime(),
    end: new Date(b.ends_at).getTime(),
  }));

  const slots: string[] = [];
  for (const window of windows) {
    const windowStartMin = timeToMinutes(window.start_time);
    const windowEndMin = timeToMinutes(window.end_time);

    for (
      let startMin = windowStartMin;
      startMin + durationMinutes <= windowEndMin;
      startMin += SLOT_GRANULARITY_MINUTES
    ) {
      const hhmm = minutesToHHMM(startMin);
      const slotStart = localToUtcDate(dateISO, hhmm).getTime();
      const slotEnd = slotStart + durationMinutes * 60_000;

      if (slotStart < now.getTime()) continue;
      const overlapsBooking = bookingRanges.some(
        (b) => slotStart < b.end && slotEnd > b.start,
      );
      if (overlapsBooking) continue;

      slots.push(hhmm);
    }
  }

  return [...new Set(slots)].sort();
}

export async function getOpenSlots(
  supabase: SupabaseClient,
  tenantId: string,
  serviceId: string,
  dateISO: string,
): Promise<{ durationMinutes: number; slots: string[] } | null> {
  const { data: service } = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("tenant_id", tenantId)
    .eq("id", serviceId)
    .eq("active", true)
    .maybeSingle();
  if (!service) return null;

  const weekday = weekdayOf(dateISO);
  const dayStart = localToUtcDate(dateISO, "00:00").toISOString();
  const dayEnd = localToUtcDate(addDays(dateISO, 1), "00:00").toISOString();

  const [{ data: rules }, { data: exception }, { data: bookings }] = await Promise.all([
    supabase
      .from("availability_rules")
      .select("start_time, end_time")
      .eq("tenant_id", tenantId)
      .eq("weekday", weekday),
    supabase
      .from("availability_exceptions")
      .select("is_closed, start_time, end_time")
      .eq("tenant_id", tenantId)
      .eq("date", dateISO)
      .maybeSingle(),
    // Bookings that start on this local day. A booking starting just before
    // local midnight and running past it wouldn't be caught here — acceptable
    // for service-length appointments, not worth the added complexity.
    supabase
      .from("bookings")
      .select("starts_at, ends_at")
      .eq("tenant_id", tenantId)
      .neq("status", "cancelled")
      .gte("starts_at", dayStart)
      .lt("starts_at", dayEnd),
  ]);

  const slots = computeOpenSlots({
    dateISO,
    rules: rules ?? [],
    exception: exception ?? null,
    existingBookings: bookings ?? [],
    durationMinutes: service.duration_minutes,
  });

  return { durationMinutes: service.duration_minutes, slots };
}

function normalizeServiceName(s: string): string {
  return s.toLowerCase().replace(/[‘’`]/g, "'").replace(/\s+/g, " ").trim();
}

// Picks the service the model named, or null if it's unknown or ambiguous (the
// caller then lists the real names). An exact name wins; otherwise the query
// must appear as whole words in exactly one service — a plain substring match
// once booked "Men's Cut" as "Women's Cut & Blow-dry".
export function matchService<T extends { name: string }>(services: T[], query: string): T | null {
  const q = normalizeServiceName(query);
  if (!q) return null;

  const exact = services.filter((s) => normalizeServiceName(s.name) === q);
  if (exact.length === 1) return exact[0];

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wholeWords = new RegExp(`(^|[^a-z0-9'])${escaped}($|[^a-z0-9'])`);
  const partial = services.filter((s) => wholeWords.test(normalizeServiceName(s.name)));
  return partial.length === 1 ? partial[0] : null;
}

export async function listActiveServices(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ id: string; name: string; duration_minutes: number }[]> {
  const { data } = await supabase
    .from("services")
    .select("id, name, duration_minutes")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("name");
  return data ?? [];
}

export async function findServiceByName(
  supabase: SupabaseClient,
  tenantId: string,
  name: string,
): Promise<{ id: string; name: string; duration_minutes: number } | null> {
  return matchService(await listActiveServices(supabase, tenantId), name);
}

export async function listActiveServiceNames(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("services")
    .select("name")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  return (data ?? []).map((s) => s.name);
}
