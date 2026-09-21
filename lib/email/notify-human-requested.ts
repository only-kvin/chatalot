import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantOwnerEmails } from "@/lib/db/tenant-owners";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "ChatAlot <onboarding@resend.dev>";

export async function notifyOwnerHumanRequested(
  admin: SupabaseClient,
  tenantId: string,
  businessName: string,
  reason: string,
): Promise<void> {
  const ownerEmails = await getTenantOwnerEmails(admin, tenantId);
  if (ownerEmails.length === 0) return;

  try {
    await resend.emails.send({
      from: FROM,
      to: ownerEmails,
      subject: `A visitor needs a person (${businessName})`,
      html: `<p>Your AI receptionist handed off a conversation to a human.</p><p><strong>Reason:</strong> ${reason}</p>`,
    });
  } catch {
    // Same as lead notifications — a failed email shouldn't block the handoff itself.
  }
}
