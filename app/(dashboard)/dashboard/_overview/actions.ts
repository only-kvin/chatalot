"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";

const switchSchema = z.object({
  key: z.enum(["web_ai_enabled", "whatsapp_ai_enabled", "lead_email_enabled"]),
  on: z.boolean(),
});
export type AiSwitchKey = z.infer<typeof switchSchema>["key"];

// The "AI receptionist" switches on the Overview. Returns errors rather than
// throwing: Next.js hides thrown server action messages in production.
export async function setAiSwitchAction(key: AiSwitchKey, on: boolean): Promise<{ error: string | null }> {
  const parsed = switchSchema.safeParse({ key, on });
  if (!parsed.success) return { error: "Invalid setting." };

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_configs")
    .update({ [parsed.data.key]: parsed.data.on, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (error) {
    console.error(`Saving ${parsed.data.key} for ${tenantId} failed:`, error);
    return { error: "Couldn't save that. Please try again." };
  }
  revalidatePath("/dashboard");
  return { error: null };
}
