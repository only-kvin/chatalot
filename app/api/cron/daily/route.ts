import { createAdminClient } from "@/lib/db/supabase-admin";
import { sendBookingReminder } from "@/lib/bookings/reminders";
import { BOOKING_PLACE_COLUMNS, type BookingPlace } from "@/lib/bookings/place";
import { REVIEW_LOOKBACK_DAYS, sendReviewRequest } from "@/lib/bookings/review-requests";
import { tenantWhatsAppLookup, type TenantWhatsApp } from "@/lib/bookings/whatsapp-channel";
import { sendDailySummary } from "@/lib/email/send-daily-summary";
import { tenantFeaturesLookup } from "@/lib/features";
import { runScheduledImports } from "@/lib/website/import";
import { recoverAllPayments } from "@/lib/payments/recover";
import { sendEventReminders } from "@/lib/events/reminders";
import type { Features } from "@/lib/plans";

// The daily jobs: booking reminders and review requests on WhatsApp, event
// reminders by email (lib/events/reminders.ts), then the owners' summary email. Runs once a day at 06:00 UTC = 08:00 SA (see
// vercel.json — Vercel's Hobby plan only allows daily cron schedules). How
// each message is sent, and what happens when it can't be, lives in
// lib/bookings/reminders.ts, review-requests.ts and lib/summary/.

// Rather than a narrow "~24h out" window a once-a-day run could easily
// straddle, reminders look ahead a full 2 days: any booking that far out or
// closer gets a reminder attempt every run until it's sent, so a failed send
// (or a missed/delayed cron trigger) still gets retried the next day instead
// of silently never firing.
const REMINDER_LOOKAHEAD_HOURS = 48;
// The function may run for up to 300s; website crawling stops in time to
// answer before that.
export const maxDuration = 300;
const WEBSITE_DEADLINE_MS = 270_000;
const HOUR_MS = 60 * 60 * 1000;

type Admin = ReturnType<typeof createAdminClient>;
type ChannelFor = (tenantId: string) => Promise<TenantWhatsApp | null>;
type FeaturesFor = (tenantId: string) => Promise<Features>;

// A many-to-one embed comes back as an object, not an array.
function serviceName(services: unknown): string {
  return (services as { name: string } | null)?.name ?? "appointment";
}

async function sendReminders(admin: Admin, channelFor: ChannelFor, featuresFor: FeaturesFor) {
  const now = Date.now();
  const { data: bookings, error } = await admin
    .from("bookings")
    .select(`id, tenant_id, name, phone, starts_at, contact_id, conversation_id, ${BOOKING_PLACE_COLUMNS}, services(name)`)
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .gte("starts_at", new Date(now).toISOString())
    .lt("starts_at", new Date(now + REMINDER_LOOKAHEAD_HOURS * HOUR_MS).toISOString());
  if (error) throw error;

  let sent = 0;
  let notSent = 0;
  for (const booking of bookings ?? []) {
    try {
      // Reminders need bookings and WhatsApp on the plan, and a connected
      // number. Left unsent otherwise, so an upgrade picks them up.
      const features = await featuresFor(booking.tenant_id);
      if (features.bookings !== "on" || features.whatsapp !== "on") continue;
      const channel = await channelFor(booking.tenant_id);
      if (!channel) continue;
      const result = await sendBookingReminder(
        admin,
        { ...booking, serviceName: serviceName(booking.services), place: booking as BookingPlace },
        channel,
      );
      if (result === "sent") sent++;
      else notSent++;
    } catch (err) {
      // Doesn't stop the rest of the batch; reminder_sent_at stays null, so
      // it's retried on tomorrow's run.
      console.error(`Reminder failed for booking ${booking.id}:`, err);
    }
  }
  return { checked: bookings?.length ?? 0, sent, notSent };
}

async function sendReviewRequests(admin: Admin, channelFor: ChannelFor, featuresFor: FeaturesFor) {
  const now = Date.now();
  const { data: bookings, error } = await admin
    .from("bookings")
    .select("id, tenant_id, name, phone, starts_at, contact_id, conversation_id, services(name)")
    .eq("status", "completed")
    .is("review_requested_at", null)
    .gte("starts_at", new Date(now - REVIEW_LOOKBACK_DAYS * 24 * HOUR_MS).toISOString())
    .lt("starts_at", new Date(now).toISOString());
  if (error) throw error;

  let sent = 0;
  let notSent = 0;
  for (const booking of bookings ?? []) {
    try {
      // Only tenants with review requests and WhatsApp on their plan, a
      // connected number and a Google review link send requests.
      // Left unclaimed otherwise, so adding the link later still covers
      // the last few days' visits.
      const features = await featuresFor(booking.tenant_id);
      if (features.reviews !== "on" || features.whatsapp !== "on") continue;
      const channel = await channelFor(booking.tenant_id);
      if (!channel?.googleReviewUrl) continue;
      const result = await sendReviewRequest(
        admin,
        { ...booking, serviceName: serviceName(booking.services) },
        { ...channel, googleReviewUrl: channel.googleReviewUrl },
      );
      if (result === "sent") sent++;
      else if (result === "not_sent") notSent++;
    } catch (err) {
      console.error(`Review request failed for booking ${booking.id}:`, err);
    }
  }
  return { checked: bookings?.length ?? 0, sent, notSent };
}

