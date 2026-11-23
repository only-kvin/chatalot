import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertContact } from "@/lib/contacts/upsert";
import { emailCustomerAboutSignup } from "@/lib/email/event-signup";
import { createSignupPayment, existingSignupPayment, onlinePaymentAccount, type PaymentRequest } from "@/lib/payments/request";

// Signing up for an event from the events widget. The customer ticked the
// consent box, so they're saved as a contact. create_event_signup() checks
// the event, the ticket limit and the spots left under a lock and sets the
// amount; paid tickets get a payment and a pay link, everything else is
// confirmed (and emailed) straight away.

export type SignupInput = {
  tenantId: string;
  eventId: string;
  widgetId: string | null;
  quantity: number;
  customer: { name: string; phone: string; email: string | null };
  details: Record<string, unknown>;
  idempotencyKey: string;
};

export type SignupResult =
  | { ok: true; signupId: string; repeat: boolean; payment: PaymentRequest | null; payAtEvent: boolean; spotsLeft: number | null }
  | { ok: false; reason: "unknown_event" | "not_open" | "closed" | "too_many" | "sold_out" | "failed"; spotsLeft?: number; max?: number };

type Rpc =
  | { ok: true; repeat: boolean; signup_id: string; amount_due_cents: number | null; payment_due_at: string | null; payment_status: string; left?: number | null }
  | { ok: false; reason: string; left?: number; max?: number };

export async function signUpForEvent(admin: SupabaseClient, input: SignupInput): Promise<SignupResult> {
  const [contactId, account] = await Promise.all([
    upsertContact(admin, {
      tenantId: input.tenantId,
      name: input.customer.name,
      phone: input.customer.phone,
      email: input.customer.email,
      nameSource: "customer",
      channel: "web",
      consent: true,
    }).catch((err) => {
      console.error("Saving the event sign-up's contact failed:", err);
      return null;
    }),
    onlinePaymentAccount(admin, input.tenantId),
  ]);

  const { data, error } = await admin.rpc("create_event_signup", {
    p_tenant_id: input.tenantId,
    p_event_id: input.eventId,
    p_name: input.customer.name,
    p_phone: input.customer.phone,
    p_email: input.customer.email,
    p_contact_id: contactId,
    p_quantity: input.quantity,
    p_details: input.details,
    p_idempotency_key: input.idempotencyKey,
    p_widget_id: input.widgetId,
    p_take_payment: account !== null,
  });
  if (error) {
    console.error(`Event sign-up for ${input.eventId} failed:`, error);
    return { ok: false, reason: "failed" };
  }
  const r = data as Rpc;
  if (!r.ok) {
    const reason = (["unknown_event", "not_open", "closed", "too_many", "sold_out"] as const).find((x) => x === r.reason) ?? "failed";
    return { ok: false, reason, spotsLeft: r.left, max: r.max };
  }

  let payment: PaymentRequest | null = null;
  if (r.repeat) payment = await existingSignupPayment(admin, input.tenantId, r.signup_id);
  else if (r.payment_status === "awaiting" && account && r.amount_due_cents && r.payment_due_at) {
    payment = await createSignupPayment(admin, {
      tenantId: input.tenantId,
      signupId: r.signup_id,
      amountCents: r.amount_due_cents,
      dueAt: r.payment_due_at,
      account,
    });
  }
  // Their spot is secured now unless it's waiting for payment; paid ones
  // are emailed once the payment arrives.
  if (!r.repeat && !payment) await emailCustomerAboutSignup(admin, input.tenantId, r.signup_id);

  const { data: event } = await admin.from("events").select("price_cents").eq("id", input.eventId).maybeSingle();
  return {
    ok: true,
    signupId: r.signup_id,
    repeat: r.repeat,
    payment,
    payAtEvent: !payment && Boolean(event?.price_cents) && r.payment_status !== "paid",
    spotsLeft: r.left ?? null,
  };
}
