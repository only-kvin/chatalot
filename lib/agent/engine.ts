import { createAdminClient } from "@/lib/db/supabase-admin";
import { buildSystemPrompt, type AgentConfig } from "./prompt";
import { runAgentTurn, type ChatMessage } from "./model";
import { AGENT_TOOLS, type ToolCall } from "./tools";
import { getRelevantKnowledge } from "./retrieval";
import {
  findServiceByName,
  getOpenSlots,
  listActiveServiceNames,
  localToUtcDate,
} from "./availability";
import { notifyOwnerOfLead } from "@/lib/email/notify-lead";
import { notifyOwnerHumanRequested } from "@/lib/email/notify-human-requested";
import { notifyOwnerOfBooking } from "@/lib/email/notify-booking";

const MAX_TOKENS = 400;
const MAX_HISTORY = 10;

type AdminClient = ReturnType<typeof createAdminClient>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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

// Returns a short text result fed back to the model as the tool's outcome.
async function executeTool(
  admin: AdminClient,
  tenantId: string,
  businessName: string,
  conversationId: string,
  call: ToolCall,
): Promise<string> {
  if (call.name === "save_lead") {
    const lead = {
      name: String(call.input.name ?? ""),
      phone: String(call.input.phone ?? ""),
      email: call.input.email || null,
      interest: String(call.input.interest ?? ""),
      summary: String(call.input.summary ?? ""),
    };
    const { error } = await admin.from("leads").insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      ...lead,
      source: "web",
    });
    if (error) return `Failed to save: ${error.message}`;

    await notifyOwnerOfLead(admin, tenantId, businessName, lead);
    return "Lead saved successfully.";
  }

  if (call.name === "request_human") {
    const { error } = await admin
      .from("conversations")
      .update({ status: "human" })
      .eq("id", conversationId);
    if (error) return `Failed to flag conversation: ${error.message}`;

    await notifyOwnerHumanRequested(
      admin,
      tenantId,
      businessName,
      String(call.input.reason ?? "Not specified"),
    );
    return "Flagged for a human to take over.";
  }

  if (call.name === "check_availability") {
    const date = String(call.input.date ?? "");
    if (!DATE_RE.test(date)) return "Invalid date — use YYYY-MM-DD.";

    const resolved = await resolveService(admin, tenantId, String(call.input.service ?? ""));
    if (typeof resolved === "string") return resolved;

    const result = await getOpenSlots(admin, tenantId, resolved.id, date);
    if (!result || result.slots.length === 0) {
      return `No availability on ${date} for ${resolved.name}.`;
    }
    return `Available times on ${date} for ${resolved.name}: ${result.slots.join(", ")}.`;
  }

  if (call.name === "create_booking") {
    const date = String(call.input.date ?? "");
    const time = String(call.input.time ?? "");
    if (!DATE_RE.test(date) || !TIME_RE.test(time)) {
      return "Invalid date or time — date must be YYYY-MM-DD, time must be 24-hour HH:MM.";
    }

    const resolved = await resolveService(admin, tenantId, String(call.input.service ?? ""));
    if (typeof resolved === "string") return resolved;

    // Recomputed here even though the model should have just called
    // check_availability — defends against a stale or made-up time.
    const availability = await getOpenSlots(admin, tenantId, resolved.id, date);
    if (!availability || !availability.slots.includes(time)) {
      return `That time isn't available. Call check_availability again for ${date} and pick one of the returned times.`;
    }

    const name = String(call.input.name ?? "");
    const phone = String(call.input.phone ?? "");
    const email = call.input.email || null;
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
    if (leadError) return `Failed to save booking: ${leadError.message}`;

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
      return `Failed to save booking: ${bookingError.message}`;
    }

    await notifyOwnerOfBooking(admin, tenantId, businessName, {
      name,
      phone,
      email,
      serviceName: resolved.name,
      startsAtLabel: `${date} at ${time}`,
    });

    return `Booking confirmed: ${resolved.name} on ${date} at ${time}.`;
  }

  return `Unknown tool: ${call.name}`;
}

// Streams the assistant's reply text as it's generated, persisting the user
// message up front and the full assistant reply once streaming finishes.
export async function* runAgent(params: {
  tenantId: string;
  conversationId: string;
  userMessage: string;
}): AsyncGenerator<string> {
  const admin = createAdminClient();

  const { data: agentConfig, error: configError } = await admin
    .from("agent_configs")
    .select("business_name, tone, greeting, system_prompt_extra, handoff_contact")
    .eq("tenant_id", params.tenantId)
    .single();

  if (configError || !agentConfig) {
    yield "Sorry, something went wrong on our end. Please try again shortly.";
    return;
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

  await admin.from("messages").insert({
    conversation_id: params.conversationId,
    tenant_id: params.tenantId,
    role: "user",
    content: params.userMessage,
  });

  let knowledgeText = "";
  try {
    knowledgeText = await getRelevantKnowledge(admin, params.tenantId, params.userMessage);
  } catch {
    // Retrieval failing shouldn't take down the whole conversation — fall back
    // to just the tenant layer of the prompt.
  }

  const system = buildSystemPrompt(agentConfig as AgentConfig, knowledgeText);

  let fullText = "";
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    for await (const event of runAgentTurn({
      system,
      messages,
      tools: AGENT_TOOLS,
      maxTokens: MAX_TOKENS,
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
      }
    }
  } catch {
    const fallback = `Sorry, I'm having trouble responding right now. Please reach out directly${
      agentConfig.handoff_contact ? ` at ${agentConfig.handoff_contact}` : ""
    }.`;
    yield fallback;
    fullText += fallback;
  }

  if (fullText.trim()) {
    await admin.from("messages").insert({
      conversation_id: params.conversationId,
      tenant_id: params.tenantId,
      role: "assistant",
      content: fullText,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
    });
  }
}
