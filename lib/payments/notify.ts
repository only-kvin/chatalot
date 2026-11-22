import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPaymentAccount } from "./accounts";
import { verifyPayfastNotification, type VerifyDeps } from "./payfast";

// Handling one PayFast notification (ITN) for one business. The route only
// reads the request; everything that decides whether money arrived is here:
//
//   1. the business's own account (the tenant id is in the notify URL we gave
//      PayFast, but nothing is trusted until the signature checks out with
//      that business's passphrase);
//   2. verifyPayfastNotification(): signature, merchant id, PayFast's IPs,
//      and PayFast's server confirming it;
//   3. apply_payment_notification() in the database: amount, sandbox/live and
//      duplicates, under a lock. Only this marks a booking paid.
//
// The HTTP status tells PayFast whether to retry: 200 = handled (including
// "not ours, ignore it"), 503 = we couldn't check right now, try again.

export type NotifyOutcome = {
  status: 200 | 400 | 503;
  // Set when this notification just paid for a live booking: send the
  // customer's confirmation.
  paidBookingId: string | null;
  // For logs.
  detail: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A rejected notification is written down without trusting any of it: no
// payment link (the id came from the sender), clipped strings.
async function logRejected(admin: SupabaseClient, tenantId: string, reason: string, rawBody: string) {
  const fields = new URLSearchParams(rawBody);
  await admin.from("payment_events").insert({
    tenant_id: tenantId,
    provider: "payfast",
    provider_payment_id: fields.get("pf_payment_id")?.slice(0, 40) ?? null,
    provider_status: fields.get("payment_status")?.slice(0, 40) ?? null,
    outcome: "rejected",
    reason,
  });
}

export async function handlePayfastNotification(
  admin: SupabaseClient,
  tenantId: string,
  rawBody: string,
  remoteIp: string | null,
  deps: VerifyDeps = {},
): Promise<NotifyOutcome> {
  if (!UUID.test(tenantId)) return { status: 400, paidBookingId: null, detail: "bad tenant id" };

  let account;
  try {
    account = await loadPaymentAccount(admin, tenantId);
  } catch (err) {
    console.error(`Payments: loading the account for ${tenantId} failed:`, err);
    return { status: 503, paidBookingId: null, detail: "account unreadable" };
  }
  // No account (or a guessed URL): nothing to check against. 200 so PayFast
  // stops; a disabled account still accepts notifications for payments
  // already started.
  if (!account) return { status: 200, paidBookingId: null, detail: "no account" };

  const verified = await verifyPayfastNotification(rawBody, remoteIp, account.secrets, deps);
  if (!verified.ok) {
    await logRejected(admin, tenantId, verified.reason, rawBody).catch(() => undefined);
    if (verified.reason === "confirm_failed") return { status: 503, paidBookingId: null, detail: verified.reason };
    return { status: verified.reason === "malformed" ? 400 : 200, paidBookingId: null, detail: verified.reason };
  }

  const n = verified.notification;
  const { data, error } = await admin.rpc("apply_payment_notification", {
    p_tenant_id: tenantId,
    p_payment_id: n.paymentId,
    p_provider: "payfast",
    p_mode: account.secrets.mode,
    p_provider_payment_id: n.providerPaymentId,
    p_provider_status: n.status,
    p_amount_gross_cents: n.amountGrossCents,
    p_fee_cents: n.feeCents,
  });
  if (error) {
    console.error(`Payments: applying notification for ${tenantId} failed:`, error);
    return { status: 503, paidBookingId: null, detail: "apply failed" };
  }
  const result = data as { outcome: string; reason: string | null };

  let paidBookingId: string | null = null;
  if (result.outcome === "applied" && n.status === "COMPLETE" && !result.reason) {
    const { data: payment } = await admin
      .from("payments")
      .select("booking_id")
      .eq("tenant_id", tenantId)
      .eq("id", n.paymentId)
      .maybeSingle();
    paidBookingId = payment?.booking_id ?? null;
  }
  return { status: 200, paidBookingId, detail: `${result.outcome}${result.reason ? `: ${result.reason}` : ""}` };
}
