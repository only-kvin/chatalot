import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { formatPhone } from "@/lib/contacts/phone";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatShortLocal } from "@/lib/time";

type Count = { count: number }[];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");
  const q = (await searchParams).q?.trim() ?? "";

  const supabase = await createClient();
  let query = supabase
    .from("contacts")
    .select(
      "id, name, phone_e164, email, first_channel, last_seen_at, opted_out_at, conversations(count), leads(count), bookings(count)",
    )
    .eq("tenant_id", tenantId)
    .order("last_seen_at", { ascending: false })
    .limit(200);

  // Digits search the phone; anything else searches name and email. Wildcard
  // and PostgREST filter characters are stripped from what the owner typed.
  const digits = q.replace(/\D/g, "");
  const text = q.replace(/[%_,()*\\]/g, "").trim();
  if (digits.length >= 3 && digits.length === q.replace(/[\s+()-]/g, "").length) {
    const local = digits.startsWith("0") ? `27${digits.slice(1)}` : digits;
    query = query.like("phone_e164", `%${local}%`);
  } else if (text) {
    query = query.or(`name.ilike.%${text}%,email.ilike.%${text}%`);
  }

  const { data: customers } = await query;

  return (
    <div className="mx-auto max-w-5xl p-8">
      <PageHeader
        title="Customers"
        description="Everyone who has messaged you on WhatsApp or left their details on your website, with their full history."
      />

      <form className="mb-4 flex gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Search by name, phone or email" aria-label="Search customers" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>First came via</TableHead>
            <TableHead>Last seen</TableHead>
            <TableHead className="text-right">Chats</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead className="text-right">Bookings</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers?.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link href={`/dashboard/customers/${c.id}`} className="font-medium hover:underline">
                  {c.name || c.email || "Unnamed customer"}
                </Link>
                {c.opted_out_at && (
                  <Badge variant="outline" className="ml-2" title="Replied STOP: no reminders or notices">
                    Opted out
                  </Badge>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap">{formatPhone(c.phone_e164)}</TableCell>
              <TableCell>
                {c.first_channel && <Badge variant="secondary">{c.first_channel}</Badge>}
              </TableCell>
              <TableCell className="whitespace-nowrap">{formatShortLocal(c.last_seen_at)}</TableCell>
              <TableCell className="text-right">{(c.conversations as Count)[0]?.count ?? 0}</TableCell>
              <TableCell className="text-right">{(c.leads as Count)[0]?.count ?? 0}</TableCell>
              <TableCell className="text-right">{(c.bookings as Count)[0]?.count ?? 0}</TableCell>
            </TableRow>
          ))}
          {!customers?.length && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                {q ? "No customers match that search." : "No customers yet."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
