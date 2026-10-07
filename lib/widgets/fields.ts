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

export const BUILTIN_KEYS = ["full_name", "phone", "email", "notes"] as const;
// Always on the form and always required: a booking needs a name, and
// confirmations and reminders need a mobile number.
const ALWAYS_REQUIRED = ["full_name", "phone"];

export const DEFAULT_FIELDS: Field[] = [
  { key: "full_name", label: "Full name", type: "text", required: true },
  { key: "phone", label: "Mobile number", type: "tel", required: true, placeholder: "082 123 4567" },
  { key: "email", label: "Email", type: "email", required: false },
  { key: "notes", label: "Anything we should know?", type: "textarea", required: false },
];

const BUILTIN_TYPE: Record<string, FieldType> = { full_name: "text", phone: "tel", email: "email", notes: "textarea" };

const fieldSchema = z.object({
  key: z.string().regex(/^(full_name|phone|email|notes|custom_[a-z0-9_]{1,40})$/),
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
export function normalizeFields(stored: unknown): Field[] {
  const parsed = z.array(z.unknown()).safeParse(stored);
  const seen = new Set<string>();
  const fields: Field[] = [];
  for (const raw of parsed.success ? parsed.data : []) {
    const f = fieldSchema.safeParse(raw);
    if (!f.success || seen.has(f.data.key)) continue;
    const field: Field = { ...f.data };
    if (field.key in BUILTIN_TYPE) field.type = BUILTIN_TYPE[field.key];
    if (ALWAYS_REQUIRED.includes(field.key)) field.required = true;
    if (field.type === "select" && !field.options?.length) continue;
    if (field.type !== "select") delete field.options;
    seen.add(field.key);
    fields.push(field);
  }
  // Nothing usable stored (e.g. a business that never edited its form).
  if (fields.length === 0) return DEFAULT_FIELDS;
  // Reversed so name ends up before phone at the top.
  for (const key of [...ALWAYS_REQUIRED].reverse()) {
    if (!seen.has(key)) fields.unshift(DEFAULT_FIELDS.find((d) => d.key === key)!);
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
export function submissionSchema(fields: Field[]) {
  return z.object(Object.fromEntries(fields.map((f) => [f.key, valueSchema(f)])));
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
