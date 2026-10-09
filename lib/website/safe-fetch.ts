import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import zlib from "node:zlib";

// Server-side fetching of URLs a business controls, guarded against SSRF:
// only http(s) on ports 80/443; every address the hostname resolves to is
// checked, and the connection goes to that checked address (so a DNS answer
// can't change between the check and the connect); private, loopback,
// link-local, metadata and other special ranges are refused; redirects are
// followed by hand, at most 5, each one checked again. Responses are capped
// in time and size.

export class BlockedUrlError extends Error {}

const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. broadcast
] as const) {
  BLOCKED.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
  ["2001:db8::", 32], // documentation
  ["64:ff9b::", 96], // NAT64 (wraps an IPv4 address)
  ["100::", 64], // discard
] as const) {
  BLOCKED.addSubnet(net, prefix, "ipv6");
}

export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return BLOCKED.check(ip, "ipv4");
  if (family === 6) {
    // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is judged as IPv4.
    const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return BLOCKED.check(mapped[1], "ipv4");
    return BLOCKED.check(ip, "ipv6");
  }
  return true;
}

// Scheme and port rules, before anything touches the network.
export function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedUrlError("Only http and https URLs");
  if (url.port && url.port !== "80" && url.port !== "443") throw new BlockedUrlError("Only ports 80 and 443");
  if (url.username || url.password) throw new BlockedUrlError("URLs with credentials aren't allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) throw new BlockedUrlError("Local addresses aren't allowed");
  if (isIP(host) && isBlockedIp(host)) throw new BlockedUrlError("That address isn't allowed");
  return url;
}

// The DNS step: every answer must be public, and the connection uses one of them.
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true, family: options.family }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = addresses as { address: string; family: number }[];
    if (!list.length) return callback(new Error(`No addresses for ${hostname}`), "", 4);
    const bad = list.find((a) => isBlockedIp(a.address));
    if (bad) return callback(new BlockedUrlError(`${hostname} resolves to a blocked address`), "", 4);
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

export type SafeResponse = {
  url: string; // after redirects
  status: number;
  contentType: string;
  body: string;
};

export type SafeFetchOptions = {
  userAgent: string;
  accept?: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

type RawResponse = { status: number; contentType: string; location: string | null; body: string };
// One HTTP request without following redirects. Swappable in tests.
export type Transport = (url: URL, opts: SafeFetchOptions, timeoutMs: number, maxBytes: number) => Promise<RawResponse>;

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions, transport: Transport = requestOnce): Promise<SafeResponse> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const maxRedirects = opts.maxRedirects ?? 5;
  const deadline = Date.now() + timeoutMs;

  let url = checkUrl(rawUrl);
  for (let hop = 0; ; hop++) {
    const res = await transport(url, opts, Math.max(1, deadline - Date.now()), maxBytes);
    if (res.status >= 300 && res.status < 400 && res.location) {
      if (hop >= maxRedirects) throw new BlockedUrlError("Too many redirects");
      url = checkUrl(new URL(res.location, url).toString());
      continue;
    }
    return { url: url.toString(), status: res.status, contentType: res.contentType, body: res.body };
  }
}

function requestOnce(url: URL, opts: SafeFetchOptions, timeoutMs: number, maxBytes: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup,
        headers: {
          "User-Agent": opts.userAgent,
          Accept: opts.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
        },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "");
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, contentType, location, body: "" });
        }

        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream =
          encoding === "gzip" ? res.pipe(zlib.createGunzip())
          : encoding === "deflate" ? res.pipe(zlib.createInflate())
          : encoding === "br" ? res.pipe(zlib.createBrotliDecompress())
          : res;

        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy(new Error("Page is larger than the size limit"));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => resolve({ status, contentType, location, body: decode(Buffer.concat(chunks), contentType) }));
        stream.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Timed out")));
    req.on("error", reject);
    req.end();
  });
}

function decode(buf: Buffer, contentType: string): string {
  const charset = contentType.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
  try {
    return new TextDecoder(charset || "utf-8").decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}
