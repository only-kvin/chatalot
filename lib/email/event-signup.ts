import type { SupabaseClient } from "@supabase/supabase-js";
import { formatLocalDateTime } from "@/lib/time";
import { formatRand } from "@/lib/bookings/price-label";
import { escapeHtml, sendCustomerEmail } from "./send";

// "You're signed up" to the customer, once their spot is secured: straight
// away for free events (and "pay at the event" ones), after payment for
// paid tickets. Only when they gave an email address.
export async function emailCustomerAboutSignup(admin: SupabaseClient, tenantId: string, signupId: string): Promise<void> {
  try {
    const [{ data: s }, { data: config }] = await Promise.all([
      admin
        .from("event_signups")
        .select("name, email, quantity, payment_status, amount_due_cents, events(title, starts_at, location, price_cents)")
        .eq("tenant_id", tenantId)
        .eq("id", signupId)
        .maybeSingle(),
      admin.from("agent_configs").select("business_name, handoff_contact").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    if (!s?.email) return;
    const event = s.events as unknown as { title: string; starts_at: string; location: string; price_cents: number | null } | null;
    if (!event) return;
    const business = config?.business_name || "the organisers";
    const tickets = `${s.quantity} ticket${s.quantity === 1 ? "" : "s"}`;
    const money =
      s.payment_status === "paid" && s.amount_due_cents
        ? `Paid: ${formatRand(s.amount_due_cents)}.`
        : event.price_cents
          ? `Please pay ${formatRand(event.price_cents * s.quantity)} at the event.`
          : "";
    const html = `
      <p>Hi ${escapeHtml(s.name)},</p>
      <p>You're signed up for <strong>${escapeHtml(event.title)}</strong> with ${escapeHtml(business)}.</p>
      <p>${escapeHtml(formatLocalDateTime(event.starts_at))}${event.location ? `<br>${escapeHtml(event.location)}` : ""}<br>${escapeHtml(tickets)}</p>
      ${money ? `<p>${escapeHtml(money)}</p>` : ""}
      ${config?.handoff_contact ? `<p>Can't make it, or have a question? Contact ${escapeHtml(business)} on ${escapeHtml(config.handoff_contact)}.</p>` : ""}
    `;
    await sendCustomerEmail({ to: s.email, subject: `You're signed up: ${event.title}`, html });
  } catch (err) {
    console.error(`Event sign-up email for ${signupId} failed:`, err);
  }
}
