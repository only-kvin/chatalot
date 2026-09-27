import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalPhone } from "./phone";

export type NameSource = "whatsapp_profile" | "customer" | "owner";

type ContactRow = {
  id: string;
  name: string | null;
  name_source: NameSource | null;
  phone: string | null;
  email: string | null;
  consent_at: string | null;
  last_seen_at: string;
};

export type ContactInput = {
  tenantId: string;
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  nameSource?: NameSource;
  channel: "web" | "whatsapp";
  // They agreed to their details being stored (the AI asks before saving).
  consent?: boolean;
  seenAt?: string;
};

// Higher wins: an owner's edit beats what the customer typed, which beats
// their WhatsApp profile name.
const NAME_RANK: Record<NameSource, number> = { whatsapp_profile: 1, customer: 2, owner: 3 };

function normalizeEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e && e.includes("@") ? e : null;
}

// The fields to change on an existing contact given new information about
// them. Never touches the phone identity; fills gaps rather than overwriting.
export function mergeContact(
  existing: Omit<ContactRow, "id">,
  input: ContactInput,
  now: string,
): Partial<Omit<ContactRow, "id">> & { updated_at?: string } {
  const patch: Partial<Omit<ContactRow, "id">> = {};
  const name = input.name?.trim();
  const source = input.nameSource ?? "customer";
  if (
    name &&
    name !== existing.name &&
    (!existing.name || !existing.name_source || NAME_RANK[source] >= NAME_RANK[existing.name_source])
  ) {
    patch.name = name;
    patch.name_source = source;
  }
  const email = normalizeEmail(input.email);
  if (email && !existing.email) patch.email = email;
  if (input.phone && !existing.phone) patch.phone = input.phone;
  if (input.consent && !existing.consent_at) patch.consent_at = now;

  const seen = input.seenAt ?? now;
  if (new Date(seen) > new Date(existing.last_seen_at)) patch.last_seen_at = seen;

  return Object.keys(patch).length ? { ...patch, updated_at: now } : {};
}

const COLUMNS = "id, name, name_source, phone, email, consent_at, last_seen_at";

async function findContact(
  admin: SupabaseClient,
  tenantId: string,
  phoneE164: string | null,
  email: string | null,
): Promise<ContactRow | null> {
  let query = admin.from("contacts").select(COLUMNS).eq("tenant_id", tenantId);
  query = phoneE164 ? query.eq("phone_e164", phoneE164) : query.is("phone_e164", null).eq("email", email);
  const { data } = await query.maybeSingle();
  return (data as ContactRow | null) ?? null;
}

// Finds the tenant's customer by phone (or by email when there's no phone)
// and merges in what we just learned, or creates them. Returns null when
// there's nothing to identify them by. Runs with the service-role client.
export async function upsertContact(admin: SupabaseClient, input: ContactInput): Promise<string | null> {
  const phoneE164 = canonicalPhone(input.phone);
  const email = normalizeEmail(input.email);
  if (!phoneE164 && !email) return null;

  const now = new Date().toISOString();

  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await findContact(admin, input.tenantId, phoneE164, email);
    if (existing) {
      const patch = mergeContact(existing, input, now);
      if (Object.keys(patch).length) {
        const { error } = await admin
          .from("contacts")
          .update(patch)
          .eq("id", existing.id)
          .eq("tenant_id", input.tenantId);
        if (error) console.error(`Updating contact ${existing.id} failed:`, error);
      }
      return existing.id;
    }

    const name = input.name?.trim() || null;
    const seen = input.seenAt ?? now;
    const { data, error } = await admin
      .from("contacts")
      .insert({
        tenant_id: input.tenantId,
        phone_e164: phoneE164,
        phone: input.phone ?? null,
        email,
        name,
        name_source: name ? (input.nameSource ?? "customer") : null,
        consent_at: input.consent ? now : null,
        first_channel: input.channel,
        first_seen_at: seen,
        last_seen_at: seen,
      })
      .select("id")
      .single();
    if (!error) return data.id;
    // Another message for the same person created them first — merge into that.
    if (error.code !== "23505") {
      console.error("Creating contact failed:", error);
      return null;
    }
  }
  return null;
}

// Attaches a conversation to its customer if it isn't already.
export async function linkConversation(
  admin: SupabaseClient,
  tenantId: string,
  conversationId: string,
  contactId: string,
): Promise<void> {
  const { error } = await admin
    .from("conversations")
    .update({ contact_id: contactId })
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .is("contact_id", null);
  if (error) console.error(`Linking conversation ${conversationId} to contact failed:`, error);
}
