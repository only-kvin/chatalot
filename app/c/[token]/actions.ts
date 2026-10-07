"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { recordConsents } from "@/lib/contacts/consents";
import { readCustomerToken } from "@/lib/security/signed-token";

// A customer switches the newsletter or marketing on or off on their own
// page. The signed link is their credential; it applies to the business's
// customer records with that email address, and each change is added to
// the consent history (source "customer_page").
const schema = z.object({ kind: z.enum(["newsletter", "marketing"]), granted: z.boolean() });

export async function setConsentAction(token: string, kind: string, granted: boolean): Promise<{ error: string | null }> {
  const who = readCustomerToken(decodeURIComponent(token));
  if (!who) return { error: "This link has expired. Sign up again for a fresh one." };
  const parsed = schema.safeParse({ kind, granted });
  if (!parsed.success) return { error: "Invalid request." };

  const admin = createAdminClient();
  const { data: contacts } = await admin.from("contacts").select("id").eq("tenant_id", who.tenantId).eq("email", who.email);
  if (!contacts?.length) return { error: "We couldn't find your details. Sign up again to save your choices." };
  for (const contact of contacts) {
    await recordConsents(admin, {
      tenantId: who.tenantId,
      contactId: contact.id,
      source: "customer_page",
      choices: [{ kind: parsed.data.kind, granted: parsed.data.granted }],
    });
  }
  revalidatePath(`/c/${token}`);
  return { error: null };
}
