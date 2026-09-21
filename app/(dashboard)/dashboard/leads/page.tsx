import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { PageHeader } from "@/components/dashboard/page-header";
import { LeadsTable } from "./leads-table";

export default async function LeadsPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, phone, email, interest, status, source, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-4xl p-8">
      <PageHeader title="Leads" />
      <LeadsTable leads={leads ?? []} />
    </div>
  );
}
