import { createClient } from "@/lib/db/supabase-server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Claude Haiku pricing per the project spec ($1 in / $5 out per million tokens) —
// used as the cost estimate basis regardless of which model is actually live.
const COST_PER_MILLION_IN = 1;
const COST_PER_MILLION_OUT = 5;

export default async function UsagePage() {
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [{ data: usageDaily }, { data: tenants }] = await Promise.all([
    supabase
      .from("usage_daily")
      .select("tenant_id, messages, tokens_in, tokens_out")
      .gte("day", startOfMonth.toISOString()),
    supabase.from("tenants").select("id, name"),
  ]);

  const tenantNames = new Map((tenants ?? []).map((t) => [t.id, t.name]));

  const byTenant = new Map<
    string,
    { messages: number; tokensIn: number; tokensOut: number }
  >();
  for (const row of usageDaily ?? []) {
    const existing = byTenant.get(row.tenant_id) ?? { messages: 0, tokensIn: 0, tokensOut: 0 };
    existing.messages += row.messages;
    existing.tokensIn += row.tokens_in;
    existing.tokensOut += row.tokens_out;
    byTenant.set(row.tenant_id, existing);
  }

  const rows = [...byTenant.entries()]
    .map(([tenantId, usage]) => ({
      tenantId,
      name: tenantNames.get(tenantId) ?? tenantId,
      ...usage,
      estimatedCostUsd:
        (usage.tokensIn / 1_000_000) * COST_PER_MILLION_IN +
        (usage.tokensOut / 1_000_000) * COST_PER_MILLION_OUT,
    }))
    .sort((a, b) => b.messages - a.messages);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-2 text-2xl font-semibold">Usage — this month</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Estimated cost assumes Claude Haiku pricing ($1 in / $5 out per million
        tokens), regardless of which model is currently live for a tenant.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tenant</TableHead>
            <TableHead>Messages</TableHead>
            <TableHead>Tokens in</TableHead>
            <TableHead>Tokens out</TableHead>
            <TableHead>Est. cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.tenantId}>
              <TableCell>{r.name}</TableCell>
              <TableCell>{r.messages}</TableCell>
              <TableCell>{r.tokensIn.toLocaleString()}</TableCell>
              <TableCell>{r.tokensOut.toLocaleString()}</TableCell>
              <TableCell>${r.estimatedCostUsd.toFixed(4)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-zinc-500">
                No usage this month yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
