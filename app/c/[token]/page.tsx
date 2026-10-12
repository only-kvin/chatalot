import type { Metadata } from "next";
import { STATUS_LABEL, type BookingStatus } from "@/lib/bookings/labels";
import { loadCustomerPage } from "@/lib/contacts/customer-page";
import { formatBookingWhen } from "@/lib/bookings/when";
import { ConsentSwitches } from "./consent-switches";
import { PublicCard, PublicShell } from "@/components/public/public-shell";

// Personal links: keep them out of search engines and referrer headers.
export const metadata: Metadata = {
  title: "Your page",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Row = {
  id: string;
  startsAt: string;
  windowEnd: string | null;
  status: string;
  serviceName: string;
  staffName: string | null;
  placeLines: [string, string | null][];
  manageUrl: string | null;
};

function BookingList({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y rounded-xl border bg-background/50">
      {rows.map((b) => (
        <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="font-medium">{b.serviceName}</p>
            <p className="text-muted-foreground">
              {formatBookingWhen(b.startsAt, b.windowEnd)}
              {b.staffName && ` · with ${b.staffName}`}
              {" · "}
              {STATUS_LABEL[b.status as BookingStatus] ?? b.status}
            </p>
            {b.placeLines
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <p key={label} className="text-muted-foreground">
                  {label}: {value}
                </p>
              ))}
          </div>
          {b.manageUrl && (
            <a href={b.manageUrl} className="rounded-full border bg-card px-4 py-2 font-medium hover:bg-muted">
              Change or cancel
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function CustomerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await loadCustomerPage(token);

  return (
    <PublicShell>
      <PublicCard className="gap-6">
        {!page ? (
          <>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Link not valid</h1>
            <p className="text-muted-foreground">
              This link has expired or isn&apos;t valid. Sign up again on the business&apos;s website for a fresh one.
            </p>
          </>
        ) : (
          <>
            <div>
              <p className="text-muted-foreground">{page.businessName}</p>
              <h1 className="font-heading text-2xl font-bold tracking-tight">{page.name ? `Hi ${page.name}` : "Your page"}</h1>
              <p className="text-muted-foreground">Bookings made with {page.email}</p>
            </div>

            <section className="flex flex-col gap-2">
              <h2 className="font-semibold">Coming up</h2>
              <BookingList rows={page.upcoming} empty="No upcoming bookings." />
              {page.bookingUrl && (
                <a href={page.bookingUrl} className="self-start rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:bg-[color-mix(in_oklch,var(--primary),black_16%)]">
                  {page.bookLinkLabel}
                </a>
              )}
            </section>

            {page.past.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="font-semibold">Recent</h2>
                <BookingList rows={page.past} empty="" />
              </section>
            )}

            <section className="flex flex-col gap-2">
              <h2 className="font-semibold">What {page.businessName} may send you</h2>
              <p className="text-muted-foreground">Booking confirmations and reminders always come. These are up to you:</p>
              {page.hasRecord ? (
                <ConsentSwitches token={token} initial={page.consents} />
              ) : (
                <p className="text-muted-foreground">Sign up on the business&apos;s website to choose.</p>
              )}
            </section>

            {page.cancellationPolicy && <p className="text-muted-foreground">Cancellation policy: {page.cancellationPolicy}</p>}

            {page.contact && (
              <p className="text-xs text-muted-foreground">
                Questions? Contact {page.businessName} on {page.contact}.
              </p>
            )}
          </>
        )}
      </PublicCard>
    </PublicShell>
  );
}
