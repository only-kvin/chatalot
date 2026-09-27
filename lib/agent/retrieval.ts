import type { SupabaseClient } from "@supabase/supabase-js";

const VOYAGE_MODEL = "voyage-3.5-lite";

// Behind its own function so the embedding provider can be swapped later
// without touching anything that calls it.
export async function embed(
  texts: string[],
  inputType: "query" | "document",
): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: inputType }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Voyage API error ${res.status}: ${body}`);
  }

  const json = await res.json();
  return json.data.map((d: { embedding: number[] }) => d.embedding);
}

// Top-k similar chunks (Phase 1+, once knowledge_chunks is populated) plus every
// always-included `info` item (hours, address, contact) — per the spec, those are
// never left to similarity search.
export async function getRelevantKnowledge(
  supabase: SupabaseClient,
  tenantId: string,
  userMessage: string,
  k = 6,
): Promise<string> {
  const [{ data: infoItems }, matches] = await Promise.all([
    supabase
      .from("knowledge_items")
      .select("title, content")
      .eq("tenant_id", tenantId)
      .eq("type", "info"),
    // Similarity search is best-effort: if embedding fails (e.g. Voyage rate
    // limits), the always-included info items below still reach the prompt.
    searchChunks(supabase, tenantId, userMessage, k).catch((err) => {
      console.error("Knowledge search failed; using info items only:", err);
      return [];
    }),
  ]);

  const sections: string[] = [];
  for (const item of infoItems ?? []) {
    sections.push(`${item.title}: ${item.content}`);
  }
  for (const match of matches) {
    sections.push(match.content);
  }

  return sections.join("\n\n");
}

async function searchChunks(
  supabase: SupabaseClient,
  tenantId: string,
  userMessage: string,
  k: number,
): Promise<{ content: string }[]> {
  const [queryEmbedding] = await embed([userMessage], "query");
  const { data, error } = await supabase.rpc("match_chunks", {
    p_tenant_id: tenantId,
    p_query_embedding: queryEmbedding,
    p_k: k,
  });
  if (error) throw new Error(`match_chunks failed: ${error.message}`);
  return data ?? [];
}

// Re-embeds one knowledge item into knowledge_chunks. Called after create/update
// from the dashboard's knowledge editor. Items in this app are short (a paragraph
// or two), so each item is embedded as a single chunk — no text-splitting needed.
export async function reembedKnowledgeItem(
  supabase: SupabaseClient,
  tenantId: string,
  itemId: string,
  content: string,
): Promise<void> {
  // Embed first: if Voyage fails, the item keeps its previous embedding
  // instead of being left with none.
  const [embedding] = await embed([content], "document");

  await supabase.from("knowledge_chunks").delete().eq("item_id", itemId).eq("tenant_id", tenantId);
  const { error } = await supabase.from("knowledge_chunks").insert({
    tenant_id: tenantId,
    item_id: itemId,
    content,
    embedding,
  });
  if (error) throw new Error(`Failed to store embedding: ${error.message}`);
}
