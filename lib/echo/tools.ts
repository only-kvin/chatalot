import { z } from "zod";
import type { ToolDef } from "@/lib/agent/tools";

// ECHO's one tool: walk the owner through a task with its cursor. Echo points
// and explains; the owner does the clicking and typing, so nothing here can
// change their business. Model output is untrusted: steps are validated here
// and planned against the target catalog (targets.ts) before anything runs.

export const ECHO_TOOLS: ToolDef[] = [
  {
    name: "guide_me",
    description:
      "Show the owner how to do something on screen: Echo's cursor moves to each target in turn with your words beside it, and waits for them to click it (or, for fields, to fill it in and press Next). Use target ids from the target list only. You don't need menu steps to reach a page: they're added for you. Use one step for \"where is...\" questions.",
    parameters: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          description: "The steps in order, at most 8",
          items: {
            type: "object",
            properties: {
              target: { type: "string", description: "A target id from the list, e.g. services.price" },
              say: {
                type: "string",
                description: "What Echo says at this step, short and direct, e.g. \"Click Edit on the service you want to change.\" or \"Type the new price here.\"",
              },
            },
            required: ["target", "say"],
          },
        },
        intro: { type: "string", description: "One short line Echo says first, e.g. \"Let me show you.\"" },
        done: { type: "string", description: "What Echo says when they've finished, e.g. \"That's it, your new price is live.\"" },
      },
      required: ["steps", "intro", "done"],
    },
  },
];

const guideMeInput = z.object({
  steps: z
    .array(z.object({ target: z.string().trim().min(1).max(60), say: z.string().trim().min(1).max(160) }))
    .min(1)
    .max(8),
  // Optional to the validator: a missing intro gets a default rather than a retry.
  intro: z.string().trim().max(160).optional(),
  done: z.string().trim().min(1).max(160),
});

export type GuideMeInput = z.infer<typeof guideMeInput>;

export function parseEchoToolInput(call: { name: string; input: unknown }): { ok: true; input: GuideMeInput } | { ok: false; error: string } {
  if (call.name !== "guide_me") return { ok: false, error: `Unknown tool: ${call.name}` };
  const result = guideMeInput.safeParse(call.input);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ");
    return { ok: false, error: `Invalid input for guide_me: ${problems}.` };
  }
  return { ok: true, input: result.data };
}

// A link Echo may hand out (from a link the model wrote into its reply): an
// allowed dashboard page, plus at most a simple ?tab= and #section. Anything
// else (other sites, other params, "..") is refused.
export function safeDashboardLink(path: string, allowed: Set<string>): string | null {
  const match = /^(\/dashboard(?:\/[a-z_-]+)*)(\?tab=[a-z_-]+)?(#[a-z_-]+)?$/.exec(path);
  if (!match || !allowed.has(match[1])) return null;
  return path;
}
