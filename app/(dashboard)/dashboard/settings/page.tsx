import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const [{ data: config }, { data: tenant }] = await Promise.all([
    supabase
      .from("agent_configs")
      .select("business_name, tone, greeting, system_prompt_extra, handoff_contact")
      .eq("tenant_id", tenantId)
      .single(),
    supabase.from("tenants").select("allowed_domains").eq("id", tenantId).single(),
  ]);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      <SettingsForm
        initialSettings={{
          business_name: config?.business_name ?? "",
          tone: config?.tone ?? "",
          greeting: config?.greeting ?? "",
          system_prompt_extra: config?.system_prompt_extra ?? "",
          handoff_contact: config?.handoff_contact ?? "",
          allowed_domains: tenant?.allowed_domains ?? [],
        }}
      />
    </div>
  );
}
