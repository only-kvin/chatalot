import { createAdminClient } from "@/lib/db/supabase-admin";
import { decrypt } from "@/lib/security/crypto";
import { isWithinServiceWindow, sendWhatsAppText } from "./whatsapp";
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
  const receivedAt = new Date().toISOString();

  const { data: conversation } = await admin
    .from("conversations")
    .upsert(
      {
        tenant_id: tenantId,
        channel: "whatsapp",
        external_id: customerPhone,
        last_message_at: receivedAt,
        last_inbound_at: receivedAt,
      },
      { onConflict: "tenant_id,channel,external_id" },
    )
    .select("id, status, last_inbound_at")
    .single();
  if (!conversation) return;

  if (normalized === "stop") {
    await setHuman(admin, tenantId, conversation.id);
    return;
  }

  const { data: agentConfig } = await admin
    .from("agent_configs")
    .select("business_name")
    .eq("tenant_id", tenantId)
    .single();
  const businessName = agentConfig?.business_name ?? "";

  if (normalized === "human" || normalized === "agent") {
    await setHuman(admin, tenantId, conversation.id);
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

  // Avoids a second owner email if the fallback send also fails below.
  let ownerNotified = false;
  try {
    const agent = runAgent({ tenantId, conversationId: conversation.id, userMessage: text });
    let fullText = "";
    let step = await agent.next();
    while (!step.done) {
      fullText += step.value;
      step = await agent.next();
    }
    const outcome = step.value;

    if (outcome.failed) {
      // The engine's fallback text (with handoff_contact) still goes out below;
      // this makes sure a person actually follows up rather than the customer
      // being left with just an apology.
      await handOffAfterFailure(admin, tenantId, businessName, conversation.id, "the AI model failed or timed out");
      ownerNotified = true;
    } else if (!outcome.handedOff) {
      // The owner may have hit "Take over" while the reply was generating — if
      // so, it's theirs now and the AI stays quiet. (When the AI itself
      // called request_human this turn, its "someone will be in touch" reply
      // must still go out.)
      const { data: current } = await admin
        .from("conversations")
        .select("status")
        .eq("id", conversation.id)
        .eq("tenant_id", tenantId)
        .single();
      if (current?.status === "human") return;
    }

    if (!fullText.trim()) return;
    if (!isWithinServiceWindow(conversation.last_inbound_at)) {
      // Can't happen for an immediate reply today; guards against slow
      // processing and keeps the rule enforced in one place if that changes.
      console.error(`WhatsApp reply for conversation ${conversation.id} is outside the 24h window; not sent.`);
      return;
    }
    await sendWhatsAppText(phoneNumberId, accessToken, customerPhone, fullText);
  } catch (err) {
    // Meta already has its 200, so it won't redeliver — without this the
    // customer would silently never get a reply.
    console.error(`WhatsApp reply for message ${message.id} failed:`, err);
    if (ownerNotified) return;
    await handOffAfterFailure(admin, tenantId, businessName, conversation.id, "the AI's reply could not be generated or sent");
  }
}

async function setHuman(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  conversationId: string,
) {
  await admin
    .from("conversations")
    .update({ status: "human" })
    .eq("id", conversationId)
    .eq("tenant_id", tenantId);
}

// Best-effort: runs from error paths, so its own failures are logged, not thrown.
async function handOffAfterFailure(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  businessName: string,
  conversationId: string,
  reason: string,
) {
  try {
    await setHuman(admin, tenantId, conversationId);
    await notifyOwnerHumanRequested(
      admin,
      tenantId,
      businessName,
      `A WhatsApp customer needs a reply — ${reason}.`,
    );
  } catch (err) {
    console.error(`Failure handoff for conversation ${conversationId} failed:`, err);
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
