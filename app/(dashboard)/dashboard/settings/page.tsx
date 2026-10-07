import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { PageHeader } from "@/components/dashboard/page-header";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const [{ data: config }, { data: tenant }] = await Promise.all([
    supabase
      .from("agent_configs")
      .select("business_name, tone, greeting, system_prompt_extra, handoff_contact, google_review_url, daily_summary_enabled")
      .eq("tenant_id", tenantId)
      .single(),
    supabase.from("tenants").select("allowed_domains").eq("id", tenantId).single(),
  ]);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <PageHeader title="Settings" />
      <SettingsForm
        initialSettings={{
          business_name: config?.business_name ?? "",
          tone: config?.tone ?? "",
          greeting: config?.greeting ?? "",
          system_prompt_extra: config?.system_prompt_extra ?? "",
          handoff_contact: config?.handoff_contact ?? "",
          google_review_url: config?.google_review_url ?? "",
          daily_summary_enabled: config?.daily_summary_enabled ?? true,
          allowed_domains: tenant?.allowed_domains ?? [],
        }}
      />
    </div>
  );
}
