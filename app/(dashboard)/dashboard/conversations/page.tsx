import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { CONVERSATION_LABEL, conversationTone } from "@/lib/ui/status-tones";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatShortLocal } from "@/lib/time";

export default async function ConversationsPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, channel, status, external_id, last_message_at")
    .eq("tenant_id", tenantId)
    .order("last_message_at", { ascending: false });

  return (
    <div className="mx-auto max-w-4xl p-8">
      <PageHeader title="Conversations" />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Channel</TableHead>
            <TableHead>Session</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last message</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {conversations?.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link href={`/dashboard/conversations/${c.id}`} className="hover:underline">
                  {c.channel}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {c.external_id.slice(0, 12)}…
              </TableCell>
              <TableCell>
                <Badge variant={conversationTone(c.status)}>
                  {CONVERSATION_LABEL[c.status] ?? c.status}
                </Badge>
              </TableCell>
              <TableCell>{formatShortLocal(c.last_message_at)}</TableCell>
            </TableRow>
          ))}
          {!conversations?.length && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No conversations yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
