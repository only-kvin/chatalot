"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { sendTeamWhatsApp } from "@/lib/channels/team-whatsapp";

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

// The emergency has been dealt with: the chat stops standing out. Its
// lead keeps its urgent flag as a record.
export async function clearUrgentAction(formData: FormData) {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) throw new Error("Not authorized");
  const id = z.string().uuid().parse(formData.get("id"));

  const supabase = await createClient();
  const { error } = await supabase.from("conversations").update({ urgent: false }).eq("id", id).eq("tenant_id", tenantId);
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

  // Replying means taking over the conversation from the AI.
  const result = await sendTeamWhatsApp(supabase, { tenantId, conversationId, userId: user.id, text, takeOver: true });
  if (!result.ok) return { error: result.message };

  revalidatePath(`/dashboard/conversations/${conversationId}`);
  revalidatePath("/dashboard/conversations");
  return { error: null };
}
