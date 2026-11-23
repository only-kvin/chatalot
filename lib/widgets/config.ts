import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeFields, type Field, type FormKind } from "./fields";

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
// Every widget configured in widget_instances.
export type WidgetType = BookingWidgetType | "contact" | "registration" | "events" | "classes";

// Which form each widget shows (lib/widgets/fields.ts).
export const FORM_KIND: Record<WidgetType, FormKind> = {
  schedule: "booking",
  appointment: "booking",
  contact: "contact",
  registration: "registration",
  // Name, phone and email, like a booking.
  events: "booking",
  classes: "booking",
};

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
  contact: {
    copy: z.object({
      title: z.string().trim().min(1).max(60),
      submitButton: z.string().trim().min(1).max(40),
      successTitle: z.string().trim().min(1).max(60),
      successMessage: z.string().trim().max(300),
      // "We usually reply within a day."
      responseTime: z.string().trim().max(120),
    }),
    settings: z.object({
      // Optional, unticked boxes under the message.
      offerNewsletter: z.boolean(),
      offerPromotions: z.boolean(),
    }),
    defaultCopy: {
      title: "Get in touch",
      submitButton: "Send message",
      successTitle: "Thanks for your message",
      successMessage: "We'll get back to you soon.",
      responseTime: "We usually reply within one working day.",
    },
    defaultSettings: { offerNewsletter: false, offerPromotions: false },
  },
  registration: {
    copy: z.object({
      title: z.string().trim().min(1).max(60),
      submitButton: z.string().trim().min(1).max(40),
      successTitle: z.string().trim().min(1).max(60),
      successMessage: z.string().trim().max(300),
      // Optional "Book now" link after signing up, to the business's own
      // booking page.
      bookingUrl: z
        .string()
        .trim()
        .max(300)
        .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "The booking page link must start with https://"),
      bookLinkLabel: z.string().trim().min(1).max(40),
    }),
    settings: z.object({
      // The optional, unticked "events and promotions" box.
      offerMarketing: z.boolean(),
    }),
    defaultCopy: {
      title: "Sign up",
      submitButton: "Sign me up",
      successTitle: "Check your email",
      successMessage: "We've sent you a link to see your bookings and choose what we send you.",
      bookingUrl: "",
      bookLinkLabel: "Book now",
    },
    defaultSettings: { offerMarketing: true },
  },
  events: {
    copy: z.object({
      title: z.string().trim().min(1).max(60),
      signUpButton: z.string().trim().min(1).max(40),
      successTitle: z.string().trim().min(1).max(60),
      successMessage: z.string().trim().max(300),
      // Shown when nothing is coming up.
      emptyMessage: z.string().trim().max(200),
    }),
    settings: z.object({
      // Also list events that have passed (marked as past), newest first.
      showPast: z.boolean(),
    }),
    defaultCopy: {
      title: "Upcoming events",
      signUpButton: "Sign up",
      successTitle: "You're signed up!",
      successMessage: "We've saved your spot. See you there!",
      emptyMessage: "No events coming up right now. Check back soon!",
    },
    defaultSettings: { showPast: false },
  },
  classes: {
    copy: z.object({
      title: z.string().trim().min(1).max(60),
      bookButton: z.string().trim().min(1).max(40),
      successTitle: z.string().trim().min(1).max(60),
      successMessage: z.string().trim().max(300),
      emptyDay: z.string().trim().max(200),
    }),
    settings: z.object({
      // The Class type and Instructor dropdowns above the timetable.
      showFilters: z.boolean(),
    }),
    defaultCopy: {
      title: "Find a class",
      bookButton: "Book",
      successTitle: "You're booked in!",
      successMessage: "See you in class.",
      emptyDay: "No classes on this day.",
    },
    defaultSettings: { showFilters: true },
  },
} as const;

type Schemas = typeof WIDGET_SCHEMAS;
export type WidgetCopy<T extends WidgetType> = z.infer<Schemas[T]["copy"]>;
export type WidgetSettings<T extends WidgetType> = z.infer<Schemas[T]["settings"]>;
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

export type WidgetConfig<T extends WidgetType> = {
  copy: WidgetCopy<T>;
  settings: WidgetSettings<T>;
  fields: Field[];
  active: boolean;
  // Which widget this is. id is null for a business that has never saved
  // this type (the built-in defaults, standing in for its default widget).
  id: string | null;
  name: string;
  // draft: previews only, takes nothing real; live: works on websites.
  status: "draft" | "live";
  isDefault: boolean;
};

type InstanceRow = {
  id?: string;
  name?: string;
  status?: string;
  is_default?: boolean;
  copy?: unknown;
  settings?: unknown;
  fields?: unknown;
  active?: boolean;
};

export const WIDGET_COLUMNS = "id, name, status, is_default, copy, settings, fields, active";

export function widgetFrom<T extends WidgetType>(type: T, row: InstanceRow | null): WidgetConfig<T> {
  const schemas = WIDGET_SCHEMAS[type];
  return {
    copy: merge(schemas.copy, { ...schemas.defaultCopy } as WidgetCopy<T>, row?.copy),
    settings: merge(schemas.settings, { ...schemas.defaultSettings } as WidgetSettings<T>, row?.settings),
    fields: normalizeFields(row?.fields ?? [], FORM_KIND[type]),
    active: row?.active ?? true,
    id: row?.id ?? null,
    name: row?.name || WIDGET_TYPE_LABEL[type],
    status: row?.status === "draft" ? "draft" : "live",
    // No row = the built-in defaults standing in for the default widget.
    isDefault: row ? Boolean(row.is_default) : true,
  };
}

export const WIDGET_TYPE_LABEL: Record<WidgetType, string> = {
  schedule: "Schedule",
  appointment: "Appointment",
  contact: "Contact",
  registration: "Registration",
  events: "Events",
  classes: "Classes",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A business's widget of a type: the one with this id, or its default. An
// embed code naming a widget that's since been deleted falls back to the
// default, so a website never ends up with an empty box.
export async function loadWidget<T extends WidgetType>(
  client: SupabaseClient,
  tenantId: string,
  type: T,
  widgetId?: string | null,
): Promise<WidgetConfig<T>> {
  if (widgetId && UUID.test(widgetId)) {
    const { data, error } = await client
      .from("widget_instances")
      .select(WIDGET_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("type", type)
      .eq("id", widgetId)
      .maybeSingle<InstanceRow>();
    if (error) throw error;
    if (data) return widgetFrom(type, data);
  }
  const { data, error } = await client
    .from("widget_instances")
    .select(WIDGET_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("type", type)
    .eq("is_default", true)
    .maybeSingle<InstanceRow>();
  if (error) throw error;
  return widgetFrom(type, data);
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
