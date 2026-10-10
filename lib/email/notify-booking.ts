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
    // Call-outs: where, and whether it's outside the listed areas.
    address?: string | null;
    outsideArea?: boolean;
  },
  conversationId?: string | null,
): Promise<void> {
  const type = booking.pending ? "approval_needed" : "new_booking";
  const callout = Boolean(booking.address);
  const kind = callout ? (booking.pending ? "Call-out to approve" : "New call-out") : booking.pending ? "Booking to approve" : "New booking";
  await recordNotification(admin, {
    tenantId,
    type,
    title: `${kind}: ${booking.name}`,
    body: [booking.serviceName, booking.startsAtLabel, booking.address, booking.outsideArea ? "outside your listed areas" : null]
      .filter(Boolean)
      .join(" · "),
    conversationId,
  });

  const made = booking.viaWidget
    ? "A customer just booked on your website."
    : "Your AI receptionist just booked an appointment.";
  await sendOwnerEmail(admin, tenantId, {
    subject: `${kind}: ${booking.name} (${businessName})`,
    intro: [
      made,
      booking.pending ? "It's waiting for you to approve or decline it; the time is held until then." : "",
      booking.outsideArea ? "Their suburb isn't in your listed service areas: check you cover it before approving." : "",
    ]
      .filter(Boolean)
      .join(" "),
    details: [
      ["Service", booking.serviceName],
      ["When", booking.startsAtLabel],
      ["With", booking.staffName ?? null],
      ["Address", booking.address ?? null],
      ["Name", booking.name],
      ["Phone", booking.phone],
      ["Email", booking.email],
    ],
    path: booking.bookingId ? `/dashboard/bookings/${booking.bookingId}` : notificationPath(type, conversationId),
  });
}
