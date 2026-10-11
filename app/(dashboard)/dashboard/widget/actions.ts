"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { imageKind, MAX_PHOTO_BYTES, storedPhotoPath } from "@/lib/staff/photo";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { whatsappContinueUrl } from "@/lib/channels/web-handoff";
import { FORM_KIND, WIDGET_SCHEMAS, type WidgetType } from "@/lib/widgets/config";
import { fieldsInputSchema, normalizeFields } from "@/lib/widgets/fields";
import { featureError } from "@/lib/dashboard-features";
import { WIDGET_FEATURE } from "@/lib/plans";

const ICON_BUCKET = "widget-icons";

const widgetSchema = z.object({
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex colour like #4f46e5"),
  position: z.enum(["bottom-right", "bottom-left"]),
  // The chatbot's own name, e.g. "Lindi". Empty = use the business name.
  assistant_name: z.string().trim().max(40, "Keep the chatbot's name to 40 characters or fewer."),
  icon_on_launcher: z.boolean(),
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
  const blocked = await featureError("web_chat");
  if (blocked) return { error: blocked };
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };

  const parsed = widgetSchema.safeParse({
    primary_color: formData.get("primary_color"),
    position: formData.get("position"),
    assistant_name: formData.get("assistant_name") ?? "",
    icon_on_launcher: formData.get("icon_on_launcher") === "on",
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
      assistant_name: parsed.data.assistant_name || null,
      icon_on_launcher: parsed.data.icon_on_launcher,
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

// The chatbot's icon: uploaded to the public widget-icons bucket under the
// business's folder, then set as widget_settings.avatar_url. The service-role
// client does the storage work only for the signed-in user's own business;
// the file's first bytes decide its type, not its name.
export async function uploadChatbotIconAction(formData: FormData): Promise<{ error: string | null }> {
  const blocked = await featureError("web_chat");
  if (blocked) return { error: blocked };
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  const file = formData.get("icon");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  if (file.size > MAX_PHOTO_BYTES) return { error: "That image is over 2 MB. Please choose a smaller one." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = imageKind(bytes);
  if (!kind) return { error: "Use a JPEG, PNG or WebP image." };

  const supabase = await createClient();
  const { data: current } = await supabase.from("widget_settings").select("avatar_url").eq("tenant_id", tenantId).maybeSingle();

  const admin = createAdminClient();
  const path = `${tenantId}/icon-${crypto.randomUUID()}.${kind.ext}`;
  const { error: uploadError } = await admin.storage
    .from(ICON_BUCKET)
    .upload(path, bytes, { contentType: kind.contentType, cacheControl: "31536000", upsert: false });
  if (uploadError) {
    console.error(`Uploading a chatbot icon for ${tenantId} failed:`, uploadError);
    return { error: "Couldn't upload the image. Please try again." };
  }
  const url = admin.storage.from(ICON_BUCKET).getPublicUrl(path).data.publicUrl;
  const { error } = await supabase
    .from("widget_settings")
    .update({ avatar_url: url, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (error) {
    await admin.storage.from(ICON_BUCKET).remove([path]);
    console.error(`Saving the chatbot icon for ${tenantId} failed:`, error);
    return { error: "Couldn't save the image. Please try again." };
  }
  await removeStoredIcon(current?.avatar_url ?? null, tenantId);
  revalidatePath("/dashboard/widget");
  revalidatePath("/dashboard/widget/preview");
  return { error: null };
}

export async function removeChatbotIconAction(): Promise<{ error: string | null }> {
  const blocked = await featureError("web_chat");
  if (blocked) return { error: blocked };
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  const supabase = await createClient();
  const { data: current } = await supabase.from("widget_settings").select("avatar_url").eq("tenant_id", tenantId).maybeSingle();
  const { error } = await supabase
    .from("widget_settings")
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (error) {
    console.error(`Removing the chatbot icon for ${tenantId} failed:`, error);
    return { error: "Couldn't remove the image. Please try again." };
  }
  await removeStoredIcon(current?.avatar_url ?? null, tenantId);
  revalidatePath("/dashboard/widget");
  revalidatePath("/dashboard/widget/preview");
  return { error: null };
}

// Deletes an icon we host, but only from this business's own folder (an
// older pasted link to somewhere else is left alone).
async function removeStoredIcon(url: string | null, tenantId: string) {
  const path = storedPhotoPath(url, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", ICON_BUCKET);
  if (!path?.startsWith(`${tenantId}/`)) return;
  const { error } = await createAdminClient().storage.from(ICON_BUCKET).remove([path]);
  if (error) console.error(`Removing old chatbot icon ${path} failed:`, error);
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

const widgetTypeSchema = z.enum(["schedule", "appointment", "contact", "registration"]);

function inputSchema(type: WidgetType) {
  return z.object({
    active: z.boolean(),
    copy: WIDGET_SCHEMAS[type].copy,
    settings: WIDGET_SCHEMAS[type].settings,
    fields: fieldsInputSchema,
  });
}

export async function saveBookingWidgetAction(type: WidgetType, input: unknown): Promise<{ error: string | null }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  if (!widgetTypeSchema.safeParse(type).success) return { error: "Invalid widget." };
  const blocked = await featureError(WIDGET_FEATURE[type]);
  if (blocked) return { error: blocked };
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
      // Normalised for that widget's form (e.g. name always asked).
      fields: normalizeFields(parsed.data.fields, FORM_KIND[type]),
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
