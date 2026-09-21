import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { PageHeader } from "@/components/dashboard/page-header";
import { AvailabilityEditor } from "./availability-editor";

export default async function AvailabilityPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const [{ data: rules }, { data: exceptions }] = await Promise.all([
    supabase
      .from("availability_rules")
      .select("id, weekday, start_time, end_time")
      .eq("tenant_id", tenantId),
    supabase
      .from("availability_exceptions")
      .select("id, date, is_closed, start_time, end_time")
      .eq("tenant_id", tenantId),
  ]);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <PageHeader
        title="Availability"
        description="When your AI receptionist can offer bookings, and any one-off closures."
      />
      <AvailabilityEditor initialRules={rules ?? []} initialExceptions={exceptions ?? []} />
    </div>
  );
}
