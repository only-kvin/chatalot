import { createAdminClient } from "@/lib/db/supabase-admin";
import { buildSystemPrompt, type AgentConfig } from "./prompt";
import { runAgentTurn, type ChatMessage } from "./model";
import { CORE_TOOL_NAMES, EMERGENCY_TOOL, parseToolInput, toolsFor, type ToolCall } from "./tools";
import { reportEmergency } from "./emergency";
import { hasFeature } from "@/lib/features";
import { getRelevantKnowledge } from "./retrieval";
import { findServiceByName, listActiveServiceNames, listActiveServices, listActiveStaff, matchStaff, type ActiveService } from "@/lib/bookings/catalog";
import { calloutFeeNotice, formatBookingWhen, priceLabel, timeRangeLabel } from "@/lib/bookings/labels";
import { bookingLinkFor } from "@/lib/widgets/booking-link";
import { getOpenSlots } from "@/lib/bookings/availability";
import { createBooking } from "@/lib/bookings/create";
import { formatLocalDate, formatLocalDateTime } from "@/lib/time";
import { notifyOwnerOfLead } from "@/lib/email/notify-lead";
import { notifyOwnerHumanRequested } from "@/lib/email/notify-human-requested";
import { notifyOwnerOfBooking } from "@/lib/email/notify-booking";
import { emailCustomerAboutBooking } from "@/lib/email/customer-booking";
import { linkConversation, upsertContact } from "@/lib/contacts/upsert";
import {
  cancelBooking,
  describeBooking,
  insideCutoff,
  listManageableBookings,
  rescheduleBooking,
} from "@/lib/bookings/manage";
import { notifyOwnerOfBookingChange } from "@/lib/email/notify-booking-change";

const MAX_TOKENS = 400;
const MAX_HISTORY = 10;
// Hard deadline for the whole turn (every model call in the tool loop), per spec.
const TURN_TIMEOUT_MS = 20_000;

// What happened during a turn, for callers that need more than the text —
// e.g. WhatsApp hands off to a human when the AI failed to answer.
export type AgentOutcome = {
  // The model errored or timed out; the reply is the canned fallback.
  failed: boolean;
  // request_human ran this turn. On WhatsApp the conversation is now `human`
  // by the AI's own doing (vs. the owner taking over mid-turn); on the web the
  // chat stays open and the caller offers the WhatsApp button.
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
): Promise<ActiveService | string> {
  const service = await findServiceByName(admin, tenantId, name);
  if (service) return service;

  const names = await listActiveServiceNames(admin, tenantId);
  return names.length
    ? `Unknown service "${name}". Available services: ${names.join(", ")}.`
    : "This business hasn't set up any bookable services yet.";
}

// The staff member the visitor asked for, if they offer this service;
// otherwise a message for the model naming who does.
async function resolveStaff(
  admin: AdminClient,
  tenantId: string,
  name: string,
  serviceName: string,
): Promise<{ id: string; name: string } | string> {
  const staff = await listActiveStaff(admin, tenantId);
  if (!staff.length) return "This business doesn't list staff: book with whoever is free (leave staff empty).";
  const person = matchStaff(staff, name);
  if (!person) return `No staff member called "${name}". Staff: ${staff.map((p) => p.name).join(", ")}.`;
  if (!person.services.includes(serviceName)) {
    const who = staff.filter((p) => p.services.includes(serviceName)).map((p) => p.name);
    return `${person.name} doesn't do ${serviceName}.${who.length ? ` ${who.join(", ")} ${who.length === 1 ? "does" : "do"}.` : ""}`;
  }
  return { id: person.id, name: person.name };
}

// Who offers a service, for the model to mention when it helps.
async function staffFor(admin: AdminClient, tenantId: string, serviceName: string): Promise<string[]> {
  return (await listActiveStaff(admin, tenantId)).filter((p) => p.services.includes(serviceName)).map((p) => p.name);
}

