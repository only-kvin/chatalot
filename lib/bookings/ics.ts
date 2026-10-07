// An iCalendar (.ics) file for one appointment, for "add to calendar" in
// emails. The widget builds the same thing in the browser
// (widget/shared/ics.ts) so it needs no server round trip.

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Commas, semicolons, backslashes and newlines are special in iCalendar text.
function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Lines over 75 octets must be folded (continuation lines start with a space).
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  parts.push(rest);
  return parts.join("\r\n");
}

export function bookingIcs(b: {
  uid: string;
  title: string;
  startsAt: string;
  endsAt: string;
  description?: string;
  location?: string;
  now?: Date;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ChatAlot//Bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.uid}@chatalot`,
    `DTSTAMP:${stamp(b.now ?? new Date())}`,
    `DTSTART:${stamp(new Date(b.startsAt))}`,
    `DTEND:${stamp(new Date(b.endsAt))}`,
    `SUMMARY:${escapeText(b.title)}`,
    ...(b.description ? [`DESCRIPTION:${escapeText(b.description)}`] : []),
    ...(b.location ? [`LOCATION:${escapeText(b.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
