import type { SupabaseClient } from "@supabase/supabase-js";
import { formatLocalDateTime } from "@/lib/agent/availability";
import { isWithinServiceWindow, sendWhatsAppTemplate, sendWhatsAppText } from "@/lib/channels/whatsapp";
import { canonicalPhone, formatPhone } from "@/lib/contacts/phone";
import { isOptedOut } from "@/lib/contacts/consent";
import { recordNotification } from "@/lib/notifications";
import { logBookingEvent } from "./manage";
import type { TenantWhatsApp } from "./whatsapp-channel";

// Booking reminders. Order of preference:
//   1. customer replied STOP → don't send;
//   2. they messaged within WhatsApp's 24h window → a normal message (free,
//      and needs no template approval);
//   3. otherwise the approved booking_reminder template;
//   4. if that fails too, record why in the booking's history and alert the
//      owner once, so someone can call them.

// Must exist and be approved in Meta Business Manager — see docs/SETUP.md.
export const REMINDER_TEMPLATE_NAME = "booking_reminder";
const REMINDER_TEMPLATE_LANGUAGE = "en";

export type NotSentReason = "opted_out" | "no_template" | "send_failed";

export const NOT_SENT_REASON: Record<NotSentReason, string> = {
  opted_out: "they replied STOP, so they don't get reminders",
  no_template:
    "there's no approved reminder template yet, and they haven't messaged in the last 24 hours",
  send_failed: "WhatsApp didn't accept the message",
};

export function reminderRoute(s: { optedOut: boolean; windowOpen: boolean }): "skip" | "message" | "template" {
  if (s.optedOut) return "skip";
  return s.windowOpen ? "message" : "template";
}

// Meta's 132xxx errors are template problems (missing, not approved, wrong
// parameters); anything else is a general send failure.
export function classifyTemplateError(err: unknown): NotSentReason {
  const text = err instanceof Error ? err.message : String(err);
  return /"code"\s*:\s*132\d{3}/.test(text) ? "no_template" : "send_failed";
}

export function reminderText(p: { name: string; service: string; business: string; startsAt: string }): string {
  const at = p.business ? ` at ${p.business}` : "";
  return `Hi ${p.name}, a reminder of your ${p.service}${at} on ${formatLocalDateTime(p.startsAt)}. Reply here if you need to change it.`;
}

export type ReminderBooking = {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  starts_at: string;
  contact_id: string | null;
  conversation_id: string | null;
  serviceName: string;
};

export type ReminderChannel = Pick<TenantWhatsApp, "phoneNumberId" | "accessToken" | "businessName">;

// The WhatsApp conversation to remind them in: the one the booking was made
// in, else this customer's latest WhatsApp chat (e.g. they booked on the
// website but have also messaged us on WhatsApp).
export async function findWhatsAppConversation(
  admin: SupabaseClient,
  b: Pick<ReminderBooking, "tenant_id" | "contact_id" | "conversation_id">,
) {
  const select = "id, channel, external_id, last_inbound_at";
  if (b.conversation_id) {
    const { data } = await admin
      .from("conversations")
      .select(select)
      .eq("id", b.conversation_id)
      .eq("tenant_id", b.tenant_id)
      .maybeSingle();
    if (data?.channel === "whatsapp") return data;
  }
  if (!b.contact_id) return null;
  const { data } = await admin
    .from("conversations")
    .select(select)
    .eq("tenant_id", b.tenant_id)
    .eq("contact_id", b.contact_id)
    .eq("channel", "whatsapp")
    .order("last_inbound_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function markSent(admin: SupabaseClient, b: ReminderBooking, via: "message" | "template") {
  await admin
    .from("bookings")
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq("id", b.id)
    .eq("tenant_id", b.tenant_id);
  await logBookingEvent(admin, {
    tenantId: b.tenant_id,
    bookingId: b.id,
    type: "reminder_sent",
    actor: "system",
    channel: "whatsapp",
    details: { via },
  });
}

// Logged and raised once per booking: the reminder job retries daily (the
// customer may message in the meantime, opening the window), and repeating
// the alert every run would just be noise.
async function markNotSent(admin: SupabaseClient, b: ReminderBooking, reason: NotSentReason) {
  const { count } = await admin
    .from("booking_events")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", b.tenant_id)
    .eq("booking_id", b.id)
    .eq("type", "reminder_not_sent");
  if (count) return;

  await logBookingEvent(admin, {
    tenantId: b.tenant_id,
    bookingId: b.id,
    type: "reminder_not_sent",
    actor: "system",
    channel: "whatsapp",
    details: { reason },
  });
  await recordNotification(admin, {
    tenantId: b.tenant_id,
    type: "reminder_not_sent",
    title: `Couldn't remind ${b.name}`,
    body: `${b.serviceName} on ${formatLocalDateTime(b.starts_at)}: ${NOT_SENT_REASON[reason]}. Call them on ${formatPhone(canonicalPhone(b.phone)) || b.phone}.`,
  });
}

export async function sendBookingReminder(
  admin: SupabaseClient,
  b: ReminderBooking,
  channel: ReminderChannel,
): Promise<"sent" | "not_sent"> {
  if (await isOptedOut(admin, b.tenant_id, b.contact_id)) {
    await markNotSent(admin, b, "opted_out");
    return "not_sent";
  }

  const conversation = await findWhatsAppConversation(admin, b);
  const route = reminderRoute({ optedOut: false, windowOpen: isWithinServiceWindow(conversation?.last_inbound_at ?? null) });

  if (route === "message" && conversation) {
    const text = reminderText({ name: b.name, service: b.serviceName, business: channel.businessName, startsAt: b.starts_at });
    try {
      await sendWhatsAppText(channel.phoneNumberId, channel.accessToken, conversation.external_id, text);
    } catch (err) {
      console.error(`Reminder message for booking ${b.id} failed:`, err);
      await markNotSent(admin, b, "send_failed");
      return "not_sent";
    }
    // Kept in the transcript so the AI and the owner see what was sent.
    await admin.from("messages").insert({ tenant_id: b.tenant_id, conversation_id: conversation.id, role: "assistant", content: text });
    await admin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id)
      .eq("tenant_id", b.tenant_id);
    await markSent(admin, b, "message");
    return "sent";
  }

  const to = canonicalPhone(b.phone);
  if (!to) {
    await markNotSent(admin, b, "send_failed");
    return "not_sent";
  }
  try {
    await sendWhatsAppTemplate(channel.phoneNumberId, channel.accessToken, to, REMINDER_TEMPLATE_NAME, REMINDER_TEMPLATE_LANGUAGE, [
      b.name,
      b.serviceName,
      formatLocalDateTime(b.starts_at),
    ]);
  } catch (err) {
    console.error(`Reminder template for booking ${b.id} failed:`, err);
    await markNotSent(admin, b, classifyTemplateError(err));
    return "not_sent";
  }
  await markSent(admin, b, "template");
  return "sent";
}
