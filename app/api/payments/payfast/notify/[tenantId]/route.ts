import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { emailCustomerAboutBooking } from "@/lib/email/customer-booking";
import { handlePayfastNotification } from "@/lib/payments/notify";

// PayFast's server-to-server payment notification (ITN) for one business.
// The notify_url we give PayFast with each checkout points here. All the
// checks are in lib/payments/notify.ts.

// Notifications are a few hundred bytes; anything big isn't PayFast.
const MAX_BODY = 16_384;

// On Vercel the first X-Forwarded-For entry is the real client: Vercel
// overwrites the header, so the sender can't fake it.
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip");
}

export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return new Response("Too large", { status: 413 });
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY) return new Response("Too large", { status: 413 });

  const admin = createAdminClient();
  const outcome = await handlePayfastNotification(admin, tenantId, rawBody, clientIp(request));
  if (outcome.status !== 200) console.warn(`PayFast notification for ${tenantId}: ${outcome.detail}`);

  // The customer's "you're booked" email was held back until they paid.
  if (outcome.paidBookingId) {
    waitUntil(
      emailCustomerAboutBooking(admin, tenantId, outcome.paidBookingId, "confirmed").catch((err) =>
        console.error(`Payments: confirmation email for booking ${outcome.paidBookingId} failed:`, err),
      ),
    );
  }
  return new Response(outcome.status === 200 ? "OK" : "Not processed", { status: outcome.status });
}
