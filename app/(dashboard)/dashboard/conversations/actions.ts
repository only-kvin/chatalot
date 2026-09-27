"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { decrypt } from "@/lib/security/crypto";
import { isWithinServiceWindow, sendWhatsAppText } from "@/lib/channels/whatsapp";

export async function toggleTakeOverAction(formData: FormData) {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) throw new Error("Not authorized");

  const id = formData.get("id") as string;
  const nextStatus = formData.get("nextStatus") as "ai" | "human";

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ status: nextStatus })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/conversations/${id}`);
  revalidatePath("/dashboard/conversations");
}

const replySchema = z.object({
  conversationId: z.string().uuid(),
  // WhatsApp's text body limit.
  text: z.string().trim().min(1, "Type a message first.").max(4096, "That message is too long for WhatsApp."),
});

// Returns the error rather than throwing: Next.js hides thrown server action
// messages in production, and these are meant for the owner to read.
export async function sendOwnerReplyAction(input: {
  conversationId: string;
  text: string;
}): Promise<{ error: string | null }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };

  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid message." };
  const { conversationId, text } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authorized." };

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, channel, external_id, status, last_inbound_at")
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .single();
  if (!conversation) return { error: "Conversation not found." };
  if (conversation.channel !== "whatsapp") {
    return { error: "Replying from the dashboard only works for WhatsApp conversations." };
  }
  if (!isWithinServiceWindow(conversation.last_inbound_at)) {
    return {
      error:
        "WhatsApp only allows replies within 24 hours of the customer's last message. They'll need to message you first.",
    };
  }

  // Conversations don't record which of the tenant's numbers they came in on;
  // tenants have a single WhatsApp number today.
  const { data: channel } = await supabase
    .from("channels")
    .select("wa_phone_number_id, wa_access_token_encrypted")
    .eq("tenant_id", tenantId)
    .eq("type", "whatsapp")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!channel?.wa_phone_number_id || !channel.wa_access_token_encrypted) {
    return { error: "No active WhatsApp number is connected." };
  }

  // Replying means taking over — set it before sending so an AI turn that's
  // mid-generation discards its reply instead of talking over the owner.
  if (conversation.status !== "human") {
    const { error } = await supabase
      .from("conversations")
      .update({ status: "human" })
      .eq("id", conversationId)
      .eq("tenant_id", tenantId);
    if (error) return { error: "Couldn't take over this conversation. Please try again." };
  }

  try {
    await sendWhatsAppText(
      channel.wa_phone_number_id,
      decrypt(channel.wa_access_token_encrypted),
      conversation.external_id,
      text,
    );
  } catch (err) {
    console.error(`Owner reply for conversation ${conversationId} failed:`, err);
    return { error: "WhatsApp didn't accept the message. Please try again." };
  }

  // Stored as an assistant message, so if the owner hands back to the AI it
  // sees these replies as the business's side of the conversation; sent_by
  // is what marks it as theirs in the transcript.
  const { error: saveError } = await supabase.from("messages").insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    role: "assistant",
    content: text,
    sent_by: user.id,
  });
  if (saveError) console.error(`Owner reply for ${conversationId} sent but not saved:`, saveError);

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("tenant_id", tenantId);

  revalidatePath(`/dashboard/conversations/${conversationId}`);
  revalidatePath("/dashboard/conversations");
  return { error: null };
}
