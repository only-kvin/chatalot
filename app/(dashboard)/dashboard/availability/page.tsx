import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
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
      <h1 className="mb-1 text-2xl font-semibold">Availability</h1>
      <p className="mb-6 text-sm text-zinc-500">
        When your AI receptionist can offer bookings, and any one-off closures.
      </p>
      <AvailabilityEditor initialRules={rules ?? []} initialExceptions={exceptions ?? []} />
    </div>
  );
}
