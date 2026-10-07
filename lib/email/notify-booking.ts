import type { SupabaseClient } from "@supabase/supabase-js";
import { notificationPath, recordNotification } from "@/lib/notifications";
import { sendOwnerEmail } from "./send";

export async function notifyOwnerOfBooking(
  admin: SupabaseClient,
  tenantId: string,
  businessName: string,
  booking: {
    name: string;
    phone: string;
    email: string | null;
    serviceName: string;
    startsAtLabel: string;
    staffName?: string | null;
    // Made through a booking widget rather than by the AI in chat.
    viaWidget?: boolean;
    // Waiting for the owner to approve it.
    pending?: boolean;
    // Opens this booking rather than the chat it came from.
    bookingId?: string;
  },
  conversationId?: string | null,
): Promise<void> {
  const type = booking.pending ? "approval_needed" : "new_booking";
  await recordNotification(admin, {
    tenantId,
    type,
    title: `${booking.pending ? "Booking to approve" : "New booking"}: ${booking.name}`,
    body: `${booking.serviceName} · ${booking.startsAtLabel}`,
    conversationId,
  });

  const made = booking.viaWidget
    ? "A customer just booked on your website."
    : "Your AI receptionist just booked an appointment.";
  await sendOwnerEmail(admin, tenantId, {
    subject: `${booking.pending ? "Booking to approve" : "New booking"}: ${booking.name} (${businessName})`,
    intro: booking.pending
      ? `${made} It's waiting for you to approve or decline it; the time is held until then.`
      : made,
    details: [
      ["Service", booking.serviceName],
      ["When", booking.startsAtLabel],
      ["With", booking.staffName ?? null],
      ["Name", booking.name],
      ["Phone", booking.phone],
      ["Email", booking.email],
    ],
    path: booking.bookingId ? `/dashboard/bookings/${booking.bookingId}` : notificationPath(type, conversationId),
  });
}
