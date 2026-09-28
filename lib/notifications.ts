import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationType =
  | "human_requested"
  | "new_lead"
  | "new_booking"
  | "booking_cancelled"
  | "booking_rescheduled";

// Where an alert takes the owner — shared by the dashboard bell and the emails.
export function notificationPath(type: NotificationType, conversationId?: string | null): string {
  if (conversationId) return `/dashboard/conversations/${conversationId}`;
  return type === "new_lead" || type === "human_requested" ? "/dashboard/leads" : "/dashboard/bookings";
}

// Records an in-app alert for the tenant's dashboard bell. Written by the
// service-role backend next to each owner email. Best-effort, like the email:
// a failed insert is logged and never blocks the action that triggered it.
export async function recordNotification(
  admin: SupabaseClient,
  n: {
    tenantId: string;
    type: NotificationType;
    title: string;
    body: string;
    conversationId?: string | null;
  },
): Promise<void> {
  const { error } = await admin.from("notifications").insert({
    tenant_id: n.tenantId,
    type: n.type,
    title: n.title,
    body: n.body,
    conversation_id: n.conversationId ?? null,
  });
  if (error) console.error(`Recording ${n.type} notification for ${n.tenantId} failed:`, error);
}
