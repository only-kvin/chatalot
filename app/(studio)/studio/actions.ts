"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/auth";
import { getPlatformRole } from "@/lib/db/platform-role";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createWidget, WIDGET_TYPES } from "@/lib/widgets/instances";

// Studio actions: platform staff and admins set up a business's widgets for
// the website they're building. Checked here, then written with the service
// role (staff aren't members of the business).

type Result = { error: string | null };

const uuid = z.string().uuid();

async function studioUser(): Promise<{ userId: string } | { error: string }> {
  const [user, role] = await Promise.all([getSessionUser(), getPlatformRole()]);
  if (!user || !role) return { error: "Not authorized." };
  return { userId: user.id };
}

const createSchema = z.object({
  type: z.enum(WIDGET_TYPES),
  name: z.string().trim().max(60),
  status: z.enum(["draft", "live"]),
});

export async function createStudioWidgetAction(tenantId: string, formData: FormData): Promise<Result> {
  const who = await studioUser();
  if ("error" in who) return who;
  if (!uuid.safeParse(tenantId).success) return { error: "Invalid business." };
  const parsed = createSchema.safeParse({ type: formData.get("type"), name: formData.get("name") ?? "", status: formData.get("status") ?? "live" });
  if (!parsed.success) return { error: "Choose a widget type." };

  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id").eq("id", tenantId).maybeSingle();
  if (!tenant) return { error: "That business doesn't exist." };
  const created = await createWidget(admin, tenantId, parsed.data.type, { ...parsed.data, createdBy: who.userId });
  if ("error" in created) {
    console.error(`Studio: creating a ${parsed.data.type} widget for ${tenantId} failed:`, created.error);
    return { error: "Couldn't create the widget. Please try again." };
  }
  revalidatePath(`/studio/${tenantId}`);
  return { error: null };
}

export async function setStudioWidgetStatusAction(tenantId: string, widgetId: string, status: "draft" | "live"): Promise<Result> {
  const who = await studioUser();
  if ("error" in who) return who;
  if (!uuid.safeParse(tenantId).success || !uuid.safeParse(widgetId).success || !["draft", "live"].includes(status)) {
    return { error: "Invalid request." };
  }
  // The default is always Live (the database refuses otherwise).
  const { error } = await createAdminClient()
    .from("widget_instances")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", widgetId)
    .eq("is_default", false);
  if (error) return { error: "Couldn't change it. Please try again." };
  revalidatePath(`/studio/${tenantId}`);
  return { error: null };
}
