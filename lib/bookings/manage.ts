import type { SupabaseClient } from "@supabase/supabase-js";
import { formatLocalDateTime, formatLocalTime, localDateISO, localToUtcDate } from "@/lib/time";
import { getAvailability } from "./availability";

// Booking changes shared by the AI tools (service-role client, actor "ai") and
// dashboard actions (the signed-in user's client, actor "team" — RLS then
// scopes every read and write to their tenant). Every change is logged to
// booking_events so the owner can see who changed what, and when.

// customer = the customer themselves (a booking widget, their email link).
export type BookingActor = "ai" | "team" | "system" | "customer";
export type BookingEventChannel = "web" | "whatsapp" | "dashboard";
export type BookingEventType =
  | "created"
  | "rescheduled"
  | "cancelled"
  | "attended"
  | "no_show"
  | "reopened"
  | "approved"
  | "declined"
  | "reminder_sent"
  | "reminder_not_sent"
  | "review_requested"
  | "review_not_sent"
  | "review_rated";

export type BookingSummary = {
  id: string;
  // Short reference the AI shows and hands back; resolved against the
  // customer's own bookings only, so a guessed ref can't reach anyone else's.
  ref: string;
  serviceName: string;
  serviceId: string;
  startsAt: string;
  status: string;
  customerName: string;
};

type Actor = { actor: BookingActor; channel: BookingEventChannel; createdBy?: string | null };

// Upcoming bookings that still hold their slot and can be changed.
export const ACTIVE_STATUSES = ["confirmed", "pending"];

