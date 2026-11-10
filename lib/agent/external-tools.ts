import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { decrypt } from "@/lib/security/crypto";
import { checkUrl } from "@/lib/website/safe-fetch";
import { AGENT_TOOLS, type ToolDef, type ToolProperty } from "./tools";

// Tools another app provides to one business's receptionist (see the
// external_tools migration). The model is offered them beside the built-in
// tools; a call is POSTed to the other app, signed, and its text result goes
// back to the model.
//
// Request:  POST endpoint_url
//   headers  X-Bookfront-Timestamp: <unix seconds>
//            X-Bookfront-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>
//   body     { "tool", "input", "tenantId", "conversationId", "channel" }
// Response: 200 { "result": "<text for the model>" }

export type ExternalTool = {
  def: ToolDef;
  endpointUrl: string;
  secret: string;
  promptNote: string;
};

export type ExternalToolContext = {
  tenantId: string;
  conversationId: string;
  channel: "web" | "whatsapp";
};

const MAX_TOOLS_PER_TENANT = 5;
// Well inside the turn's 20s deadline, which also covers the model calls.
const CALL_TIMEOUT_MS = 6_000;
const MAX_RESULT_CHARS = 2_000;

const FAILED =
  "That lookup failed due to a technical problem. Don't guess the answer: apologise briefly and offer to have a person follow up.";

const propertySchema: z.ZodType<ToolProperty> = z.lazy(() =>
  z.object({
    type: z.union([z.string(), z.array(z.string())]),
    description: z.string().optional(),
    items: propertySchema.optional(),
    properties: z.record(z.string(), propertySchema).optional(),
    required: z.array(z.string()).optional(),
  }),
);

export const externalToolSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{2,40}$/),
  description: z.string().trim().min(1).max(800),
  parameters: z.object({
    type: z.literal("object"),
    properties: z.record(z.string(), propertySchema),
    required: z.array(z.string()).default([]),
  }),
  endpoint_url: z.string().min(1),
  prompt_note: z.string().max(2000).default(""),
});

const BUILT_IN_NAMES = new Set(AGENT_TOOLS.map((t) => t.name));

export function isBuiltInToolName(name: string): boolean {
  return BUILT_IN_NAMES.has(name);
}

// HTTPS to a public host. Plain http to localhost is allowed outside
// production only, for running the other app on the same machine.
export function checkEndpoint(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Not a valid URL");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (local && process.env.NODE_ENV !== "production") return url;
  if (url.protocol !== "https:") throw new Error("Tool endpoints must use https");
  return checkUrl(raw);
}

export function signExternalToolRequest(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

// A bad row is skipped (and logged) rather than failing the chat: the
// receptionist still works, just without that tool.
export async function loadExternalTools(admin: SupabaseClient, tenantId: string): Promise<ExternalTool[]> {
  const { data, error } = await admin
    .from("external_tools")
    .select("name, description, parameters, endpoint_url, secret_encrypted, prompt_note")
    .eq("tenant_id", tenantId)
    .eq("enabled", true)
    .order("created_at")
    .limit(MAX_TOOLS_PER_TENANT);
  if (error || !data) return [];

  const tools: ExternalTool[] = [];
  for (const row of data) {
    try {
      const parsed = externalToolSchema.parse(row);
      if (isBuiltInToolName(parsed.name)) throw new Error("name clashes with a built-in tool");
      checkEndpoint(parsed.endpoint_url);
      tools.push({
        def: { name: parsed.name, description: parsed.description, parameters: parsed.parameters },
        endpointUrl: parsed.endpoint_url,
        secret: decrypt(row.secret_encrypted),
        promptNote: parsed.prompt_note.trim(),
      });
    } catch (err) {
      console.error(`External tool "${row.name}" skipped for tenant ${tenantId}:`, err);
    }
  }
  return tools;
}

// The model's input is untrusted: it must be an object carrying every
// required field, and only declared fields are passed on. The receiving app
// validates values itself.
export function cleanInput(def: ToolDef, input: unknown): { ok: true; input: Record<string, unknown> } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: `Invalid input for ${def.name}: expected an object.` };
  }
  const given = input as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(def.parameters.properties)) {
    if (Object.hasOwn(given, key) && given[key] !== undefined) cleaned[key] = given[key];
  }
  const missing = def.parameters.required.filter((key) => {
    const value = cleaned[key];
    return value === undefined || value === null || (typeof value === "string" && !value.trim());
  });
  if (missing.length) return { ok: false, error: `Invalid input for ${def.name}: missing ${missing.join(", ")}.` };
  return { ok: true, input: cleaned };
}

export async function callExternalTool(
  tool: ExternalTool,
  rawInput: unknown,
  ctx: ExternalToolContext,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const cleaned = cleanInput(tool.def, rawInput);
  if (!cleaned.ok) return cleaned.error;

  const body = JSON.stringify({
    tool: tool.def.name,
    input: cleaned.input,
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    channel: ctx.channel,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));

  try {
    const res = await fetchImpl(checkEndpoint(tool.endpointUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bookfront-Timestamp": timestamp,
        "X-Bookfront-Signature": signExternalToolRequest(tool.secret, timestamp, body),
      },
      body,
      // A redirect could point somewhere the endpoint check never saw.
      redirect: "error",
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = z.object({ result: z.string().trim().min(1) }).parse(await res.json());
    return parsed.result.slice(0, MAX_RESULT_CHARS);
  } catch (err) {
    // Logged, never passed on: the model could repeat internals to a customer.
    console.error(`External tool ${tool.def.name} failed:`, err);
    return FAILED;
  }
}
