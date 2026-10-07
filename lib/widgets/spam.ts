// Cheap bot checks for public widget forms. A hidden "website" field that
// people never see (bots fill every field), and a minimum time between the
// form appearing and being sent — nobody books in under three seconds.
// Not a wall: rate limits and server-side validation back them up.

export const MIN_FILL_MS = 3000;

export function looksLikeBot(s: { honeypot?: string; elapsedMs: number }): boolean {
  return Boolean(s.honeypot?.trim()) || s.elapsedMs < MIN_FILL_MS;
}
