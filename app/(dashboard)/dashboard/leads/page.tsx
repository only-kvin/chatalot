import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { PageHeader } from "@/components/dashboard/page-header";
import { LeadsTable } from "./leads-table";
import { UrgentFilter } from "@/components/dashboard/urgent-filter";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");
  const urgentOnly = (await searchParams).filter === "urgent";

  const supabase = await createClient();
  let query = supabase
    .from("leads")
    .select("id, name, phone, email, interest, status, source, urgent, conversation_id, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (urgentOnly) query = query.eq("urgent", true);
  const { data: leads } = await query;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <PageHeader title="Leads" />
      <UrgentFilter base="/dashboard/leads" urgentOnly={urgentOnly} />
      <LeadsTable leads={leads ?? []} />
    </div>
  );
}
