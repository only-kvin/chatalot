import type { Metadata } from "next";
import { Fragment } from "react";
import { bookingRef } from "@/lib/bookings/manage";
import { STATUS_LABEL, statusVariant, type BookingStatus } from "@/lib/bookings/labels";
import { formatBookingWhen } from "@/lib/bookings/when";
import { loadBookingFromToken } from "@/lib/bookings/manage-link";
import { CancelBooking } from "./cancel-booking";
import { ChangeTime } from "./change-time";
import { PublicCard, PublicShell } from "@/components/public/public-shell";
import { Badge } from "@/components/ui/badge";

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
    <PublicShell>
      <PublicCard>
        {!booking ? (
          <>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Link not valid</h1>
            <p className="text-muted-foreground">
              This link has expired or isn&apos;t valid. Please contact the business you booked with.
            </p>
          </>
        ) : (
          <>
            <div>
              <p className="text-muted-foreground">{booking.businessName}</p>
              <h1 className="font-heading text-2xl font-bold tracking-tight">{booking.serviceName}</h1>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y py-4">
              <dt className="text-muted-foreground">When</dt>
              <dd>{formatBookingWhen(booking.startsAt, booking.windowEnd)}</dd>
              {booking.staffName && (
                <>
                  <dt className="text-muted-foreground">With</dt>
                  <dd>{booking.staffName}</dd>
                </>
              )}
              {booking.placeLines
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <Fragment key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd>{value}</dd>
                  </Fragment>
                ))}
              <dt className="text-muted-foreground">Name</dt>
              <dd>{booking.name}</dd>
              <dt className="text-muted-foreground">Reference</dt>
              <dd>{bookingRef(booking.id)}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <Badge variant={statusVariant(booking.status)}>{STATUS_LABEL[booking.status as BookingStatus] ?? booking.status}</Badge>
              </dd>
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
              <p className="text-muted-foreground">
                It&apos;s too close to your appointment to change or cancel it online.
                {booking.contact && ` Please contact ${booking.businessName} on ${booking.contact}.`}
              </p>
            )}
            {booking.active && booking.contact && !booking.tooLate && (
              <p className="text-xs text-muted-foreground">
                Questions? Contact {booking.businessName} on {booking.contact}.
              </p>
            )}
          </>
        )}
      </PublicCard>
    </PublicShell>
  );
}
