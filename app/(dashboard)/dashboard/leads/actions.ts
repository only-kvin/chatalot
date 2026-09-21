"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";

const statusSchema = z.enum(["new", "contacted", "booked", "won", "lost"]);

export async function updateLeadStatusAction(formData: FormData) {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) throw new Error("Not authorized");

  const id = formData.get("id") as string;
  const parsed = statusSchema.safeParse(formData.get("status"));
  if (!parsed.success) throw new Error("Invalid status");

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ status: parsed.data })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/leads");
}
