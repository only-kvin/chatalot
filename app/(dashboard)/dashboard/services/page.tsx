import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { PageHeader } from "@/components/dashboard/page-header";
import { ServicesEditor } from "./services-editor";

export default async function ServicesPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("id, name, description, duration_minutes, price_cents, active")
    .eq("tenant_id", tenantId)
    .order("name");

  return (
    <div className="mx-auto max-w-2xl p-8">
      <PageHeader
        title="Services"
        description="What your AI receptionist can book appointments for."
      />
      <ServicesEditor initialServices={services ?? []} />
    </div>
  );
}
