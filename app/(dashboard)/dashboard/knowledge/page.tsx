import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { PageHeader } from "@/components/dashboard/page-header";
import { KnowledgeEditor } from "./knowledge-editor";

export default async function KnowledgePage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const { data: items } = await supabase
    .from("knowledge_items")
    .select("id, type, title, content")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:p-8">
      <PageHeader
        title="Knowledge base"
        description="FAQs, services, prices and policies your AI receptionist answers from."
      />
      <KnowledgeEditor initialItems={items ?? []} />
    </div>
  );
}
