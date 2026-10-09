import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { PageHeader } from "@/components/dashboard/page-header";
import { KnowledgeEditor } from "./knowledge-editor";
import { WebsiteSection } from "./website-section";
import { importableHosts } from "@/lib/website/urls";

export default async function KnowledgePage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const [{ data: items }, { data: pages }, { data: latest }, { data: tenant }] = await Promise.all([
    supabase
      .from("knowledge_items")
      .select("id, type, title, content")
      .eq("tenant_id", tenantId)
      .eq("source", "manual")
      .order("updated_at", { ascending: false }),
    supabase
      .from("knowledge_items")
      .select("id, title, source_url, updated_at, excluded, content")
      .eq("tenant_id", tenantId)
      .eq("source", "website")
      .order("source_url"),
    supabase
      .from("website_imports")
      .select("status, start_url, pages_found, pages_done, pages_failed, pages_empty, capped, error, finished_at, seen")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("tenants").select("allowed_domains").eq("id", tenantId).single(),
  ]);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <PageHeader
        title="Knowledge base"
        description="FAQs, services, prices and policies your AI receptionist answers from."
      />
      <div className="flex flex-col gap-8">
        <KnowledgeEditor initialItems={items ?? []} />
        <WebsiteSection
          domains={importableHosts(tenant?.allowed_domains ?? [])}
          latest={
            latest && {
              status: latest.status,
              startUrl: latest.start_url,
              pagesFound: latest.pages_found,
              pagesRead: (latest.seen as string[]).length,
              pagesDone: latest.pages_done,
              pagesFailed: latest.pages_failed,
              pagesEmpty: latest.pages_empty,
              capped: latest.capped,
              error: latest.error,
              finishedAt: latest.finished_at,
            }
          }
          pages={(pages ?? []).map((p) => ({
            id: p.id,
            title: p.title,
            url: p.source_url,
            updatedAt: p.updated_at,
            excluded: p.excluded,
            // A preview is enough here; the full text can be long.
            preview: p.content.length > 1500 ? `${p.content.slice(0, 1500)}…` : p.content,
          }))}
        />
      </div>
    </div>
  );
}
