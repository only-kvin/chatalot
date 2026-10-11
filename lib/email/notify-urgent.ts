import type { SupabaseClient } from "@supabase/supabase-js";
import { notificationPath, recordNotification } from "@/lib/notifications";
import { canonicalPhone, formatPhone } from "@/lib/contacts/phone";
import { isWithinServiceWindow, sendWhatsAppTemplate, sendWhatsAppText } from "@/lib/channels/whatsapp";
import { tenantWhatsAppLookup } from "@/lib/bookings/whatsapp-channel";
import { sendOwnerEmail } from "./send";
import { BRAND_NAME } from "@/lib/brand";

// An emergency call-out: the bell (shown first and in red), an email, and a
// WhatsApp message to the owner's own mobile when they've set one in
// Settings. Each is best-effort; one failing never stops the others.

// Must exist and be approved in WhatsApp Manager to reach the owner outside
// WhatsApp's 24-hour window — see docs/SETUP.md.
export const URGENT_TEMPLATE_NAME = "urgent_alert";

export type UrgentJob = {
  problem: string;
  name: string | null;
  phone: string | null;
  address: string | null;
};

export function urgentAlertText(businessName: string, job: UrgentJob): string {
  const who = [job.name, job.phone ? formatPhone(canonicalPhone(job.phone)) || job.phone : null].filter(Boolean).join(", ");
  return [
    `URGENT call-out for ${businessName}: ${job.problem}.`,
    who ? `Customer: ${who}.` : "",
    job.address ? `Where: ${job.address}.` : "",
    `The chat is waiting for you in ${BRAND_NAME}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function notifyOwnerOfUrgent(
  admin: SupabaseClient,
  tenantId: string,
  businessName: string,
  job: UrgentJob,
  conversationId: string | null,
): Promise<{ whatsapp: "sent" | "not_set" | "failed" }> {
  await recordNotification(admin, {
    tenantId,
    type: "urgent",
    title: `URGENT: ${job.problem}`.slice(0, 200),
    body: [job.name, job.phone, job.address].filter(Boolean).join(" · ") || "Open the chat to reply",
    conversationId,
  });

  await sendOwnerEmail(admin, tenantId, {
    subject: `URGENT call-out: ${job.problem} (${businessName})`.slice(0, 200),
    intro: "A customer has an emergency. Your AI receptionist handed the chat to you and didn't offer them a booking time.",
    details: [
      ["Problem", job.problem],
      ["Name", job.name],
      ["Phone", job.phone],
      ["Where", job.address],
    ],
    path: notificationPath("urgent", conversationId),
  }).catch((err) => console.error(`Urgent email for ${tenantId} failed:`, err));

  return { whatsapp: await whatsAppOwner(admin, tenantId, businessName, job) };
}

// Inside the 24-hour window (the owner messaged the business number
// recently) a normal message; otherwise the urgent_alert template.
async function whatsAppOwner(
  admin: SupabaseClient,
  tenantId: string,
  businessName: string,
  job: UrgentJob,
): Promise<"sent" | "not_set" | "failed"> {
  try {
    const { data: config } = await admin.from("agent_configs").select("owner_alert_phone").eq("tenant_id", tenantId).maybeSingle();
    const to = canonicalPhone(config?.owner_alert_phone);
    const channel = to ? await tenantWhatsAppLookup(admin)(tenantId) : null;
    if (!to || !channel) return "not_set";

    const { data: chat } = await admin
      .from("conversations")
      .select("last_inbound_at")
      .eq("tenant_id", tenantId)
      .eq("channel", "whatsapp")
      .eq("external_id", to)
      .maybeSingle();
    if (isWithinServiceWindow(chat?.last_inbound_at ?? null)) {
      await sendWhatsAppText(channel.phoneNumberId, channel.accessToken, to, urgentAlertText(businessName, job));
    } else {
      await sendWhatsAppTemplate(channel.phoneNumberId, channel.accessToken, to, URGENT_TEMPLATE_NAME, "en", [
        businessName,
        job.problem.slice(0, 200),
        [job.name, job.phone].filter(Boolean).join(", ") || "not given yet",
      ]);
    }
    return "sent";
  } catch (err) {
    console.error(`Urgent WhatsApp alert for ${tenantId} failed:`, err);
    return "failed";
  }
}
