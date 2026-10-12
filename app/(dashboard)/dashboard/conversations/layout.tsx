import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { canonicalPhone, formatPhone } from "@/lib/contacts/phone";
import { pageFrame } from "@/components/dashboard/page-frame";
import { Inbox, type InboxItem } from "./inbox";

// The inbox: conversations on the left, the open one on the right (one at a
// time on phones). The list lives in this layout so it stays put while you
// move between chats.

const LIMIT = 150;

export default async function ConversationsLayout({ children }: { children: React.ReactNode }) {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, channel, status, urgent, external_id, last_message_at, contacts(name, phone_e164)")
    .eq("tenant_id", tenantId)
    .order("last_message_at", { ascending: false })
    .limit(LIMIT);
  const ids = (conversations ?? []).map((c) => c.id);
  const { data: previews } = ids.length
    ? await supabase.rpc("conversation_previews", { p_tenant_id: tenantId, p_ids: ids })
    : { data: [] };
  const last = new Map(
    ((previews ?? []) as { conversation_id: string; role: string; content: string; sent_by: string | null }[]).map((p) => [
      p.conversation_id,
      p,
    ]),
  );

  const items: InboxItem[] = (conversations ?? []).map((c) => {
    const contact = c.contacts as unknown as { name: string | null; phone_e164: string | null } | null;
    const phone = contact?.phone_e164 ? formatPhone(contact.phone_e164) : c.channel === "whatsapp" ? formatPhone(canonicalPhone(c.external_id)) || null : null;
    const preview = last.get(c.id);
    return {
      id: c.id,
      name: contact?.name || phone || "Website visitor",
      channel: c.channel as "web" | "whatsapp",
      status: c.status,
      urgent: c.urgent,
      lastAt: c.last_message_at,
      preview: preview ? `${preview.role === "user" ? "" : preview.sent_by ? "You: " : "AI: "}${preview.content}` : "",
    };
  });

  return (
    <div className={pageFrame("wide", "md:pb-6")}>
      <Inbox items={items}>{children}</Inbox>
    </div>
  );
}
