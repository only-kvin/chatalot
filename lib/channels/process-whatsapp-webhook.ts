import { createAdminClient } from "@/lib/db/supabase-admin";
import { decrypt } from "@/lib/security/crypto";
import { redis } from "@/lib/redis";
import { isWithinServiceWindow, sendWhatsAppText } from "./whatsapp";
import { customerTurns, redisTurnStore } from "./customer-lock";
import { runAgent } from "@/lib/agent/engine";
import { wantsHuman } from "@/lib/agent/handoff-intent";
import { linkConversation, upsertContact } from "@/lib/contacts/upsert";
import { consentKeyword, setOptedOut, START_CONFIRMATION, STOP_CONFIRMATION } from "@/lib/contacts/consent";
import { checkDailyTenantCap } from "@/lib/security/rate-limit";
import { notifyOwnerHumanRequested } from "@/lib/email/notify-human-requested";

type WhatsAppMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
};

type WhatsAppStatus = {
  id: string;
  status: string;
  errors?: { code: number; title: string }[];
};

type WebhookValue = {
  metadata: { phone_number_id: string };
  // The sender's WhatsApp profile, keyed by their number (wa_id).
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
};

type WebhookPayload = {
  entry?: { changes?: { field: string; value: WebhookValue }[] }[];
};

type AdminClient = ReturnType<typeof createAdminClient>;

// Message types we can't read but should acknowledge, so the customer isn't
// left waiting (voice notes are very common in SA). Anything else — e.g.
// reactions or system notices — is ignored without a reply.
const NON_TEXT_LABELS: Record<string, string> = {
  audio: "a voice note",
  image: "a photo",
  video: "a video",
  document: "a document",
  sticker: "a sticker",
  location: "a location",
  contacts: "a contact card",
  unsupported: "an unsupported message",
};
const NON_TEXT_REPLY = "Sorry, I can only read text messages for now — please type your question.";

const turnStore = redisTurnStore(redis);

async function isAlreadyProcessed(admin: AdminClient, providerMessageId: string): Promise<boolean> {
  const { error } = await admin
    .from("processed_events")
    .insert({ provider_message_id: providerMessageId });
  // Unique violation means we've handled this message id before (Meta retries deliveries).
  return error?.code === "23505";
}

async function saveMessage(
  admin: AdminClient,
  tenantId: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
) {
  await admin
    .from("messages")
    .insert({ tenant_id: tenantId, conversation_id: conversationId, role, content });
}

