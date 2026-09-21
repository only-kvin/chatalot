// Provider-neutral tool definitions. `model.ts` translates these into whatever
// shape the active model provider expects (currently Groq's OpenAI-compatible
// function-calling format; Anthropic's tool-use format later).

export type ToolDef = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string | string[]; description: string }>;
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
      "Flag this conversation for a human to take over — call when the visitor explicitly asks for a person, or when you're unsure how to answer from the available knowledge.",
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
        service: { type: "string", description: "The service name, e.g. 'Haircut'" },
        date: { type: "string", description: "Date to check, as YYYY-MM-DD" },
      },
      required: ["service", "date"],
    },
  },
  {
    name: "create_booking",
    description:
      "Book an appointment. Only call this after confirming the exact date and time with the visitor (from a time check_availability actually returned), and after they've given their name, phone number, and consent to save their details.",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string", description: "The service name, e.g. 'Haircut'" },
        date: { type: "string", description: "Date to book, as YYYY-MM-DD" },
        time: { type: "string", description: "Start time to book, as 24-hour HH:MM" },
        name: { type: "string", description: "The visitor's name" },
        phone: { type: "string", description: "The visitor's phone number" },
        email: {
          type: ["string", "null"],
          description: "The visitor's email, if given, otherwise null",
        },
      },
      required: ["service", "date", "time", "name", "phone"],
    },
  },
];

export type ToolCall = {
  name: string;
  input: Record<string, string | null>;
};
