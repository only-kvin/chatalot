export function isOriginAllowed(origin: string | null, allowedDomains: string[]): boolean {
  if (!origin) return false;

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