async function handleMessage(
  admin: AdminClient,
  tenantId: string,
  phoneNumberId: string,
  accessToken: string,
  message: WhatsAppMessage,
  profileName: string | null,
) {
  const isText = message.type === "text" && !!message.text;
  const nonTextLabel = NON_TEXT_LABELS[message.type];
  if (!isText && !nonTextLabel) return;
  if (await isAlreadyProcessed(admin, message.id)) return;

  const customerPhone = message.from;
  const receivedAt = new Date().toISOString();

  // Any inbound message, text or not, opens Meta's 24h window.
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
    .select("id, status, last_inbound_at, contact_id")
    .single();
  if (!conversation) return;

  // Their number is known, so every WhatsApp sender is a customer record.
  const contactId = await upsertContact(admin, {
    tenantId,
    phone: customerPhone,
    name: profileName,
    nameSource: "whatsapp_profile",
    channel: "whatsapp",
    seenAt: receivedAt,
  }).catch((err) => {
    console.error("Recording WhatsApp customer failed:", err);
    return null;
  });
  if (contactId && !conversation.contact_id) {
    await linkConversation(admin, tenantId, conversation.id, contactId);
  }

  if (!isText) {
    // Saved so the owner sees it in the transcript and the AI knows about it
    // on the customer's next text message.
    await saveMessage(admin, tenantId, conversation.id, "user", `[Customer sent ${nonTextLabel}]`);
    // In human mode the owner replies from the dashboard; no auto-reply.
    if (conversation.status === "human") return;
    await saveMessage(admin, tenantId, conversation.id, "assistant", NON_TEXT_REPLY);
    await sendWhatsAppText(phoneNumberId, accessToken, customerPhone, NON_TEXT_REPLY);
    return;
  }

  const text = message.text!.body;

  // Every text message goes in the transcript except the ones that start an
  // AI turn — runAgent saves those itself, once it knows the turn will run.
  // STOP pauses the AI and opts them out of every message we'd start
  // (reminders, notices); START undoes both. Both are confirmed — they just
  // messaged us, so the 24h window is open.
  const keyword = consentKeyword(text);
  if (keyword) {
    await saveMessage(admin, tenantId, conversation.id, "user", text);
    if (contactId) await setOptedOut(admin, tenantId, contactId, keyword === "stop");
    await admin
      .from("conversations")
      .update({ status: keyword === "stop" ? "human" : "ai" })
      .eq("id", conversation.id)
      .eq("tenant_id", tenantId);
    const confirmation = keyword === "stop" ? STOP_CONFIRMATION : START_CONFIRMATION;
    await sendWhatsAppText(phoneNumberId, accessToken, customerPhone, confirmation);
    await saveMessage(admin, tenantId, conversation.id, "assistant", confirmation);
    return;
  }

  const { data: agentConfig } = await admin
    .from("agent_configs")
    .select("business_name, handoff_contact")
    .eq("tenant_id", tenantId)
    .single();
  const businessName = agentConfig?.business_name ?? "";
  const handoffContact = agentConfig?.handoff_contact ?? "";

  if (wantsHuman(text)) {
    const confirmation = "A team member will get back to you shortly.";
    await saveMessage(admin, tenantId, conversation.id, "user", text);
    await setHuman(admin, tenantId, conversation.id);
    await notifyOwnerHumanRequested(
      admin,
      tenantId,
      businessName,
      "Visitor asked for a person on WhatsApp",
      conversation.id,
    );
    await sendWhatsAppText(phoneNumberId, accessToken, customerPhone, confirmation);
    await saveMessage(admin, tenantId, conversation.id, "assistant", confirmation);
    return;
  }

  if (conversation.status === "human") {
    // The owner is handling this one from the dashboard.
    await saveMessage(admin, tenantId, conversation.id, "user", text);
    return;
  }

  const turns = customerTurns(turnStore, tenantId, customerPhone);
  // Marked before waiting on the lock, so a turn already in progress can see
  // that its reply is about to be stale.
  await turns.markLatest(message.id);

  await turns.withLock(async () => {
    // Waiting for the previous turn can take a while; the owner may have
    // taken over, or more messages may have arrived, in the meantime.
    const { data: current } = await admin
      .from("conversations")
      .select("status")
      .eq("id", conversation.id)
      .eq("tenant_id", tenantId)
      .single();
    // Either way the message is kept: for the owner, or so the newer
    // message's turn answers this one too.
    if (current?.status === "human" || (await turns.isSuperseded(message.id))) {
      await saveMessage(admin, tenantId, conversation.id, "user", text);
      return;
    }

    // Checked under the lock so a burst can't race past the cap.
    const { allowed } = await checkDailyTenantCap(admin, tenantId);
    if (!allowed) {
      await handOffAtCap(admin, {
        tenantId,
        phoneNumberId,
        accessToken,
        customerPhone,
        businessName,
        handoffContact,
        conversationId: conversation.id,
        text,
      });
      return;
    }

    await replyWithAgent(admin, {
      tenantId,
      phoneNumberId,
      accessToken,
      customerPhone,
      businessName,
      conversationId: conversation.id,
      lastInboundAt: conversation.last_inbound_at,
      messageId: message.id,
      text,
      turns,
    });
  });
}

