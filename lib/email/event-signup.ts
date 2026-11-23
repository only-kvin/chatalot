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

// ---------------------------------------------------------------------------
// "Cancelled" to everyone still signed up when the business cancels an
// event, with the business's own message. Paid tickets: the business refunds
// in its own PayFast account, so the email says they'll be in touch rather
// than promising an automatic refund.
// ---------------------------------------------------------------------------

export type CancellationEmailInput = {
  name: string;
  businessName: string;
  contact: string;
  title: string;
  startsAt: string;
  message: string;
  paidCents: number | null;
};

export function cancellationEmail(c: CancellationEmailInput): { subject: string; html: string } {
  const business = c.businessName || "the organisers";
  const paragraphs = c.message
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return {
    subject: `Cancelled: ${c.title}`,
    html: `
      <p>Hi ${escapeHtml(c.name)},</p>
      <p>Sorry, ${escapeHtml(business)} has cancelled <strong>${escapeHtml(c.title)}</strong> on ${escapeHtml(formatLocalDateTime(c.startsAt))}.</p>
      ${paragraphs ? `<p><em>Their message:</em></p>${paragraphs}` : ""}
      ${c.paidCents ? `<p>You paid ${escapeHtml(formatRand(c.paidCents))} for your tickets. ${escapeHtml(business)} will be in touch about your refund.</p>` : ""}
      ${c.contact ? `<p>Questions? Contact ${escapeHtml(business)} on ${escapeHtml(c.contact)}.</p>` : ""}
    `,
  };
}

// Emails everyone still signed up (with an email address). Returns how many
// were sent.
export async function emailSignupsAboutCancellation(
  admin: SupabaseClient,
  tenantId: string,
  eventId: string,
  message: string,
): Promise<number> {
  const [{ data: event }, { data: signups }, { data: config }] = await Promise.all([
    admin.from("events").select("title, starts_at").eq("tenant_id", tenantId).eq("id", eventId).maybeSingle(),
    admin
      .from("event_signups")
      .select("id, name, email, payment_status, amount_due_cents")
      .eq("tenant_id", tenantId)
      .eq("event_id", eventId)
      .eq("status", "confirmed")
      .not("email", "is", null),
    admin.from("agent_configs").select("business_name, handoff_contact").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (!event) return 0;
  let sent = 0;
  for (const s of signups ?? []) {
    if (!s.email) continue;
    const { subject, html } = cancellationEmail({
      name: s.name,
      businessName: config?.business_name ?? "",
      contact: config?.handoff_contact ?? "",
      title: event.title,
      startsAt: event.starts_at,
      message,
      paidCents: s.payment_status === "paid" ? s.amount_due_cents : null,
    });
    await sendCustomerEmail({ to: s.email, subject, html });
    sent++;
  }
  return sent;
}
