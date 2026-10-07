"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markMessageReadAction, setMessageStatusAction } from "../actions";
import { Button, buttonVariants } from "@/components/ui/button";

// Opening a new message marks it read; the owner marks it replied once
// they've answered (by email or phone, from their own accounts).
export function MessageActions(props: {
  id: string;
  status: string;
  email: string | null;
  phone: string | null;
  subject: string | null;
  businessName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (props.status !== "new") return;
    markMessageReadAction(props.id).then(() => router.refresh());
  }, [props.id, props.status, router]);

  function set(status: string) {
    setError(null);
    startTransition(async () => {
      const result = await setMessageStatusAction(props.id, status);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  const mailto = props.email
    ? `mailto:${props.email}?subject=${encodeURIComponent(`Re: ${props.subject ?? `your message to ${props.businessName}`}`)}`
    : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {mailto && (
          <a href={mailto} className={buttonVariants()} onClick={() => props.status !== "replied" && set("replied")}>
            Reply by email
          </a>
        )}
        {props.phone && (
          <a href={`tel:${props.phone.replace(/\s/g, "")}`} className={buttonVariants({ variant: "outline" })}>
            Call {props.phone}
          </a>
        )}
        {props.status === "replied" ? (
          <Button variant="ghost" disabled={pending} onClick={() => set("read")}>
            Mark as not replied
          </Button>
        ) : (
          <Button variant="outline" disabled={pending} onClick={() => set("replied")}>
            Mark as replied
          </Button>
        )}
        {props.status !== "new" && (
          <Button variant="ghost" disabled={pending} onClick={() => set("new")}>
            Mark as unread
          </Button>
        )}
      </div>
      <p className="text-xs text-zinc-500">Replies go from your own email or phone. &ldquo;Reply by email&rdquo; marks it replied.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
