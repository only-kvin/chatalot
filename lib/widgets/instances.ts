import type { SupabaseClient } from "@supabase/supabase-js";
import { FORM_KIND, WIDGET_TYPE_LABEL, type WidgetType } from "./config";
import { normalizeFields, type Field } from "./fields";

// Writing a business's widgets. A business has any number of widgets per
// type (variants, test widgets) and exactly one default per type: the widget
// embed codes without a widget id, the hosted booking page and booking links
// use. A business that has never saved a type has no row at all; its
// default then comes from the built-in settings until the first save.

export const WIDGET_TYPES = ["appointment", "schedule", "contact", "registration"] as const satisfies readonly WidgetType[];

export type WidgetValues = { active: boolean; copy: unknown; settings: unknown; fields: Field[] };

export type WidgetSummary = {
  id: string;
  type: WidgetType;
  name: string;
  status: "draft" | "live";
  isDefault: boolean;
  active: boolean;
  createdAt: string;
};

// Saves a widget: the one with this id, or the business's default of the
// type (created on its first save).
export async function saveWidget(
  client: SupabaseClient,
  tenantId: string,
  type: WidgetType,
  values: WidgetValues,
  widgetId?: string | null,
): Promise<{ error: string | null }> {
  const row = {
    active: values.active,
    copy: values.copy,
    settings: values.settings,
    // Normalised for that widget's form (e.g. name always asked).
    fields: normalizeFields(values.fields, FORM_KIND[type]),
    updated_at: new Date().toISOString(),
  };
  let q = client.from("widget_instances").update(row).eq("tenant_id", tenantId).eq("type", type);
  q = widgetId ? q.eq("id", widgetId) : q.eq("is_default", true);
  const { data, error } = await q.select("id");
  if (error) return { error: error.message };
  if (data?.length) return { error: null };
  if (widgetId) return { error: "That widget no longer exists." };
  const { error: insertError } = await client
    .from("widget_instances")
    .insert({ tenant_id: tenantId, type, ...row, name: WIDGET_TYPE_LABEL[type], status: "live", is_default: true });
  return { error: insertError?.message ?? null };
}

// A new widget with the built-in settings, ready to embed before the
// business has set anything up. The first of a type becomes the default
// (and so Live); later ones start as Draft unless asked otherwise.
export async function createWidget(
  client: SupabaseClient,
  tenantId: string,
  type: WidgetType,
  opts: { name: string; status: "draft" | "live"; createdBy: string | null },
): Promise<{ id: string } | { error: string }> {
  const { data: existing, error: readError } = await client
    .from("widget_instances")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("type", type)
    .eq("is_default", true)
    .maybeSingle();
  if (readError) return { error: readError.message };
  const first = !existing;
  const { data, error } = await client
    .from("widget_instances")
    .insert({
      tenant_id: tenantId,
      type,
      name: opts.name.trim().slice(0, 60) || WIDGET_TYPE_LABEL[type],
      status: first ? "live" : opts.status,
      is_default: first,
      created_by: opts.createdBy,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export async function listWidgets(client: SupabaseClient, tenantId: string): Promise<WidgetSummary[]> {
  const { data, error } = await client
    .from("widget_instances")
    .select("id, type, name, status, is_default, active, created_at")
    .eq("tenant_id", tenantId)
    .order("is_default", { ascending: false })
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    type: r.type as WidgetType,
    name: r.name || WIDGET_TYPE_LABEL[r.type as WidgetType],
    status: r.status === "draft" ? "draft" : "live",
    isDefault: r.is_default,
    active: r.active,
    createdAt: r.created_at,
  }));
}

// The code to paste into a website: the loader script once per page (in
// the <head> or before </body>), then a box wherever each widget goes.
// data-chat="off" leaves the chat bubble out; drop it to show the chat too.
export function loaderScript(appUrl: string, publicKey: string): string {
  return `<script src="${appUrl}/widget.js" data-key="${publicKey}" data-chat="off" async></script>`;
}

// A widget id picks a variant (the default without one). preview: sample
// data and setup notes for whoever is building the site.
export function widgetBox(type: WidgetType, opts: { widgetId?: string | null; preview?: boolean } = {}): string {
  const attrs = [`data-chatalot="${type}"`, opts.widgetId ? `data-widget="${opts.widgetId}"` : "", opts.preview ? "data-preview" : ""];
  return `<div ${attrs.filter(Boolean).join(" ")}></div>`;
}
