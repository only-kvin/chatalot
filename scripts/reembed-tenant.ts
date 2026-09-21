// Re-embeds every knowledge_item for a tenant. Useful after seeding without an
// embeddings key available yet, or after switching embedding models.
// Usage: pnpm reembed-tenant <slug>

import { createAdminClient } from "../lib/db/supabase-admin";
import { reembedKnowledgeItem } from "../lib/agent/retrieval";

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: pnpm reembed-tenant <slug>");
    process.exit(1);
  }

  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id").eq("slug", slug).single();
  if (!tenant) {
    console.error(`No tenant found for slug "${slug}"`);
    process.exit(1);
  }

  const { data: items, error } = await admin
    .from("knowledge_items")
    .select("id, content")
    .eq("tenant_id", tenant.id);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  for (const item of items ?? []) {
    // Voyage throttles free accounts with no payment method to 3 requests/minute —
    // retry with backoff rather than failing the whole backfill on a 429.
    for (let attempt = 0; ; attempt++) {
      try {
        await reembedKnowledgeItem(admin, tenant.id, item.id, item.content);
        console.log(`Embedded: ${item.id}`);
        break;
      } catch (err) {
        if (attempt >= 5 || !(err instanceof Error) || !err.message.includes("429")) throw err;
        const waitMs = 21_000;
        console.log(`Rate limited, waiting ${waitMs / 1000}s before retrying...`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  console.log(`Done. Re-embedded ${items?.length ?? 0} items for "${slug}".`);
}

main();
