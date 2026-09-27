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
  },
  conversationId?: string | null,
): Promise<void> {
  await recordNotification(admin, {
    tenantId,
    type: "new_booking",
    title: `New booking: ${booking.name}`,
    body: `${booking.serviceName} · ${booking.startsAtLabel}`,
    conversationId,
  });

  await sendOwnerEmail(admin, tenantId, {
    subject: `New booking: ${booking.name} (${businessName})`,
    intro: "Your AI receptionist just booked an appointment.",
    details: [
      ["Service", booking.serviceName],
      ["When", booking.startsAtLabel],
      ["Name", booking.name],
      ["Phone", booking.phone],
      ["Email", booking.email],
    ],
    path: notificationPath("new_booking", conversationId),
  });
}
