import type { Metadata } from "next";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { loadPayPage, loadPayPageAfterReturn } from "@/lib/payments/pay-page";
import { formatLocalTime } from "@/lib/time";
import { PublicCard, PublicShell } from "@/components/public/public-shell";
import { CheckoutForm } from "./checkout-form";

// /pay/<paymentId>: the link a customer gets after booking a service that
// needs paying online. Shows what they're paying for, then sends them to
// the business's own PayFast checkout. PayFast brings them back here with
// ?returned=1 or ?cancelled=1. A booking is only marked paid by PayFast's
// server notification, never by coming back to this page.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pay for your booking",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const rand = (cents: number) => `R${(cents / 100).toFixed(2)}`;

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ returned?: string; cancelled?: string }>;
}) {
  const [{ paymentId }, query] = await Promise.all([params, searchParams]);
  const admin = createAdminClient();
  // Back from PayFast: make sure we know about the payment first.
  const page = query.returned ? await loadPayPageAfterReturn(admin, paymentId) : await loadPayPage(admin, paymentId);

  return (
    <PublicShell>
      <PublicCard>
        {page.state === "not_found" && (
          <>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Payment link not found</h1>
            <p className="mt-1 text-muted-foreground">Check the link you were sent, or contact the business.</p>
          </>
        )}

        {page.state === "paid" && (
          <>
            <h1 className="font-heading text-2xl font-bold tracking-tight">
              {page.kind === "event" ? "Paid. You're signed up" : "Paid. You're booked"}
            </h1>
            <p className="mt-2">
              {page.serviceName} with {page.businessName} on {page.when}.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Reference {page.ref}</p>
          </>
        )}

        {page.state === "expired" && (
          <>
            <h1 className="font-heading text-2xl font-bold tracking-tight">This payment link has expired</h1>
            <p className="mt-2 text-muted-foreground">
              The time to pay ran out, so {page.kind === "event" ? "the tickets were released. You can sign up again" : "the slot was released. You can book again"}, or contact {page.businessName}
              {page.contact ? ` (${page.contact})` : ""}.
            </p>
            {query.returned && (
              <p className="mt-2 text-sm text-muted-foreground">
                If you did pay just now, {page.businessName} has been told and will {page.kind === "event" ? "add you back" : "rebook you"} or refund you.
              </p>
            )}
          </>
        )}

        {page.state === "unavailable" && (
          <>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Online payment isn&apos;t available</h1>
            <p className="mt-2 text-muted-foreground">
              Please contact {page.businessName}
              {page.contact ? ` (${page.contact})` : ""} to secure your booking.
            </p>
          </>
        )}

        {page.state === "pay" && (
          <>
            {query.returned ? (
              <>
                <h1 className="font-heading text-2xl font-bold tracking-tight">Confirming your payment…</h1>
                <p className="mt-2 text-muted-foreground">
                  PayFast is letting us know. This usually takes a few seconds: refresh this page, or wait for your
                  confirmation email.
                </p>
              </>
            ) : (
              <>
                <h1 className="font-heading text-2xl font-bold tracking-tight">
                  Pay {rand(page.amountCents)} to secure your {page.kind === "event" ? "tickets" : "booking"}
                </h1>
                <p className="mt-2">
                  {page.serviceName} with {page.businessName} on {page.when}.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reference {page.ref}. {page.kind === "event" ? "Your tickets are" : "Your slot is"} held until {formatLocalTime(page.dueAt)}.
                </p>
                {query.cancelled && (
                  <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
                    Payment cancelled. You can try again until {formatLocalTime(page.dueAt)}.
                  </p>
                )}
                {page.sandbox && (
                  <p className="mt-3 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                    Test mode: this goes to PayFast&apos;s sandbox and no real money is taken.
                  </p>
                )}
                <CheckoutForm
                  action={page.checkout.action}
                  fields={page.checkout.fields}
                  label={`Pay ${rand(page.amountCents)} with PayFast`}
                />
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  You&apos;ll pay {page.businessName} directly on PayFast&apos;s secure page.
                </p>
              </>
            )}
          </>
        )}
      </PublicCard>
    </PublicShell>
  );
}
