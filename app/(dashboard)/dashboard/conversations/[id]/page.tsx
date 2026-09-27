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
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, channel, status, external_id, last_inbound_at")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  if (!conversation) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  const nextStatus = conversation.status === "human" ? "ai" : "human";

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Conversation</h1>
          <p className="text-sm text-zinc-500">
            {conversation.channel} · <Badge variant="secondary">{conversation.status}</Badge>
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
        {messages?.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
              m.role === "user"
                ? "self-start bg-zinc-100 dark:bg-zinc-800"
                : "self-end bg-indigo-600 text-white"
            }`}
            style={{ marginLeft: m.role === "user" ? 0 : "auto" }}
          >
            {m.content}
          </div>
        ))}
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
