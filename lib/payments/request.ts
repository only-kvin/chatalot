import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/app-url";
import { amountDueCents, type ServicePaymentMode } from "./service-rules";

// Asking a customer to pay for a booking they just made. Called by
// createBooking() (service-role client) right after the booking exists:
//
// - the amount comes from the service as stored now, never from the caller;
// - the booking is put on hold (payment_status 'awaiting') until
//   payment_due_at, after which expire_unpaid_bookings() frees the slot;
// - a payments row is created; its id is the pay link and PayFast's
//   m_payment_id.
//
// Only for bookings that are confirmed straight away. A booking waiting for
// the owner's approval isn't charged (the owner may still say no).

export type PaymentRequest = {
  paymentId: string;
  amountCents: number;
  dueAt: string;
  // The page that sends the customer on to PayFast.
  url: string;
};

export function payUrl(paymentId: string): string {
  return appUrl(`/pay/${paymentId}`);
}

type ServiceRow = {
  payment_mode: ServicePaymentMode;
  deposit_cents: number | null;
  price_cents: number | null;
  price_type: "fixed" | "from" | "on_inspection";
};

export async function requestPaymentForBooking(
  admin: SupabaseClient,
  b: { tenantId: string; bookingId: string; serviceId: string; now?: Date },
): Promise<PaymentRequest | null> {
  const [{ data: service }, { data: account }, { data: config }] = await Promise.all([
    admin
      .from("services")
      .select("payment_mode, deposit_cents, price_cents, price_type")
      .eq("tenant_id", b.tenantId)
      .eq("id", b.serviceId)
      .maybeSingle<ServiceRow>(),
    admin
      .from("payment_accounts")
      .select("id, provider, mode, status")
      .eq("tenant_id", b.tenantId)
      .eq("provider", "payfast")
      .maybeSingle<{ id: string; provider: "payfast"; mode: "sandbox" | "live"; status: string }>(),
    admin.from("agent_configs").select("payment_window_minutes").eq("tenant_id", b.tenantId).maybeSingle(),
  ]);
  if (!service || !account || account.status !== "active") return null;
  const amount = amountDueCents({
    paymentMode: service.payment_mode,
    depositCents: service.deposit_cents,
    priceCents: service.price_cents,
    priceType: service.price_type,
  });
  if (!amount) return null;

  const minutes = config?.payment_window_minutes ?? 30;
  const dueAt = new Date((b.now ?? new Date()).getTime() + minutes * 60_000).toISOString();

  // Hold first: if this fails, nothing is charged and the booking stands
  // as an ordinary pay-on-the-day booking.
  const { data: held, error: holdError } = await admin
    .from("bookings")
    .update({ payment_status: "awaiting", amount_due_cents: amount, payment_due_at: dueAt, updated_at: new Date().toISOString() })
    .eq("tenant_id", b.tenantId)
    .eq("id", b.bookingId)
    .eq("payment_status", "not_required")
    .select("id")
    .maybeSingle();
  if (holdError || !held) {
    if (holdError) console.error(`Payments: holding booking ${b.bookingId} failed:`, holdError);
    return null;
  }

  const { data: payment, error } = await admin
    .from("payments")
    .insert({
      tenant_id: b.tenantId,
      booking_id: b.bookingId,
      payment_account_id: account.id,
      provider: account.provider,
      mode: account.mode,
      amount_cents: amount,
    })
    .select("id")
    .single();
  if (error || !payment) {
    console.error(`Payments: creating the payment for booking ${b.bookingId} failed:`, error);
    // Undo the hold so the customer isn't cancelled for a link they never got.
    await admin
      .from("bookings")
      .update({ payment_status: "not_required", amount_due_cents: null, payment_due_at: null })
      .eq("tenant_id", b.tenantId)
      .eq("id", b.bookingId);
    return null;
  }
  return { paymentId: payment.id, amountCents: amount, dueAt, url: payUrl(payment.id) };
}

// A retried submit (same idempotency key): hand back the payment it made.
export async function existingPaymentRequest(
  admin: SupabaseClient,
  tenantId: string,
  bookingId: string,
): Promise<PaymentRequest | null> {
  const [{ data: booking }, { data: payment }] = await Promise.all([
    admin
      .from("bookings")
      .select("payment_status, payment_due_at")
      .eq("tenant_id", tenantId)
      .eq("id", bookingId)
      .maybeSingle(),
    admin
      .from("payments")
      .select("id, amount_cents")
      .eq("tenant_id", tenantId)
      .eq("booking_id", bookingId)
      .eq("status", "created")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (booking?.payment_status !== "awaiting" || !booking.payment_due_at || !payment) return null;
  return { paymentId: payment.id, amountCents: payment.amount_cents, dueAt: booking.payment_due_at, url: payUrl(payment.id) };
}

// Frees slots held by unpaid bookings. Best effort: only the service role may
// run it, so a dashboard (signed-in) client just skips it; the daily cron is
// the backstop.
export async function expireUnpaidHolds(client: SupabaseClient, tenantId: string): Promise<void> {
  const { error } = await client.rpc("expire_unpaid_bookings", { p_tenant_id: tenantId });
  if (error && error.code !== "42501") console.error(`Payments: expiring holds for ${tenantId} failed:`, error);
}