export function bookingRef(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export async function logBookingEvent(
  client: SupabaseClient,
  e: Actor & {
    tenantId: string;
    bookingId: string;
    type: BookingEventType;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await client.from("booking_events").insert({
    tenant_id: e.tenantId,
    booking_id: e.bookingId,
    type: e.type,
    actor: e.actor,
    channel: e.channel,
    details: e.details ?? {},
    created_by: e.createdBy ?? null,
  });
  if (error) console.error(`Logging ${e.type} for booking ${e.bookingId} failed:`, error);
}

// Which bookings a visitor may manage in chat. WhatsApp proves their phone
// number, so it's everything booked by that customer; on the website anyone
// can type a number, so only bookings made in this very chat.
export async function listManageableBookings(
  admin: SupabaseClient,
  s: { tenantId: string; conversationId: string; channel: "web" | "whatsapp" },
): Promise<BookingSummary[]> {
  let contactId: string | null = null;
  if (s.channel === "whatsapp") {
    const { data } = await admin
      .from("conversations")
      .select("contact_id")
      .eq("id", s.conversationId)
      .eq("tenant_id", s.tenantId)
      .maybeSingle();
    contactId = data?.contact_id ?? null;
  }

  let query = admin
    .from("bookings")
    .select("id, service_id, starts_at, status, name, services(name)")
    .eq("tenant_id", s.tenantId)
    .in("status", ACTIVE_STATUSES)
    .gt("starts_at", new Date().toISOString())
    .order("starts_at");
  query = contactId
    ? query.or(`conversation_id.eq.${s.conversationId},contact_id.eq.${contactId}`)
    : query.eq("conversation_id", s.conversationId);

  const { data } = await query;
  return (data ?? []).map((b) => ({
    id: b.id,
    ref: bookingRef(b.id),
    serviceId: b.service_id,
    serviceName: (b.services as unknown as { name: string } | null)?.name ?? "Booking",
    startsAt: b.starts_at,
    status: b.status,
    customerName: b.name,
  }));
}

export function describeBooking(b: { serviceName: string; startsAt: string }): string {
  return `${b.serviceName} on ${formatLocalDateTime(b.startsAt)}`;
}

// True when the booking starts within the tenant's minimum notice, so the
// customer can't change it themselves in chat.
export function insideCutoff(startsAt: string, cutoffMinutes: number, now = new Date()): boolean {
  return new Date(startsAt).getTime() - now.getTime() < cutoffMinutes * 60_000;
}

export async function cancelBooking(
  client: SupabaseClient,
  c: Actor & { tenantId: string; bookingId: string; reason?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("bookings")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", c.bookingId)
    .eq("tenant_id", c.tenantId)
    .in("status", ACTIVE_STATUSES)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error(`Cancelling booking ${c.bookingId} failed:`, error);
    return { ok: false, error: "The booking couldn't be cancelled due to a technical problem." };
  }
  if (!data) return { ok: false, error: "That booking isn't active any more." };

  await logBookingEvent(client, {
    ...c,
    type: "cancelled",
    details: c.reason ? { reason: c.reason } : {},
  });
  return { ok: true };
}

export async function rescheduleBooking(
  client: SupabaseClient,
  r: Actor & { tenantId: string; bookingId: string; date: string; time: string },
): Promise<{ ok: true; from: string; to: string } | { ok: false; error: string }> {
  const { data: booking } = await client
    .from("bookings")
    .select("id, service_id, staff_id, status")
    .eq("id", r.bookingId)
    .eq("tenant_id", r.tenantId)
    .maybeSingle();
  if (!booking || !ACTIVE_STATUSES.includes(booking.status)) {
    return { ok: false, error: "That booking isn't active any more." };
  }

  // Recomputed here even if availability was just checked — defends against
  // a stale or made-up time, and excludes this booking's own current slot.
  const availability = await getAvailability(client, r.tenantId, {
    serviceId: booking.service_id,
    fromDate: r.date,
    toDate: r.date,
    excludeBookingId: booking.id,
    forTeam: r.actor === "team",
  });
  const slot = availability?.days[0]?.slots.find((s) => s.time === r.time);
  if (!slot || slot.staffIds.length === 0) {
    return {
      ok: false,
      error: `That time isn't available. Check availability for ${r.date} and pick one of the returned times.`,
    };
  }
  // Same person if they're free then, otherwise whoever is.
  const staffId = slot.staffIds.includes(booking.staff_id) ? booking.staff_id : slot.staffIds[0];

  const { data, error } = await client.rpc("reschedule_booking", {
    p_tenant_id: r.tenantId,
    p_booking_id: booking.id,
    p_staff_id: staffId,
    p_starts_at: localToUtcDate(r.date, r.time).toISOString(),
    p_actor: r.actor,
    p_channel: r.channel,
    p_created_by: r.createdBy ?? null,
  });
  if (error) {
    console.error(`Rescheduling booking ${booking.id} failed:`, error);
    return { ok: false, error: "The booking couldn't be moved due to a technical problem." };
  }
  const result = data as { ok: true; from: string; to: string } | { ok: false; reason: string };
  if (!result.ok) {
    if (result.reason === "slot_taken") return { ok: false, error: "That slot was just taken — please pick another time." };
    return { ok: false, error: "That booking isn't active any more." };
  }
  // Postgres returns its own timestamp format; normalise to ISO.
  return { ok: true, from: new Date(result.from).toISOString(), to: new Date(result.to).toISOString() };
}

// Gives a booking to a different staff member at the same time, e.g. one
// made before the business added staff. They must be working and free then;
// reschedule_booking() re-checks capacity under the calendar lock.
export async function assignStaff(
  client: SupabaseClient,
  a: Actor & { tenantId: string; bookingId: string; staffId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: booking } = await client
    .from("bookings")
    .select("id, service_id, staff_id, starts_at, status")
    .eq("id", a.bookingId)
    .eq("tenant_id", a.tenantId)
    .maybeSingle();
  if (!booking || !ACTIVE_STATUSES.includes(booking.status)) return { ok: false, error: "That booking isn't active any more." };
  if (booking.staff_id === a.staffId) return { ok: true };

  const date = localDateISO(new Date(booking.starts_at));
  const time = formatLocalTime(booking.starts_at);
  const availability = await getAvailability(client, a.tenantId, {
    serviceId: booking.service_id,
    staffId: a.staffId,
    fromDate: date,
    toDate: date,
    excludeBookingId: booking.id,
    forTeam: true,
  });
  const slot = availability?.days[0]?.slots.find((s) => s.time === time);
  if (!slot?.staffIds.includes(a.staffId)) {
    return {
      ok: false,
      error: "They aren't free then: check their hours, time off, other bookings and the services they offer.",
    };
  }

  const { data, error } = await client.rpc("reschedule_booking", {
    p_tenant_id: a.tenantId,
    p_booking_id: booking.id,
    p_staff_id: a.staffId,
    p_starts_at: booking.starts_at,
    p_actor: a.actor,
    p_channel: a.channel,
    p_created_by: a.createdBy ?? null,
  });
  if (error) {
    console.error(`Assigning booking ${booking.id} failed:`, error);
    return { ok: false, error: "The booking couldn't be reassigned due to a technical problem." };
  }
  const result = data as { ok: boolean; reason?: string };
  if (!result.ok) {
    return { ok: false, error: result.reason === "slot_taken" ? "They were just booked at that time." : "That booking isn't active any more." };
  }
  return { ok: true };
}

// The owner's answer to a booking waiting for approval. Declining cancels
// it, freeing the slot. Only acts on a booking that's still pending.
export async function decidePendingBooking(
  client: SupabaseClient,
  d: Actor & { tenantId: string; bookingId: string; approve: boolean; reason?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("bookings")
    .update({ status: d.approve ? "confirmed" : "cancelled", updated_at: new Date().toISOString() })
    .eq("id", d.bookingId)
    .eq("tenant_id", d.tenantId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error(`Deciding on booking ${d.bookingId} failed:`, error);
    return { ok: false, error: "The booking couldn't be updated due to a technical problem." };
  }
  if (!data) return { ok: false, error: "That booking isn't waiting for approval any more." };

  await logBookingEvent(client, {
    ...d,
    type: d.approve ? "approved" : "declined",
    details: !d.approve && d.reason ? { reason: d.reason } : {},
  });
  return { ok: true };
}
