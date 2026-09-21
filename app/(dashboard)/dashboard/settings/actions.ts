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

export async function updateSettingsAction(formData: FormData) {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) throw new Error("Not authorized");

  const parsed = settingsSchema.safeParse({
    business_name: formData.get("business_name"),
    tone: formData.get("tone"),
    greeting: formData.get("greeting"),
    system_prompt_extra: formData.get("system_prompt_extra") ?? "",
    handoff_contact: formData.get("handoff_contact") ?? "",
    allowed_domains: formData.get("allowed_domains") ?? "",
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

  const supabase = await createClient();

  const { error: configError } = await supabase
    .from("agent_configs")
    .update({
      business_name: parsed.data.business_name,
      tone: parsed.data.tone,
      greeting: parsed.data.greeting,
      system_prompt_extra: parsed.data.system_prompt_extra,
      handoff_contact: parsed.data.handoff_contact,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);
  if (configError) throw new Error(configError.message);

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
  if (tenantError) throw new Error(tenantError.message);

  revalidatePath("/dashboard/settings");
}
