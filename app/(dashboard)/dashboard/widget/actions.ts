"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";

const widgetSchema = z.object({
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex colour like #4f46e5"),
  position: z.enum(["bottom-right", "bottom-left"]),
  avatar_url: z.string(),
  launcher_text: z.string().min(1, "Launcher text is required"),
  teaser_text: z.string(),
  quick_replies: z.string(),
  whatsapp_link: z.string(),
});

export async function updateWidgetSettingsAction(formData: FormData) {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) throw new Error("Not authorized");

  const parsed = widgetSchema.safeParse({
    primary_color: formData.get("primary_color"),
    position: formData.get("position"),
    avatar_url: formData.get("avatar_url") ?? "",
    launcher_text: formData.get("launcher_text"),
    teaser_text: formData.get("teaser_text") ?? "",
    quick_replies: formData.get("quick_replies") ?? "",
    whatsapp_link: formData.get("whatsapp_link") ?? "",
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

  const quickReplies = parsed.data.quick_replies
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);

  const supabase = await createClient();
  const { error } = await supabase
    .from("widget_settings")
    .update({
      primary_color: parsed.data.primary_color,
      position: parsed.data.position,
      avatar_url: parsed.data.avatar_url || null,
      launcher_text: parsed.data.launcher_text,
      teaser_text: parsed.data.teaser_text || null,
      quick_replies: quickReplies,
      whatsapp_link: parsed.data.whatsapp_link || null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/widget");
  revalidatePath("/dashboard/widget/preview");
}
