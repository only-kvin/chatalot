"use client";

import { useState, useTransition } from "react";
import { CheckIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestUpgradeAction } from "./actions";

export function RequestUpgradeButton({ feature, alreadyRequested }: { feature: string; alreadyRequested: boolean }) {
  const [requested, setRequested] = useState(alreadyRequested);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (requested) {
    return (
      <p className="feedback-enter flex items-center gap-2 text-sm font-medium text-tone-ok-foreground">
        <CheckIcon className="size-4" />
        Request sent. We&apos;ll be in touch to switch it on.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await requestUpgradeAction(feature);
            if (result.error) setError(result.error);
            else setRequested(true);
          })
        }
        className="self-start"
      >
        <SparklesIcon />
        {pending ? "Sending…" : "Request upgrade"}
      </Button>
      {error && (
        <p role="alert" className="feedback-enter text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
