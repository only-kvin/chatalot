import type { SupabaseClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";
import { recordConsents, type ConsentKind } from "@/lib/contacts/consents";
import { upsertContact } from "@/lib/contacts/upsert";
import { emailCustomerPageLink } from "@/lib/email/customer-page";
import type { RegistrationAnswers } from "./fields";

// Someone signs up through the registration widget: no password. They're
// saved (or their existing record updated, never duplicated), their
// consents recorded, and a link to their own page is emailed to the
// address they typed. The caller answers the same whatever happened here,
// so the widget never reveals whether someone was already a customer.
export async function registerCustomer(
  admin: SupabaseClient,
  r: { tenantId: string; answers: RegistrationAnswers; marketing: boolean },
): Promise<void> {
  const { answers } = r;
  const contactId = await upsertContact(admin, {
    tenantId: r.tenantId,
    name: answers.name,
    phone: answers.phone,
    email: answers.email,
    nameSource: "customer",
    channel: "web",
    consent: true,
  }).catch((err) => {
    console.error("Saving a registration failed:", err);
    return null;
  });

  if (contactId) {
    // The first time only.
    await admin
      .from("contacts")
      .update({ registered_at: new Date().toISOString() })
      .eq("tenant_id", r.tenantId)
      .eq("id", contactId)
      .is("registered_at", null);
    // Booking notifications are required to sign up; marketing only when
    // ticked. An unticked box records nothing, so it never withdraws an
    // earlier yes.
    const choices: { kind: ConsentKind; granted: boolean }[] = [{ kind: "booking_notifications", granted: true }];
    if (r.marketing) choices.push({ kind: "marketing", granted: true });
    await recordConsents(admin, { tenantId: r.tenantId, contactId, source: "registration_widget", choices });
  }

  waitUntil(
    (async () => {
      const { data: config } = await admin.from("agent_configs").select("business_name").eq("tenant_id", r.tenantId).maybeSingle();
      await emailCustomerPageLink({
        tenantId: r.tenantId,
        email: answers.email,
        name: answers.name,
        businessName: config?.business_name || "us",
      });
    })(),
  );
}
