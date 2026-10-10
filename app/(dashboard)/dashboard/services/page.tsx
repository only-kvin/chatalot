import { createClient } from "@/lib/db/supabase-server";
import { requireFeaturePage } from "@/lib/dashboard-features";
import { PageHeader } from "@/components/dashboard/page-header";
import { ServicesEditor } from "./services-editor";
import { pageFrame } from "@/components/dashboard/page-frame";

export default async function ServicesPage() {
  const tenantId = await requireFeaturePage("bookings");

  const supabase = await createClient();
  const [{ data: services }, { data: staff }, { data: links }, { data: config }] = await Promise.all([
    supabase
      .from("services")
      .select(
        "id, name, description, category, duration_minutes, buffer_before_min, buffer_after_min, price_cents, active, online_bookable, location, price_type, callout_fee_cents, arrival_window_minutes",
      )
      .eq("tenant_id", tenantId)
      .order("sort_order")
      .order("name"),
    supabase.from("staff").select("id, name, active").eq("tenant_id", tenantId).order("sort_order").order("name"),
    supabase.from("staff_services").select("staff_id, service_id").eq("tenant_id", tenantId),
    supabase.from("agent_configs").select("business_name").eq("tenant_id", tenantId).maybeSingle(),
  ]);

  return (
    <div className={pageFrame("form")}>
      <PageHeader title="Services" description="What customers can book, how long it takes and who does it." />
      <ServicesEditor
        initialServices={(services ?? []).map((svc) => ({
          ...svc,
          staffIds: (links ?? []).filter((l) => l.service_id === svc.id).map((l) => l.staff_id),
        }))}
        staff={staff ?? []}
        businessName={config?.business_name ?? ""}
      />
    </div>
  );
}
