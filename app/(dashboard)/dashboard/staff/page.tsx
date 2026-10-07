import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { PageHeader } from "@/components/dashboard/page-header";
import { StaffList, type StaffRow } from "./staff-list";

export default async function StaffPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const [{ data: staff }, { data: services }, { data: links }, { data: ownHours }] = await Promise.all([
    supabase
      .from("staff")
      .select("id, name, role, avatar_url, active, max_concurrent")
      .eq("tenant_id", tenantId)
      .order("sort_order")
      .order("name"),
    supabase.from("services").select("id, name").eq("tenant_id", tenantId).eq("active", true),
    supabase.from("staff_services").select("staff_id, service_id").eq("tenant_id", tenantId),
    supabase.from("availability_rules").select("staff_id").eq("tenant_id", tenantId).not("staff_id", "is", null),
  ]);

  // A service nobody is linked to can be done by anyone.
  const linkedServices = new Set((links ?? []).map((l) => l.service_id));
  const rows: StaffRow[] = (staff ?? []).map((p) => {
    const offers = (services ?? []).filter(
      (svc) => !linkedServices.has(svc.id) || (links ?? []).some((l) => l.staff_id === p.id && l.service_id === svc.id),
    );
    return {
      ...p,
      services: offers.map((svc) => svc.name).sort(),
      ownHours: (ownHours ?? []).some((r) => r.staff_id === p.id),
    };
  });

  return (
    <div className="mx-auto max-w-3xl p-8">
      <PageHeader
        title="Staff"
        description="The people customers can book. Without any staff, the business takes one booking at a time."
      />
      <StaffList staff={rows} />
    </div>
  );
}
