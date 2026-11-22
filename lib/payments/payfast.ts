import { createHash, timingSafeEqual } from "node:crypto";
import { promises as dns } from "node:dns";
import type {
  Checkout,
  CheckoutRequest,
  NotificationFailure,
  PaymentAccountSecrets,
  PaymentMode,
  VerifiedNotification,
} from "./types";

// PayFast "custom integration" (hosted payment page) for one business's own
// merchant account. Rules follow PayFast's official PHP SDK
// (github.com/Payfast/payfast-php-sdk, lib/Auth.php and
// lib/PaymentIntegrations/Notification.php):
//
// - Checkout signature: md5 of "key=urlencode(trim(value))" pairs joined by
//   "&", in the order the fields are posted, empty values left out, then
//   "&passphrase=...".
// - Notification (ITN) signature: md5 of every posted field in the order
//   received up to "signature" (empty values kept), then "&passphrase=...".
// - Then confirm the notification with PayFast's server (POST the same string,
//   without the passphrase, to /eng/query/validate; it answers "VALID") and
//   check it came from a PayFast host.
//
// urlencode is PHP's: everything but A-Z a-z 0-9 - _ . is %XX (upper case)
// and spaces are "+".

export const PAYFAST_HOSTS: Record<PaymentMode, string> = {
  sandbox: "https://sandbox.payfast.co.za",
  live: "https://www.payfast.co.za",
};
const API_URL = "https://api.payfast.co.za";

// Hosts PayFast sends notifications from (Notification.php, pfValidIP).
const NOTIFY_HOSTNAMES = ["www.payfast.co.za", "sandbox.payfast.co.za", "w1w.payfast.co.za", "w2w.payfast.co.za"];

// Credential formats. The passphrase is limited to characters urlencode
// leaves alone: PayFast's SDK encodes it once for notifications but twice
// for checkouts, so any other character would make one of them fail.
export const MERCHANT_ID_RE = /^[0-9]{5,12}$/;
export const MERCHANT_KEY_RE = /^[a-z0-9]{8,32}$/i;
export const PASSPHRASE_RE = /^[A-Za-z0-9._-]{8,64}$/;

export function phpUrlencode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, "+");
}