async function staffName(admin: AdminClient, tenantId: string, staffId: string | null): Promise<string | null> {
  if (!staffId) return null;
  const { data } = await admin.from("staff").select("name").eq("tenant_id", tenantId).eq("id", staffId).maybeSingle();
  return data?.name ?? null;
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
export type Channel = "web" | "whatsapp";

export type ToolContext = {
  tenantId: string;
  businessName: string;
  conversationId: string;
  channel: Channel;
  // Web only: the tenant has a WhatsApp link the widget can offer on handoff.
  whatsappAvailable: boolean;
  // Minimum notice for customers to cancel or reschedule in chat.
  cutoffMinutes: number;
  // Online bookings are on the business's plan. Without them only the core
  // tools run, whatever the model asks for.
  takesBookings: boolean;
  // The business takes emergency call-outs (report_emergency is offered).
  emergencyCallouts?: boolean;
  emergencyNote?: string;
  cancellationPolicy?: string;
};

// The service's price as customers see it, for tool results.
function priceFor(service: ActiveService, atCustomer: boolean): string {
  if (service.price_type === "on_inspection") {
    const fee = atCustomer ? calloutFeeNotice(service.callout_fee_cents, "the business") : null;
    return ` Price: quoted on site (never state a price)${fee ? `; ${fee}` : ""}.`;
  }
  const label = priceLabel(
    { priceType: service.price_type, priceCents: service.price_cents, calloutFeeCents: service.callout_fee_cents },
    atCustomer,
  );
  return label ? ` Price: ${label}.` : "";
}

// Tool result for request_human on the website, where the owner can't reply
// in the chat: the model steers the visitor to a channel that reaches a person.
function webHandoffInstructions(whatsappAvailable: boolean): string {
  return [
    "The team has been notified, but they can't reply in this website chat.",
    whatsappAvailable
      ? "Tell the visitor the quickest way to reach a person is WhatsApp, using the button shown under your reply."
      : "",
    "Offer to take their name and phone number so the team can contact them. If they share them, ask their permission, then call save_lead with interest 'Callback request'.",
    "Do not say someone will reply in this chat.",
  ]
    .filter(Boolean)
    .join(" ");
}

// The visitor shared their details (with consent, per the tool rules): find
// or create them as a customer and attach this conversation to them. A
// website chat becomes a known customer here. Best-effort — never blocks the
// lead or booking itself.
async function rememberCustomer(
  admin: AdminClient,
  ctx: ToolContext,
  details: { name: string; phone: string; email: string | null },
): Promise<string | null> {
  try {
    const contactId = await upsertContact(admin, {
      tenantId: ctx.tenantId,
      ...details,
      nameSource: "customer",
      channel: ctx.channel,
      consent: true,
    });
    if (contactId) await linkConversation(admin, ctx.tenantId, ctx.conversationId, contactId);
    return contactId;
  } catch (err) {
    console.error("Remembering customer failed:", err);
    return null;
  }
}

// Exported for tests, which drive the real tool runner without the model.
export async function executeTool(admin: AdminClient, ctx: ToolContext, rawCall: ToolCall): Promise<string> {
  const { tenantId, businessName, conversationId } = ctx;
  const parsed = parseToolInput(rawCall);
  if (!parsed.ok) return parsed.error;
  const call = parsed.call;
  if (call.name === EMERGENCY_TOOL) {
    if (!ctx.emergencyCallouts) return "This business doesn't take emergency call-outs. Offer a person (request_human) instead.";
    return reportEmergency(
      admin,
      { tenantId, businessName, conversationId, channel: ctx.channel, emergencyNote: ctx.emergencyNote ?? "" },
      call.input,
    );
  }
  if (!ctx.takesBookings && !CORE_TOOL_NAMES.includes(call.name)) {
    return "Bookings can't be made in this chat. Offer to take their name and phone number for a callback (save_lead).";
  }

  if (call.name === "save_lead") {
    const lead = call.input;
    const contactId = await rememberCustomer(admin, ctx, lead);
    // After report_emergency, the details complete its urgent lead rather
    // than filing a second one.
    const { data: urgentLead } = await admin
      .from("leads")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .eq("urgent", true)
      .is("phone", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (urgentLead) {
      const { error } = await admin
        .from("leads")
        .update({ name: lead.name, phone: lead.phone, email: lead.email, contact_id: contactId })
        .eq("id", urgentLead.id)
        .eq("tenant_id", tenantId);
      if (error) return toolFailed(call.name, error);
      await notifyOwnerOfLead(admin, tenantId, businessName, { ...lead, interest: `URGENT: ${lead.interest}` }, conversationId);
      return "Details passed to the team with the emergency.";
    }
    const { error } = await admin.from("leads").insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      contact_id: contactId,
      ...lead,
      source: ctx.channel,
    });
    if (error) return toolFailed(call.name, error);

    await notifyOwnerOfLead(admin, tenantId, businessName, lead, conversationId);
    return "Lead saved successfully.";
  }

  if (call.name === "request_human") {
    if (ctx.channel === "web") {
      // No human can answer in the widget, so the chat stays with the AI —
      // locking it would strand the visitor. The owner is alerted either way.
      await notifyOwnerHumanRequested(admin, tenantId, businessName, call.input.reason, conversationId);
      return webHandoffInstructions(ctx.whatsappAvailable);
    }

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
    const { data: convo } = await admin
      .from("conversations")
      .select("urgent")
      .eq("tenant_id", tenantId)
      .eq("id", conversationId)
      .maybeSingle();
    if (convo?.urgent) {
      return "This chat is an emergency already handed to the team: don't offer booking times. Tell the visitor the team has been alerted.";
    }
    const resolved = await resolveService(admin, tenantId, call.input.service);
    if (typeof resolved === "string") return resolved;
    if (resolved.location === "either" && !call.input.location) {
      return `${resolved.name} can be done at ${businessName} or at the visitor's place. Ask which they'd like, then check again with location "business" or "customer".`;
    }
    if (resolved.location !== "either" && call.input.location && call.input.location !== resolved.location) {
      return resolved.location === "customer"
        ? `${resolved.name} is only done at the customer's address. Check again with location "customer".`
        : `${resolved.name} is only done at ${businessName}. Check again with location "business".`;
    }
    const atCustomer = (call.input.location ?? resolved.location) === "customer";

    let person: { id: string; name: string } | null = null;
    if (call.input.staff) {
      const found = await resolveStaff(admin, tenantId, call.input.staff, resolved.name);
      if (typeof found === "string") return found;
      person = found;
    }
    const result = await getOpenSlots(admin, tenantId, resolved.id, date, { staffId: person?.id, location: call.input.location });
    const day = formatLocalDate(date);
    const forWhom = person ? ` with ${person.name}` : "";
    if (!result || result.slots.length === 0) {
      return `No availability on ${day} (${date}) for ${resolved.name}${forWhom}.`;
    }
    // With many open times the model tends to say "lots of slots" and offer
    // none; ask it to name a few, spread across the day.
    const offer = result.slots.length > 4 ? " Offer the visitor 3 or 4 of these, spread across the day, and ask which suits." : "";
    const extra = `${priceFor(resolved, atCustomer)}${atCustomer && resolved.callout_fee_cents ? " State the call-out fee before booking." : ""}`;
    const times = result.windows
      ? `Available arrival windows on ${day} (${date}) for ${resolved.name}${forWhom}: ${result.windows
          .map((w) => timeRangeLabel(w.start, w.end))
          .join(", ")}. Offer them as windows ("between 08:00 and 10:00") and book with the window's start time.${offer}${extra}`
      : `Available times on ${day} (${date}) for ${resolved.name}${forWhom}: ${result.slots.join(", ")}.${offer}${extra}`;
    if (person) return times;
    const who = await staffFor(admin, tenantId, resolved.name);
    return who.length > 1 ? `${times} (Anyone free. Staff who do it: ${who.join(", ")}; only ask if the visitor has a preference.)` : times;
  }

  if (call.name === "my_bookings") {
    const bookings = await listManageableBookings(admin, ctx);
    if (!bookings.length) {
      return ctx.channel === "web"
        ? "No upcoming bookings were made in this chat. On the website, only bookings made in this same chat can be changed; for others, the visitor should message us on WhatsApp or call."
        : "This customer has no upcoming bookings.";
    }
    return `Upcoming bookings: ${bookings.map((b) => `[${b.ref}] ${describeBooking(b)}`).join("; ")}.`;
  }

  if (call.name === "cancel_booking" || call.name === "reschedule_booking") {
    // Only bookings this visitor may manage are resolvable by reference.
    const bookings = await listManageableBookings(admin, ctx);
    const ref = call.input.booking_ref.replace(/[^a-z0-9]/gi, "").toUpperCase();
    const booking = bookings.find((b) => b.ref === ref);
    if (!booking) {
      return "No matching upcoming booking for this visitor. Call my_bookings and use one of its references.";
    }
    if (insideCutoff(booking.startsAt, ctx.cutoffMinutes)) {
      return `${describeBooking(booking)} is too soon to change in chat (the business needs at least ${formatNotice(ctx.cutoffMinutes)} notice). Nothing was changed. Apologise and call request_human so the team can help.`;
    }
    const actor = { actor: "ai" as const, channel: ctx.channel, tenantId, bookingId: booking.id };

    if (call.name === "cancel_booking") {
      const result = await cancelBooking(admin, { ...actor, reason: call.input.reason });
      if (!result.ok) return result.error;
      await notifyOwnerOfBookingChange(
        admin,
        tenantId,
        businessName,
        { kind: "cancelled", customer: booking.customerName, booking: describeBooking(booking), reason: call.input.reason },
        conversationId,
      );
      return `Cancelled: ${describeBooking(booking)}. Tell the visitor exactly this.`;
    }

    const moved = await rescheduleBooking(admin, { ...actor, date: call.input.date, time: call.input.time });
    if (!moved.ok) return moved.error;
    await notifyOwnerOfBookingChange(
      admin,
      tenantId,
      businessName,
      {
        kind: "rescheduled",
        customer: booking.customerName,
        serviceName: booking.serviceName,
        from: formatLocalDateTime(moved.from),
        to: formatLocalDateTime(moved.to),
      },
      conversationId,
    );
    const { data: after } = await admin.from("bookings").select("staff_id").eq("tenant_id", tenantId).eq("id", booking.id).maybeSingle();
    const movedWith = await staffName(admin, tenantId, after?.staff_id ?? null);
    return `Moved: ${booking.serviceName} from ${formatLocalDateTime(moved.from)} to ${formatLocalDateTime(moved.to)}${movedWith ? ` with ${movedWith}` : ""} (same booking). Tell the visitor exactly this.`;
  }

  if (call.name === "send_booking_link") {
    let serviceId: string | null = null;
    if (call.input.service) {
      const resolved = await resolveService(admin, tenantId, call.input.service);
      if (typeof resolved !== "string") serviceId = resolved.id;
    }
    const link = await bookingLinkFor(admin, tenantId, serviceId);
    return link
      ? `Online booking link: ${link} (share it exactly as written; they pick the time and fill in their details there).`
      : "This business doesn't take online bookings by link. Keep helping them book here in the chat.";
  }

  // create_booking
  const { date, time, name, phone, email } = call.input;
  const resolved = await resolveService(admin, tenantId, call.input.service);
  if (typeof resolved === "string") return resolved;
  let person: { id: string; name: string } | null = null;
  if (call.input.staff) {
    const found = await resolveStaff(admin, tenantId, call.input.staff, resolved.name);
    if (typeof found === "string") return found;
    person = found;
  }

  if (resolved.location === "either" && !call.input.location) {
    return `Ask whether they'd like ${resolved.name} at ${businessName} or at their place, then book with location "business" or "customer".`;
  }
  const atCustomer = (call.input.location ?? resolved.location) === "customer";
  if (atCustomer && (!call.input.address_line || !call.input.suburb)) {
    return "A call-out needs the street address and suburb. Ask for whichever is missing (one question at a time), then call create_booking again.";
  }

  const contactId = await rememberCustomer(admin, ctx, { name, phone, email });
  // createBooking re-checks the time against the live calendar, so a stale
  // or made-up time is refused here too.
  const booked = await createBooking(admin, {
    tenantId,
    serviceId: resolved.id,
    staffId: person?.id,
    date,
    time,
    customer: { name, phone, email, contactId },
    conversationId,
    source: ctx.channel,
    lead: { source: "booking", summary: `${atCustomer ? "Call-out:" : "Booked"} ${resolved.name} on ${date} at ${time}` },
    actor: "ai",
    channel: ctx.channel,
    location: call.input.location,
    address: atCustomer
      ? {
          line: call.input.address_line ?? "",
          suburb: call.input.suburb ?? "",
          city: call.input.city,
          postalCode: call.input.postal_code,
          accessNotes: call.input.access_notes,
        }
      : null,
  });
  if (!booked.ok) {
    if (booked.reason === "unavailable") {
      return `That time isn't available. Call check_availability again for ${date} and pick one of the returned times.`;
    }
    if (booked.reason === "slot_taken") return "That slot was just taken by someone else — please pick a different time.";
    if (booked.reason === "address_required") return "A call-out needs the street address and suburb. Ask for them, then try again.";
    if (booked.reason === "invalid_location") return `${resolved.name} can't be done there. Ask the visitor where they'd like it.`;
    return toolFailed(call.name, booked.reason);
  }
  const when = formatBookingWhen(booked.startsAt, booked.windowEnd);
  const pending = booked.status === "pending";
  const address = booked.location === "customer" ? `${call.input.address_line}, ${call.input.suburb}` : null;
  const where = address ? ` at ${address}` : "";
  const fee = calloutFeeNotice(booked.calloutFeeCents, businessName);
  const policy = ctx.cancellationPolicy?.trim();
  const after = [
    fee ? `${fee}.` : "",
    booked.outsideArea ? "Their suburb isn't in the listed areas: say the business will confirm whether they cover it." : "",
    policy ? `Mention the cancellation policy: ${policy}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const callout = booked.location === "customer";
  // Who it's with: the person asked for, or whoever "anyone" went to.
  const withWhom = await staffName(admin, tenantId, booked.staffId);
  const withText = withWhom ? ` with ${withWhom}` : "";
  await notifyOwnerOfBooking(
    admin,
    tenantId,
    businessName,
    {
      name,
      phone,
      email,
      serviceName: resolved.name,
      startsAtLabel: when,
      pending,
      bookingId: booked.bookingId,
      address,
      outsideArea: booked.outsideArea,
    },
    conversationId,
  );
  if (!booked.repeat) await emailCustomerAboutBooking(admin, tenantId, booked.bookingId, pending ? "requested" : "confirmed");

  if (pending) {
    return `${callout ? "Call-out requested" : "Booking requested"} (not yet confirmed): ${resolved.name} on ${when}${withText}${where} (reference ${booked.ref}). The business approves ${callout ? "call-outs" : "bookings"} first and will confirm soon; the time is held meanwhile. Tell the visitor exactly this, and don't call it confirmed. ${after}`.trim();
  }
  return `Booking confirmed: ${resolved.name} on ${when}${withText}${where} (reference ${booked.ref}). Tell the visitor exactly this date, time and person. ${after}`.trim();
}

