import Link from "next/link";
import { cn } from "cn";
import { createClient } from "@/lib/db/supabase-server";
import { requireFeaturePage } from "@/lib/dashboard-features";
import { formatShortLocal } from "@/lib/time";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TABS = [
  { id: "new", label: "New" },
  { id: "all", label: "All" },
] as const;

const STATUS = { new: "New", read: "Read", replied: "Replied" } as Record<string, string>;

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tenantId = await requireFeaturePage("contact_form");
  const tab = (await searchParams).tab === "all" ? "all" : "new";

  const supabase = await createClient();
  let query = supabase
    .from("contact_messages")
    .select("id, name, email, phone, subject, message, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (tab === "new") query = query.eq("status", "new");
  const { data: messages } = await query;

  return (
    <div className="mx-auto max-w-5xl p-8">
      <PageHeader title="Messages" description="What people sent through the contact form on your website." />
      <nav className="mb-4 flex gap-1 border-b" aria-label="Message views">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "new" ? "/dashboard/messages" : "/dashboard/messages?tab=all"}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>From</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Received</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {messages?.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="whitespace-nowrap">
                <Link href={`/dashboard/messages/${m.id}`} className={cn("hover:underline", m.status === "new" && "font-semibold")}>
                  {m.name}
                </Link>
                <div className="text-xs text-muted-foreground">{m.email ?? m.phone}</div>
              </TableCell>
              <TableCell className="max-w-md">
                {m.subject && <span className="mr-2 font-medium">{m.subject}</span>}
                <span className="text-muted-foreground">
                  {m.message.length > 90 ? `${m.message.slice(0, 87)}…` : m.message}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant={m.status === "new" ? "new" : m.status === "replied" ? "success" : "neutral"}>
                  {STATUS[m.status] ?? m.status}
                </Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatShortLocal(m.created_at)}</TableCell>
            </TableRow>
          ))}
          {!messages?.length && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                {tab === "new" ? "No new messages." : "No messages yet. Add the contact widget from Widgets → Contact."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
