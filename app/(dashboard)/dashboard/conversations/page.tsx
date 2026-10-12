import { MessagesSquareIcon } from "lucide-react";

// The inbox's right-hand side before a chat is chosen (desktop only; on
// phones the list fills the screen). The list itself is in layout.tsx.
export default function ConversationsPage() {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/50 p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <MessagesSquareIcon className="size-6" aria-hidden />
      </span>
      <p className="font-medium">Choose a conversation</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Read what the AI said, take over when you want to reply yourself, and hand it back when you&apos;re done.
      </p>
    </div>
  );
}
