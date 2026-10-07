"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { cancelBooking, describeBooking } from "@/lib/bookings/manage";
import { emailCustomerAboutBooking } from "@/lib/email/customer-booking";
import { notifyOwnerOfBookingChange } from "@/lib/email/notify-booking-change";
import { loadBookingFromToken } from "@/lib/bookings/manage-link";

// The customer cancels from the link in their booking email. Same rules as
// cancelling in chat: only an upcoming booking, and not inside the
// business's minimum notice.
export async function cancelByTokenAction(token: string): Promise<{ error: string | null }> {
  const booking = await loadBookingFromToken(token);
  if (!booking) return { error: "This link has expired or isn't valid." };
  if (!booking.active) return { error: "This booking can't be changed any more." };
  if (booking.tooLate) {
    return { error: `It's too close to your appointment to cancel online. Please contact ${booking.businessName}.` };
  }

  const admin = createAdminClient();
  const result = await cancelBooking(admin, {
    tenantId: booking.tenantId,
    bookingId: booking.id,
    actor: "customer",
    channel: "web",
  });
  if (!result.ok) return { error: result.error };

  await Promise.all([
    notifyOwnerOfBookingChange(
      admin,
      booking.tenantId,
      booking.businessName,
      {
        kind: "cancelled",
        customer: booking.name,
        booking: describeBooking({ serviceName: booking.serviceName, startsAt: booking.startsAt }),
        reason: null,
      },
      null,
      "email_link",
    ),
    emailCustomerAboutBooking(admin, booking.tenantId, booking.id, "cancelled"),
  ]);
  revalidatePath(`/b/${token}`);
  return { error: null };
}
