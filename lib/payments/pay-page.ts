import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/app-url";
import { bookingRef } from "@/lib/bookings/manage";
import { formatBookingWhen } from "@/lib/bookings/when";
import { formatLocalDateTime } from "@/lib/time";
import { loadPaymentAccount } from "./accounts";
import { buildPayfastCheckout } from "./payfast";
import type { Checkout } from "./types";

// What /pay/<paymentId> shows. The payment id (a random UUID) is the link's
// only key, so the page reveals no more than the customer already knows:
// the business, service, time and amount.

// kind: what's being paid for, which decides the wording ("You're booked"
// or "You're signed up").
export type PayKind = "booking" | "event";

export type PayPage =
  | { state: "not_found" }
  | { state: "paid"; kind: PayKind; businessName: string; serviceName: string; when: string; ref: string }
  | { state: "expired"; kind: PayKind; businessName: string; contact: string }
  | { state: "unavailable"; businessName: string; contact: string }
  | {
      state: "pay";
      kind: PayKind;
      businessName: string;
      serviceName: string;
      when: string;
      ref: string;
      amountCents: number;
      dueAt: string;
      sandbox: boolean;
      checkout: Checkout;
    };

type Customer = { name: string; phone: string; email: string | null };
type Held = { status: string; payment_status: string; payment_due_at: string | null };

type Row = {
  id: string;
  tenant_id: string;
  amount_cents: number;
  status: string;
  mode: "sandbox" | "live";
  bookings: (Customer & Held & { id: string; starts_at: string; arrival_window_end: string | null; services: { name: string } | null }) | null;
  event_signups: (Customer & Held & { id: string; quantity: number; events: { title: string; starts_at: string } | null }) | null;
};

// A booking or an event sign-up, in the shape the page needs.
type Purchase = Customer & Held & { kind: PayKind; serviceName: string; when: string; ref: string };

function purchaseOf(p: Row): Purchase | null {
  if (p.bookings) {
    const b = p.bookings;
    return { ...b, kind: "booking", serviceName: b.services?.name ?? "Booking", when: formatBookingWhen(b.starts_at, b.arrival_window_end), ref: bookingRef(b.id) };
  }
  const s = p.event_signups;
  if (s?.events) {
    const tickets = `${s.quantity} ticket${s.quantity === 1 ? "" : "s"}`;
    return { ...s, kind: "event", serviceName: `${s.events.title} (${tickets})`, when: formatLocalDateTime(s.events.starts_at), ref: bookingRef(s.id) };
  }
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function notifyUrl(tenantId: string): string {
  return appUrl(`/api/payments/payfast/notify/${tenantId}`);
}

// The customer is back from PayFast. Usually its notification has already
// marked the payment paid; if not, ask PayFast directly before showing the
// page, so a lost notification doesn't leave them on "Confirming…".
export async function loadPayPageAfterReturn(admin: SupabaseClient, paymentId: string, now = new Date()): Promise<PayPage> {
  if (UUID.test(paymentId)) {
    const { data: p } = await admin.from("payments").select("tenant_id, status").eq("id", paymentId).maybeSingle();
    if (p && p.status !== "paid") {
      const { recoverPayments } = await import("./recover");
      await recoverPayments(admin, p.tenant_id, { paymentIds: [paymentId], now }).catch((err) =>
        console.error(`Payments: recovery on return for ${paymentId} failed:`, err),
      );
    }
  }
  return loadPayPage(admin, paymentId, now);
}

export async function loadPayPage(admin: SupabaseClient, paymentId: string, now = new Date()): Promise<PayPage> {
  if (!UUID.test(paymentId)) return { state: "not_found" };
  const { data: p } = await admin
    .from("payments")
    .select(
      "id, tenant_id, amount_cents, status, mode, " +
        "bookings(id, name, phone, email, starts_at, arrival_window_end, status, payment_status, payment_due_at, services(name)), " +
        "event_signups(id, name, phone, email, quantity, status, payment_status, payment_due_at, events(title, starts_at))",
    )
    .eq("id", paymentId)
    .maybeSingle<Row>();
  const b = p ? purchaseOf(p) : null;
  if (!p || !b) return { state: "not_found" };

  const { data: config } = await admin
    .from("agent_configs")
    .select("business_name, handoff_contact")
    .eq("tenant_id", p.tenant_id)
    .maybeSingle();
  const businessName = config?.business_name || "the business";
  const contact = config?.handoff_contact ?? "";
  const { kind, serviceName, when, ref } = b;

  if (p.status === "paid") return { state: "paid", kind, businessName, serviceName, when, ref };
  const due = b.payment_due_at ? new Date(b.payment_due_at) : null;
  // Expired, cancelled, or already paid through another attempt.
  if (b.payment_status !== "awaiting" || b.status === "cancelled" || !due || due <= now) {
    return b.payment_status === "paid" ? { state: "paid", kind, businessName, serviceName, when, ref } : { state: "expired", kind, businessName, contact };
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
    itemDescription: `${kind === "event" ? "Tickets" : "Booking"} ${ref}, ${when}`,
    customer: { name: b.name, email: b.email, phone: b.phone },
    returnUrl: appUrl(`/pay/${p.id}?returned=1`),
    cancelUrl: appUrl(`/pay/${p.id}?cancelled=1`),
    notifyUrl: notifyUrl(p.tenant_id),
  });
  return {
    state: "pay",
    kind,
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
