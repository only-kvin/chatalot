"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";

export async function toggleTakeOverAction(formData: FormData) {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) throw new Error("Not authorized");

  const id = formData.get("id") as string;
  const nextStatus = formData.get("nextStatus") as "ai" | "human";

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ status: nextStatus })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/conversations/${id}`);
  revalidatePath("/dashboard/conversations");
}
