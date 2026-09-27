import Link from "next/link";
import { formatPhone } from "@/lib/contacts/phone";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { toggleTakeOverAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isWithinServiceWindow } from "@/lib/channels/whatsapp";
import { ReplyBox } from "./reply-box";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, channel, status, external_id, last_inbound_at, contacts(id, name, phone_e164)")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  if (!conversation) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, created_at, sent_by")
    .eq("conversation_id", id)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  const nextStatus = conversation.status === "human" ? "ai" : "human";
  const customer = conversation.contacts as unknown as {
    id: string;
    name: string | null;
    phone_e164: string | null;
  } | null;

  // Business-side messages without a sender are the AI's (or automatic
  // system replies); ones with a sender were typed in this dashboard.
  function senderLabel(sentBy: string | null): string {
    if (!sentBy) return "AI";
    return sentBy === user?.id ? "You" : "Team member";
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Conversation</h1>
          <p className="text-sm text-zinc-500">
            {conversation.channel} · <Badge variant="secondary">{conversation.status}</Badge>
            {customer && (
              <>
                {" · "}
                <Link href={`/dashboard/customers/${customer.id}`} className="hover:underline">
                  {customer.name || formatPhone(customer.phone_e164) || "View customer"}
                </Link>
              </>
            )}
          </p>
        </div>
        <form action={toggleTakeOverAction}>
          <input type="hidden" name="id" value={conversation.id} />
          <input type="hidden" name="nextStatus" value={nextStatus} />
          <Button type="submit" variant={nextStatus === "human" ? "default" : "outline"}>
            {nextStatus === "human" ? "Take over" : "Hand back to AI"}
          </Button>
        </form>
      </div>

      <div className="flex flex-col gap-3">
        {messages?.map((m) =>
          m.role === "user" ? (
            <div
              key={m.id}
              className="max-w-[80%] self-start rounded-lg bg-zinc-100 px-4 py-2 text-sm dark:bg-zinc-800"
            >
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="flex max-w-[80%] flex-col items-end gap-1 self-end">
              <span className="text-xs text-zinc-500">{senderLabel(m.sent_by)}</span>
              <div
                className={`rounded-lg px-4 py-2 text-sm text-white ${
                  m.sent_by ? "bg-emerald-600" : "bg-indigo-600"
                }`}
              >
                {m.content}
              </div>
            </div>
          ),
        )}
        {!messages?.length && (
          <p className="text-center text-zinc-500">No messages yet.</p>
        )}
      </div>

      <div className="mt-6 border-t pt-6">
        {conversation.channel === "whatsapp" ? (
          <ReplyBox
            conversationId={conversation.id}
            isHuman={conversation.status === "human"}
            windowOpen={isWithinServiceWindow(conversation.last_inbound_at)}
          />
        ) : (
          <p className="text-sm text-zinc-500">
            Replying from the dashboard isn&apos;t available for website chats yet.
          </p>
        )}
      </div>
    </div>
  );
}
