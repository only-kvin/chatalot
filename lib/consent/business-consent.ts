import type { SupabaseClient } from "@supabase/supabase-js";

// What a business agrees to about its own website, in one place and
// versioned: every answer stores the version of the words it was given.
// Change the wording → bump the version. [LEGAL REVIEW] before launch.

export const BUSINESS_CONSENT_KINDS = ["website_content", "website_images"] as const;
export type BusinessConsentKind = (typeof BUSINESS_CONSENT_KINDS)[number];

export const CONSENT_TEXT: Record<BusinessConsentKind, { version: string; label: string; detail: string }> = {
  website_content: {
    version: "2026-10-09.1",
    label: "Use the content of my website to set up my AI receptionist and to prepare a website for me.",
    detail:
      "We read the pages of the website you list so your AI receptionist can answer from them, and use that text when we prepare a website brief for you. Your own entries in the dashboard always come first.",
  },
  website_images: {
    version: "2026-10-09.1",
    label: "Use the photos and images on my website.",
    detail:
      "We may use your logo, photos and staff pictures from your website in a website we prepare for you. Without this, any new website uses AI-generated or royalty-free images instead.",
  },
};

export type ConsentSource = "signup" | "settings" | "admin";

export type ConsentState = {
  granted: boolean;
  textVersion: string;
  source: ConsentSource;
  createdAt: string;
  note: string | null;
};

// The current answer per kind (the latest row), or null when never asked.
export async function currentConsents(
  client: SupabaseClient,
  tenantId: string,
): Promise<Record<BusinessConsentKind, ConsentState | null>> {
  const { data, error } = await client
    .from("tenant_consents")
    .select("kind, granted, text_version, source, note, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const result: Record<BusinessConsentKind, ConsentState | null> = { website_content: null, website_images: null };
  for (const row of data ?? []) {
    const kind = row.kind as BusinessConsentKind;
    if (result[kind]) continue;
    result[kind] = { granted: row.granted, textVersion: row.text_version, source: row.source, createdAt: row.created_at, note: row.note };
  }
  return result;
}

export async function hasConsent(client: SupabaseClient, tenantId: string, kind: BusinessConsentKind): Promise<boolean> {
  return (await currentConsents(client, tenantId))[kind]?.granted === true;
}

// Appends an answer (service-role client: owners and admins are checked by
// the caller). Uses the current wording's version.
export async function recordConsent(
  admin: SupabaseClient,
  c: { tenantId: string; kind: BusinessConsentKind; granted: boolean; source: ConsentSource; grantedBy: string | null; note?: string | null },
): Promise<void> {
  const { error } = await admin.from("tenant_consents").insert({
    tenant_id: c.tenantId,
    kind: c.kind,
    granted: c.granted,
    text_version: CONSENT_TEXT[c.kind].version,
    granted_by: c.grantedBy,
    source: c.source,
    note: c.note ?? null,
  });
  if (error) throw error;
}
