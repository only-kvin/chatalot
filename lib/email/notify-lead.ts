import type { SupabaseClient } from "@supabase/supabase-js";
import { notificationPath, recordNotification } from "@/lib/notifications";
import { sendOwnerEmail } from "./send";

export async function notifyOwnerOfLead(
  admin: SupabaseClient,
  tenantId: string,
  businessName: string,
  lead: { name: string; phone: string; email: string | null; interest: string; summary: string },
  conversationId?: string | null,
): Promise<void> {
  await recordNotification(admin, {
    tenantId,
    type: "new_lead",
    title: `New lead: ${lead.name}`,
    body: `${lead.interest} · ${lead.phone}`,
    conversationId,
  });

  // The bell entry above always happens; the email is the owner's choice.
  const { data: config } = await admin
    .from("agent_configs")
    .select("lead_email_enabled")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (config?.lead_email_enabled === false) return;

  await sendOwnerEmail(admin, tenantId, {
    subject: `New lead: ${lead.name} (${businessName})`,
    intro: "Your AI receptionist just captured a new lead.",
    details: [
      ["Name", lead.name],
      ["Phone", lead.phone],
      ["Email", lead.email],
      ["Interest", lead.interest],
      ["Summary", lead.summary],
    ],
    path: notificationPath("new_lead", conversationId),
  });
}
