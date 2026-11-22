import type { SupabaseClient } from "@supabase/supabase-js";
import { emailCustomerAboutBooking } from "@/lib/email/customer-booking";
import { addDays, localDateISO } from "@/lib/time";
import { loadPaymentAccount } from "./accounts";
import { payfastApiGet, randToCents, type ApiDeps } from "./payfast";
import type { PaymentAccountSecrets } from "./types";

// Lost-confirmation recovery. PayFast tells us about a payment by posting a
// notification (ITN); if that never arrives or is turned away, the customer
// has paid but the booking would expire. So we also ask PayFast: its
// transaction history (an authenticated API call with the business's own
// credentials) lists each payment with our payment id (M Payment ID).
// Anything found goes through apply_payment_notification() exactly like a
// notification, so the amount, sandbox/live and duplicates are checked the
// same way, and a payment found after its hold expired becomes a
// "paid for a cancelled booking" alert for the owner.
//
// Run: when a customer returns from PayFast and we haven't heard yet, before
// an unpaid hold is released, and from the daily cron for the last 3 days.

const LOOKBACK_DAYS = 3;

export type HistoryRow = {
  type: string;
  paymentId: string;
  providerPaymentId: string;
  grossCents: number;
  feeCents: number | null;
};

// RFC 4180: quoted fields may hold commas, quotes ("") and newlines.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) row.push(field), rows.push(row);
  return rows.filter((r) => r.some((f) => f !== ""));
}

// PayFast's history CSV: Date, Type, ..., Gross, Fee, Net, ..., "M Payment ID", "PF Payment ID", ...
export function parseHistory(csv: string): HistoryRow[] {
  const [header, ...rows] = parseCsv(csv);
  if (!header) return [];
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const at = { type: col("type"), gross: col("gross"), fee: col("fee"), m: col("m payment id"), pf: col("pf payment id") };
  if (Object.values(at).some((i) => i < 0)) throw new Error("PayFast history has unexpected columns");
  return rows.flatMap((r) => {
    const grossCents = randToCents(r[at.gross] ?? "");
    const fee = randToCents(r[at.fee] ?? "");
    if (grossCents === null) return [];
    return [
      {
        type: (r[at.type] ?? "").trim(),
        paymentId: (r[at.m] ?? "").trim(),
        providerPaymentId: (r[at.pf] ?? "").trim(),
        grossCents,
        feeCents: fee === null ? null : Math.abs(fee),
      },
    ];
  });
}

// One SA day of the business's PayFast transactions.
export async function fetchPayfastDay(account: PaymentAccountSecrets, date: string, deps: ApiDeps = {}): Promise<HistoryRow[]> {
  const res = await payfastApiGet(account, "transactions/history/daily", { date, offset: "0", limit: "1000" }, deps);
  if (res.status === 204) return [];
  if (!res.ok) throw new Error(`PayFast history ${date}: HTTP ${res.status}`);
  return parseHistory(await res.text());
}

type OpenPayment = { id: string; booking_id: string | null; amount_cents: number; created_at: string };

export type RecoverResult = { checked: number; recovered: string[]; problems: number };

// Checks one business's unpaid payments (all from the last 3 days, or just
// the ids given) against PayFast. Needs the service-role client; with any
// other client it quietly does nothing.
export async function recoverPayments(
  admin: SupabaseClient,
  tenantId: string,
  opts: { paymentIds?: string[]; now?: Date; deps?: ApiDeps; sendEmails?: boolean } = {},
): Promise<RecoverResult> {
  const none: RecoverResult = { checked: 0, recovered: [], problems: 0 };
  const now = opts.now ?? new Date();
  const account = await loadPaymentAccount(admin, tenantId).catch(() => null);
  if (!account) return none;

  let q = admin
    .from("payments")
    .select("id, booking_id, amount_cents, created_at")
    .eq("tenant_id", tenantId)
    .eq("provider", "payfast")
    .eq("mode", account.secrets.mode)
    .in("status", ["created", "cancelled", "failed"])
    .gte("created_at", new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString());
  if (opts.paymentIds) q = q.in("id", opts.paymentIds);
  const { data: open, error } = await q;
  if (error || !open?.length) return none;

  // Each payment's SA day and the next (a payment can complete after midnight).
  const today = localDateISO(now);
  const days = new Set<string>();
  for (const p of open as OpenPayment[]) {
    const day = localDateISO(new Date(p.created_at));
    for (const d of [day, addDays(day, 1)]) if (d <= today) days.add(d);
  }

  const found = new Map<string, HistoryRow>();
  for (const day of days) {
    let rows: HistoryRow[];
    try {
      rows = await fetchPayfastDay(account.secrets, day, opts.deps);
    } catch (err) {
      console.error(`Payments: reading PayFast history for ${tenantId} on ${day} failed:`, err);
      continue;
    }
    for (const r of rows) if (r.type === "FUNDS_RECEIVED" && r.paymentId) found.set(r.paymentId, r);
  }

  const result: RecoverResult = { checked: open.length, recovered: [], problems: 0 };
  for (const p of open as OpenPayment[]) {
    const row = found.get(p.id);
    if (!row) continue;
    const { data, error: applyError } = await admin.rpc("apply_payment_notification", {
      p_tenant_id: tenantId,
      p_payment_id: p.id,
      p_provider: "payfast",
      p_mode: account.secrets.mode,
      p_provider_payment_id: row.providerPaymentId,
      p_provider_status: "COMPLETE",
      p_amount_gross_cents: row.grossCents,
      p_fee_cents: row.feeCents,
    });
    if (applyError) {
      console.error(`Payments: recovering payment ${p.id} failed:`, applyError);
      continue;
    }
    const outcome = data as { outcome: string; reason: string | null };
    if (outcome.outcome === "applied" && !outcome.reason && p.booking_id) result.recovered.push(p.booking_id);
    else if (outcome.reason) result.problems++;
    console.warn(`Payments: recovered payment ${p.id} from PayFast's history: ${outcome.outcome}${outcome.reason ? ` (${outcome.reason})` : ""}`);
  }

  // The "you're booked" email held back until payment.
  if (opts.sendEmails !== false) {
    await Promise.all(result.recovered.map((bookingId) => emailCustomerAboutBooking(admin, tenantId, bookingId, "confirmed")));
  }
  return result;
}

// Daily cron: every business with unpaid payments in the last 3 days.
export async function recoverAllPayments(admin: SupabaseClient, now = new Date()): Promise<{ tenants: number; recovered: number }> {
  const { data, error } = await admin
    .from("payments")
    .select("tenant_id")
    .eq("provider", "payfast")
    .in("status", ["created", "cancelled", "failed"])
    .gte("created_at", new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString());
  if (error) throw error;
  const tenants = [...new Set((data ?? []).map((r) => r.tenant_id as string))];
  let recovered = 0;
  for (const tenantId of tenants) {
    try {
      recovered += (await recoverPayments(admin, tenantId, { now })).recovered.length;
    } catch (err) {
      console.error(`Payments: recovery for ${tenantId} failed:`, err);
    }
  }
  return { tenants: tenants.length, recovered };
}