function md5(s: string): string {
  return createHash("md5").update(s, "utf8").digest("hex");
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a.toLowerCase(), "utf8");
  const y = Buffer.from(b.toLowerCase(), "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export function centsToRand(cents: number): string {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error("amount must be a positive whole number of cents");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

// "250.00" -> 25000; "-6.50" -> -650. No floats, nothing loose.
export function randToCents(value: string): number | null {
  const m = /^(-)?(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) return null;
  const cents = Number(m[2]) * 100 + Number((m[3] ?? "0").padEnd(2, "0"));
  return m[1] ? -cents : cents;
}

export function checkoutSignature(fields: [string, string][], passphrase: string): string {
  const parts = fields.filter(([, v]) => v !== "").map(([k, v]) => `${k}=${phpUrlencode(v)}`);
  parts.push(`passphrase=${phpUrlencode(passphrase.trim())}`);
  return md5(parts.join("&"));
}

// A South African cell number as PayFast wants it: 0XXXXXXXXX.
function saCell(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const local = digits.startsWith("27") && digits.length === 11 ? "0" + digits.slice(2) : digits;
  return /^0[6-8]\d{8}$/.test(local) ? local : "";
}

function clip(s: string, max: number): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

export function buildPayfastCheckout(account: PaymentAccountSecrets, req: CheckoutRequest): Checkout {
  const [first, ...rest] = clip(req.customer.name, 200).split(" ");
  const email = (req.customer.email ?? "").trim();
  // Field order matters: it's the order the signature is computed in.
  const fields: [string, string][] = (
    [
      ["merchant_id", account.merchantId],
      ["merchant_key", account.merchantKey],
      ["return_url", req.returnUrl],
      ["cancel_url", req.cancelUrl],
      ["notify_url", req.notifyUrl],
      ["name_first", clip(first ?? "", 100)],
      ["name_last", clip(rest.join(" "), 100)],
      ["email_address", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? clip(email, 100) : ""],
      ["cell_number", saCell(req.customer.phone)],
      ["m_payment_id", req.paymentId],
      ["amount", centsToRand(req.amountCents)],
      ["item_name", clip(req.itemName, 100)],
      ["item_description", clip(req.itemDescription ?? "", 255)],
    ] as [string, string][]
  )
    .map(([k, v]) => [k, v.trim()] as [string, string])
    .filter(([, v]) => v !== "");
  fields.push(["signature", checkoutSignature(fields, account.passphrase)]);
  return { action: `${PAYFAST_HOSTS[account.mode]}/eng/process`, fields };
}

// The ITN body, in the order PayFast sent it.
export function parseNotificationBody(rawBody: string): [string, string][] {
  return [...new URLSearchParams(rawBody).entries()];
}

// The string PayFast signs (and wants back at /eng/query/validate).
export function notificationParamString(pairs: [string, string][]): string {
  const out: string[] = [];
  for (const [k, v] of pairs) {
    if (k === "signature") break;
    out.push(`${k}=${phpUrlencode(v)}`);
  }
  return out.join("&");
}

export function notificationSignatureValid(pairs: [string, string][], passphrase: string): boolean {
  const given = pairs.find(([k]) => k === "signature")?.[1];
  if (!given) return false;
  const expected = md5(`${notificationParamString(pairs)}&passphrase=${phpUrlencode(passphrase.trim())}`);
  return sameHex(given, expected);
}

let hostCache: { ips: Set<string>; at: number } | null = null;

// IPs of PayFast's notification hosts, refreshed every 10 minutes.
export async function payfastIps(resolve: (host: string) => Promise<string[]> = dns.resolve4): Promise<Set<string>> {
  if (hostCache && Date.now() - hostCache.at < 10 * 60_000) return hostCache.ips;
  const lists = await Promise.all(NOTIFY_HOSTNAMES.map((h) => resolve(h).catch(() => [] as string[])));
  const ips = new Set(lists.flat());
  if (ips.size > 0) hostCache = { ips, at: Date.now() };
  return ips;
}

export function resetPayfastIpCache(): void {
  hostCache = null;
}

export type VerifyDeps = {
  fetch?: typeof fetch;
  resolve?: (host: string) => Promise<string[]>;
};

// The checks that decide, cheapest first: the signature (needs the
// business's secret passphrase), the merchant id, and PayFast's own server
// confirming these exact details as VALID. Only a notification that passes
// all of them reaches the database, which then checks the amount, mode and
// duplicates under a lock (apply_payment_notification()).
//
// The sender's IP is checked against PayFast's hosts but only reported
// (sourceTrusted), not enforced: PayFast's notifications can come from
// addresses those hostnames don't resolve to (the sandbox's did, in our
// end-to-end test; WooCommerce's PayFast plugin skips the check in test
// mode). A forger can't pass the confirmation step anyway: PayFast won't
// call a payment VALID that it didn't take.
export async function verifyPayfastNotification(
  rawBody: string,
  remoteIp: string | null,
  account: PaymentAccountSecrets,
  deps: VerifyDeps = {},
): Promise<{ ok: true; notification: VerifiedNotification; sourceTrusted: boolean } | NotificationFailure> {
  const pairs = parseNotificationBody(rawBody);
  const get = (k: string) => pairs.find(([key]) => key === k)?.[1] ?? "";

  const paymentId = get("m_payment_id");
  const providerPaymentId = get("pf_payment_id");
  const status = get("payment_status");
  const gross = randToCents(get("amount_gross"));
  const fee = get("amount_fee") === "" ? null : randToCents(get("amount_fee"));
  if (!/^[0-9a-f-]{36}$/i.test(paymentId) || !/^\d{1,20}$/.test(providerPaymentId) || !status || gross === null) {
    return { ok: false, reason: "malformed" };
  }

  if (!notificationSignatureValid(pairs, account.passphrase)) return { ok: false, reason: "bad_signature" };
  if (get("merchant_id") !== account.merchantId) return { ok: false, reason: "wrong_merchant" };

  const sourceTrusted = Boolean(remoteIp && (await payfastIps(deps.resolve)).has(remoteIp));

  try {
    const res = await (deps.fetch ?? fetch)(`${PAYFAST_HOSTS[account.mode]}/eng/query/validate`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: notificationParamString(pairs),
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if ((await res.text()).trim() !== "VALID") return { ok: false, reason: "not_confirmed" };
  } catch {
    // PayFast retries notifications that don't get a 200, so the route
    // answers non-200 for this one.
    return { ok: false, reason: "confirm_failed" };
  }

  return {
    ok: true,
    sourceTrusted,
    notification: {
      paymentId,
      providerPaymentId,
      status,
      amountGrossCents: gross,
      feeCents: fee === null ? null : Math.abs(fee),
    },
  };
}

// API request signature (Auth::generateApiSignature): every header and
// parameter plus the passphrase, sorted by key.
export function apiSignature(data: Record<string, string>, passphrase: string): string {
  const all: Record<string, string> = { ...data, passphrase };
  return md5(
    Object.keys(all)
      .sort()
      .map((k) => `${k}=${phpUrlencode(all[k])}`)
      .join("&"),
  );
}

// PHP date("Y-m-d\TH:i:sO") in SA time, e.g. 2026-11-22T10:00:00+0200.
function apiTimestamp(now: Date): string {
  const sa = new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 19);
  return `${sa}+0200`;
}

export type ApiDeps = { fetch?: typeof fetch; now?: Date };

// A signed GET to PayFast's API (Request::sendApiRequest): the signature
// covers the headers and the query parameters, but not "testing", which
// only routes the call to the sandbox.
export function payfastApiGet(
  account: PaymentAccountSecrets,
  path: string,
  query: Record<string, string> = {},
  deps: ApiDeps = {},
): Promise<Response> {
  const headers = { "merchant-id": account.merchantId, version: "v1", timestamp: apiTimestamp(deps.now ?? new Date()) };
  const params = new URLSearchParams({ ...query, ...(account.mode === "sandbox" ? { testing: "true" } : {}) }).toString();
  return (deps.fetch ?? fetch)(`${API_URL}/${path}${params ? `?${params}` : ""}`, {
    headers: { ...headers, signature: apiSignature({ ...headers, ...query }, account.passphrase) },
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
}

// "Test connection" for the dashboard: PayFast's API ping checks the merchant
// id and passphrase. (The merchant key is only checked by a real checkout;
// the first sandbox payment proves it.)
export async function pingPayfast(
  account: PaymentAccountSecrets,
  deps: ApiDeps = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await payfastApiGet(account, "ping", {}, deps);
    if (res.ok) return { ok: true };
    return {
      ok: false,
      error:
        res.status === 401 || res.status === 403
          ? "PayFast didn't accept the Merchant ID and passphrase. Check them, and that the passphrase is set in PayFast."
          : `PayFast answered ${res.status}. Try again in a minute.`,
    };
  } catch {
    return { ok: false, error: "Couldn't reach PayFast. Try again in a minute." };
  }
}
