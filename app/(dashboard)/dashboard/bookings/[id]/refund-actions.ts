"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/auth";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createClient } from "@/lib/db/supabase-server";

// "Mark as refunded": the business refunded the customer in its own PayFast
// account (we never hold the money, so we can't refund it ourselves) and
// records that here. Owner only, like everything about money. Written with
// the service role, since members can't change payments.

type Result = { error: string | null };

export async function markRefundedAction(bookingId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(bookingId).success) return { error: "Invalid request." };
  const [user, tenantId] = await Promise.all([getSessionUser(), getCurrentTenantId()]);
  if (!user || !tenantId) return { error: "Not authorized." };
  const { data: member } = await (await createClient())
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (member?.role !== "owner") return { error: "Only the business owner can record a refund." };

  const admin = createAdminClient();
  const now = new Date().toISOString();
  // The booking first, and only while it's paid: a second click (or a second
  // tab) finds nothing to change and records nothing twice.
  const { data: booking, error } = await admin
    .from("bookings")
    .update({ payment_status: "refunded", updated_at: now })
    .eq("tenant_id", tenantId)
    .eq("id", bookingId)
    .eq("payment_status", "paid")
    .select("id, amount_due_cents")
    .maybeSingle();
  if (error) {
    console.error(`Recording a refund for booking ${bookingId} failed:`, error);
    return { error: "Couldn't record the refund. Please try again." };
  }
  if (!booking) return { error: "This booking isn't marked as paid, so there's nothing to refund." };

  const [payments, history] = await Promise.all([
    admin
      .from("payments")
      .update({ status: "refunded", updated_at: now })
      .eq("tenant_id", tenantId)
      .eq("booking_id", bookingId)
      .eq("status", "paid"),
    admin.from("booking_events").insert({
      tenant_id: tenantId,
      booking_id: bookingId,
      type: "payment_refunded",
      actor: "team",
      channel: "dashboard",
      created_by: user.id,
      details: { amount_cents: booking.amount_due_cents },
    }),
  ]);
  if (payments.error || history.error) {
    console.error(`Recording a refund for booking ${bookingId}: payment or history update failed:`, payments.error ?? history.error);
  }

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath("/dashboard/bookings");
  return { error: null };
}
