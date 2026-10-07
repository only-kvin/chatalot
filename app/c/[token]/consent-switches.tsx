"use client";

import { useState, useTransition } from "react";
import { setConsentAction } from "./actions";

const OPTIONS = [
  { kind: "newsletter", label: "Newsletter" },
  { kind: "marketing", label: "Events and promotions" },
] as const;

// The customer's own choices. Each change is saved straight away.
export function ConsentSwitches({ token, initial }: { token: string; initial: { newsletter: boolean; marketing: boolean } }) {
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function toggle(kind: "newsletter" | "marketing", granted: boolean) {
    setMessage(null);
    setValues((v) => ({ ...v, [kind]: granted }));
    startTransition(async () => {
      const result = await setConsentAction(token, kind, granted);
      if (result.error) {
        setValues((v) => ({ ...v, [kind]: !granted }));
        setMessage(result.error);
      } else {
        setMessage("Saved.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {OPTIONS.map((o) => (
        <label key={o.kind} className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            className="size-5"
            checked={values[o.kind]}
            disabled={pending}
            onChange={(e) => toggle(o.kind, e.target.checked)}
          />
          {o.label}
        </label>
      ))}
      {message && <p className="text-xs text-zinc-500">{message}</p>}
    </div>
  );
}
