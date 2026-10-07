import type { SupabaseClient } from "@supabase/supabase-js";
import { recordNotification } from "@/lib/notifications";
import { sendOwnerEmail } from "./send";

// Someone sent a message through the website contact form.
export async function notifyOwnerOfContactMessage(
  admin: SupabaseClient,
  tenantId: string,
  businessName: string,
  m: { id: string; name: string; email: string | null; phone: string | null; subject: string | null; message: string },
): Promise<void> {
  const title = `New message: ${m.name}`;
  await recordNotification(admin, {
    tenantId,
    type: "contact_message",
    title,
    body: (m.subject ? `${m.subject} · ` : "") + (m.message.length > 120 ? `${m.message.slice(0, 117)}…` : m.message),
  });
  await sendOwnerEmail(admin, tenantId, {
    subject: `${title} (${businessName})`,
    intro: "Someone sent you a message through the contact form on your website.",
    details: [
      ["Name", m.name],
      ["Email", m.email],
      ["Phone", m.phone],
      ["Subject", m.subject],
      ["Message", m.message],
    ],
    path: `/dashboard/messages/${m.id}`,
  });
}
