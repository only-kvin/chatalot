"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { reembedKnowledgeItem } from "@/lib/agent/retrieval";

const itemSchema = z.object({
  type: z.enum(["faq", "service", "policy", "info"]),
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
});

type KnowledgeItem = z.infer<typeof itemSchema> & { id: string };

// Results are returned rather than thrown: Next.js hides thrown server action
// messages in production (React error #441), and these are for the owner.
// `warning` means the item saved but the AI can't find it by search yet.
export type SaveResult = { error: string | null; warning: string | null; item?: KnowledgeItem };

const INDEX_WARNING =
  "Saved, but the AI couldn't index this item yet (the search service is busy). Open it and save again in a minute.";

function parseItem(formData: FormData) {
  return itemSchema.safeParse({
    type: formData.get("type"),
    title: formData.get("title"),
    content: formData.get("content"),
  });
}

// Embedding happens after the row is saved; failing it shouldn't lose the
// owner's edit, so it's reported as a warning instead of an error.
async function tryReembed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  itemId: string,
  content: string,
): Promise<string | null> {
  try {
    await reembedKnowledgeItem(supabase, tenantId, itemId, content);
    return null;
  } catch (err) {
    console.error(`Re-embedding knowledge item ${itemId} failed:`, err);
    return INDEX_WARNING;
  }
}

export async function createKnowledgeItemAction(formData: FormData): Promise<SaveResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized.", warning: null };
  const parsed = parseItem(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input.", warning: null };

  const supabase = await createClient();
  const { data: item, error } = await supabase
    .from("knowledge_items")
    .insert({ tenant_id: tenantId, ...parsed.data })
    .select("id, type, title, content")
    .single();
  if (error) {
    console.error("Creating knowledge item failed:", error);
    return { error: "Couldn't save the item. Please try again.", warning: null };
  }

  const warning = await tryReembed(supabase, tenantId, item.id, item.content);
  revalidatePath("/dashboard/knowledge");
  return { error: null, warning, item };
}

export async function updateKnowledgeItemAction(formData: FormData): Promise<SaveResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized.", warning: null };
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid item.", warning: null };
  const parsed = parseItem(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input.", warning: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("knowledge_items")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("tenant_id", tenantId);
  if (error) {
    console.error(`Updating knowledge item ${id.data} failed:`, error);
    return { error: "Couldn't save the item. Please try again.", warning: null };
  }

  const warning = await tryReembed(supabase, tenantId, id.data, parsed.data.content);
  revalidatePath("/dashboard/knowledge");
  return { error: null, warning, item: { id: id.data, ...parsed.data } };
}

export async function deleteKnowledgeItemAction(formData: FormData): Promise<{ error: string | null }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid item." };

  const supabase = await createClient();
  // knowledge_chunks rows go with it via the item_id foreign key.
  const { error } = await supabase
    .from("knowledge_items")
    .delete()
    .eq("id", id.data)
    .eq("tenant_id", tenantId);
  if (error) {
    console.error(`Deleting knowledge item ${id.data} failed:`, error);
    return { error: "Couldn't delete the item. Please try again." };
  }

  revalidatePath("/dashboard/knowledge");
  return { error: null };
}
