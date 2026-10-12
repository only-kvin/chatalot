import type { SupabaseClient } from "@supabase/supabase-js";
import { formatBookingWhen } from "@/lib/bookings/when";
import { addressText, BOOKING_PLACE_COLUMNS, type BookingPlace } from "@/lib/bookings/place";
import { sendStaffEmail, type OwnerEmail } from "./send";

// Emails the staff member a booking is with when it's made, moved, cancelled
// or handed to them, if they have an email and alerts switched on. Bookings
// still waiting for approval aren't sent: they hear once it's approved.
// Best-effort: never blocks the booking change that triggered it.

export type StaffAlertKind = "new" | "approved" | "rescheduled" | "cancelled" | "assigned" | "unassigned";

const HEADLINE: Record<StaffAlertKind, string> = {
  new: "New booking",
  approved: "New booking",
  rescheduled: "Booking moved",
  cancelled: "Booking cancelled",
  assigned: "Booking given to you",
  unassigned: "Booking given to someone else",
};

const INTRO: Record<StaffAlertKind, string> = {
  new: "You have a new booking.",
  approved: "A booking with you has been approved.",
  rescheduled: "One of your bookings has moved to a new time.",
  cancelled: "One of your bookings has been cancelled.",
  assigned: "A booking has been given to you.",
  unassigned: "A booking you had has been given to someone else, so it's off your schedule.",
};

type StaffRow = { id: string; name: string; email: string | null; notify_email: boolean; active: boolean };

// Pure, so it can be tested without sending.
export function renderStaffAlert(
  kind: StaffAlertKind,
  b: { customer: string; serviceName: string; when: string; address: string | null; businessName: string },
): OwnerEmail {
  return {
    subject: `${HEADLINE[kind]}: ${b.serviceName}, ${b.when}${b.businessName ? ` (${b.businessName})` : ""}`,
    intro: INTRO[kind],
    details: [
      ["Service", b.serviceName],
      ["When", b.when],
      ["Customer", b.customer],
      ["Address", b.address],
    ],
    path: "/schedule",
    footer: "You get these because you take bookings here. Ask the business owner to turn them off.",
  };
}

// Who a booking is with right now; read before a move, which can hand the
// booking to someone else when its person isn't free at the new time.
export async function bookingStaffId(admin: SupabaseClient, tenantId: string, bookingId: string): Promise<string | null> {
  const { data } = await admin.from("bookings").select("staff_id").eq("tenant_id", tenantId).eq("id", bookingId).maybeSingle();
  return data?.staff_id ?? null;
}

// After a move (or a hand-over): the same person hears it moved; if it
// changed hands, the previous person hears it's gone and the new one gets it
// as new (or as "given to you" for a hand-over at the same time).
export async function notifyStaffAfterChange(
  admin: SupabaseClient,
  tenantId: string,
  bookingId: string,
  previousStaffId: string | null,
  change: "rescheduled" | "assigned",
): Promise<void> {
  const current = await bookingStaffId(admin, tenantId, bookingId);
  if (current === previousStaffId) {
    if (change === "rescheduled") await notifyStaffAboutBooking(admin, tenantId, bookingId, "rescheduled");
    return;
  }
  await Promise.all([
    previousStaffId ? notifyStaffAboutBooking(admin, tenantId, bookingId, "unassigned", previousStaffId) : null,
    notifyStaffAboutBooking(admin, tenantId, bookingId, change === "assigned" ? "assigned" : "new"),
  ]);
}

export async function notifyStaffAboutBooking(
  admin: SupabaseClient,
  tenantId: string,
  bookingId: string,
  kind: StaffAlertKind,
  // For "unassigned": who it was taken from (the booking now has someone else).
  staffIdOverride?: string | null,
): Promise<void> {
  try {
    const { data: booking } = await admin
      .from("bookings")
      .select(`id, name, starts_at, status, staff_id, ${BOOKING_PLACE_COLUMNS}, services(name)`)
      .eq("tenant_id", tenantId)
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return;
    const staffId = staffIdOverride ?? booking.staff_id;
    if (!staffId) return;
    if (kind !== "cancelled" && kind !== "unassigned" && booking.status !== "confirmed") return;

    const [{ data: person }, { data: config }] = await Promise.all([
      admin
        .from("staff")
        .select("id, name, email, notify_email, active")
        .eq("tenant_id", tenantId)
        .eq("id", staffId)
        .maybeSingle<StaffRow>(),
      admin.from("agent_configs").select("business_name").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    if (!person?.email || !person.notify_email || !person.active) return;

    const place = booking as unknown as BookingPlace;
    await sendStaffEmail(
      person.email,
      renderStaffAlert(kind, {
        customer: booking.name,
        serviceName: (booking.services as unknown as { name: string } | null)?.name ?? "Appointment",
        when: formatBookingWhen(booking.starts_at, place.arrival_window_end),
        address: addressText(place),
        businessName: config?.business_name ?? "",
      }),
    );
  } catch (err) {
    console.error(`Staff alert (${kind}) for booking ${bookingId} failed:`, err);
  }
}
