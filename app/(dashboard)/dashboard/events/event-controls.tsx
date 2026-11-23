"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelEventAction, cancelSignupAction, deleteEventAction, duplicateEventAction, removePosterAction, uploadPosterAction } from "./actions";
import { Button } from "@/components/ui/button";

type Result = { error: string | null; id?: string };

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<Result>, after?: (r: Result) => void) => {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (r.error) return setError(r.error);
      after?.(r);
      router.refresh();
    });
  };
  return { pending, error, run, router };
}

export function PosterUpload({ eventId, posterUrl }: { eventId: string; posterUrl: string | null }) {
  const { pending, error, run } = useRun();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3">
      {posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a stored public poster, any size
        <img src={posterUrl} alt="Event poster" className="max-h-80 w-full rounded-lg border object-contain" />
      ) : (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">No poster yet</div>
      )}
      <form
        action={(fd) => run(() => uploadPosterAction(eventId, fd), () => input.current && (input.current.value = ""))}
        className="flex flex-wrap items-center gap-2"
      >
        <input ref={input} type="file" name="poster" accept="image/jpeg,image/png,image/webp" className="text-sm" required />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Uploading…" : posterUrl ? "Replace" : "Upload"}
        </Button>
        {posterUrl && (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removePosterAction(eventId))}>
            Remove
          </Button>
        )}
      </form>
      <p className="text-xs text-muted-foreground">JPEG, PNG or WebP, up to 4 MB. Portrait or landscape both work.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function EventActions({ eventId, cancelled, hasSignups }: { eventId: string; cancelled: boolean; hasSignups: boolean }) {
  const { pending, error, run, router } = useRun();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => duplicateEventAction(eventId), (r) => r.id && router.push(`/dashboard/events/${r.id}?copied=1`))}>
          Duplicate
        </Button>
        {!cancelled && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => confirm("Cancel this event? It shows as cancelled on your website and sign-ups close. People who signed up aren't told automatically.") && run(() => cancelEventAction(eventId))}
          >
            Cancel event
          </Button>
        )}
        {!hasSignups && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => confirm("Delete this event for good?") && run(() => deleteEventAction(eventId), () => router.push("/dashboard/events"))}
          >
            Delete
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function CancelSignupButton({ eventId, signupId, name }: { eventId: string; signupId: string; name: string }) {
  const { pending, error, run } = useRun();
  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => confirm(`Cancel ${name}'s sign-up? Their tickets go back on sale.`) && run(() => cancelSignupAction(eventId, signupId))}>
        Cancel
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
