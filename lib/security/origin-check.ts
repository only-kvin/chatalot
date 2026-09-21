export function isOriginAllowed(origin: string | null, allowedDomains: string[]): boolean {
  // Same-origin fetches often omit the Origin header entirely (browser
  // behaviour, not a bug) — in dev this is exactly what happens when
  // widget-demo.html is served from this same Next.js app, so allow it there.
  // In production a missing Origin is always rejected.
  if (!origin) return process.env.NODE_ENV !== "production";

  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  if (process.env.NODE_ENV !== "production" && (hostname === "localhost" || hostname === "127.0.0.1")) {
    return true;
  }

  return allowedDomains.includes(hostname);
}
