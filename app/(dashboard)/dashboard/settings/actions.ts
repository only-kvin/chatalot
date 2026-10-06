"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getCurrentTenantId } from "@/lib/db/current-tenant";

const settingsSchema = z.object({
  business_name: z.string().min(1, "Business name is required"),
  tone: z.string().min(1, "Tone is required"),
  greeting: z.string().min(1, "Greeting is required"),
  system_prompt_extra: z.string(),
  handoff_contact: z.string(),
  booking_change_cutoff_minutes: z.coerce.number().int().min(0).max(10080),
  // Empty turns review requests off.
  google_review_url: z
    .string()
    .trim()
    .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "The Google review link must start with https://"),
  allowed_domains: z.string(),
});

// "https://Client-Site.com/" -> "client-site.com" — isOriginAllowed() matches
// on bare hostname (see lib/security/origin-check.ts), so normalize whatever
// the owner pastes in rather than requiring an exact format.
function parseDomains(raw: string): string[] {
  const domains = raw
    .split(/[\n,]/)
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => d.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase());
  return [...new Set(domains)];
}

// Returns errors rather than throwing: Next.js hides thrown server action
// messages in production, and these are meant for the owner to read.
export async function updateSettingsAction(formData: FormData): Promise<{ error: string | null }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };

  const parsed = settingsSchema.safeParse({
    business_name: formData.get("business_name"),
    tone: formData.get("tone"),
    greeting: formData.get("greeting"),
    system_prompt_extra: formData.get("system_prompt_extra") ?? "",
    handoff_contact: formData.get("handoff_contact") ?? "",
    booking_change_cutoff_minutes: formData.get("booking_change_cutoff_minutes") ?? 120,
    google_review_url: formData.get("google_review_url") ?? "",
    allowed_domains: formData.get("allowed_domains") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient();

  const { error: configError } = await supabase
    .from("agent_configs")
    .update({
      business_name: parsed.data.business_name,
      tone: parsed.data.tone,
      greeting: parsed.data.greeting,
      system_prompt_extra: parsed.data.system_prompt_extra,
      handoff_contact: parsed.data.handoff_contact,
      booking_change_cutoff_minutes: parsed.data.booking_change_cutoff_minutes,
      google_review_url: parsed.data.google_review_url || null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);
  if (configError) {
    console.error(`Saving settings for ${tenantId} failed:`, configError);
    return { error: "Couldn't save your settings. Please try again." };
  }

  // `tenants` RLS restricts writes to platform admins (see
  // 20260921084004_rls_policies.sql) so a tenant owner editing their own
  // allowed_domains has to go through the service-role client — safe here
  // because `tenantId` came from getCurrentTenantId(), not client input, so
  // this can only ever touch the caller's own tenant.
  const admin = createAdminClient();
  const { error: tenantError } = await admin
    .from("tenants")
    .update({ allowed_domains: parseDomains(parsed.data.allowed_domains) })
    .eq("id", tenantId);
  if (tenantError) {
    console.error(`Saving allowed domains for ${tenantId} failed:`, tenantError);
    return { error: "Couldn't save your allowed domains. Please try again." };
  }

  revalidatePath("/dashboard/settings");
  return { error: null };
}
