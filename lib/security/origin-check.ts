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

// A request made by ChatAlot's own pages (the dashboard's widget previews).
// Browsers omit Origin on same-origin GETs but always send Sec-Fetch-Site,
// which page scripts can't set; POSTs carry our own origin. Nothing here is
// a credential — non-browser clients can send any header — it only decides
// which websites may embed a business's widgets.
export function isOwnAppRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "same-origin") return true;
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}
