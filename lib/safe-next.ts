// Where to send someone after sign-in. `next` travels through the login URL
// and the magic-link email, so it's untrusted: only same-site paths are
// allowed — never "//evil.com", "/\evil.com" or "https://…", which browsers
// would treat as another site.
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
