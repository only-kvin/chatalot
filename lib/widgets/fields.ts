import { z } from "zod";
import { canonicalPhone } from "@/lib/contacts/phone";

// The booking form a business configures for a widget. Stored as JSON on
// widget_instances.fields; the browser renders it, and the submission is
// checked against a schema built here from the *stored* list, never from a
// field list the browser sends.
//
// Built-in fields map to real booking columns (name, phone, email, notes);
// custom ones ("custom_...") go into bookings.details.

export const FIELD_TYPES = ["text", "email", "tel", "textarea", "select", "checkbox", "date"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  // For select.
  options?: string[];
};

// Which form a widget shows: the booking widgets, the contact form, or
// registration. Each has its own built-in questions (stored in real columns)
// and ones that can't be removed.
export type FormKind = "booking" | "contact" | "registration";

type Profile = {
  builtins: Record<string, FieldType>;
  alwaysRequired: string[];
  defaults: Field[];
};

const NAME: Field = { key: "full_name", label: "Full name", type: "text", required: true };
const PHONE: Field = { key: "phone", label: "Mobile number", type: "tel", required: true, placeholder: "082 123 4567" };

const PROFILES: Record<FormKind, Profile> = {
  // A booking needs a name, and confirmations and reminders need a mobile.
  booking: {
    builtins: { full_name: "text", phone: "tel", email: "email", notes: "textarea" },
    alwaysRequired: ["full_name", "phone"],
    defaults: [
      NAME,
      PHONE,
      { key: "email", label: "Email", type: "email", required: false },
      { key: "notes", label: "Anything we should know?", type: "textarea", required: false },
    ],
  },
  // A message needs a sender and something to say; an email or phone to
  // reply on is checked separately (either will do).
  contact: {
    builtins: { full_name: "text", email: "email", phone: "tel", subject: "select", message: "textarea" },
    alwaysRequired: ["full_name", "message"],
    defaults: [
      NAME,
      { key: "email", label: "Email", type: "email", required: false },
      { ...PHONE, required: false },
      { key: "message", label: "Message", type: "textarea", required: true },
    ],
  },
  // The customer's page link goes by email.
  registration: {
    builtins: { full_name: "text", email: "email", phone: "tel" },
    alwaysRequired: ["full_name", "email"],
    defaults: [NAME, { key: "email", label: "Email", type: "email", required: true }, { ...PHONE, required: false }],
  },
};

export function defaultFields(kind: FormKind): Field[] {
  return PROFILES[kind].defaults;
}
export function alwaysRequired(kind: FormKind): string[] {
  return PROFILES[kind].alwaysRequired;
}

// Built-in questions a business can add back after removing them (or add
// for the first time, like the contact form's subject list).
const OPTIONAL_BUILTINS: Partial<Record<FormKind, Field[]>> = {
  contact: [{ key: "subject", label: "Subject", type: "select", required: false, options: ["General question", "Bookings", "Prices"] }],
};
export function addableBuiltins(kind: FormKind, current: Field[]): Field[] {
  const all = [...PROFILES[kind].defaults, ...(OPTIONAL_BUILTINS[kind] ?? [])];
  return all.filter((d) => !current.some((f) => f.key === d.key));
}

// The booking widgets' defaults (kept for existing callers).
export const DEFAULT_FIELDS: Field[] = PROFILES.booking.defaults;

const fieldSchema = z.object({
  key: z.string().regex(/^(full_name|phone|email|notes|subject|message|custom_[a-z0-9_]{1,40})$/),
  label: z.string().trim().min(1).max(80),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  placeholder: z.string().trim().max(80).optional(),
  options: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
});

// What the dashboard may save: well-formed fields with unique keys.
export const fieldsInputSchema = z
  .array(fieldSchema)
  .max(20, "At most 20 fields")
  .refine((fs) => new Set(fs.map((f) => f.key)).size === fs.length, "Two fields have the same name")
  .refine((fs) => fs.every((f) => f.type !== "select" || (f.options?.length ?? 0) > 0), "Give each choice list at least one option");

