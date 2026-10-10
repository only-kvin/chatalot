import { z } from "zod";

// Provider-neutral tool definitions. `model.ts` translates these into whatever
// shape the active model provider expects (currently Groq's OpenAI-compatible
// function-calling format; Anthropic's tool-use format later).

// A JSON Schema property: plain fields for the receptionist's tools, nested
// objects and arrays for structured extraction (lib/site-brief/extract.ts).
export type ToolProperty = {
  type: string | string[];
  description?: string;
  items?: ToolProperty;
  properties?: Record<string, ToolProperty>;
  required?: string[];
};

export type ToolDef = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolProperty>;
    required: string[];
  };
};

export const AGENT_TOOLS: ToolDef[] = [
  {
    name: "save_lead",
    description:
      "Save a visitor's contact details once they've shown interest and agreed to share them. Only call this after the visitor has explicitly given their name and phone number.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The visitor's name" },
        phone: { type: "string", description: "The visitor's phone number" },
        email: {
          type: ["string", "null"],
          description: "The visitor's email, if given, otherwise null",
        },
        interest: {
          type: "string",
          description: "What they're interested in, e.g. 'balayage colour'",
        },
        summary: {
          type: "string",
          description: "One-line summary of the conversation for the business owner",
        },
      },
      required: ["name", "phone", "interest", "summary"],
    },
  },
  {
    name: "request_human",
    description:
      "Alert the team that this visitor needs a person. Call it immediately when the visitor asks for a person (don't ask whether they'd like you to), or when they accept your offer of one. Follow the instructions in the result.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why a human is needed" },
      },
      required: ["reason"],
    },
  },
  {
    name: "check_availability",
    description:
      "Look up open appointment times for a service on a given date. Always call this before proposing a specific time to a visitor. Use today's date (given above) to resolve relative dates like 'tomorrow' or 'Friday' into a YYYY-MM-DD date.",
    parameters: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description: "The exact name of one service from the bookable services list, e.g. \"Men's Cut\"",
        },
        date: { type: "string", description: "Date to check, as YYYY-MM-DD" },
        staff: {
          type: ["string", "null"],
          description: "A staff member's name from the 'Who works here' list, only if the visitor asked for that person; otherwise null (anyone free)",
        },
        location: {
          type: ["string", "null"],
          description:
            "Where it happens: \"business\" (at the business) or \"customer\" (at the visitor's address). Required for services done at either place, once the visitor has said which; otherwise null",
        },
      },
      required: ["service", "date"],
    },
  },
  {
    name: "create_booking",
    description:
      "Book an appointment for one service, or request a call-out at the visitor's address. Only call this after confirming the exact date and time (or arrival window start) with the visitor (from a time check_availability actually returned), and after they've given their name, phone number, and consent to save their details. For a call-out, also pass the street address and suburb (and access notes if they gave any), and only after stating the call-out fee and arrival window. For several services, book each one separately at back-to-back times, checking availability for each. Afterwards, tell the visitor exactly what the result confirmed — service, date and time — never something else.",
    parameters: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description: "The exact name of one service from the bookable services list, e.g. \"Men's Cut\"",
        },
        date: { type: "string", description: "Date to book, as YYYY-MM-DD" },
        time: { type: "string", description: "Start time to book, as 24-hour HH:MM" },
        name: { type: "string", description: "The visitor's name" },
        phone: { type: "string", description: "The visitor's phone number" },
        email: {
          type: ["string", "null"],
          description: "The visitor's email, if given, otherwise null",
        },
        staff: {
          type: ["string", "null"],
          description: "A staff member's name from the 'Who works here' list, only if the visitor asked for that person; otherwise null (anyone free)",
        },
        location: {
          type: ["string", "null"],
          description:
            "Where it happens: \"business\" (at the business) or \"customer\" (at the visitor's address). Required for services done at either place, once the visitor has said which; otherwise null",
        },
        address_line: { type: ["string", "null"], description: "Call-outs only: street address, e.g. \"12 Oak Street\"; otherwise null" },
        suburb: { type: ["string", "null"], description: "Call-outs only: suburb or town; otherwise null" },
        city: { type: ["string", "null"], description: "Call-outs only: city, if given; otherwise null" },
        postal_code: { type: ["string", "null"], description: "Call-outs only: postal code, if given; otherwise null" },
        access_notes: { type: ["string", "null"], description: "Call-outs only: gate code, parking or how to get in, if given; otherwise null" },
      },
      required: ["service", "date", "time", "name", "phone"],
    },
  },
  {
    name: "my_bookings",
    description:
      "List this visitor's upcoming bookings, each with a reference. Call it before cancelling or rescheduling, and whenever they ask about their appointments.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "cancel_booking",
    description:
      "Cancel one of the visitor's upcoming bookings. Only after they've clearly confirmed which booking (by the reference from my_bookings) and that they want it cancelled. Then tell them exactly what the result says.",
    parameters: {
      type: "object",
      properties: {
        booking_ref: { type: "string", description: "The booking reference from my_bookings" },
        reason: { type: ["string", "null"], description: "Their reason, if they gave one, otherwise null" },
      },
      required: ["booking_ref"],
    },
  },
  {
    name: "reschedule_booking",
    description:
      "Move one of the visitor's upcoming bookings to a new date and time — the same booking, not a new one. Check availability for the service on the new date first, and only use a time it returned. Then tell them exactly what the result says.",
    parameters: {
      type: "object",
      properties: {
        booking_ref: { type: "string", description: "The booking reference from my_bookings" },
        date: { type: "string", description: "New date, as YYYY-MM-DD" },
        time: { type: "string", description: "New start time, as 24-hour HH:MM" },
      },
      required: ["booking_ref", "date", "time"],
    },
  },
  {
    name: "send_booking_link",
    description:
      "Get a link where the visitor can book online themselves (pick a service, person and time). Use it when they'd rather click than chat, or when choosing a time in chat is getting long. Share the returned link as-is.",
    parameters: {
      type: "object",
      properties: {
        service: {
          type: ["string", "null"],
          description: "The exact name of a service to open the page on, if one is clear; otherwise null",
        },
      },
      required: [],
    },
  },
  {
    name: "report_emergency",
    description:
      "An urgent job (burst pipe, no power, flooding, a blocked toilet on a weekend...): alerts the owner straight away and hands the chat to them. Call it as soon as the visitor describes an emergency, instead of offering booking times. Then follow the instructions in the result.",
    parameters: {
      type: "object",
      properties: {
        problem: { type: "string", description: "What's wrong, in a few words, e.g. 'burst geyser, water through ceiling'" },
        name: { type: ["string", "null"], description: "The visitor's name, if given; otherwise null" },
        phone: { type: ["string", "null"], description: "The visitor's phone number, if given; otherwise null" },
        address: { type: ["string", "null"], description: "Where the emergency is, if given; otherwise null" },
      },
      required: ["problem"],
    },
  },
];

