import type { SupabaseClient } from "@supabase/supabase-js";
import { formatLocalDateTime, formatLocalTime } from "@/lib/time";
import { formatRand } from "@/lib/bookings/price-label";
import { listPublicEvents, type PublicEvent } from "@/lib/events/public";
import { signUpForEvent } from "@/lib/events/signup";

// The receptionist's event tools: what's on, and signing someone up in the
// chat. Same rules as the events widget: published events only, and every
// sign-up goes through create_event_signup() (spots, ticket limits, the
// amount), so the model can't oversell or set a price.

// A short reference the model can quote back, like booking references.
export const eventRef = (id: string) => `E-${id.slice(0, 6).toUpperCase()}`;

function line(e: PublicEvent): string {
  const when = `${formatLocalDateTime(e.startsAt)}${e.endsAt ? `–${formatLocalTime(e.endsAt)}` : ""}`;
  const price = e.priceCents ? `${formatRand(e.priceCents)} per ticket` : "free";
  const spots = e.closed
    ? { past: "already happened", cancelled: "CANCELLED", sold_out: "SOLD OUT", signups_closed: "sign-ups closed" }[e.closed]
    : e.spotsLeft !== null
      ? `${e.spotsLeft} spot${e.spotsLeft === 1 ? "" : "s"} left`
      : "spots available";
  const parts = [
    `${eventRef(e.id)}: ${e.title}`,
    when,
    e.location || null,
    price,
    spots,
    !e.closed && e.maxPerSignup > 1 ? `up to ${e.maxPerSignup} tickets per sign-up` : null,
    e.summary || null,
  ];
  return parts.filter(Boolean).join(" · ");
}

export async function listEventsForAgent(admin: SupabaseClient, tenantId: string): Promise<string> {
  const events = (await listPublicEvents(admin, tenantId)).slice(0, 10);
  if (!events.length) return "There are no upcoming events. Say so; don't suggest any.";
  return [
    "Upcoming events (only these exist; never invent others, dates or prices):",
    ...events.map(line),
    "To sign someone up, use sign_up_for_event with the reference (e.g. E-1A2B3C).",
  ].join("\n");
}

// The model may give the reference, or the title.
async function findEvent(admin: SupabaseClient, tenantId: string, query: string): Promise<PublicEvent | "ambiguous" | null> {
  const events = await listPublicEvents(admin, tenantId);
  const q = query.trim().toLowerCase();
  const byRef = events.find((e) => eventRef(e.id).toLowerCase() === q || eventRef(e.id).toLowerCase() === `e-${q}`);
  if (byRef) return byRef;
  const byTitle = events.filter((e) => e.title.toLowerCase() === q);
  if (byTitle.length === 1) return byTitle[0]!;
  if (byTitle.length > 1) return "ambiguous";
  const partial = events.filter((e) => e.title.toLowerCase().includes(q));
  return partial.length === 1 ? partial[0]! : partial.length > 1 ? "ambiguous" : null;
}

export async function signUpFromChat(
  admin: SupabaseClient,
  ctx: { tenantId: string; conversationId: string },
  input: { event: string; name: string; phone: string; email: string | null; tickets: number },
): Promise<string> {
  const event = await findEvent(admin, ctx.tenantId, input.event);
  if (event === "ambiguous") return "More than one event matches. Call list_events and use the exact reference.";
  if (!event) return "No upcoming event matches that. Call list_events and use one of its references.";

  const result = await signUpForEvent(admin, {
    tenantId: ctx.tenantId,
    eventId: event.id,
    widgetId: null,
    quantity: input.tickets,
    customer: { name: input.name, phone: input.phone, email: input.email },
    details: {},
    // One sign-up per event per chat: a repeated call returns the same one.
    idempotencyKey: `chat:${ctx.conversationId}:${event.id}`,
  });
  const when = formatLocalDateTime(event.startsAt);
  const tickets = `${input.tickets} ticket${input.tickets === 1 ? "" : "s"}`;
  if (!result.ok) {
    const why: Record<string, string> = {
      sold_out: `Not enough spots left${result.spotsLeft !== undefined ? ` (${result.spotsLeft} left)` : ""}. Tell them, and offer fewer tickets if any are left.`,
      too_many: `Too many tickets: at most ${result.max ?? event.maxPerSignup} per sign-up for this event.`,
      closed: "Sign-ups for this event have closed. Tell them.",
      not_open: "That event isn't available any more. Tell them.",
      unknown_event: "That event isn't available any more. Tell them.",
    };
    return why[result.reason] ?? "The sign-up didn't go through. Apologise and offer a person (request_human).";
  }
  const ref = eventRef(event.id);
  if (result.repeat) {
    return `They're already signed up for ${event.title} on ${when} from earlier in this chat (no new sign-up was made).${result.payment ? ` Their payment link is still ${result.payment.url} (share it exactly).` : ""}`;
  }
  if (result.payment) {
    const minutes = Math.max(1, Math.round((new Date(result.payment.dueAt).getTime() - Date.now()) / 60_000));
    return `Tickets held, waiting for payment: ${tickets} for ${event.title} on ${when} (${ref}). To secure them they must pay ${formatRand(result.payment.amountCents)} online within ${minutes} minutes at ${result.payment.url} (share the link exactly as written). If they don't pay in time the tickets are released. Tell them this; don't call it confirmed until they've paid.`;
  }
  const atDoor = result.payAtEvent && event.priceCents ? ` They pay ${formatRand(event.priceCents * input.tickets)} at the event.` : "";
  return `Signed up: ${tickets} for ${event.title} on ${when}${event.location ? ` at ${event.location}` : ""} (${ref}).${atDoor}${input.email ? " A confirmation email is on its way." : ""} Tell them exactly this.`;
}
