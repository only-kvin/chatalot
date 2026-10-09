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

// Website chunks are long, so only a few are added, within a character
// budget: a big website mustn't crowd out what the owner typed.
const MAX_WEBSITE_CHUNKS = 2;
const WEBSITE_CHAR_BUDGET = 3500;

type Match = { content: string; source: string | null; source_url: string | null };

// The knowledge for one turn: every always-included `info` item (hours,
// address, contact; never left to similarity search), the owner's best
// matching items, then a little matching text from the business's website,
// labelled as such so the prompt can tell the two apart (owner entries win).
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
      .eq("type", "info")
      .eq("excluded", false),
    // Similarity search is best-effort: if embedding fails (e.g. Voyage rate
    // limits), the always-included info items below still reach the prompt.
    // A wide search: website pages have many chunks and could otherwise
    // fill every slot, leaving none of the owner's own items.
    searchChunks(supabase, tenantId, userMessage, k * 4).catch((err) => {
      console.error("Knowledge search failed; using info items only:", err);
      return [] as Match[];
    }),
  ]);
  return assembleKnowledge(infoItems ?? [], matches, k);
}

// Pure, for testing: owner info items, up to k owner matches, then website
// matches within their budget.
export function assembleKnowledge(infoItems: { title: string; content: string }[], matches: Match[], k: number): string {
  const sections = infoItems.map((item) => `${item.title}: ${item.content}`);
  // Info items are already in; a search hit on one would only repeat it.
  const infoText = new Set(infoItems.map((item) => item.content));
  const owner = matches.filter((m) => m.source !== "website" && !infoText.has(m.content)).slice(0, k);
  sections.push(...owner.map((m) => m.content));

  let budget = WEBSITE_CHAR_BUDGET;
  let added = 0;
  for (const m of matches.filter((m) => m.source === "website")) {
    if (added >= MAX_WEBSITE_CHUNKS) break;
    // Too long for what's left: a shorter match further down may still fit.
    if (m.content.length > budget) continue;
    sections.push(`[From the business's website: ${m.source_url ?? "unknown page"}]\n${m.content}`);
    budget -= m.content.length;
    added++;
  }
  return sections.join("\n\n");
}

async function searchChunks(
  supabase: SupabaseClient,
  tenantId: string,
  userMessage: string,
  k: number,
): Promise<Match[]> {
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
