"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/auth";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createClient } from "@/lib/db/supabase-server";
import { generateSiteBrief } from "@/lib/site-brief/generate";

// Platform-admin actions on site briefs. Each re-checks the caller: server
// actions can be called directly, so the admin layout alone isn't enough.

type Result = { error: string | null };

async function adminUserId(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const { data } = await (await createClient()).from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return data ? user.id : null;
}

const updateSchema = z.object({
  id: z.uuid(),
  status: z.enum(["draft", "ready", "in_build", "live", "withdrawn"]),
  lovableProjectUrl: z.union([z.url().max(500), z.literal("")]),
  liveDomain: z.union([z.string().trim().max(253).regex(/^[a-z0-9.-]+$/i, "Enter a domain like example.co.za"), z.literal("")]),
});

export async function updateSiteBriefAction(input: z.input<typeof updateSchema>): Promise<Result> {
  if (!(await adminUserId())) return { error: "Not authorized." };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { id, status, lovableProjectUrl, liveDomain } = parsed.data;
  const { error } = await createAdminClient()
    .from("site_briefs")
    .update({
      status,
      lovable_project_url: lovableProjectUrl || null,
      live_domain: liveDomain.toLowerCase() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: "Couldn't save the brief." };
  revalidatePath(`/admin/site-briefs/${id}`);
  revalidatePath("/admin/site-briefs");
  return { error: null };
}

export async function generateSiteBriefAdminAction(tenantId: string): Promise<Result & { id?: string }> {
  const userId = await adminUserId();
  if (!userId) return { error: "Not authorized." };
  if (!z.uuid().safeParse(tenantId).success) return { error: "Unknown business." };
  try {
    const brief = await generateSiteBrief(createAdminClient(), tenantId, { createdBy: userId });
    revalidatePath("/admin/site-briefs");
    revalidatePath(`/admin/tenants/${tenantId}`);
    return { error: null, id: brief.id };
  } catch (err) {
    console.error("Making a site brief failed:", err);
    return { error: "Couldn't make the brief. Try again in a minute." };
  }
}
