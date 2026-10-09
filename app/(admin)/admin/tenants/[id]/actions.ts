"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { encrypt } from "@/lib/security/crypto";
import { overridesSchema, PLANS } from "@/lib/plans";
import { waitUntil } from "@vercel/functions";
import { ImportRefusedError, importWebsite, removeWebsiteKnowledge, runWebsiteImport } from "@/lib/website/import";
import { BUSINESS_CONSENT_KINDS, hasConsent, recordConsent } from "@/lib/consent/business-consent";
import { withdrawWebsiteContent } from "@/lib/site-brief/generate";

const connectSchema = z.object({
  tenantId: z.string().uuid(),
  // Meta's numeric ID for the number, not the phone number itself — the
  // webhook matches incoming messages on this exact value.
  phoneNumberId: z
    .string()
    .trim()
    .regex(/^\d{10,20}$/,"Use the Phone Number ID from Meta (digits only), not the phone number itself."),
  accessToken: z.string().min(1, "Access token is required"),
});

async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: adminRow } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) throw new Error("Not authorized");
}

export async function connectWhatsAppChannelAction(formData: FormData) {
  await requirePlatformAdmin();

  const parsed = connectSchema.safeParse({
    tenantId: formData.get("tenantId"),
    phoneNumberId: formData.get("phoneNumberId"),
    accessToken: formData.get("accessToken"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

  const admin = createAdminClient();
  const encryptedToken = encrypt(parsed.data.accessToken);

  const { data: existing } = await admin
    .from("channels")
    .select("id")
    .eq("tenant_id", parsed.data.tenantId)
    .eq("type", "whatsapp")
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("channels")
      .update({
        wa_phone_number_id: parsed.data.phoneNumberId,
        wa_access_token_encrypted: encryptedToken,
        status: "active",
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("channels").insert({
      tenant_id: parsed.data.tenantId,
      type: "whatsapp",
      wa_phone_number_id: parsed.data.phoneNumberId,
      wa_access_token_encrypted: encryptedToken,
      status: "active",
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/admin/tenants/${parsed.data.tenantId}`);
}

export async function disconnectWhatsAppChannelAction(formData: FormData) {
  await requirePlatformAdmin();
  const tenantId = formData.get("tenantId") as string;

  const admin = createAdminClient();
  const { error } = await admin
    .from("channels")
    .update({ status: "disabled" })
    .eq("tenant_id", tenantId)
    .eq("type", "whatsapp");
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/tenants/${tenantId}`);
}

const planSchema = z.object({
  tenantId: z.string().uuid(),
  plan: z.enum(PLANS),
  overrides: overridesSchema,
});

// Plan and per-feature overrides. Returns errors rather than throwing (they're
// shown inline). Runs on the admin's own client: `tenants` RLS only lets
// platform admins update it.
export async function updatePlanAction(input: {
  tenantId: string;
  plan: string;
  overrides: Record<string, string>;
}): Promise<{ error: string | null }> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid plan settings." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .update({ plan: parsed.data.plan, feature_overrides: parsed.data.overrides })
    .eq("id", parsed.data.tenantId)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error(`Saving plan for ${parsed.data.tenantId} failed:`, error);
    return { error: "Couldn't save. Are you signed in as a platform admin?" };
  }
  revalidatePath(`/admin/tenants/${parsed.data.tenantId}`);
  revalidatePath("/admin");
  return { error: null };
}

export async function markUpgradeHandledAction(formData: FormData) {
  await requirePlatformAdmin();
  const id = z.string().uuid().parse(formData.get("requestId"));
  const tenantId = z.string().uuid().parse(formData.get("tenantId"));
  const supabase = await createClient();
  await supabase
    .from("upgrade_requests")
    .update({ handled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin");
}

// Imports a client's website into their knowledge base, for onboarding by
// hand. Same rules as the owner's button: the site must be in the tenant's
// allowed domains.
export async function importWebsiteAdminAction(tenantId: string, startUrl: string): Promise<{ error: string | null }> {
  try {
    await requirePlatformAdmin();
  } catch {
    return { error: "Not authorized." };
  }
  if (!z.uuid().safeParse(tenantId).success || typeof startUrl !== "string" || !startUrl.trim()) {
    return { error: "Enter the website's address." };
  }
  const admin = createAdminClient();
  try {
    const importId = await importWebsite(admin, tenantId, startUrl);
    waitUntil(runWebsiteImport(admin, importId).catch((err) => console.error("Website import failed:", err)));
  } catch (err) {
    if (err instanceof ImportRefusedError) return { error: err.message };
    console.error("Starting a website import failed:", err);
    return { error: "Couldn't start the import." };
  }
  revalidatePath(`/admin/tenants/${tenantId}`);
  return { error: null };
}

// Consent a business gave by email or phone, recorded by a platform admin
// (a note saying how is required).
export async function recordConsentAdminAction(input: {
  tenantId: string;
  kind: string;
  granted: boolean;
  note: string;
}): Promise<{ error: string | null }> {
  try {
    await requirePlatformAdmin();
  } catch {
    return { error: "Not authorized." };
  }
  const parsed = z
    .object({
      tenantId: z.uuid(),
      kind: z.enum(BUSINESS_CONSENT_KINDS),
      granted: z.boolean(),
      note: z.string().trim().min(3, "Add a note saying how and when they agreed.").max(500),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { tenantId, kind, granted, note } = parsed.data;
  const admin = createAdminClient();
  try {
    if (kind === "website_content" && !granted) {
      await withdrawWebsiteContent(admin, tenantId, { userId: null, source: "admin", note });
    } else {
      await recordConsent(admin, { tenantId, kind, granted, source: "admin", grantedBy: null, note });
    }
  } catch (err) {
    console.error("Recording consent failed:", err);
    return { error: "Couldn't record the consent." };
  }
  revalidatePath(`/admin/tenants/${tenantId}`);
  return { error: null };
}

// "Replace website": the business's new site is live. Adds its domain to the
// allowed list, removes the old site's imported knowledge, imports the new
// site, and marks the latest brief live on that domain.
export async function replaceWebsiteAdminAction(input: { tenantId: string; domain: string }): Promise<{ error: string | null }> {
  try {
    await requirePlatformAdmin();
  } catch {
    return { error: "Not authorized." };
  }
  const parsed = z
    .object({ tenantId: z.uuid(), domain: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Enter a domain like example.co.za") })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { tenantId, domain } = parsed.data;
  const admin = createAdminClient();

  // Checked before anything is removed, so a refusal changes nothing.
  if (!(await hasConsent(admin, tenantId, "website_content"))) {
    return { error: "They haven't agreed to their website's content being used. Record their consent first." };
  }
  const { data: tenant } = await admin.from("tenants").select("allowed_domains").eq("id", tenantId).single();
  const domains = new Set<string>(tenant?.allowed_domains ?? []);
  domains.add(domain);
  const { error: domainError } = await admin.from("tenants").update({ allowed_domains: [...domains] }).eq("id", tenantId);
  if (domainError) return { error: "Couldn't add the domain." };

  try {
    await removeWebsiteKnowledge(admin, tenantId);
    const importId = await importWebsite(admin, tenantId, `https://${domain}`);
    waitUntil(runWebsiteImport(admin, importId).catch((err) => console.error("Website import failed:", err)));
  } catch (err) {
    if (err instanceof ImportRefusedError) return { error: err.message };
    console.error("Replacing the website failed:", err);
    return { error: "Couldn't start importing the new site." };
  }

  const { data: latest } = await admin
    .from("site_briefs")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest) {
    await admin
      .from("site_briefs")
      .update({ status: "live", live_domain: domain, updated_at: new Date().toISOString() })
      .eq("id", latest.id)
      .eq("tenant_id", tenantId);
  }
  revalidatePath(`/admin/tenants/${tenantId}`);
  return { error: null };
}
