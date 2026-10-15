import { z } from "zod";
import type { ToolDef } from "@/lib/agent/tools";

// ECHO's one tool: a button to a dashboard page. ECHO points the way and the
// owner makes the change, so nothing here can alter their business. Model
// output is untrusted, so every call is validated (and every link checked
// against the pages this business can open) before it's shown.

export const ECHO_TOOLS: ToolDef[] = [
  {
    name: "show_page",
    description:
      "Give the owner a button that opens a dashboard page. Use a path from the dashboard guide, optionally with a ?tab= or #section from the guide, e.g. /dashboard/bookings?tab=calendar or /dashboard/settings#bookings.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "The page's path from the guide, e.g. /dashboard/availability" },
        label: { type: "string", description: "Short button text, e.g. \"Open Availability\"" },
      },
      required: ["path", "label"],
    },
  },
];

const showPageInput = z.object({ path: z.string().trim().min(1).max(200), label: z.string().trim().min(1).max(40) });

export type EchoToolCall = { name: "show_page"; input: z.infer<typeof showPageInput> };

export function parseEchoToolInput(call: { name: string; input: unknown }): { ok: true; call: EchoToolCall } | { ok: false; error: string } {
  if (call.name !== "show_page") return { ok: false, error: `Unknown tool: ${call.name}` };
  const result = showPageInput.safeParse(call.input);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ");
    return { ok: false, error: `Invalid input for show_page: ${problems}.` };
  }
  return { ok: true, call: { name: "show_page", input: result.data } };
}

// A link ECHO may hand out: an allowed dashboard page, plus at most a simple
// ?tab= and #section. Anything else (other sites, other params, "..") is
// refused, so a button can only ever open a page of this dashboard.
export function safeDashboardLink(path: string, allowed: Set<string>): string | null {
  const match = /^(\/dashboard(?:\/[a-z_-]+)*)(\?tab=[a-z_-]+)?(#[a-z_-]+)?$/.exec(path);
  if (!match || !allowed.has(match[1])) return null;
  return path;
}
