"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markRefundedAction } from "./refund-actions";
import { Button } from "@/components/ui/button";

// Two steps, because it can't be undone: first the reminder that the refund
// itself happens in PayFast, then the confirmation.
export function RefundButton({ bookingId, amountLabel }: { bookingId: string; amountLabel: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!asking) {
    return (
      <div>
        <Button variant="outline" size="sm" onClick={() => setAsking(true)}>
          Mark as refunded
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p>
        First refund {amountLabel} to the customer in your PayFast account (Transactions, find the payment, Refund). Then
        record it here. This can&apos;t be undone.
      </p>
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await markRefundedAction(bookingId);
              if (r.error) setError(r.error);
              else {
                setAsking(false);
                router.refresh();
              }
            })
          }
        >
          {pending ? "Saving…" : `I've refunded ${amountLabel} in PayFast`}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">This only records the refund. If the booking is off too, cancel it as well.</p>
    </div>
  );
}
