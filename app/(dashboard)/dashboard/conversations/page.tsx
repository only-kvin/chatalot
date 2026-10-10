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
import { UrgentFilter } from "@/components/dashboard/urgent-filter";

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");
  const urgentOnly = (await searchParams).filter === "urgent";

  const supabase = await createClient();
  let query = supabase
    .from("conversations")
    .select("id, channel, status, urgent, external_id, last_message_at")
    .eq("tenant_id", tenantId)
    .order("last_message_at", { ascending: false });
  if (urgentOnly) query = query.eq("urgent", true);
  const { data: conversations } = await query;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <PageHeader title="Conversations" />
      <UrgentFilter base="/dashboard/conversations" urgentOnly={urgentOnly} />
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
                {c.urgent && (
                  <Badge variant="danger" className="ml-2">
                    Urgent
                  </Badge>
                )}
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
                {urgentOnly ? "No urgent conversations." : "No conversations yet."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
