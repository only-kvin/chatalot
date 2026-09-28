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
