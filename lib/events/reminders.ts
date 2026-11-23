import type { SupabaseClient } from "@supabase/supabase-js";
import { formatLocalTime, localDateISO } from "@/lib/time";
import { formatRand } from "@/lib/bookings/price-label";
import { escapeHtml, sendCustomerEmail } from "@/lib/email/send";
import type { Features } from "@/lib/plans";

// Event reminders, from the daily cron (08:00 SA): everyone still signed up
// for a published event starting in the next 40 hours (the rest of today and
// all of tomorrow) gets one email, if they gave an address and their spot is
// secured (free, paid, or pay at the event; not an unpaid hold). People who
// signed up in the last 12 hours are skipped: they've just had their
// "You're signed up" email. Each sign-up is reminded at most once.

export const LOOKAHEAD_HOURS = 40;
const RECENT_SIGNUP_HOURS = 12;
const HOUR = 3600_000;

export type ReminderInput = {
  name: string;
  businessName: string;
  contact: string;
  title: string;
  startsAt: string;
  location: string;
  quantity: number;
  // Owed at the door: a priced event the customer hasn't paid online.
  payAtEventCents: number | null;
  now: Date;
};

// "today" / "tomorrow" / the weekday, in SA time.
export function dayWord(startsAt: string, now: Date): string {
  const day = localDateISO(new Date(startsAt));
  const today = localDateISO(now);
  if (day === today) return "today";
  if (day === localDateISO(new Date(now.getTime() + 24 * HOUR))) return "tomorrow";
  return `on ${new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", weekday: "long" }).format(new Date(startsAt))}`;
}

export function reminderEmail(r: ReminderInput): { subject: string; html: string } {
  const business = r.businessName || "the organisers";
  const when = `${dayWord(r.startsAt, r.now)} at ${formatLocalTime(r.startsAt)}`;
  const tickets = `${r.quantity} ticket${r.quantity === 1 ? "" : "s"}`;
  return {
    subject: `Reminder: ${r.title} is ${when}`,
    html: `
      <p>Hi ${escapeHtml(r.name)},</p>
      <p>A reminder that <strong>${escapeHtml(r.title)}</strong> with ${escapeHtml(business)} is ${escapeHtml(when)}.</p>
      <p>${r.location ? `${escapeHtml(r.location)}<br>` : ""}${escapeHtml(tickets)}</p>
      ${r.payAtEventCents ? `<p>Please bring ${escapeHtml(formatRand(r.payAtEventCents))} to pay at the event.</p>` : ""}
      ${r.contact ? `<p>Can't make it any more? Let ${escapeHtml(business)} know on ${escapeHtml(r.contact)}.</p>` : ""}
      <p>See you there!</p>
    `,
  };
}

type EventRow = { id: string; tenant_id: string; title: string; starts_at: string; location: string; price_cents: number | null };
type SignupRow = { id: string; event_id: string; name: string; email: string | null; quantity: number; payment_status: string };

export async function sendEventReminders(
  admin: SupabaseClient,
  featuresFor: (tenantId: string) => Promise<Features>,
  now = new Date(),
): Promise<{ events: number; sent: number }> {
  const { data: events, error } = await admin
    .from("events")
    .select("id, tenant_id, title, starts_at, location, price_cents")
    .eq("status", "published")
    .gt("starts_at", now.toISOString())
    .lte("starts_at", new Date(now.getTime() + LOOKAHEAD_HOURS * HOUR).toISOString());
  if (error) throw error;

  let sent = 0;
  const configs = new Map<string, { business: string; contact: string } | null>();
  for (const event of (events ?? []) as EventRow[]) {
    try {
      // Events not (any more) in their plan: no reminders.
      if ((await featuresFor(event.tenant_id)).events !== "on") continue;
      if (!configs.has(event.tenant_id)) {
        const { data } = await admin.from("agent_configs").select("business_name, handoff_contact").eq("tenant_id", event.tenant_id).maybeSingle();
        configs.set(event.tenant_id, data ? { business: data.business_name ?? "", contact: data.handoff_contact ?? "" } : null);
      }
      const config = configs.get(event.tenant_id);
      const { data: signups, error: signupError } = await admin
        .from("event_signups")
        .select("id, event_id, name, email, quantity, payment_status")
        .eq("tenant_id", event.tenant_id)
        .eq("event_id", event.id)
        .eq("status", "confirmed")
        .is("reminder_sent_at", null)
        .in("payment_status", ["not_required", "paid"])
        .not("email", "is", null)
        .lt("created_at", new Date(now.getTime() - RECENT_SIGNUP_HOURS * HOUR).toISOString());
      if (signupError) throw signupError;

      for (const s of (signups ?? []) as SignupRow[]) {
        if (!s.email) continue;
        // Claim it first, so a re-run (or overlapping run) can't send twice.
        const { data: claimed } = await admin
          .from("event_signups")
          .update({ reminder_sent_at: now.toISOString() })
          .eq("id", s.id)
          .is("reminder_sent_at", null)
          .select("id");
        if (!claimed?.length) continue;
        const { subject, html } = reminderEmail({
          name: s.name,
          businessName: config?.business ?? "",
          contact: config?.contact ?? "",
          title: event.title,
          startsAt: event.starts_at,
          location: event.location,
          quantity: s.quantity,
          payAtEventCents: s.payment_status === "not_required" && event.price_cents ? event.price_cents * s.quantity : null,
          now,
        });
        await sendCustomerEmail({ to: s.email, subject, html });
        sent++;
      }
    } catch (err) {
      console.error(`Event reminders for ${event.id} failed:`, err);
    }
  }
  return { events: events?.length ?? 0, sent };
}
