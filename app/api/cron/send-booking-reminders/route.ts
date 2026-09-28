import { createAdminClient } from "@/lib/db/supabase-admin";
import { decrypt } from "@/lib/security/crypto";
import { sendBookingReminder, type ReminderChannel } from "@/lib/bookings/reminders";

// Runs once daily (see vercel.json — Vercel's Hobby plan only allows daily
// cron schedules). Rather than a narrow "~24h out" window a once-a-day run
// could easily straddle, this looks ahead a full 2 days: any booking that
// far out or closer gets a reminder attempt every run until it's sent, so a
// failed send (or a missed/delayed cron trigger) still gets retried the next
// day instead of silently never firing. How each reminder is sent, and what
// happens when it can't be, lives in lib/bookings/reminders.ts.
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
    .select("id, tenant_id, name, phone, starts_at, contact_id, conversation_id, services(name)")
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .gte("starts_at", windowStart)
    .lt("starts_at", windowEnd);

  if (error) {
    console.error("Failed to load bookings for reminders:", error);
    return new Response("Error", { status: 500 });
  }

  // One WhatsApp number and business name per tenant; looked up once each.
  const channels = new Map<string, ReminderChannel | null>();
  async function channelFor(tenantId: string): Promise<ReminderChannel | null> {
    if (!channels.has(tenantId)) {
      const [{ data: channel }, { data: config }] = await Promise.all([
        admin
          .from("channels")
          .select("wa_phone_number_id, wa_access_token_encrypted")
          .eq("tenant_id", tenantId)
          .eq("type", "whatsapp")
          .eq("status", "active")
          .limit(1)
          .maybeSingle(),
        admin.from("agent_configs").select("business_name").eq("tenant_id", tenantId).maybeSingle(),
      ]);
      channels.set(
        tenantId,
        channel?.wa_phone_number_id && channel.wa_access_token_encrypted
          ? {
              phoneNumberId: channel.wa_phone_number_id,
              accessToken: decrypt(channel.wa_access_token_encrypted),
              businessName: config?.business_name ?? "",
            }
          : null,
      );
    }
    return channels.get(tenantId) ?? null;
  }

  let sent = 0;
  let notSent = 0;
  for (const booking of bookings ?? []) {
    try {
      // Tenants without WhatsApp don't have reminders at all.
      const channel = await channelFor(booking.tenant_id);
      if (!channel) continue;

      const result = await sendBookingReminder(
        admin,
        {
          ...booking,
          // A many-to-one embed comes back as an object, not an array.
          serviceName: (booking.services as unknown as { name: string } | null)?.name ?? "appointment",
        },
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

  return Response.json({ checked: bookings?.length ?? 0, sent, notSent });
}