async function replyWithAgent(
  admin: AdminClient,
  p: {
    tenantId: string;
    phoneNumberId: string;
    accessToken: string;
    customerPhone: string;
    businessName: string;
    conversationId: string;
    lastInboundAt: string | null;
    messageId: string;
    text: string;
    turns: ReturnType<typeof customerTurns>;
  },
) {
  // Avoids a second owner email if the fallback send also fails below.
  let ownerNotified = false;
  try {
    const agent = runAgent({
      tenantId: p.tenantId,
      conversationId: p.conversationId,
      userMessage: p.text,
      channel: "whatsapp",
      keepReply: async ({ failed, handedOff }) => {
        // A failure's fallback text (with handoff_contact) always goes out.
        // So does the AI's own "someone will be in touch" after request_human.
        if (failed || handedOff) return true;

        // The owner may have hit "Take over" while the reply was generating —
        // if so, it's theirs now and the AI stays quiet.
        const { data: current } = await admin
          .from("conversations")
          .select("status")
          .eq("id", p.conversationId)
          .eq("tenant_id", p.tenantId)
          .single();
        if (current?.status === "human") return false;

        return !(await p.turns.isSuperseded(p.messageId));
      },
    });
    let fullText = "";
    let step = await agent.next();
    while (!step.done) {
      fullText += step.value;
      step = await agent.next();
    }
    const outcome = step.value;
    if (outcome.discarded) return;

    if (outcome.failed) {
      // The fallback still goes out below; this makes sure a person actually
      // follows up rather than the customer being left with just an apology.
      await handOffAfterFailure(admin, p.tenantId, p.businessName, p.conversationId, "the AI model failed or timed out");
      ownerNotified = true;
    }

    if (!fullText.trim()) return;
    if (!isWithinServiceWindow(p.lastInboundAt)) {
      // Can't happen for an immediate reply today; guards against slow
      // processing and keeps the rule enforced in one place if that changes.
      console.error(`WhatsApp reply for conversation ${p.conversationId} is outside the 24h window; not sent.`);
      return;
    }
    await sendWhatsAppText(p.phoneNumberId, p.accessToken, p.customerPhone, fullText);
  } catch (err) {
    // Meta already has its 200, so it won't redeliver — without this the
    // customer would silently never get a reply.
    console.error(`WhatsApp reply for message ${p.messageId} failed:`, err);
    if (ownerNotified) return;
    await handOffAfterFailure(admin, p.tenantId, p.businessName, p.conversationId, "the AI's reply could not be generated or sent");
  }
}

// Over the daily cap the AI can't answer, but going silent on WhatsApp would
// leave the customer waiting with no reply. Handing off to a person means
// the customer is told once, the owner is emailed once, and further messages
// in this conversation are saved quietly for the owner to answer.
async function handOffAtCap(
  admin: AdminClient,
  p: {
    tenantId: string;
    phoneNumberId: string;
    accessToken: string;
    customerPhone: string;
    businessName: string;
    handoffContact: string;
    conversationId: string;
    text: string;
  },
) {
  await saveMessage(admin, p.tenantId, p.conversationId, "user", p.text);
  await setHuman(admin, p.tenantId, p.conversationId);
  await notifyOwnerHumanRequested(
    admin,
    p.tenantId,
    p.businessName,
    "Your daily AI message limit was reached, so a WhatsApp customer needs a reply from you.",
    p.conversationId,
  );

  const notice = `Thanks for your message! A team member will get back to you as soon as possible${
    p.handoffContact ? `, or you can reach us at ${p.handoffContact}` : ""
  }.`;
  await sendWhatsAppText(p.phoneNumberId, p.accessToken, p.customerPhone, notice);
  await saveMessage(admin, p.tenantId, p.conversationId, "assistant", notice);
}

async function setHuman(admin: AdminClient, tenantId: string, conversationId: string) {
  await admin
    .from("conversations")
    .update({ status: "human" })
    .eq("id", conversationId)
    .eq("tenant_id", tenantId);
}

// Best-effort: runs from error paths, so its own failures are logged, not thrown.
async function handOffAfterFailure(
  admin: AdminClient,
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
      conversationId,
    );
  } catch (err) {
    console.error(`Failure handoff for conversation ${conversationId} failed:`, err);
  }
}

// Meta reports delivery outcomes asynchronously. Only failures matter here —
// e.g. 131047 means the reply was sent outside the 24h window — and they'd
// otherwise be invisible, since the send itself already returned 200.
function logFailedStatuses(statuses: WhatsAppStatus[]) {
  for (const s of statuses) {
    if (s.status !== "failed") continue;
    const errors = (s.errors ?? []).map((e) => `${e.code} ${e.title}`).join("; ");
    console.error(`WhatsApp message ${s.id} failed to deliver: ${errors || "no error details"}`);
  }
}

export async function processWhatsAppWebhook(payload: WebhookPayload): Promise<void> {
  const admin = createAdminClient();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const { metadata, messages, statuses, contacts } = change.value;
      if (statuses?.length) logFailedStatuses(statuses);
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
            contacts?.find((c) => c.wa_id === message.from)?.profile?.name ?? null,
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
