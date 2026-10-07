"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { whatsappContinueUrl } from "@/lib/channels/web-handoff";
import { WIDGET_SCHEMAS, type BookingWidgetType } from "@/lib/widgets/config";
import { fieldsInputSchema, normalizeFields } from "@/lib/widgets/fields";

const widgetSchema = z.object({
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex colour like #4f46e5"),
  position: z.enum(["bottom-right", "bottom-left"]),
  avatar_url: z.string(),
  launcher_text: z.string().min(1, "Launcher text is required"),
  teaser_text: z.string(),
  quick_replies: z.string(),
  // Must be a wa.me (or api.whatsapp.com) link: the widget offers it as the
  // way to reach a person when a visitor asks for one.
  whatsapp_link: z
    .string()
    .trim()
    .refine((v) => v === "" || whatsappContinueUrl(v) !== null, {
      message: "Use a WhatsApp link like https://wa.me/27821234567 (country code, no + or spaces).",
    }),
});

// Returns errors rather than throwing: Next.js hides thrown server action
// messages in production, and these are meant for the owner to read.
export async function updateWidgetSettingsAction(formData: FormData): Promise<{ error: string | null }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };

  const parsed = widgetSchema.safeParse({
    primary_color: formData.get("primary_color"),
    position: formData.get("position"),
    avatar_url: formData.get("avatar_url") ?? "",
    launcher_text: formData.get("launcher_text"),
    teaser_text: formData.get("teaser_text") ?? "",
    quick_replies: formData.get("quick_replies") ?? "",
    whatsapp_link: formData.get("whatsapp_link") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

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
  if (error) {
    console.error(`Saving widget settings for ${tenantId} failed:`, error);
    return { error: "Couldn't save your settings. Please try again." };
  }

  revalidatePath("/dashboard/widget");
  revalidatePath("/dashboard/widget/preview");
  return { error: null };
}

// ---------------------------------------------------------------------------
// The website booking widgets: shared look, and the schedule widget.
// ---------------------------------------------------------------------------

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colours must be hex like #4f46e5");
const themeSchema = z.object({
  primary_color: hex,
  surface_color: hex,
  text_color: hex,
  corner_radius: z.coerce.number().int().min(0).max(32),
  font: z.enum(["system", "inter", "poppins", "lora", "nunito"]),
  color_mode: z.enum(["light", "dark", "auto"]),
});

export async function updateWidgetThemeAction(formData: FormData): Promise<{ error: string | null }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  const parsed = themeSchema.safeParse(Object.fromEntries(["primary_color", "surface_color", "text_color", "corner_radius", "font", "color_mode"].map((k) => [k, formData.get(k)])));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("widget_settings")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (error) {
    console.error(`Saving the widget look for ${tenantId} failed:`, error);
    return { error: "Couldn't save the look. Please try again." };
  }
  revalidatePath("/dashboard/widget");
  return { error: null };
}

const widgetTypeSchema = z.enum(["schedule", "appointment"]);

function inputSchema(type: BookingWidgetType) {
  return z.object({
    active: z.boolean(),
    copy: WIDGET_SCHEMAS[type].copy,
    settings: WIDGET_SCHEMAS[type].settings,
    fields: fieldsInputSchema,
  });
}

export async function saveBookingWidgetAction(type: BookingWidgetType, input: unknown): Promise<{ error: string | null }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  if (!widgetTypeSchema.safeParse(type).success) return { error: "Invalid widget." };
  const parsed = inputSchema(type).safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.path[0] === "copy" ? "Fill in every text, within its length." : (issue?.message ?? "Invalid input.") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("widget_instances").upsert(
    {
      tenant_id: tenantId,
      type,
      active: parsed.data.active,
      copy: parsed.data.copy,
      settings: parsed.data.settings,
      // Normalised: name and phone always present and required.
      fields: normalizeFields(parsed.data.fields),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,type" },
  );
  if (error) {
    console.error(`Saving the ${type} widget for ${tenantId} failed:`, error);
    return { error: "Couldn't save the widget. Please try again." };
  }
  revalidatePath("/dashboard/widget");
  return { error: null };
}
