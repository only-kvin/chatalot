import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { PageHeader } from "@/components/dashboard/page-header";
import { ServicesEditor } from "./services-editor";

export default async function ServicesPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const [{ data: services }, { data: staff }, { data: links }] = await Promise.all([
    supabase
      .from("services")
      .select(
        "id, name, description, category, duration_minutes, buffer_before_min, buffer_after_min, price_cents, active, online_bookable",
      )
      .eq("tenant_id", tenantId)
      .order("sort_order")
      .order("name"),
    supabase.from("staff").select("id, name, active").eq("tenant_id", tenantId).order("sort_order").order("name"),
    supabase.from("staff_services").select("staff_id, service_id").eq("tenant_id", tenantId),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:p-8">
      <PageHeader title="Services" description="What customers can book, how long it takes and who does it." />
      <ServicesEditor
        initialServices={(services ?? []).map((svc) => ({
          ...svc,
          staffIds: (links ?? []).filter((l) => l.service_id === svc.id).map((l) => l.staff_id),
        }))}
        staff={staff ?? []}
      />
    </div>
  );
}
