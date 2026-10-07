import type { SupabaseClient } from "@supabase/supabase-js";

// Consent history (consents table): every yes or no a customer gives,
// appended, never edited. Separate from STOP/START (lib/contacts/consent.ts),
// which stops every message ChatAlot starts.

export type ConsentKind = "booking_notifications" | "marketing" | "newsletter";
export const CONSENT_KINDS: ConsentKind[] = ["booking_notifications", "marketing", "newsletter"];

export const CONSENT_LABEL: Record<ConsentKind, string> = {
  booking_notifications: "Booking notifications",
  marketing: "Events and promotions",
  newsletter: "Newsletter",
};

export async function recordConsents(
  admin: SupabaseClient,
  c: { tenantId: string; contactId: string; source: string; choices: { kind: ConsentKind; granted: boolean }[] },
): Promise<void> {
  if (!c.choices.length) return;
  const { error } = await admin.from("consents").insert(
    c.choices.map((choice) => ({ tenant_id: c.tenantId, contact_id: c.contactId, source: c.source, ...choice })),
  );
  if (error) {
    console.error(`Recording consents for contact ${c.contactId} failed:`, error);
    return;
  }
  // Keep the quick marketing flag in step with the latest answer.
  const marketing = c.choices.find((choice) => choice.kind === "marketing");
  if (marketing) {
    let update = admin
      .from("contacts")
      .update({ marketing_opt_in_at: marketing.granted ? new Date().toISOString() : null })
      .eq("tenant_id", c.tenantId)
      .eq("id", c.contactId);
    // Keep the original opt-in date if they were already in.
    if (marketing.granted) update = update.is("marketing_opt_in_at", null);
    const { error: flagError } = await update;
    if (flagError) console.error(`Updating marketing opt-in for ${c.contactId} failed:`, flagError);
  }
}

// The current answer per kind (the latest row), for one customer.
export async function currentConsents(
  client: SupabaseClient,
  tenantId: string,
  contactId: string,
): Promise<Partial<Record<ConsentKind, { granted: boolean; at: string; source: string }>>> {
  const { data } = await client
    .from("consents")
    .select("kind, granted, source, created_at")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });
  const current: Partial<Record<ConsentKind, { granted: boolean; at: string; source: string }>> = {};
  for (const row of data ?? []) {
    const kind = row.kind as ConsentKind;
    current[kind] ??= { granted: row.granted, at: row.created_at, source: row.source };
  }
  return current;
}
