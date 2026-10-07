"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendOwnerReplyAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// Refetches the transcript while the owner is handling the conversation, so
// the customer's new messages show up without reloading the page.
const REFRESH_MS = 10_000;

export function ReplyBox({
  conversationId,
  isHuman,
  windowOpen,
}: {
  conversationId: string;
  isHuman: boolean;
  windowOpen: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!isHuman) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [isHuman, router]);

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await sendOwnerReplyAction({ conversationId, text });
      if (result.error) {
        setError(result.error);
      } else {
        setText("");
        router.refresh();
      }
    });
  }

  if (!windowOpen) {
    return (
      <p className="text-sm text-muted-foreground">
        More than 24 hours have passed since this customer&apos;s last message, so WhatsApp won&apos;t
        let you reply until they message again.
      </p>
    );
  }

  return (
    <form action={send} className="flex flex-col gap-2">
      <Textarea
        aria-label="Reply on WhatsApp"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter adds a new line.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (text.trim() && !pending) e.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder="Reply on WhatsApp…"
        disabled={pending}
      />
      {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {isHuman
            ? "The AI is paused while you handle this conversation."
            : "Sending a reply takes over from the AI."}
        </p>
        <Button type="submit" disabled={pending || !text.trim()}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
