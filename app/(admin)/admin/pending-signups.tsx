"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { decideSignupAction } from "./actions";

// Approve or decline one self-serve trial waiting for review.
export function SignupDecision({ tenantId }: { tenantId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const decide = (decision: "approve" | "decline") =>
    startTransition(async () => {
      setError(null);
      const result = await decideSignupAction(tenantId, decision);
      if (result.error) setError(result.error);
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("decline")}>
          Decline
        </Button>
        <Button size="sm" disabled={pending} onClick={() => decide("approve")}>
          Approve
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
