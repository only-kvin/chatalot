import type { SupabaseClient } from "@supabase/supabase-js";
import { runAgentTurn, type ChatMessage } from "@/lib/agent/model";
import type { ToolCall } from "@/lib/agent/tools";
import { loadSetupSteps } from "@/lib/onboarding";
import type { Features } from "@/lib/plans";
import { allowedHrefs, guideText, pageForPath } from "./guide";
import { buildEchoPrompt, setupProgressText } from "./prompt";
import { cleanReply, type ReplyLink } from "./reply";
import { planTour, targetCatalogText, type TourStep } from "./targets";
import { ECHO_TOOLS, parseEchoToolInput } from "./tools";

// One ECHO turn: the owner's conversation so far in; reply text, a cursor
// walkthrough and page buttons out. Runs with the owner's own Supabase
// client, so RLS limits every read to their business as well as the explicit
// tenant filter.

export type EchoEvent =
  | { type: "text"; text: string }
  | { type: "link"; href: string; label: string }
  | { type: "tour"; steps: TourStep[]; done: string };

const MAX_TOKENS = 700;
const TURN_TIMEOUT_MS = 25_000;

export async function* runEcho(params: {
  supabase: SupabaseClient;
  tenantId: string;
  businessName: string;
  features: Features;
  pathname: string;
  messages: ChatMessage[];
  // Aborted when the owner presses Stop or closes the page.
  signal: AbortSignal;
}): AsyncGenerator<EchoEvent> {
  const allowed = allowedHrefs(params.features);
  const links: ReplyLink[] = [];
  // No button to the page they're already on.
  const addLink = (link: ReplyLink) => {
    if (link.href !== params.pathname && !links.some((l) => l.href === link.href)) links.push(link);
  };
  // The walkthrough the model asked for, once it plans cleanly. That ends the
  // turn (see endTurn below): the intro line in the plan is the reply, which
  // saves a second full model call per walkthrough.
  let tour: { steps: TourStep[]; done: string; intro: string } | null = null;

  async function executeTool(raw: ToolCall): Promise<string> {
    const parsed = parseEchoToolInput(raw);
    if (!parsed.ok) return parsed.error;
    const planned = planTour(parsed.input.steps, { pathname: params.pathname, features: params.features });
    if (!planned.ok) return planned.error;
    tour = { steps: planned.steps, done: parsed.input.done, intro: parsed.input.intro || "Let me show you." };
    return "Walkthrough started.";
  }

  // Read fresh every turn, so "what next?" always matches what's really set
  // up, even straight after they've done a step.
  const steps = await loadSetupSteps(params.supabase, params.tenantId, params.features.bookings === "on");

  const system = buildEchoPrompt({
    businessName: params.businessName,
    currentPage: pageForPath(params.pathname),
    pathname: params.pathname,
    setup: setupProgressText(steps),
    guide: guideText(params.features),
    targets: targetCatalogText(params.features),
  });

  let wrote = false;
  for await (const event of runAgentTurn({
    system,
    messages: params.messages,
    tools: ECHO_TOOLS,
    maxTokens: MAX_TOKENS,
    signal: AbortSignal.any([params.signal, AbortSignal.timeout(TURN_TIMEOUT_MS)]),
    executeTool,
    endTurn: () => tour !== null,
  })) {
    if (event.type !== "text-delta") continue;
    // Each text event is one whole model reply between tool calls.
    const reply = cleanReply(event.text, allowed);
    reply.links.forEach(addLink);
    if (!reply.text) continue;
    yield { type: "text", text: wrote ? `\n\n${reply.text}` : reply.text };
    wrote = true;
  }
  // The walkthrough replaces page buttons: the cursor takes them there.
  const planned = tour as { steps: TourStep[]; done: string; intro: string } | null;
  if (planned) {
    if (!wrote) yield { type: "text", text: cleanReply(planned.intro, allowed).text || "Let me show you." };
    yield { type: "tour", steps: planned.steps, done: planned.done };
  } else for (const link of links) yield { type: "link", ...link };
}
