// Dashboard timestamps, always in SA time. Pages render on the server (UTC on
// Vercel), so a plain toLocaleString() shows times two hours off — and in
// client components it can differ between the server and browser renders.
// A fixed time zone gives the same text everywhere. Safe in client code.

const SHORT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Johannesburg",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// "28 Sept, 02:19"
export function formatShortLocal(instant: string | Date): string {
  return SHORT.format(new Date(instant));
}

// ---------------------------------------------------------------------------
// SA calendar dates and instants.
// ---------------------------------------------------------------------------

// Every tenant is a South African business, so tenant-local time is hardcoded
// to Africa/Johannesburg (UTC+2, year-round — no DST) rather than stored
// per-tenant. If ChatAlot ever serves a tenant outside SA, this becomes a
// per-tenant column and every call site below needs the tenant's offset.
const TENANT_TZ_OFFSET = "+02:00";
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// A calendar date's day-of-week doesn't depend on timezone, so this is safe
// to compute directly from the date components (no offset conversion needed).
export function weekdayOf(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// YYYY-MM-DD plus `days` calendar days.
export function addDays(dateISO: string, days: number): string {
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

const LOCAL_DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Johannesburg",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const LOCAL_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Johannesburg",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// "14:30" in SA time.
export function formatLocalTime(instant: string | Date): string {
  return LOCAL_TIME.format(new Date(instant));
}

// "Friday 2 October at 10:00" in SA time. Tool results use this wording so
// the model repeats it verbatim instead of reinterpreting "2026-10-02".
export function formatLocalDateTime(instant: string | Date): string {
  const d = new Date(instant);
  return `${LOCAL_DAY.format(d)} at ${LOCAL_TIME.format(d)}`;
}

// "Friday 2 October" for a YYYY-MM-DD local date (noon avoids any DST edge).
export function formatLocalDate(dateISO: string): string {
  return LOCAL_DAY.format(localToUtcDate(dateISO, "12:00"));
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
