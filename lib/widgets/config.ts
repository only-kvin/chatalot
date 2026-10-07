import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeFields, type Field } from "./fields";

// What the website widgets read: the shared look (widget_settings) and each
// widget's own wording, behaviour and form (widget_instances). Anything a
// business hasn't set falls back to the defaults here.

export type WidgetTheme = {
  primary: string;
  surface: string;
  text: string;
  radius: number;
  font: "system" | "inter" | "poppins" | "lora" | "nunito";
  mode: "light" | "dark" | "auto";
};

export type BookingWidgetType = "schedule" | "appointment";

// Wording both booking widgets have.
const baseCopy = {
  title: z.string().trim().min(1).max(60),
  confirmButton: z.string().trim().min(1).max(40),
  successTitle: z.string().trim().min(1).max(60),
  successMessage: z.string().trim().max(300),
  requestedTitle: z.string().trim().min(1).max(60),
  requestedMessage: z.string().trim().max(300),
};
const BASE_COPY_DEFAULTS = {
  confirmButton: "Confirm booking",
  successTitle: "You're booked!",
  successMessage: "See you soon!",
  requestedTitle: "Request received",
  requestedMessage: "We'll confirm your booking shortly. The time is held for you until then.",
};

export const WIDGET_SCHEMAS = {
  schedule: {
    copy: z.object(baseCopy),
    settings: z.object({
      // Let customers choose who they book with (only shown once there's staff).
      allowStaffChoice: z.boolean(),
    }),
    defaultCopy: { title: "Book an appointment", ...BASE_COPY_DEFAULTS },
    defaultSettings: { allowStaffChoice: true },
  },
  appointment: {
    copy: z.object({
      ...baseCopy,
      // Shown on the confirmation, e.g. "Arrive 5 minutes early".
      nextSteps: z.string().trim().max(300),
    }),
    settings: z.object({
      // Offer "Any available" above the staff list.
      allowAnyStaff: z.boolean(),
      // Show services under their category headings.
      groupByCategory: z.boolean(),
    }),
    defaultCopy: { title: "Book a service", nextSteps: "", ...BASE_COPY_DEFAULTS },
    defaultSettings: { allowAnyStaff: true, groupByCategory: true },
  },
} as const;

type Schemas = typeof WIDGET_SCHEMAS;
export type WidgetCopy<T extends BookingWidgetType> = z.infer<Schemas[T]["copy"]>;
export type WidgetSettings<T extends BookingWidgetType> = z.infer<Schemas[T]["settings"]>;
export type ScheduleCopy = WidgetCopy<"schedule">;
export type ScheduleSettings = WidgetSettings<"schedule">;
export type AppointmentCopy = WidgetCopy<"appointment">;
export type AppointmentSettings = WidgetSettings<"appointment">;

// Stored values over defaults, key by key, ignoring anything invalid.
function merge<T extends Record<string, unknown>>(schema: z.ZodObject, defaults: T, stored: unknown): T {
  const partial = schema.partial().safeParse(stored);
  if (!partial.success) return defaults;
  const clean = Object.fromEntries(Object.entries(partial.data).filter(([, v]) => v !== undefined));
  return { ...defaults, ...clean };
}

export type BookingWidgetConfig<T extends BookingWidgetType> = {
  copy: WidgetCopy<T>;
  settings: WidgetSettings<T>;
  fields: Field[];
  active: boolean;
};

export function bookingWidgetFrom<T extends BookingWidgetType>(
  type: T,
  row: { copy?: unknown; settings?: unknown; fields?: unknown; active?: boolean } | null,
): BookingWidgetConfig<T> {
  const schemas = WIDGET_SCHEMAS[type];
  return {
    copy: merge(schemas.copy, { ...schemas.defaultCopy } as WidgetCopy<T>, row?.copy),
    settings: merge(schemas.settings, { ...schemas.defaultSettings } as WidgetSettings<T>, row?.settings),
    fields: normalizeFields(row?.fields ?? []),
    active: row?.active ?? true,
  };
}

export async function loadBookingWidget<T extends BookingWidgetType>(
  client: SupabaseClient,
  tenantId: string,
  type: T,
): Promise<BookingWidgetConfig<T>> {
  const { data, error } = await client
    .from("widget_instances")
    .select("copy, settings, fields, active")
    .eq("tenant_id", tenantId)
    .eq("type", type)
    .maybeSingle();
  if (error) throw error;
  return bookingWidgetFrom(type, data);
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
