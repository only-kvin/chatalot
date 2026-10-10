import { formatLocalDateTime, formatLocalTime } from "@/lib/time";

// "Friday 2 October at 10:00", or for an arrival window "Friday 2 October,
// between 08:00 and 10:00". Used wherever a booking's time is written out
// (AI tool results, emails, reminders, pages), so a window always reads as
// one. Also fits the {{3}} variable of the booking_reminder template
// ("… your Call-out on {{3}}").
export function formatBookingWhen(startsAt: string, windowEnd?: string | null): string {
  if (!windowEnd) return formatLocalDateTime(startsAt);
  const day = formatLocalDateTime(startsAt).replace(/ at \d{2}:\d{2}$/, "");
  return `${day}, between ${formatLocalTime(startsAt)} and ${formatLocalTime(windowEnd)}`;
}
