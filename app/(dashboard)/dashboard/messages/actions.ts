"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";

// Contact-form messages: the dashboard only changes their status. The
// user's own client is used, so RLS (and a column grant on status alone)
// keeps it to their business and that one field.

const schema = z.object({ id: z.string().uuid(), status: z.enum(["new", "read", "replied"]) });

export async function setMessageStatusAction(id: string, status: string): Promise<{ error: string | null }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  const parsed = schema.safeParse({ id, status });
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_messages")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .eq("tenant_id", tenantId);
  if (error) {
    console.error(`Updating message ${id} failed:`, error);
    return { error: "Couldn't update the message. Please try again." };
  }
  revalidatePath("/dashboard/messages");
  revalidatePath(`/dashboard/messages/${id}`);
  return { error: null };
}

// Opening a message: new -> read, and only from new, so it can never undo a
// "replied" the owner set in the meantime.
export async function markMessageReadAction(id: string): Promise<{ error: string | null }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  if (!z.string().uuid().safeParse(id).success) return { error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_messages")
    .update({ status: "read" })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("status", "new");
  if (error) console.error(`Marking message ${id} read failed:`, error);
  revalidatePath("/dashboard/messages");
  return { error: null };
}
