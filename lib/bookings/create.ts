import type { SupabaseClient } from "@supabase/supabase-js";
import { localToUtcDate } from "@/lib/time";
import { getAvailability } from "./availability";
import { bookingRef, type BookingActor, type BookingEventChannel } from "./manage";

// Making a booking — the one way in for the AI, the booking widgets and the
// dashboard. The slot is re-checked against the live calendar here (what the
// customer saw may be stale), then create_booking() in the database books it
// under a lock, together with its lead and history entry, or reports the
// slot taken.

export type BookingSource = "web" | "whatsapp" | "team" | "widget";

export type CreateBookingInput = {
  tenantId: string;
  serviceId: string;
  // SA date and "HH:MM".
  date: string;
  time: string;
  // A specific staff member; omitted = whoever is free (least busy that day).
  staffId?: string | null;
  customer: { name: string; phone: string; email: string | null; contactId: string | null };
  conversationId: string | null;
  source: BookingSource;
  notes?: string;
  // Answers to the business's custom form fields.
  details?: Record<string, unknown>;
  // Same key twice = the same booking, not two.
  idempotencyKey?: string;
  // File a "booked" lead with the booking.
  lead: { source: string; summary: string } | null;
  actor: BookingActor;
  channel: BookingEventChannel;
  createdBy?: string | null;
  forTeam?: boolean;
  now?: Date;
};

export type CreatedBooking = {
  ok: true;
  bookingId: string;
  ref: string;
  serviceName: string;
  staffId: string | null;
  startsAt: string;
  // An earlier request with the same idempotency key made it.
  repeat: boolean;
};

export type BookingFailure = {
  ok: false;
  // unavailable: not a bookable time (closed, too soon, nobody free).
  // slot_taken: it was free a moment ago, someone else just took it.
  reason: "unavailable" | "slot_taken" | "unknown_service" | "unknown_staff" | "failed";
};

type RpcResult = { ok: true; booking_id: string; repeat: boolean } | { ok: false; reason: string };

async function findByIdempotencyKey(admin: SupabaseClient, tenantId: string, key: string) {
  const { data } = await admin
    .from("bookings")
    .select("id, staff_id, starts_at, services(name)")
    .eq("tenant_id", tenantId)
    .eq("idempotency_key", key)
    .maybeSingle();
  return data;
}

export async function createBooking(
  client: SupabaseClient,
  input: CreateBookingInput,
): Promise<CreatedBooking | BookingFailure> {
  // A retried submit: answer with the booking it already made, even though
  // its slot no longer shows as free.
  if (input.idempotencyKey) {
    const existing = await findByIdempotencyKey(client, input.tenantId, input.idempotencyKey);
    if (existing) {
      return {
        ok: true,
        bookingId: existing.id,
        ref: bookingRef(existing.id),
        serviceName: (existing.services as unknown as { name: string } | null)?.name ?? "Booking",
        staffId: existing.staff_id,
        startsAt: existing.starts_at,
        repeat: true,
      };
    }
  }

  const availability = await getAvailability(client, input.tenantId, {
    serviceId: input.serviceId,
    staffId: input.staffId,
    fromDate: input.date,
    toDate: input.date,
    forTeam: input.forTeam,
    now: input.now,
  });
  if (!availability) return { ok: false, reason: "unknown_service" };
  const slot = availability.days[0]?.slots.find((s) => s.time === input.time);
  if (!slot || slot.staffIds.length === 0) return { ok: false, reason: "unavailable" };

  const startsAt = localToUtcDate(input.date, input.time).toISOString();
  // With "anyone", try each free person in turn: if the first was just
  // taken, the next may still be free.
  let lastReason: BookingFailure["reason"] = "slot_taken";
  for (const staffId of slot.staffIds) {
    const { data, error } = await client.rpc("create_booking", {
      p_tenant_id: input.tenantId,
      p_service_id: input.serviceId,
      p_staff_id: staffId,
      p_starts_at: startsAt,
      p_name: input.customer.name,
      p_phone: input.customer.phone,
      p_email: input.customer.email,
      p_contact_id: input.customer.contactId,
      p_conversation_id: input.conversationId,
      p_source: input.source,
      p_notes: input.notes ?? "",
      p_details: input.details ?? {},
      p_idempotency_key: input.idempotencyKey ?? null,
      p_lead_source: input.lead?.source ?? null,
      p_lead_summary: input.lead?.summary ?? null,
      p_actor: input.actor,
      p_channel: input.channel,
      p_created_by: input.createdBy ?? null,
    });
    if (error) {
      console.error(`Creating a booking for tenant ${input.tenantId} failed:`, error);
      return { ok: false, reason: "failed" };
    }
    const result = data as RpcResult;
    if (result.ok) {
      return {
        ok: true,
        bookingId: result.booking_id,
        ref: bookingRef(result.booking_id),
        serviceName: availability.service.name,
        staffId,
        startsAt,
        repeat: result.repeat,
      };
    }
    lastReason = result.reason as BookingFailure["reason"];
    if (lastReason !== "slot_taken") break;
  }
  return { ok: false, reason: lastReason };
}
