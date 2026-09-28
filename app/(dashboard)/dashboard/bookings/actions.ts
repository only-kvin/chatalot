"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { formatLocalDateTime, getOpenSlots } from "@/lib/agent/availability";
import { cancelBooking, logBookingEvent, rescheduleBooking } from "@/lib/bookings/manage";
import { sendTeamWhatsApp } from "@/lib/channels/team-whatsapp";
import { formatPhone, canonicalPhone } from "@/lib/contacts/phone";
import { isOptedOut } from "@/lib/contacts/consent";

// Team actions on a booking. They use the signed-in user's client, so RLS
// scopes everything to their tenant, and every change is logged under their
// name. Results are returned rather than thrown (Next.js hides thrown
// messages in production).

type Result = { error: string | null; notice?: string };

const uuid = z.string().uuid();
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeText = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

async function session() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { tenantId, supabase, userId: user.id } : null;
}

type Session = NonNullable<Awaited<ReturnType<typeof session>>>;

async function loadBooking(s: Session, bookingId: string) {
  const { data } = await s.supabase
    .from("bookings")
    .select("id, name, phone, starts_at, status, service_id, conversation_id, contact_id, services(name)")
    .eq("id", bookingId)
    .eq("tenant_id", s.tenantId)
    .maybeSingle();
  if (!data) return null;
  return { ...data, serviceName: (data.services as unknown as { name: string } | null)?.name ?? "booking" };
}

function revalidate(bookingId: string) {
  revalidatePath("/dashboard/bookings");
  revalidatePath(`/dashboard/bookings/${bookingId}`);
}

// Tells the customer about a change the team made: on WhatsApp when the
// 24-hour window allows it, otherwise a reminder to contact them directly.
async function tellCustomer(
  s: Session,
  booking: { name: string; phone: string; conversation_id: string | null; contact_id: string | null },
  text: string,
  notify: boolean,
): Promise<string> {
  const contactHint = `Let ${booking.name} know on ${formatPhone(canonicalPhone(booking.phone)) || booking.phone}.`;
  if (!notify) return contactHint;
  if (await isOptedOut(s.supabase, s.tenantId, booking.contact_id)) {
    return `${booking.name} replied STOP to our messages, so they weren't told on WhatsApp. ${contactHint}`;
  }
  if (!booking.conversation_id) return `There's no WhatsApp chat with this customer. ${contactHint}`;

  const sent = await sendTeamWhatsApp(s.supabase, {
    tenantId: s.tenantId,
    conversationId: booking.conversation_id,
    userId: s.userId,
    text,
    takeOver: false,
  });
  if (sent.ok) return `${booking.name} was told on WhatsApp.`;
  if (sent.reason === "not_whatsapp") return `They booked on the website, so they can't be messaged automatically. ${contactHint}`;
  if (sent.reason === "window_closed") {
    return `WhatsApp only allows messages within 24 hours of their last message, so they weren't told. ${contactHint}`;
  }
  return `The WhatsApp message didn't go through. ${contactHint}`;
}

export async function getRescheduleSlotsAction(
  bookingId: string,
  date: string,
): Promise<{ error: string | null; slots: string[] }> {
  const s = await session();
  if (!s) return { error: "Not authorized.", slots: [] };
  if (!uuid.safeParse(bookingId).success || !dateText.safeParse(date).success) {
    return { error: "Pick a valid date.", slots: [] };
  }
  const booking = await loadBooking(s, bookingId);
  if (!booking) return { error: "Booking not found.", slots: [] };

  const open = await getOpenSlots(s.supabase, s.tenantId, booking.service_id, date, booking.id);
  return { error: null, slots: open?.slots ?? [] };
}

export async function cancelBookingAction(input: {
  bookingId: string;
  reason: string;
  notifyCustomer: boolean;
}): Promise<Result> {
  const s = await session();
  if (!s) return { error: "Not authorized." };
  if (!uuid.safeParse(input.bookingId).success) return { error: "Invalid booking." };
  const reason = input.reason.trim().slice(0, 300) || null;

  const booking = await loadBooking(s, input.bookingId);
  if (!booking) return { error: "Booking not found." };

  const result = await cancelBooking(s.supabase, {
    tenantId: s.tenantId,
    bookingId: booking.id,
    reason,
    actor: "team",
    channel: "dashboard",
    createdBy: s.userId,
  });
  if (!result.ok) return { error: result.error };

  const when = formatLocalDateTime(booking.starts_at);
  const notice = await tellCustomer(
    s,
    booking,
    `Hi ${booking.name}, your ${booking.serviceName} on ${when} has been cancelled.${reason ? ` ${reason}` : ""} Reply here if you'd like to rebook.`,
    input.notifyCustomer,
  );
  revalidate(booking.id);
  return { error: null, notice };
}

export async function rescheduleBookingAction(input: {
  bookingId: string;
  date: string;
  time: string;
  notifyCustomer: boolean;
}): Promise<Result> {
  const s = await session();
  if (!s) return { error: "Not authorized." };
  if (
    !uuid.safeParse(input.bookingId).success ||
    !dateText.safeParse(input.date).success ||
    !timeText.safeParse(input.time).success
  ) {
    return { error: "Pick a date and an available time." };
  }

  const booking = await loadBooking(s, input.bookingId);
  if (!booking) return { error: "Booking not found." };

  const moved = await rescheduleBooking(s.supabase, {
    tenantId: s.tenantId,
    bookingId: booking.id,
    date: input.date,
    time: input.time,
    actor: "team",
    channel: "dashboard",
    createdBy: s.userId,
  });
  if (!moved.ok) return { error: moved.error };

  const notice = await tellCustomer(
    s,
    booking,
    `Hi ${booking.name}, your ${booking.serviceName} has been moved from ${formatLocalDateTime(moved.from)} to ${formatLocalDateTime(moved.to)}. Reply here if that doesn't suit you.`,
    input.notifyCustomer,
  );
  revalidate(booking.id);
  return { error: null, notice };
}

const outcomeSchema = z.enum(["completed", "no_show", "confirmed"]);

// Attended / no-show once the appointment has started; "confirmed" undoes
// either. Cancelled bookings can't be reopened here — the slot may be taken.
export async function setBookingOutcomeAction(bookingId: string, outcome: string): Promise<Result> {
  const s = await session();
  if (!s) return { error: "Not authorized." };
  const parsed = outcomeSchema.safeParse(outcome);
  if (!uuid.safeParse(bookingId).success || !parsed.success) return { error: "Invalid request." };

  const booking = await loadBooking(s, bookingId);
  if (!booking) return { error: "Booking not found." };
  if (booking.status === "cancelled") return { error: "Cancelled bookings can't be changed." };
  if (parsed.data !== "confirmed" && new Date(booking.starts_at) > new Date()) {
    return { error: "You can mark attendance once the appointment has started." };
  }
  if (booking.status === parsed.data) return { error: null };

  const { error } = await s.supabase
    .from("bookings")
    .update({ status: parsed.data, updated_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("tenant_id", s.tenantId)
    .neq("status", "cancelled");
  if (error) {
    console.error(`Setting outcome for booking ${booking.id} failed:`, error);
    return { error: "Couldn't update the booking. Please try again." };
  }

  await logBookingEvent(s.supabase, {
    tenantId: s.tenantId,
    bookingId: booking.id,
    type: parsed.data === "completed" ? "attended" : parsed.data === "no_show" ? "no_show" : "reopened",
    actor: "team",
    channel: "dashboard",
    createdBy: s.userId,
  });
  revalidate(booking.id);
  return { error: null };
}
