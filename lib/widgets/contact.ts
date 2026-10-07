import type { SupabaseClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";
import { recordConsents, type ConsentKind } from "@/lib/contacts/consents";
import { upsertContact } from "@/lib/contacts/upsert";
import { notifyOwnerOfContactMessage } from "@/lib/email/notify-contact-message";
import type { ContactAnswers } from "./fields";

// A message from the website contact form: kept as a contact message and a
// lead, and the owner is told. The sender becomes a customer record only
// if they ticked one of the optional consents; otherwise just the message
// is kept, to reply to.
export async function submitContactMessage(
  admin: SupabaseClient,
  m: { tenantId: string; answers: ContactAnswers; consents: { kind: ConsentKind; granted: boolean }[] },
): Promise<{ ok: true; id: string } | { ok: false }> {
  const { answers } = m;
  const granted = m.consents.filter((c) => c.granted);

  let contactId: string | null = null;
  if (granted.length) {
    contactId = await upsertContact(admin, {
      tenantId: m.tenantId,
      name: answers.name,
      phone: answers.phone,
      email: answers.email,
      nameSource: "customer",
      channel: "web",
      consent: true,
    }).catch((err) => {
      console.error("Saving the contact-form sender failed:", err);
      return null;
    });
    if (contactId) await recordConsents(admin, { tenantId: m.tenantId, contactId, source: "contact_widget", choices: granted });
  }

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      tenant_id: m.tenantId,
      contact_id: contactId,
      name: answers.name,
      phone: answers.phone,
      email: answers.email,
      interest: answers.subject ?? "Website message",
      summary: answers.message.slice(0, 500),
      source: "contact_widget",
    })
    .select("id")
    .single();
  if (leadError) console.error(`Saving the contact-form lead for ${m.tenantId} failed:`, leadError);

  const { data: message, error } = await admin
    .from("contact_messages")
    .insert({
      tenant_id: m.tenantId,
      contact_id: contactId,
      lead_id: lead?.id ?? null,
      name: answers.name,
      email: answers.email,
      phone: answers.phone,
      subject: answers.subject,
      message: answers.message,
      details: answers.details,
    })
    .select("id")
    .single();
  if (error) {
    console.error(`Saving a contact message for ${m.tenantId} failed:`, error);
    return { ok: false };
  }

  // After the response, like booking alerts.
  waitUntil(
    (async () => {
      const { data: config } = await admin.from("agent_configs").select("business_name").eq("tenant_id", m.tenantId).maybeSingle();
      await notifyOwnerOfContactMessage(admin, m.tenantId, config?.business_name ?? "", { id: message.id, ...answers });
    })(),
  );
  return { ok: true, id: message.id };
}
