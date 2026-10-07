import { addDays, formatLocalTime, localToUtcDate } from "@/lib/time";

// Checks for the hours and time off owners enter in the dashboard. Pure, so
// the server actions and tests share them. Times are SA "HH:MM".

export type HoursWindow = { weekday: number; start_time: string; end_time: string };

const hhmm = (t: string) => t.slice(0, 5);

// An error message for a new weekly window, or null if it's fine. Windows on
// the same day may not overlap (a break is two windows with a gap).
export function checkNewWindow(existing: HoursWindow[], w: HoursWindow): string | null {
  if (hhmm(w.start_time) >= hhmm(w.end_time)) return "The start time must be before the end time.";
  const clash = existing.find(
    (e) => e.weekday === w.weekday && hhmm(e.start_time) < hhmm(w.end_time) && hhmm(e.end_time) > hhmm(w.start_time),
  );
  return clash ? `That overlaps ${hhmm(clash.start_time)}–${hhmm(clash.end_time)} on the same day.` : null;
}

export type TimeOffInput = {
  fromDate: string;
  // Inclusive; same as fromDate for a single day.
  toDate: string;
  // Part of a day: both times set, fromDate only.
  fromTime: string | null;
  toTime: string | null;
};

// The UTC range a time-off entry covers: whole days run SA midnight to
// midnight; a part-day is its two times on fromDate.
export function timeOffRange(t: TimeOffInput): { startsAt: string; endsAt: string } | { error: string } {
  if (t.toDate < t.fromDate) return { error: "The last day can't be before the first day." };
  if (t.fromTime || t.toTime) {
    if (!t.fromTime || !t.toTime) return { error: "Give both a from and a to time, or leave both empty for whole days." };
    if (t.toDate !== t.fromDate) return { error: "Part-day time off has to be on a single day." };
    if (t.fromTime >= t.toTime) return { error: "The from time must be before the to time." };
    return {
      startsAt: localToUtcDate(t.fromDate, t.fromTime).toISOString(),
      endsAt: localToUtcDate(t.fromDate, t.toTime).toISOString(),
    };
  }
  return {
    startsAt: localToUtcDate(t.fromDate, "00:00").toISOString(),
    endsAt: localToUtcDate(addDays(t.toDate, 1), "00:00").toISOString(),
  };
}

// "Mon 6 Oct", "Mon 6 Oct – Wed 8 Oct" or "Mon 6 Oct, 13:00–17:00", in SA time.
const SHORT_DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Johannesburg",
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function describeTimeOff(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const wholeDays = formatLocalTime(start) === "00:00" && formatLocalTime(end) === "00:00";
  if (!wholeDays) return `${SHORT_DAY.format(start)}, ${formatLocalTime(start)}–${formatLocalTime(end)}`;
  // Whole days end at midnight after the last day.
  const lastDay = new Date(end.getTime() - 1);
  const first = SHORT_DAY.format(start);
  const last = SHORT_DAY.format(lastDay);
  return first === last ? first : `${first} – ${last}`;
}
