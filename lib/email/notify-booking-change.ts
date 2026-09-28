import type { SupabaseClient } from "@supabase/supabase-js";
import { notificationPath, recordNotification } from "@/lib/notifications";
import { sendOwnerEmail } from "./send";

// A customer cancelled or moved a booking through the AI.
export async function notifyOwnerOfBookingChange(
  admin: SupabaseClient,
  tenantId: string,
  businessName: string,
  change:
    | { kind: "cancelled"; customer: string; booking: string; reason: string | null }
    | { kind: "rescheduled"; customer: string; serviceName: string; from: string; to: string },
  conversationId?: string | null,
): Promise<void> {
  const type = change.kind === "cancelled" ? "booking_cancelled" : "booking_rescheduled";
  const title =
    change.kind === "cancelled" ? `Booking cancelled: ${change.customer}` : `Booking moved: ${change.customer}`;
  const body =
    change.kind === "cancelled"
      ? `${change.booking}${change.reason ? ` · "${change.reason}"` : ""}`
      : `${change.serviceName}: ${change.from} → ${change.to}`;

  await recordNotification(admin, { tenantId, type, title, body, conversationId });

  await sendOwnerEmail(admin, tenantId, {
    subject: `${title} (${businessName})`,
    intro:
      change.kind === "cancelled"
        ? "A customer cancelled their booking through your AI receptionist. The slot is free again."
        : "A customer moved their booking through your AI receptionist.",
    details:
      change.kind === "cancelled"
        ? [
            ["Customer", change.customer],
            ["Booking", change.booking],
            ["Reason", change.reason],
          ]
        : [
            ["Customer", change.customer],
            ["Service", change.serviceName],
            ["Was", change.from],
            ["Now", change.to],
          ],
    path: notificationPath(type, conversationId),
  });
}
