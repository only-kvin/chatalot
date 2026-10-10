import { addDays, weekdayOf } from "../../lib/time";

// Calendar maths for the schedule widget, on SA "YYYY-MM-DD" dates (no
// Date-object arithmetic, so the visitor's own time zone never matters).
// Pure, so tests cover it.

// end: arrival windows only, when the window closes.
export type Slot = { time: string; end?: string; available: boolean };

// The Monday on or before a date.
export function weekStart(dateISO: string): string {
  return addDays(dateISO, -((weekdayOf(dateISO) + 6) % 7));
}

export function weekDays(mondayISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayISO, i));
}

// Six Monday-first weeks covering the month of `dateISO`.
export function monthGrid(dateISO: string): string[] {
  const first = `${dateISO.slice(0, 7)}-01`;
  return Array.from({ length: 42 }, (_, i) => addDays(weekStart(first), i));
}

export function addMonths(dateISO: string, months: number): string {
  const [y, m] = dateISO.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

export type SlotGroup = { label: "Morning" | "Afternoon" | "Evening"; slots: Slot[] };

export function groupSlots(slots: Slot[]): SlotGroup[] {
  const groups: SlotGroup[] = [
    { label: "Morning", slots: [] },
    { label: "Afternoon", slots: [] },
    { label: "Evening", slots: [] },
  ];
  for (const s of slots) groups[s.time < "12:00" ? 0 : s.time < "17:00" ? 1 : 2].slots.push(s);
  return groups.filter((g) => g.slots.length > 0);
}

// The free times closest to one that was just taken, earliest first.
export function nearestAvailable(slots: Slot[], time: string, count = 3): string[] {
  const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return slots
    .filter((s) => s.available && s.time !== time)
    .sort((a, b) => Math.abs(minutes(a.time) - minutes(time)) - Math.abs(minutes(b.time) - minutes(time)))
    .slice(0, count)
    .map((s) => s.time)
    .sort();
}

const DAY_SHORT = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" });
const DAY_LONG = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const MONTH = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });

// Date-only strings are formatted as UTC midnight so no zone shifts the day.
const utc = (dateISO: string) => new Date(`${dateISO}T00:00:00Z`);
export const dayShort = (d: string) => DAY_SHORT.format(utc(d));
export const dayLong = (d: string) => DAY_LONG.format(utc(d));
export const monthLabel = (d: string) => MONTH.format(utc(d));
export const dayNumber = (d: string) => String(Number(d.slice(8, 10)));