// A stored field list made safe to use: invalid entries and duplicates
// dropped, built-ins forced to their type, name and phone always present
// and required. Anything unusable falls back to the defaults.
export function normalizeFields(stored: unknown, kind: FormKind = "booking"): Field[] {
  const profile = PROFILES[kind];
  const parsed = z.array(z.unknown()).safeParse(stored);
  const seen = new Set<string>();
  const fields: Field[] = [];
  for (const raw of parsed.success ? parsed.data : []) {
    const f = fieldSchema.safeParse(raw);
    if (!f.success || seen.has(f.data.key)) continue;
    const field: Field = { ...f.data };
    const builtin = profile.builtins[field.key];
    // Another form's built-in (e.g. "notes" on the contact form) isn't valid here.
    if (!builtin && !field.key.startsWith("custom_")) continue;
    if (builtin) field.type = builtin;
    if (profile.alwaysRequired.includes(field.key)) field.required = true;
    if (field.type === "select" && !field.options?.length) continue;
    if (field.type !== "select") delete field.options;
    seen.add(field.key);
    fields.push(field);
  }
  // Nothing usable stored (e.g. a business that never edited its form).
  if (fields.length === 0) return profile.defaults;
  // Missing must-haves go back in: name at the top, the rest at the end.
  for (const key of profile.alwaysRequired) {
    if (seen.has(key)) continue;
    const field = profile.defaults.find((d) => d.key === key)!;
    if (key === "full_name") fields.unshift(field);
    else fields.push(field);
  }
  return fields;
}

// "Vehicle registration" -> "custom_vehicle_registration".
export function customKey(label: string, taken: string[]): string {
  const base = `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "field"}`;
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`;
  return key;
}

const PHONE_MESSAGE = "Enter a valid mobile number, e.g. 082 123 4567 or +27 82 123 4567";

function valueSchema(f: Field): z.ZodType {
  const label = f.label;
  // Empty optional answers come through as "" (or are missing).
  const optional = (s: z.ZodType) =>
    z.preprocess((v) => (v === "" || v === null ? undefined : v), s.optional());
  switch (f.type) {
    case "checkbox": {
      const box = z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean());
      return f.required ? box.refine((v) => v, `Please tick "${label}"`) : box;
    }
    case "email": {
      const s = z.string().trim().toLowerCase().email(`Enter a valid email for "${label}"`).max(200);
      return f.required ? s : optional(s);
    }
    case "tel": {
      const s = z.string().trim().max(30).refine((v) => canonicalPhone(v) !== null, PHONE_MESSAGE);
      return f.required ? s : optional(s);
    }
    case "select": {
      const s = z.enum(f.options as [string, ...string[]], { message: `Choose an option for "${label}"` });
      return f.required ? s : optional(s);
    }
    case "date": {
      const s = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Enter a date for "${label}"`);
      return f.required ? s : optional(s);
    }
    default: {
      const max = f.type === "textarea" ? 2000 : 200;
      const s = z.string().trim().min(1, `"${label}" is required`).max(max, `"${label}" is too long`);
      return f.required ? s : optional(s);
    }
  }
}

// Validates a submission against the stored fields. Keys the business
// didn't configure are dropped.
export function submissionSchema(fields: Field[], kind: FormKind = "booking") {
  const base = z.object(Object.fromEntries(fields.map((f) => [f.key, valueSchema(f)])));
  if (kind !== "contact") return base;
  // A message is no use without a way to reply.
  return base.refine((v) => Boolean(v.email || v.phone), {
    message: "Please give an email address or a phone number so we can reply.",
  });
}

export type Answers = {
  name: string;
  phone: string;
  email: string | null;
  notes: string;
  // Custom fields, by key.
  details: Record<string, string | boolean>;
};

// Splits validated answers into booking columns and custom details.
export function splitAnswers(values: Record<string, unknown>): Answers {
  const details: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith("custom_") && (typeof value === "string" || typeof value === "boolean")) details[key] = value;
  }
  return {
    name: String(values.full_name),
    phone: String(values.phone),
    email: typeof values.email === "string" ? values.email : null,
    notes: typeof values.notes === "string" ? values.notes : "",
    details,
  };
}

export type ContactAnswers = {
  name: string;
  email: string | null;
  phone: string | null;
  subject: string | null;
  message: string;
  details: Record<string, string | boolean>;
};

// Splits a validated contact-form submission into its columns.
export function splitContactAnswers(values: Record<string, unknown>): ContactAnswers {
  const text = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    name: String(values.full_name),
    email: text(values.email),
    phone: text(values.phone),
    subject: text(values.subject),
    message: String(values.message),
    details: splitAnswers({ ...values, full_name: "", phone: "" }).details,
  };
}

export type RegistrationAnswers = {
  name: string;
  email: string;
  phone: string | null;
  details: Record<string, string | boolean>;
};

export function splitRegistrationAnswers(values: Record<string, unknown>): RegistrationAnswers {
  return {
    name: String(values.full_name),
    email: String(values.email),
    phone: typeof values.phone === "string" && values.phone ? values.phone : null,
    details: splitAnswers({ ...values, full_name: "", phone: "" }).details,
  };
}
