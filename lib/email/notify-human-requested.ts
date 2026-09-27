import type { SupabaseClient } from "@supabase/supabase-js";
import { notificationPath, recordNotification } from "@/lib/notifications";
import { sendOwnerEmail } from "./send";

export async function notifyOwnerHumanRequested(
  admin: SupabaseClient,
  tenantId: string,
  businessName: string,
  reason: string,
  conversationId?: string | null,
): Promise<void> {
  await recordNotification(admin, {
    tenantId,
    type: "human_requested",
    title: "A customer needs a person",
    body: reason,
    conversationId,
  });

  await sendOwnerEmail(admin, tenantId, {
    subject: `A visitor needs a person (${businessName})`,
    intro: "Your AI receptionist handed off a conversation to a human.",
    details: [["Reason", reason]],
    path: notificationPath("human_requested", conversationId),
  });
}
