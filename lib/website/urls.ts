// Which URLs the crawler may visit: the business's own site, real pages
// only, one entry per page.

export const MAX_PAGES = 50;
export const MAX_DEPTH = 3;

// Login, account, cart, checkout and admin areas, and similar.
const SKIP_PATH = /\/(wp-admin|wp-login|wp-json|admin|administrator|login|log-in|signin|sign-in|signup|sign-up|register|logout|log-out|account|my-account|cart|basket|checkout|feed)(\/|\.|$)/i;
const NOT_HTML = /\.(pdf|jpe?g|png|gif|webp|svg|ico|mp4|mov|mp3|wav|zip|rar|gz|docx?|xlsx?|pptx?|css|js|json|xml|txt|csv|woff2?|ttf)$/i;

// The site's host and its www/non-www twin, when the business listed both.
export function siteHosts(startHost: string, allowedDomains: string[]): Set<string> {
  const host = startHost.toLowerCase();
  const twin = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  const hosts = new Set([host]);
  if (allowedDomains.map((d) => d.toLowerCase()).includes(twin)) hosts.add(twin);
  return hosts;
}

// One canonical form per page: no fragment, no query string (those are
// usually the same page), no trailing slash except the root.
export function normalizeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  url.search = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

// Whether a (normalized) URL is a page of this site worth reading.
export function isCrawlable(url: string, hosts: Set<string>): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!hosts.has(parsed.hostname.toLowerCase())) return false;
  if (SKIP_PATH.test(parsed.pathname)) return false;
  if (NOT_HTML.test(parsed.pathname)) return false;
  return true;
}

// The hosts a business may import from: its allowed domains, minus local
// names and IP addresses.
export function importableHosts(allowedDomains: string[]): string[] {
  return allowedDomains
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d && d !== "localhost" && !d.endsWith(".localhost") && !/^[\d.]+$/.test(d) && !d.includes(":"));
}
