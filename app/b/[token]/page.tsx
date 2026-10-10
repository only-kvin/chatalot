import type { Metadata } from "next";
import { Fragment } from "react";
import { bookingRef } from "@/lib/bookings/manage";
import { STATUS_LABEL, type BookingStatus } from "@/lib/bookings/labels";
import { formatBookingWhen } from "@/lib/bookings/when";
import { loadBookingFromToken } from "@/lib/bookings/manage-link";
import { CancelBooking } from "./cancel-booking";
import { ChangeTime } from "./change-time";

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
      <div className="mx-auto flex max-w-lg flex-col gap-4 rounded-2xl border bg-white p-6 text-sm dark:bg-zinc-950">
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
              <dd>{formatBookingWhen(booking.startsAt, booking.windowEnd)}</dd>
              {booking.staffName && (
                <>
                  <dt className="text-zinc-500">With</dt>
                  <dd>{booking.staffName}</dd>
                </>
              )}
              {booking.placeLines
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <Fragment key={label}>
                    <dt className="text-zinc-500">{label}</dt>
                    <dd>{value}</dd>
                  </Fragment>
                ))}
              <dt className="text-zinc-500">Name</dt>
              <dd>{booking.name}</dd>
              <dt className="text-zinc-500">Reference</dt>
              <dd>{bookingRef(booking.id)}</dd>
              <dt className="text-zinc-500">Status</dt>
              <dd>{STATUS_LABEL[booking.status as BookingStatus] ?? booking.status}</dd>
            </dl>
            {booking.active && !booking.tooLate && (
              <div className="flex flex-col gap-3">
                {booking.publicKey && (
                  <ChangeTime
                    token={decodeURIComponent(token)}
                    publicKey={booking.publicKey}
                    serviceId={booking.serviceId}
                    startsAt={booking.startsAt}
                    serviceName={booking.serviceName}
                    businessName={booking.businessName}
                  />
                )}
                <CancelBooking token={token} />
              </div>
            )}
            {booking.tooLate && (
              <p className="text-zinc-600 dark:text-zinc-400">
                It&apos;s too close to your appointment to change or cancel it online.
                {booking.contact && ` Please contact ${booking.businessName} on ${booking.contact}.`}
              </p>
            )}
            {booking.active && booking.contact && !booking.tooLate && (
              <p className="text-xs text-zinc-500">
                Questions? Contact {booking.businessName} on {booking.contact}.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
