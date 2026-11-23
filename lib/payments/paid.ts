import type { SupabaseClient } from "@supabase/supabase-js";
import { emailCustomerAboutBooking } from "@/lib/email/customer-booking";
import { emailCustomerAboutSignup } from "@/lib/email/event-signup";

// What a payment was for, and the email held back until it was paid.
export type PaidFor = { bookingId: string | null; signupId: string | null };

export async function paidForOf(admin: SupabaseClient, tenantId: string, paymentId: string): Promise<PaidFor> {
  const { data } = await admin.from("payments").select("booking_id, event_signup_id").eq("tenant_id", tenantId).eq("id", paymentId).maybeSingle();
  return { bookingId: data?.booking_id ?? null, signupId: data?.event_signup_id ?? null };
}

export async function sendPaidConfirmation(admin: SupabaseClient, tenantId: string, paid: PaidFor): Promise<void> {
  if (paid.bookingId) await emailCustomerAboutBooking(admin, tenantId, paid.bookingId, "confirmed");
  if (paid.signupId) await emailCustomerAboutSignup(admin, tenantId, paid.signupId);
}
