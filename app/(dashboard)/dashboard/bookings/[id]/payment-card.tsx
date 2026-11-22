import { formatRand } from "@/lib/bookings/price-label";
import { formatLocalTime } from "@/lib/time";
import { formatShortLocal } from "@/lib/bookings/labels";
import { PAYMENT_ATTEMPT_LABEL, paymentBadge } from "@/lib/payments/labels";
import { payUrl } from "@/lib/payments/request";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// A booking's online payment, for the business: what was asked, what was
// paid (with PayFast's fee and what lands in their account), PayFast's
// reference for refunds, and the pay link while it's still due.

export type PaymentAttempt = {
  id: string;
  status: string;
  mode: "sandbox" | "live";
  amount_cents: number;
  fee_cents: number | null;
  net_cents: number | null;
  provider_payment_id: string | null;
  paid_at: string | null;
  created_at: string;
};

export function PaymentCard({
  status,
  amountDueCents,
  dueAt,
  attempts,
}: {
  status: string;
  amountDueCents: number | null;
  dueAt: string | null;
  attempts: PaymentAttempt[];
}) {
  const badge = paymentBadge(status, amountDueCents);
  if (!badge) return null;
  const paid = attempts.find((a) => a.status === "paid");
  // The link the customer was given: the newest attempt not yet paid.
  const open = attempts.find((a) => a.status !== "paid");
  const sandbox = attempts.some((a) => a.mode === "sandbox");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Payment</CardTitle>
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {sandbox && <Badge variant="outline">Test mode</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {status === "awaiting" && (
          <>
            <p>
              Waiting for the customer to pay {amountDueCents ? formatRand(amountDueCents) : ""} online. The slot is held
              {dueAt ? ` until ${formatLocalTime(dueAt)}` : ""}, then released if they haven&apos;t paid.
            </p>
            {open && (
              <p className="text-muted-foreground">
                Their pay link, to send again if needed:{" "}
                <a href={payUrl(open.id)} target="_blank" rel="noopener noreferrer" className="break-all underline">
                  {payUrl(open.id)}
                </a>
              </p>
            )}
          </>
        )}

        {paid && (
          <>
            <p>
              Paid {formatRand(paid.amount_cents)} online{paid.paid_at ? ` on ${formatShortLocal(paid.paid_at)}` : ""}, into your
              PayFast account.
            </p>
            {paid.fee_cents !== null && paid.net_cents !== null && (
              <p className="text-muted-foreground">
                PayFast&apos;s fee {formatRand(paid.fee_cents)}, so you receive {formatRand(paid.net_cents)}.
              </p>
            )}
            {paid.provider_payment_id && (
              <p className="text-muted-foreground">
                PayFast reference {paid.provider_payment_id}. Refunds are made in your PayFast account.
              </p>
            )}
          </>
        )}

        {status === "expired" && !paid && (
          <p>Not paid in time, so the booking was cancelled and the slot released.</p>
        )}

        {status === "refunded" && <p>This payment was refunded.</p>}

        {attempts.length > 1 && (
          <details className="text-muted-foreground">
            <summary className="cursor-pointer">Payment attempts ({attempts.length})</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {attempts.map((a) => (
                <li key={a.id}>
                  {formatShortLocal(a.created_at)}: {formatRand(a.amount_cents)}, {PAYMENT_ATTEMPT_LABEL[a.status] ?? a.status}
                  {a.provider_payment_id ? ` (PayFast ${a.provider_payment_id})` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