// `input` is whatever the model produced — untrusted until parseToolInput accepts it.
export type ToolCall = {
  name: string;
  input: unknown;
};

const requiredText = z.string().trim().min(1);
// Models often send "" instead of null for an omitted optional field.
const optionalText = z
  .string()
  .nullish()
  .transform((v) => v?.trim() || null);
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const timeText = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be 24-hour HH:MM");

// Models sometimes say "home"; anything unexpected counts as not given.
const locationText = z
  .string()
  .nullish()
  .transform((v) => {
    const t = v?.trim().toLowerCase();
    if (t === "customer" || t === "home") return "customer" as const;
    if (t === "business") return "business" as const;
    return null;
  });

// Tools that work without online bookings on the business's plan.
export const CORE_TOOL_NAMES = ["save_lead", "request_human"];
export const EMERGENCY_TOOL = "report_emergency";

// The tools offered to the model: the booking ones only when the business
// takes bookings, and the emergency one only when it takes emergency
// call-outs, so it never offers what the business can't do.
export function toolsFor(takesBookings: boolean, emergencyCallouts = false): ToolDef[] {
  return AGENT_TOOLS.filter((t) => {
    if (t.name === EMERGENCY_TOOL) return emergencyCallouts;
    return takesBookings || CORE_TOOL_NAMES.includes(t.name);
  });
}

// Zod mirrors of AGENT_TOOLS' JSON schemas above — model output is an API
// boundary like any other, so every tool input is validated before it runs.
export const TOOL_INPUT_SCHEMAS = {
  save_lead: z.object({
    name: requiredText,
    phone: requiredText,
    email: optionalText,
    interest: requiredText,
    summary: requiredText,
  }),
  request_human: z.object({ reason: requiredText }),
  check_availability: z.object({ service: requiredText, date: dateText, staff: optionalText, location: locationText }),
  create_booking: z.object({
    service: requiredText,
    date: dateText,
    time: timeText,
    name: requiredText,
    phone: requiredText,
    email: optionalText,
    staff: optionalText,
    location: locationText,
    address_line: optionalText,
    suburb: optionalText,
    city: optionalText,
    postal_code: optionalText,
    access_notes: optionalText,
  }),
  my_bookings: z.object({}).passthrough(),
  cancel_booking: z.object({ booking_ref: requiredText, reason: optionalText }),
  reschedule_booking: z.object({ booking_ref: requiredText, date: dateText, time: timeText }),
  send_booking_link: z.object({ service: optionalText }),
  report_emergency: z.object({ problem: requiredText, name: optionalText, phone: optionalText, address: optionalText }),
};

export type ToolName = keyof typeof TOOL_INPUT_SCHEMAS;
export type ToolInput<N extends ToolName> = z.infer<(typeof TOOL_INPUT_SCHEMAS)[N]>;

export type ParsedToolCall = {
  [N in ToolName]: { name: N; input: ToolInput<N> };
}[ToolName];

// On failure, `error` is a short message safe to hand back to the model so it
// can correct itself (field names and rules only — no internal details).
export function parseToolInput(
  call: ToolCall,
): { ok: true; call: ParsedToolCall } | { ok: false; error: string } {
  // hasOwn, not `in` — `in` would accept inherited names like "toString".
  if (!Object.hasOwn(TOOL_INPUT_SCHEMAS, call.name)) {
    return { ok: false, error: `Unknown tool: ${call.name}` };
  }
  const name = call.name as ToolName;
  const result = TOOL_INPUT_SCHEMAS[name].safeParse(call.input);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `${i.path.join(".") || "input"} ${i.message}`)
      .join("; ");
    return { ok: false, error: `Invalid input for ${name}: ${problems}.` };
  }
  return { ok: true, call: { name, input: result.data } as ParsedToolCall };
}
