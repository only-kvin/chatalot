import { createAdminClient } from "@/lib/db/supabase-admin";
import { buildSystemPrompt, type AgentConfig } from "./prompt";
import { runAgentTurn, type ChatMessage } from "./model";
import { AGENT_TOOLS, parseToolInput, type ToolCall } from "./tools";
import { getRelevantKnowledge } from "./retrieval";
import {
  findServiceByName,
  getOpenSlots,
  listActiveServiceNames,
  listActiveServices,
  localToUtcDate,
} from "./availability";
import { notifyOwnerOfLead } from "@/lib/email/notify-lead";
import { notifyOwnerHumanRequested } from "@/lib/email/notify-human-requested";
import { notifyOwnerOfBooking } from "@/lib/email/notify-booking";

const MAX_TOKENS = 400;
const MAX_HISTORY = 10;
// Hard deadline for the whole turn (every model call in the tool loop), per spec.
const TURN_TIMEOUT_MS = 20_000;

// What happened during a turn, for callers that need more than the text —
// e.g. WhatsApp hands off to a human when the AI failed to answer.
export type AgentOutcome = {
  // The model errored or timed out; the reply is the canned fallback.
  failed: boolean;
  // request_human ran this turn, so the conversation is now `human` by the
  // AI's own doing (vs. the owner taking over mid-turn).
  handedOff: boolean;
  // The caller's keepReply said the reply won't be delivered, so it wasn't
  // saved to the transcript.
  discarded: boolean;
};

type AdminClient = ReturnType<typeof createAdminClient>;

// Resolves a service by name, or a ready-to-return error string listing what
// is actually bookable — callers just return it as-is when it's a string.
async function resolveService(
  admin: AdminClient,
  tenantId: string,
  name: string,
): Promise<{ id: string; name: string; duration_minutes: number } | string> {
  const service = await findServiceByName(admin, tenantId, name);
  if (service) return service;

  const names = await listActiveServiceNames(admin, tenantId);
  return names.length
    ? `Unknown service "${name}". Available services: ${names.join(", ")}.`
    : "This business hasn't set up any bookable services yet.";
}

// Generic tool failure text for the model. The real error is logged, never
// passed back — the model could otherwise repeat DB internals to a customer.
const TOOL_FAILED =
  "That action failed due to a technical problem. Apologise briefly and offer to have a person follow up.";

function toolFailed(tool: string, err: unknown): string {
  console.error(`Agent tool ${tool} failed:`, err);
  return TOOL_FAILED;
}

// Returns a short text result fed back to the model as the tool's outcome.
async function executeTool(
  admin: AdminClient,
  tenantId: string,
  businessName: string,
  conversationId: string,
  rawCall: ToolCall,
): Promise<string> {
  const parsed = parseToolInput(rawCall);
  if (!parsed.ok) return parsed.error;
  const call = parsed.call;

  if (call.name === "save_lead") {
    const lead = call.input;
    const { error } = await admin.from("leads").insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      ...lead,
      source: "web",
    });
    if (error) return toolFailed(call.name, error);

    await notifyOwnerOfLead(admin, tenantId, businessName, lead, conversationId);
    return "Lead saved successfully.";
  }

  if (call.name === "request_human") {
    const { error } = await admin
      .from("conversations")
      .update({ status: "human" })
      .eq("id", conversationId)
      .eq("tenant_id", tenantId);
    if (error) return toolFailed(call.name, error);

    await notifyOwnerHumanRequested(admin, tenantId, businessName, call.input.reason, conversationId);
    return "Flagged for a human to take over.";
  }

  if (call.name === "check_availability") {
    const { date } = call.input;
    const resolved = await resolveService(admin, tenantId, call.input.service);
    if (typeof resolved === "string") return resolved;

    const result = await getOpenSlots(admin, tenantId, resolved.id, date);
    if (!result || result.slots.length === 0) {
      return `No availability on ${date} for ${resolved.name}.`;
    }
    return `Available times on ${date} for ${resolved.name}: ${result.slots.join(", ")}.`;
  }

  // create_booking
  const { date, time, name, phone, email } = call.input;
  const resolved = await resolveService(admin, tenantId, call.input.service);
  if (typeof resolved === "string") return resolved;

  // Recomputed here even though the model should have just called
  // check_availability — defends against a stale or made-up time.
  const availability = await getOpenSlots(admin, tenantId, resolved.id, date);
  if (!availability || !availability.slots.includes(time)) {
    return `That time isn't available. Call check_availability again for ${date} and pick one of the returned times.`;
  }

  const startsAt = localToUtcDate(date, time);
  const endsAt = new Date(startsAt.getTime() + resolved.duration_minutes * 60_000);

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      name,
      phone,
      email,
      interest: resolved.name,
      summary: `Booked ${resolved.name} on ${date} at ${time}`,
      status: "booked",
      source: "booking",
    })
    .select("id")
    .single();
  if (leadError) return toolFailed(call.name, leadError);

  const { error: bookingError } = await admin.from("bookings").insert({
    tenant_id: tenantId,
    service_id: resolved.id,
    conversation_id: conversationId,
    lead_id: lead.id,
    name,
    phone,
    email,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
  });
  if (bookingError) {
    // Exclusion-violation: another booking took this slot between our
    // availability check above and this insert.
    if (bookingError.code === "23P01") {
      return "That slot was just taken by someone else — please pick a different time.";
    }
    return toolFailed(call.name, bookingError);
  }

  await notifyOwnerOfBooking(admin, tenantId, businessName, {
    name,
    phone,
    email,
    serviceName: resolved.name,
    startsAtLabel: `${date} at ${time}`,
  }, conversationId);

  return `Booking confirmed: ${resolved.name} on ${date} at ${time}.`;
}

