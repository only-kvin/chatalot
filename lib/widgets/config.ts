import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeFields, type Field } from "./fields";

// What the website widgets read: the shared look (widget_settings) and each
// widget's own wording, behaviour and form (widget_instances). Anything a
// business hasn't set falls back to the defaults here.

export type WidgetType = "schedule";

export type WidgetTheme = {
  primary: string;
  surface: string;
  text: string;
  radius: number;
  font: "system" | "inter" | "poppins" | "lora" | "nunito";
  mode: "light" | "dark" | "auto";
};

export const scheduleCopySchema = z.object({
  title: z.string().trim().min(1).max(60),
  confirmButton: z.string().trim().min(1).max(40),
  successTitle: z.string().trim().min(1).max(60),
  successMessage: z.string().trim().max(300),
  requestedTitle: z.string().trim().min(1).max(60),
  requestedMessage: z.string().trim().max(300),
});
export type ScheduleCopy = z.infer<typeof scheduleCopySchema>;

export const scheduleSettingsSchema = z.object({
  // Let customers choose who they book with (only shown once there's staff).
  allowStaffChoice: z.boolean(),
});
export type ScheduleSettings = z.infer<typeof scheduleSettingsSchema>;

export const DEFAULT_SCHEDULE_COPY: ScheduleCopy = {
  title: "Book an appointment",
  confirmButton: "Confirm booking",
  successTitle: "You're booked!",
  successMessage: "We've sent the details to your email.",
  requestedTitle: "Request received",
  requestedMessage: "We'll confirm your booking shortly. The time is held for you until then.",
};
export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = { allowStaffChoice: true };

// Stored values over defaults, key by key, ignoring anything invalid.
function merge<T extends Record<string, unknown>>(schema: z.ZodObject, defaults: T, stored: unknown): T {
  const partial = schema.partial().safeParse(stored);
  if (!partial.success) return defaults;
  const clean = Object.fromEntries(Object.entries(partial.data).filter(([, v]) => v !== undefined));
  return { ...defaults, ...clean };
}

export type ScheduleWidgetConfig = {
  copy: ScheduleCopy;
  settings: ScheduleSettings;
  fields: Field[];
  active: boolean;
};

export function scheduleConfigFrom(row: { copy?: unknown; settings?: unknown; fields?: unknown; active?: boolean } | null): ScheduleWidgetConfig {
  return {
    copy: merge(scheduleCopySchema, DEFAULT_SCHEDULE_COPY, row?.copy),
    settings: merge(scheduleSettingsSchema, DEFAULT_SCHEDULE_SETTINGS, row?.settings),
    fields: normalizeFields(row?.fields ?? []),
    active: row?.active ?? true,
  };
}

export async function loadScheduleWidget(client: SupabaseClient, tenantId: string): Promise<ScheduleWidgetConfig> {
  const { data, error } = await client
    .from("widget_instances")
    .select("copy, settings, fields, active")
    .eq("tenant_id", tenantId)
    .eq("type", "schedule")
    .maybeSingle();
  if (error) throw error;
  return scheduleConfigFrom(data);
}

export async function loadWidgetTheme(client: SupabaseClient, tenantId: string): Promise<WidgetTheme> {
  const { data, error } = await client
    .from("widget_settings")
    .select("primary_color, surface_color, text_color, corner_radius, font, color_mode")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  return {
    primary: data?.primary_color ?? "#4f46e5",
    surface: data?.surface_color ?? "#ffffff",
    text: data?.text_color ?? "#18181b",
    radius: data?.corner_radius ?? 20,
    font: (data?.font as WidgetTheme["font"]) ?? "system",
    mode: (data?.color_mode as WidgetTheme["mode"]) ?? "light",
  };
}
