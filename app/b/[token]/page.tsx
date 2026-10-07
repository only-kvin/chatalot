import type { Metadata } from "next";
import { bookingRef } from "@/lib/bookings/manage";
import { STATUS_LABEL, type BookingStatus } from "@/lib/bookings/labels";
import { formatLocalDateTime } from "@/lib/time";
import { loadBookingFromToken } from "./load";
import { CancelBooking } from "./cancel-booking";

// Personal links: keep them out of search engines and referrer headers.
export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ManageBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await loadBookingFromToken(token);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="mx-auto flex max-w-md flex-col gap-4 rounded-2xl border bg-white p-6 text-sm dark:bg-zinc-950">
        {!booking ? (
          <>
            <h1 className="text-xl font-semibold">Link not valid</h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              This link has expired or isn&apos;t valid. Please contact the business you booked with.
            </p>
          </>
        ) : (
          <>
            <div>
              <p className="text-zinc-500">{booking.businessName}</p>
              <h1 className="text-xl font-semibold">{booking.serviceName}</h1>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-zinc-500">When</dt>
              <dd>{formatLocalDateTime(booking.startsAt)}</dd>
              {booking.staffName && (
                <>
                  <dt className="text-zinc-500">With</dt>
                  <dd>{booking.staffName}</dd>
                </>
              )}
              <dt className="text-zinc-500">Name</dt>
              <dd>{booking.name}</dd>
              <dt className="text-zinc-500">Reference</dt>
              <dd>{bookingRef(booking.id)}</dd>
              <dt className="text-zinc-500">Status</dt>
              <dd>{STATUS_LABEL[booking.status as BookingStatus] ?? booking.status}</dd>
            </dl>
            {booking.active && !booking.tooLate && <CancelBooking token={token} />}
            {booking.tooLate && (
              <p className="text-zinc-600 dark:text-zinc-400">
                It&apos;s too close to your appointment to cancel online.
                {booking.contact && ` Please contact ${booking.businessName} on ${booking.contact}.`}
              </p>
            )}
            {booking.active && booking.contact && !booking.tooLate && (
              <p className="text-xs text-zinc-500">
                Need a different time? Contact {booking.businessName} on {booking.contact}.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
