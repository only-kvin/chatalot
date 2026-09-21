import { createAdminClient } from "@/lib/db/supabase-admin";
import { decrypt } from "@/lib/security/crypto";
import { sendWhatsAppText } from "./whatsapp";
import { runAgent } from "@/lib/agent/engine";
import { notifyOwnerHumanRequested } from "@/lib/email/notify-human-requested";

type WhatsAppMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
};

type WebhookValue = {
  metadata: { phone_number_id: string };
  messages?: WhatsAppMessage[];
};

type WebhookPayload = {
  entry?: { changes?: { field: string; value: WebhookValue }[] }[];
};

async function isAlreadyProcessed(
  admin: ReturnType<typeof createAdminClient>,
  providerMessageId: string,
): Promise<boolean> {
  const { error } = await admin
    .from("processed_events")
    .insert({ provider_message_id: providerMessageId });
  // Unique violation means we've handled this message id before (Meta retries deliveries).
  return error?.code === "23505";
}

async function handleMessage(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  phoneNumberId: string,
  accessToken: string,
  message: WhatsAppMessage,
) {
  if (await isAlreadyProcessed(admin, message.id)) return;
  if (message.type !== "text" || !message.text) return;

  const customerPhone = message.from;
  const text = message.text.body;
  const normalized = text.trim().toLowerCase();

  const { data: conversation } = await admin
    .from("conversations")
    .upsert(
      {
        tenant_id: tenantId,
        channel: "whatsapp",
        external_id: customerPhone,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,channel,external_id" },
    )
    .select("id, status")
    .single();
  if (!conversation) return;

  if (normalized === "stop") {
    await admin.from("conversations").update({ status: "human" }).eq("id", conversation.id);
    return;
  }

  const { data: agentConfig } = await admin
    .from("agent_configs")
    .select("business_name")
    .eq("tenant_id", tenantId)
    .single();
  const businessName = agentConfig?.business_name ?? "";

  if (normalized === "human" || normalized === "agent") {
    await admin.from("conversations").update({ status: "human" }).eq("id", conversation.id);
    await notifyOwnerHumanRequested(admin, tenantId, businessName, "Visitor asked for a person on WhatsApp");
    await sendWhatsAppText(
      phoneNumberId,
      accessToken,
      customerPhone,
      "A team member will get back to you shortly.",
    );
    return;
  }

  if (conversation.status === "human") return;

  let fullText = "";
  for await (const chunk of runAgent({
    tenantId,
    conversationId: conversation.id,
    userMessage: text,
  })) {
    fullText += chunk;
  }

  if (fullText.trim()) {
    await sendWhatsAppText(phoneNumberId, accessToken, customerPhone, fullText);
  }
}

export async function processWhatsAppWebhook(payload: WebhookPayload): Promise<void> {
  const admin = createAdminClient();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const { metadata, messages } = change.value;
      if (!messages?.length) continue;

      const { data: channel } = await admin
        .from("channels")
        .select("tenant_id, wa_access_token_encrypted")
        .eq("type", "whatsapp")
        .eq("wa_phone_number_id", metadata.phone_number_id)
        .eq("status", "active")
        .single();
      if (!channel?.wa_access_token_encrypted) continue;

      const accessToken = decrypt(channel.wa_access_token_encrypted);

      for (const message of messages) {
        try {
          await handleMessage(
            admin,
            channel.tenant_id,
            metadata.phone_number_id,
            accessToken,
            message,
          );
        } catch (err) {
          // This already returned 200 to Meta — there's no request left to fail.
          // Log so it's visible in function logs, and keep processing the rest
          // of the batch rather than losing it to an unhandled rejection.
          console.error(`WhatsApp message ${message.id} failed:`, err);
        }
      }
    }
  }
}
