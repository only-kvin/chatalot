import { createAdminClient } from "@/lib/db/supabase-admin";
import { decrypt } from "@/lib/security/crypto";
import { sendWhatsAppTemplate } from "@/lib/channels/whatsapp";

// Must exist and be approved in Meta Business Manager before sends actually go
// out — see docs/SETUP.md. Until then this route runs end-to-end and just logs
// the Graph API rejection for each attempted send.
const REMINDER_TEMPLATE_NAME = "booking_reminder";
const REMINDER_TEMPLATE_LANGUAGE = "en";

// Runs once daily (see vercel.json — Vercel's Hobby plan only allows daily
// cron schedules). Rather than a narrow "~24h out" window a once-a-day run
// could easily straddle, this looks ahead a full 2 days: any booking that
// far out or closer gets a reminder attempt every run until it's sent, so a
// failed send (or a missed/delayed cron trigger) still gets retried the next
// day instead of silently never firing.
const LOOKAHEAD_HOURS = 48;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const windowStart = new Date().toISOString();
  const windowEnd = new Date(Date.now() + LOOKAHEAD_HOURS * 60 * 60 * 1000).toISOString();

  const { data: bookings, error } = await admin
    .from("bookings")
    .select("id, tenant_id, name, phone, starts_at, services(name)")
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .gte("starts_at", windowStart)
    .lt("starts_at", windowEnd);

  if (error) {
    console.error("Failed to load bookings for reminders:", error);
    return new Response("Error", { status: 500 });
  }

  let sent = 0;
  for (const booking of bookings ?? []) {
    try {
      const { data: channel } = await admin
        .from("channels")
        .select("wa_phone_number_id, wa_access_token_encrypted")
        .eq("tenant_id", booking.tenant_id)
        .eq("type", "whatsapp")
        .eq("status", "active")
        .maybeSingle();
      if (!channel?.wa_access_token_encrypted || !channel.wa_phone_number_id) continue;

      const serviceName =
        (booking.services as { name: string }[] | null)?.[0]?.name ?? "your appointment";
      const timeLabel = new Date(booking.starts_at).toLocaleString("en-ZA", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Johannesburg",
      });

      await sendWhatsAppTemplate(
        channel.wa_phone_number_id,
        decrypt(channel.wa_access_token_encrypted),
        booking.phone,
        REMINDER_TEMPLATE_NAME,
        REMINDER_TEMPLATE_LANGUAGE,
        [booking.name, serviceName, timeLabel],
      );

      await admin
        .from("bookings")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", booking.id);
      sent++;
    } catch (err) {
      // Doesn't stop the rest of the batch — reminder_sent_at stays null so
      // this booking is retried on tomorrow's run, until it's sent or it
      // falls out of the lookahead window entirely.
      console.error(`Reminder failed for booking ${booking.id}:`, err);
    }
  }

  return Response.json({ checked: bookings?.length ?? 0, sent });
}
