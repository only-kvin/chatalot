import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/security/crypto";
import { isWithinServiceWindow, sendWhatsAppText } from "./whatsapp";

export type TeamSendResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_whatsapp" | "window_closed" | "no_channel" | "takeover_failed" | "send_failed"; message: string };

// Sends a message from a dashboard user to a WhatsApp conversation and saves
// it to the transcript as theirs. Uses the signed-in user's client, so RLS
// confines it to their tenant. Shared by the conversation reply box and
// booking changes made from the dashboard.
export async function sendTeamWhatsApp(
  supabase: SupabaseClient,
  s: {
    tenantId: string;
    conversationId: string;
    userId: string;
    text: string;
    // The reply box takes the conversation over; a booking notice doesn't.
    takeOver: boolean;
  },
): Promise<TeamSendResult> {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, channel, external_id, status, last_inbound_at")
    .eq("id", s.conversationId)
    .eq("tenant_id", s.tenantId)
    .maybeSingle();
  if (!conversation) return { ok: false, reason: "not_found", message: "Conversation not found." };
  if (conversation.channel !== "whatsapp") {
    return { ok: false, reason: "not_whatsapp", message: "Replying from the dashboard only works for WhatsApp conversations." };
  }
  if (!isWithinServiceWindow(conversation.last_inbound_at)) {
    return {
      ok: false,
      reason: "window_closed",
      message:
        "WhatsApp only allows messages within 24 hours of the customer's last message. They'll need to message you first.",
    };
  }

  // Conversations don't record which of the tenant's numbers they came in on;
  // tenants have a single WhatsApp number today.
  const { data: channel } = await supabase
    .from("channels")
    .select("wa_phone_number_id, wa_access_token_encrypted")
    .eq("tenant_id", s.tenantId)
    .eq("type", "whatsapp")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!channel?.wa_phone_number_id || !channel.wa_access_token_encrypted) {
    return { ok: false, reason: "no_channel", message: "No active WhatsApp number is connected." };
  }

  // Set before sending, so an AI turn that's mid-generation discards its
  // reply instead of talking over the owner.
  if (s.takeOver && conversation.status !== "human") {
    const { error } = await supabase
      .from("conversations")
      .update({ status: "human" })
      .eq("id", s.conversationId)
      .eq("tenant_id", s.tenantId);
    if (error) return { ok: false, reason: "takeover_failed", message: "Couldn't take over this conversation. Please try again." };
  }

  try {
    await sendWhatsAppText(
      channel.wa_phone_number_id,
      decrypt(channel.wa_access_token_encrypted),
      conversation.external_id,
      s.text,
    );
  } catch (err) {
    console.error(`Team message to conversation ${s.conversationId} failed:`, err);
    return { ok: false, reason: "send_failed", message: "WhatsApp didn't accept the message. Please try again." };
  }

  // Stored as an assistant message, so if the AI picks the chat back up it
  // sees these as the business's side; sent_by marks it as the team's.
  const { error: saveError } = await supabase.from("messages").insert({
    tenant_id: s.tenantId,
    conversation_id: s.conversationId,
    role: "assistant",
    content: s.text,
    sent_by: s.userId,
  });
  if (saveError) console.error(`Team message to ${s.conversationId} sent but not saved:`, saveError);

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", s.conversationId)
    .eq("tenant_id", s.tenantId);

  return { ok: true };
}
