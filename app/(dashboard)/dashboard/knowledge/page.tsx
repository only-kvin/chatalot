import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
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
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Knowledge base</h1>
      <KnowledgeEditor initialItems={items ?? []} />
    </div>
  );
}
