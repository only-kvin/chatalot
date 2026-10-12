"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelByTokenAction } from "./actions";
import { Button } from "@/components/ui/button";

export function CancelBooking({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelByTokenAction(token);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {sure ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>Cancel this booking?</span>
          <Button variant="destructive" size="sm" disabled={pending} onClick={cancel}>
            {pending ? "Cancelling…" : "Yes, cancel it"}
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setSure(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="outline" onClick={() => setSure(true)}>
            Cancel booking
          </Button>
        </div>
      )}
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
}
