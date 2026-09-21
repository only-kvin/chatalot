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

async function requireTenantId(): Promise<string> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) throw new Error("Not authorized");
  return tenantId;
}

export async function createKnowledgeItemAction(formData: FormData) {
  const tenantId = await requireTenantId();
  const parsed = itemSchema.safeParse({
    type: formData.get("type"),
    title: formData.get("title"),
    content: formData.get("content"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

  const supabase = await createClient();
  const { data: item, error } = await supabase
    .from("knowledge_items")
    .insert({ tenant_id: tenantId, ...parsed.data })
    .select("id, content")
    .single();
  if (error) throw new Error(error.message);

  await reembedKnowledgeItem(supabase, tenantId, item.id, item.content);
  revalidatePath("/dashboard/knowledge");
}

export async function updateKnowledgeItemAction(formData: FormData) {
  const tenantId = await requireTenantId();
  const id = formData.get("id") as string;
  const parsed = itemSchema.safeParse({
    type: formData.get("type"),
    title: formData.get("title"),
    content: formData.get("content"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

  const supabase = await createClient();
  const { error } = await supabase
    .from("knowledge_items")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  await reembedKnowledgeItem(supabase, tenantId, id, parsed.data.content);
  revalidatePath("/dashboard/knowledge");
}

export async function deleteKnowledgeItemAction(formData: FormData) {
  const tenantId = await requireTenantId();
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { error } = await supabase
    .from("knowledge_items")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/knowledge");
}
