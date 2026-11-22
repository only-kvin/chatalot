import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/app-url";
import { bookingRef } from "@/lib/bookings/manage";
import { formatBookingWhen } from "@/lib/bookings/when";
import { loadPaymentAccount } from "./accounts";
import { buildPayfastCheckout } from "./payfast";
import type { Checkout } from "./types";

// What /pay/<paymentId> shows. The payment id (a random UUID) is the link's
// only key, so the page reveals no more than the customer already knows:
// the business, service, time and amount.

export type PayPage =
  | { state: "not_found" }
  | { state: "paid"; businessName: string; serviceName: string; when: string; ref: string }
  | { state: "expired"; businessName: string; contact: string }
  | { state: "unavailable"; businessName: string; contact: string }
  | {
      state: "pay";
      businessName: string;
      serviceName: string;
      when: string;
      ref: string;
      amountCents: number;
      dueAt: string;
      sandbox: boolean;
      checkout: Checkout;
    };

type Row = {
  id: string;
  tenant_id: string;
  booking_id: string | null;
  amount_cents: number;
  status: string;
  mode: "sandbox" | "live";
  bookings: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    starts_at: string;
    arrival_window_end: string | null;
    status: string;
    payment_status: string;
    payment_due_at: string | null;
    services: { name: string } | null;
  } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function notifyUrl(tenantId: string): string {
  return appUrl(`/api/payments/payfast/notify/${tenantId}`);
}

export async function loadPayPage(admin: SupabaseClient, paymentId: string, now = new Date()): Promise<PayPage> {
  if (!UUID.test(paymentId)) return { state: "not_found" };
  const { data: p } = await admin
    .from("payments")
    .select(
      "id, tenant_id, booking_id, amount_cents, status, mode, bookings(id, name, phone, email, starts_at, arrival_window_end, status, payment_status, payment_due_at, services(name))",
    )
    .eq("id", paymentId)
    .maybeSingle<Row>();
  const b = p?.bookings;
  if (!p || !b) return { state: "not_found" };

  const { data: config } = await admin
    .from("agent_configs")
    .select("business_name, handoff_contact")
    .eq("tenant_id", p.tenant_id)
    .maybeSingle();
  const businessName = config?.business_name || "the business";
  const contact = config?.handoff_contact ?? "";
  const serviceName = b.services?.name ?? "Booking";
  const when = formatBookingWhen(b.starts_at, b.arrival_window_end);
  const ref = bookingRef(b.id);

  if (p.status === "paid") return { state: "paid", businessName, serviceName, when, ref };
  const due = b.payment_due_at ? new Date(b.payment_due_at) : null;
  // Expired, cancelled, or already paid through another attempt.
  if (b.payment_status !== "awaiting" || b.status === "cancelled" || !due || due <= now) {
    return b.payment_status === "paid" ? { state: "paid", businessName, serviceName, when, ref } : { state: "expired", businessName, contact };
  }

  const account = await loadPaymentAccount(admin, p.tenant_id).catch(() => null);
  // Switched off, or switched between test and live since the link was made.
  if (!account || account.status !== "active" || account.secrets.mode !== p.mode) {
    return { state: "unavailable", businessName, contact };
  }

  const checkout = buildPayfastCheckout(account.secrets, {
    paymentId: p.id,
    amountCents: p.amount_cents,
    itemName: `${serviceName} - ${businessName}`,
    itemDescription: `Booking ${ref}, ${when}`,
    customer: { name: b.name, email: b.email, phone: b.phone },
    returnUrl: appUrl(`/pay/${p.id}?returned=1`),
    cancelUrl: appUrl(`/pay/${p.id}?cancelled=1`),
    notifyUrl: notifyUrl(p.tenant_id),
  });
  return {
    state: "pay",
    businessName,
    serviceName,
    when,
    ref,
    amountCents: p.amount_cents,
    dueAt: due.toISOString(),
    sandbox: p.mode === "sandbox",
    checkout,
  };
}
