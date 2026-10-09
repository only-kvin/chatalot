import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { currentTenantFeatures } from "@/lib/dashboard-features";
import { PageHeader } from "@/components/dashboard/page-header";
import { SettingsForm } from "./settings-form";
import { YourWebsite, type ConsentView } from "./your-website";
import { currentConsents, type ConsentState } from "@/lib/consent/business-consent";
import { setupComplete } from "@/lib/onboarding";
import { briefIsStale } from "@/lib/site-brief/generate";
import { appUrl } from "@/lib/app-url";

export default async function SettingsPage() {
  const current = await currentTenantFeatures();
  if (!current) redirect("/");
  const { tenantId, features } = current;

  const supabase = await createClient();
  const [{ data: config }, { data: tenant }] = await Promise.all([
    supabase
      .from("agent_configs")
      .select("business_name, tone, greeting, system_prompt_extra, handoff_contact, google_review_url, daily_summary_enabled, booking_page_url")
      .eq("tenant_id", tenantId)
      .single(),
    supabase.from("tenants").select("allowed_domains, slug").eq("id", tenantId).single(),
  ]);
  const [consents, { data: brief }, { data: websiteRequest }, setupDone] = await Promise.all([
    currentConsents(supabase, tenantId),
    supabase
      .from("site_briefs")
      .select("version, status, created_at, missing, data_fingerprint")
      .eq("tenant_id", tenantId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("website_requests").select("id").eq("tenant_id", tenantId).is("handled_at", null).maybeSingle(),
    setupComplete(supabase, tenantId, features.bookings === "on"),
  ]);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <PageHeader title="Settings" />
      <SettingsForm
        hostedBookingUrl={appUrl(`/book/${tenant?.slug ?? ""}`)}
        showBookingPage={features.bookings === "on"}
        showReviews={features.reviews === "on"}
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
      <div className="mt-6">
        <YourWebsite
          consents={{
            website_content: view(consents.website_content),
            website_images: view(consents.website_images),
          }}
          brief={
            brief && {
              version: brief.version,
              status: brief.status,
              createdAt: brief.created_at,
              missing: brief.missing as string[],
              stale: await briefIsStale(supabase, tenantId, brief.data_fingerprint),
            }
          }
          setupDone={setupDone}
          websiteRequested={Boolean(websiteRequest)}
        />
      </div>
    </div>
  );
}

function view(c: ConsentState | null): ConsentView {
  return c && { granted: c.granted, textVersion: c.textVersion, createdAt: c.createdAt, source: c.source };
}