async function sendSummaries(admin: Admin) {
  const { data: configs, error } = await admin
    .from("agent_configs")
    .select("tenant_id, business_name, tenants!inner(status)")
    .eq("daily_summary_enabled", true)
    .eq("tenants.status", "active");
  if (error) throw error;

  const counts = { sent: 0, quiet: 0, alreadySent: 0 };
  for (const config of configs ?? []) {
    try {
      const result = await sendDailySummary(admin, { tenantId: config.tenant_id, businessName: config.business_name ?? "" });
      if (result === "sent") counts.sent++;
      else if (result === "quiet") counts.quiet++;
      else counts.alreadySent++;
    } catch (err) {
      console.error(`Daily summary failed for tenant ${config.tenant_id}:`, err);
    }
  }
  return counts;
}

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  const admin = createAdminClient();
  // One WhatsApp number and settings lookup per tenant, shared by both jobs.
  const channelFor = tenantWhatsAppLookup(admin);
  const featuresFor = tenantFeaturesLookup(admin);

  // Payments PayFast took but never told us about (a lost notification) are
  // picked up from its transaction history first, then unpaid holds that ran
  // out are released, so they get no reminder. (Booking checks do both as
  // they go; this catches the rest.)
  const [recovery] = await Promise.allSettled([recoverAllPayments(admin)]);
  if (recovery.status === "rejected") console.error("Recovering payments failed:", recovery.reason);
  const { data: expired, error: expireError } = await admin.rpc("expire_unpaid_bookings", { p_tenant_id: null });
  if (expireError) console.error("Releasing unpaid holds failed:", expireError);
  // Event tickets held for payment that ran out (sign-ups also release
  // these per event as they come in).
  const { error: signupExpireError } = await admin.rpc("expire_unpaid_event_signups", { p_tenant_id: null });
  if (signupExpireError) console.error("Releasing unpaid event sign-ups failed:", signupExpireError);

  // Each job runs even if the other fails.
  const [reminders, reviews, eventReminders] = await Promise.allSettled([
    sendReminders(admin, channelFor, featuresFor),
    sendReviewRequests(admin, channelFor, featuresFor),
    sendEventReminders(admin, featuresFor),
  ]);
  for (const [job, result] of [["reminders", reminders], ["review requests", reviews], ["event reminders", eventReminders]] as const) {
    if (result.status === "rejected") console.error(`Daily ${job} failed:`, result.reason);
  }
  // After the WhatsApp jobs, so today's "reminder not sent" is already known.
  const [summaries] = await Promise.allSettled([sendSummaries(admin)]);
  if (summaries.status === "rejected") console.error("Daily summaries failed:", summaries.reason);
  // Last, with the time that's left: website imports that stalled, and the
  // weekly re-crawl of a few businesses' websites.
  const [websites] = await Promise.allSettled([
    runScheduledImports(admin, { budgetMs: Math.max(0, startedAt + WEBSITE_DEADLINE_MS - Date.now()) }),
  ]);
  if (websites.status === "rejected") console.error("Website imports failed:", websites.reason);
  const ok = recovery.status === "fulfilled" && !expireError && [reminders, reviews, eventReminders, summaries, websites].every((r) => r.status === "fulfilled");

  return Response.json(
    {
      paymentsRecovered: recovery.status === "fulfilled" ? recovery.value : "failed",
      unpaidReleased: expireError ? "failed" : expired,
      reminders: reminders.status === "fulfilled" ? reminders.value : "failed",
      reviews: reviews.status === "fulfilled" ? reviews.value : "failed",
      eventReminders: eventReminders.status === "fulfilled" ? eventReminders.value : "failed",
      summaries: summaries.status === "fulfilled" ? summaries.value : "failed",
      websites: websites.status === "fulfilled" ? websites.value : "failed",
    },
    { status: ok ? 200 : 500 },
  );
}
