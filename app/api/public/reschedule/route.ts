import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { rescheduleBooking } from "@/lib/bookings/manage";
import { loadBookingFromToken } from "@/lib/bookings/manage-link";
import { emailCustomerAboutBooking } from "@/lib/email/customer-booking";
import { notifyOwnerOfBookingChange } from "@/lib/email/notify-booking-change";
import { checkWidgetBookingLimit } from "@/lib/security/rate-limit";
import { formatLocalDateTime } from "@/lib/time";
import { clientIp } from "@/lib/widgets/public-request";

const bodySchema = z.object({
  token: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

// A customer moves their booking from the link in their booking email. The
// signed token is the credential (no cookies, so no cross-site forgery);
// the same rules as moving it in chat apply: an upcoming active booking,
// outside the business's change cutoff, to a genuinely free time with the
// usual notice and booking horizon.
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { token, date, time } = parsed.data;

  const booking = await loadBookingFromToken(token);
  if (!booking) return NextResponse.json({ error: "This link has expired or isn't valid." }, { status: 404 });
  if (!(await checkWidgetBookingLimit(clientIp(request), booking.tenantId))) {
    return NextResponse.json({ error: "Too many changes from here. Please try again later." }, { status: 429 });
  }
  if (!booking.active) return NextResponse.json({ error: "This booking can't be changed any more." }, { status: 409 });
  if (booking.tooLate) {
    return NextResponse.json(
      { error: `It's too close to your appointment to change it online. Please contact ${booking.businessName}.` },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  const moved = await rescheduleBooking(admin, {
    tenantId: booking.tenantId,
    bookingId: booking.id,
    date,
    time,
    actor: "customer",
    channel: "web",
  });
  if (!moved.ok) {
    return NextResponse.json({ error: "Sorry, that time isn't free. Please pick another.", reason: "slot_taken" }, { status: 409 });
  }

  const { data: after } = await admin
    .from("bookings")
    .select("starts_at, ends_at")
    .eq("tenant_id", booking.tenantId)
    .eq("id", booking.id)
    .single();
  // Tell the owner and the customer after responding.
  waitUntil(
    Promise.all([
      notifyOwnerOfBookingChange(
        admin,
        booking.tenantId,
        booking.businessName,
        {
          kind: "rescheduled",
          customer: booking.name,
          serviceName: booking.serviceName,
          from: formatLocalDateTime(moved.from),
          to: formatLocalDateTime(moved.to),
        },
        null,
        "email_link",
      ),
      // Still awaiting approval: it stays a request, at its new time.
      emailCustomerAboutBooking(admin, booking.tenantId, booking.id, booking.status === "pending" ? "requested" : "rescheduled"),
    ]),
  );
  return NextResponse.json({ ok: true, startsAt: after?.starts_at ?? moved.to, endsAt: after?.ends_at ?? moved.to });
}
