import type { Metadata } from "next";
import { STATUS_LABEL, type BookingStatus } from "@/lib/bookings/labels";
import { loadCustomerPage } from "@/lib/contacts/customer-page";
import { formatLocalDateTime } from "@/lib/time";
import { ConsentSwitches } from "./consent-switches";

// Personal links: keep them out of search engines and referrer headers.
export const metadata: Metadata = {
  title: "Your page",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Row = { id: string; startsAt: string; status: string; serviceName: string; staffName: string | null; manageUrl: string | null };

function BookingList({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <p className="text-zinc-500">{empty}</p>;
  return (
    <ul className="divide-y rounded-xl border">
      {rows.map((b) => (
        <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="font-medium">{b.serviceName}</p>
            <p className="text-zinc-500">
              {formatLocalDateTime(b.startsAt)}
              {b.staffName && ` · with ${b.staffName}`}
              {" · "}
              {STATUS_LABEL[b.status as BookingStatus] ?? b.status}
            </p>
          </div>
          {b.manageUrl && (
            <a href={b.manageUrl} className="rounded-lg border px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900">
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
    <main className="min-h-screen bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="mx-auto flex max-w-lg flex-col gap-6 rounded-2xl border bg-white p-6 text-sm dark:bg-zinc-950">
        {!page ? (
          <>
            <h1 className="text-xl font-semibold">Link not valid</h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              This link has expired or isn&apos;t valid. Sign up again on the business&apos;s website for a fresh one.
            </p>
          </>
        ) : (
          <>
            <div>
              <p className="text-zinc-500">{page.businessName}</p>
              <h1 className="text-xl font-semibold">{page.name ? `Hi ${page.name}` : "Your page"}</h1>
              <p className="text-zinc-500">Bookings made with {page.email}</p>
            </div>

            <section className="flex flex-col gap-2">
              <h2 className="font-semibold">Coming up</h2>
              <BookingList rows={page.upcoming} empty="No upcoming bookings." />
              {page.bookingUrl && (
                <a href={page.bookingUrl} className="self-start rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-white dark:text-zinc-900">
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
              <p className="text-zinc-500">Booking confirmations and reminders always come. These are up to you:</p>
              {page.hasRecord ? (
                <ConsentSwitches token={token} initial={page.consents} />
              ) : (
                <p className="text-zinc-500">Sign up on the business&apos;s website to choose.</p>
              )}
            </section>

            {page.contact && (
              <p className="text-xs text-zinc-500">
                Questions? Contact {page.businessName} on {page.contact}.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