function formatNotice(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}'`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}'`;
  return `${minutes} minutes'`;
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
  channel: Channel;
  // Web only: whether the widget can offer a WhatsApp button on handoff.
  whatsappAvailable?: boolean;
  keepReply?: (outcome: Omit<AgentOutcome, "discarded">) => Promise<boolean>;
}): AsyncGenerator<string, AgentOutcome> {
  const admin = createAdminClient();

  const { data: agentConfig, error: configError } = await admin
    .from("agent_configs")
    .select(
      "business_name, tone, greeting, system_prompt_extra, handoff_contact, booking_change_cutoff_minutes, service_areas, cancellation_policy, emergency_callouts, emergency_note",
    )
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

  const takesBookings = await hasFeature(admin, params.tenantId, "bookings");
  const [services, staff] = takesBookings
    ? await Promise.all([listActiveServices(admin, params.tenantId), listActiveStaff(admin, params.tenantId)])
    : [[], []];
  const system = buildSystemPrompt(agentConfig as AgentConfig, knowledgeText, services, staff, takesBookings);

  let fullText = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let failed = false;
  let handedOff = false;

  try {
    for await (const event of runAgentTurn({
      system,
      messages,
      tools: toolsFor(takesBookings, agentConfig.emergency_callouts),
      maxTokens: MAX_TOKENS,
      signal: AbortSignal.timeout(TURN_TIMEOUT_MS),
      executeTool: (call) =>
        executeTool(
          admin,
          {
            tenantId: params.tenantId,
            businessName: agentConfig.business_name,
            conversationId: params.conversationId,
            channel: params.channel,
            whatsappAvailable: params.whatsappAvailable ?? false,
            cutoffMinutes: agentConfig.booking_change_cutoff_minutes ?? 120,
            takesBookings,
            emergencyCallouts: agentConfig.emergency_callouts,
            emergencyNote: agentConfig.emergency_note,
            cancellationPolicy: agentConfig.cancellation_policy,
          },
          call,
        ),
    })) {
      if (event.type === "text-delta") {
        fullText += event.text;
        yield event.text;
      } else if (event.type === "usage") {
        // Each iteration of the tool loop is a separate billed API call, so
        // totals across iterations are summed, not overwritten.
        tokensIn += event.promptTokens;
        tokensOut += event.completionTokens;
      } else if (event.type === "tool-executed" && (event.call.name === "request_human" || event.call.name === EMERGENCY_TOOL)) {
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
