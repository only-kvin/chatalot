import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { PageHeader } from "@/components/dashboard/page-header";
import { SettingsForm } from "./settings-form";
import { appUrl } from "@/lib/app-url";

export default async function SettingsPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const [{ data: config }, { data: tenant }] = await Promise.all([
    supabase
      .from("agent_configs")
      .select("business_name, tone, greeting, system_prompt_extra, handoff_contact, google_review_url, daily_summary_enabled, booking_page_url")
      .eq("tenant_id", tenantId)
      .single(),
    supabase.from("tenants").select("allowed_domains, slug").eq("id", tenantId).single(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:p-8">
      <PageHeader title="Settings" />
      <SettingsForm
        hostedBookingUrl={appUrl(`/book/${tenant?.slug ?? ""}`)}
        initialSettings={{
          business_name: config?.business_name ?? "",
          tone: config?.tone ?? "",
          greeting: config?.greeting ?? "",
          system_prompt_extra: config?.system_prompt_extra ?? "",
          handoff_contact: config?.handoff_contact ?? "",
          google_review_url: config?.google_review_url ?? "",
          booking_page_url: config?.booking_page_url ?? "",
          daily_summary_enabled: config?.daily_summary_enabled ?? true,
          allowed_domains: tenant?.allowed_domains ?? [],
        }}
      />
    </div>
  );
}