// Streams the assistant's reply text as it's generated, persisting the user
// message up front and the full assistant reply once streaming finishes.
// The generator's return value reports how the turn went (see AgentOutcome).
//
// keepReply lets a caller that sends the reply later (WhatsApp) veto it after
// generation, e.g. because a newer customer message made it stale. A vetoed
// reply is left out of the transcript so later turns don't believe the
// customer saw it.
export async function* runAgent(params: {
  tenantId: string;
  conversationId: string;
  userMessage: string;
  keepReply?: (outcome: Omit<AgentOutcome, "discarded">) => Promise<boolean>;
}): AsyncGenerator<string, AgentOutcome> {
  const admin = createAdminClient();

  const { data: agentConfig, error: configError } = await admin
    .from("agent_configs")
    .select("business_name, tone, greeting, system_prompt_extra, handoff_contact")
    .eq("tenant_id", params.tenantId)
    .single();

  if (configError || !agentConfig) {
    yield "Sorry, something went wrong on our end. Please try again shortly.";
    return { failed: true, handedOff: false, discarded: false };
  }

  const { data: history } = await admin
    .from("messages")
    .select("role, content")
    .eq("conversation_id", params.conversationId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY);

  const messages: ChatMessage[] = (history ?? [])
    .reverse()
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        m.role === "user" || m.role === "assistant",
    );
  messages.push({ role: "user", content: params.userMessage });

  const { data: userRow } = await admin
    .from("messages")
    .insert({
      conversation_id: params.conversationId,
      tenant_id: params.tenantId,
      role: "user",
      content: params.userMessage,
    })
    .select("id")
    .single();

  let knowledgeText = "";
  try {
    knowledgeText = await getRelevantKnowledge(admin, params.tenantId, params.userMessage);
  } catch {
    // Retrieval failing shouldn't take down the whole conversation — fall back
    // to just the tenant layer of the prompt.
  }

  const services = await listActiveServices(admin, params.tenantId);
  const system = buildSystemPrompt(agentConfig as AgentConfig, knowledgeText, services);

  let fullText = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let failed = false;
  let handedOff = false;

  try {
    for await (const event of runAgentTurn({
      system,
      messages,
      tools: AGENT_TOOLS,
      maxTokens: MAX_TOKENS,
      signal: AbortSignal.timeout(TURN_TIMEOUT_MS),
      executeTool: (call) =>
        executeTool(admin, params.tenantId, agentConfig.business_name, params.conversationId, call),
    })) {
      if (event.type === "text-delta") {
        fullText += event.text;
        yield event.text;
      } else if (event.type === "usage") {
        // Each iteration of the tool loop is a separate billed API call, so
        // totals across iterations are summed, not overwritten.
        tokensIn += event.promptTokens;
        tokensOut += event.completionTokens;
      } else if (event.type === "tool-executed" && event.call.name === "request_human") {
        handedOff = true;
      }
    }
  } catch (err) {
    console.error("Agent turn failed:", err);
    failed = true;
    const fallback = `Sorry, I'm having trouble responding right now. Please reach out directly${
      agentConfig.handoff_contact ? ` at ${agentConfig.handoff_contact}` : ""
    }.`;
    yield fallback;
    fullText += fallback;
  }

  let discarded = false;
  if (params.keepReply) {
    try {
      discarded = !(await params.keepReply({ failed, handedOff }));
    } catch (err) {
      console.error("keepReply check failed; keeping the reply:", err);
    }
  }

  if (discarded) {
    // The tokens were still spent — book them on the user message so
    // usage_daily (which sums every message row) stays accurate.
    if (userRow) {
      await admin
        .from("messages")
        .update({ tokens_in: tokensIn, tokens_out: tokensOut })
        .eq("id", userRow.id)
        .eq("tenant_id", params.tenantId);
    }
  } else if (fullText.trim()) {
    await admin.from("messages").insert({
      conversation_id: params.conversationId,
      tenant_id: params.tenantId,
      role: "assistant",
      content: fullText,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
    });
  }

  return { failed, handedOff, discarded };
}
