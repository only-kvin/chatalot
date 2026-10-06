import type { SupabaseClient } from "@supabase/supabase-js";
import { notificationPath, recordNotification } from "@/lib/notifications";
import { sendOwnerEmail } from "./send";

// A customer answered a review request with a low score — worth a call while
// the visit is still fresh.
export async function notifyOwnerOfLowRating(
  admin: SupabaseClient,
  tenantId: string,
  businessName: string,
  r: { customer: string; rating: number; booking: string; phone: string },
  conversationId?: string | null,
): Promise<void> {
  const title = `${r.customer} rated their visit ${r.rating}/5`;

  await recordNotification(admin, {
    tenantId,
    type: "low_rating",
    title,
    body: `${r.booking}. Call them on ${r.phone}.`,
    conversationId,
  });

  await sendOwnerEmail(admin, tenantId, {
    subject: `${title} (${businessName})`,
    intro: "A customer gave a low score when asked how their visit went. A quick call now can often turn it around.",
    details: [
      ["Customer", r.customer],
      ["Rating", `${r.rating} out of 5`],
      ["Booking", r.booking],
      ["Phone", r.phone],
    ],
    path: notificationPath("low_rating", conversationId),
  });
}
