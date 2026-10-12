import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { cn } from "cn";
import { canonicalPhone, formatPhone } from "@/lib/contacts/phone";
import { createClient } from "@/lib/db/supabase-server";
import { getSessionUser } from "@/lib/db/auth";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { isWithinServiceWindow } from "@/lib/channels/whatsapp";
import { formatLocalDate, formatLocalTime, localDateISO } from "@/lib/time";
import { clearUrgentAction, toggleTakeOverAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Avatar } from "../inbox";
import { ReplyBox } from "./reply-box";
import { ScrollToEnd } from "./scroll-to-end";

const WINDOW_MS = 24 * 60 * 60 * 1000;

// WhatsApp's reply window, in words: "reply window open for 22 h".
function windowText(lastInboundAt: string | null): string | null {
  if (!lastInboundAt) return null;
  const left = new Date(lastInboundAt).getTime() + WINDOW_MS - Date.now();
  if (left <= 0) return "reply window closed";
  const hours = Math.floor(left / (60 * 60 * 1000));
  return hours >= 1 ? `reply window open for ${hours} h` : "reply window closes within the hour";
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const user = await getSessionUser();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, channel, status, urgent, external_id, last_inbound_at, contacts(id, name, phone_e164)")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!conversation) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, created_at, sent_by")
    .eq("conversation_id", id)
    .eq("tenant_id", tenantId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true });

  const isHuman = conversation.status === "human";
  const isWhatsApp = conversation.channel === "whatsapp";
  const customer = conversation.contacts as unknown as { id: string; name: string | null; phone_e164: string | null } | null;
  const phone = formatPhone(customer?.phone_e164 ?? (isWhatsApp ? canonicalPhone(conversation.external_id) : null));
  const name = customer?.name || phone || "Website visitor";
  const subtitle = [isWhatsApp ? "WhatsApp" : "Website chat", phone || null, isWhatsApp ? windowText(conversation.last_inbound_at) : null]
    .filter(Boolean)
    .join(" · ");

  // Business-side messages without a sender are the AI's (or automatic
  // system replies); ones with a sender were typed in this dashboard.
  function senderLabel(sentBy: string | null): string {
    if (!sentBy) return "AI";
    return sentBy === user?.id ? "You" : "Team member";
  }

  let lastDay = "";

  return (
    <div className="flex min-h-[70dvh] flex-col overflow-hidden rounded-2xl border bg-card md:h-full md:min-h-0">
      {/* Header */}
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <Link
          href="/dashboard/conversations"
          aria-label="All conversations"
          className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-muted md:hidden"
        >
          <ArrowLeftIcon className="size-4" />
        </Link>
        <Avatar name={name} channel={isWhatsApp ? "whatsapp" : "web"} className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {customer ? (
              <Link href={`/dashboard/customers/${customer.id}`} className="hover:underline">
                {name}
              </Link>
            ) : (
              name
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <form action={toggleTakeOverAction}>
          <input type="hidden" name="id" value={conversation.id} />
          <input type="hidden" name="nextStatus" value={isHuman ? "ai" : "human"} />
          <Button type="submit" size="sm" variant={isHuman ? "outline" : "default"}>
            {isHuman ? "Hand back to AI" : "Take over"}
          </Button>
        </form>
      </header>

      {/* Status strip */}
      {conversation.urgent ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-tone-bad px-4 py-2 text-sm text-tone-bad-foreground">
          <span>
            <strong>Urgent:</strong> the customer described an emergency. The AI stopped offering times and handed the chat to you.
          </span>
          <form action={clearUrgentAction}>
            <input type="hidden" name="id" value={conversation.id} />
            <Button type="submit" size="xs" variant="outline">
              Mark handled
            </Button>
          </form>
        </div>
      ) : (
        <p className={cn("border-b px-4 py-2 text-sm", isHuman ? "bg-tone-warn text-tone-warn-foreground" : "bg-accent text-accent-foreground")}>
          {isHuman
            ? "You've taken over. The AI won't reply until you hand the chat back."
            : conversation.status === "closed"
              ? "This conversation is closed."
              : "The AI is handling this chat. Take over any time to reply yourself."}
        </p>
      )}

      {/* Messages */}
      <ScrollToEnd count={messages?.length ?? 0} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-background/60 px-3 py-4 sm:px-5">
        {messages?.map((m) => {
          const day = localDateISO(new Date(m.created_at));
          const separator = day !== lastDay;
          lastDay = day;
          const mine = m.role !== "user";
          return (
            <div key={m.id} className="flex flex-col">
              {separator && (
                <p className="my-2 self-center rounded-full bg-card px-3 py-1 text-xs text-muted-foreground shadow-raised">
                  {formatLocalDate(day)}
                </p>
              )}
              <div className={cn("flex max-w-[85%] flex-col gap-1 sm:max-w-[75%]", mine ? "items-end self-end" : "items-start self-start")}>
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                    !mine && "rounded-bl-md bg-card shadow-raised",
                    mine && m.sent_by && "rounded-br-md bg-primary text-primary-foreground",
                    mine && !m.sent_by && "rounded-br-md bg-accent text-accent-foreground",
                  )}
                >
                  {m.content}
                </div>
                <span className="px-1 text-[11px] text-muted-foreground tabular-nums">
                  {mine ? `${senderLabel(m.sent_by)} · ` : ""}
                  {formatLocalTime(m.created_at)}
                </span>
              </div>
            </div>
          );
        })}
        {!messages?.length && <p className="m-auto text-sm text-muted-foreground">No messages yet.</p>}
      </ScrollToEnd>

      {/* Composer */}
      <div className="border-t bg-card px-3 py-3 sm:px-4">
        {isWhatsApp ? (
          <ReplyBox conversationId={conversation.id} isHuman={isHuman} windowOpen={isWithinServiceWindow(conversation.last_inbound_at)} />
        ) : (
          <p className="px-1 text-sm text-muted-foreground">Replying from the dashboard isn&apos;t available for website chats yet.</p>
        )}
      </div>
    </div>
  );
}
