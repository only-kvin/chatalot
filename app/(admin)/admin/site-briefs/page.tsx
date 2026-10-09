import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/db/supabase-server";
import { BUSINESS_GROUPS } from "@/lib/marketing/business-types";
import { formatShortLocal } from "@/lib/time";

const STATUSES = ["draft", "ready", "in_build", "live", "withdrawn"] as const;
const GAPS = [
  { value: "", label: "Any gaps" },
  { value: "0", label: "No gaps" },
  { value: "1", label: "1–3 gaps" },
  { value: "4", label: "4+ gaps" },
];

// All site briefs across businesses, newest first. Filters are plain query
// parameters, so a filtered view can be bookmarked.
export default async function SiteBriefsPage({ searchParams }: PageProps<"/admin/site-briefs">) {
  const params = await searchParams;
  const status = typeof params.status === "string" && (STATUSES as readonly string[]).includes(params.status) ? params.status : "";
  const type = typeof params.type === "string" ? params.type : "";
  const gaps = typeof params.gaps === "string" ? params.gaps : "";

  // Platform admins can read every brief under RLS.
  const supabase = await createClient();
  let query = supabase
    .from("site_briefs")
    .select("id, version, status, missing, conflicts, created_at, tenant_id, tenants!inner(name, business_type)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);
  if (type) query = query.eq("tenants.business_type", type);
  const { data } = await query;
  const rows = (data ?? []).filter((r) => {
    const n = (r.missing as string[]).length;
    return gaps === "0" ? n === 0 : gaps === "1" ? n >= 1 && n <= 3 : gaps === "4" ? n >= 4 : true;
  });

  const selectClass = "h-8 rounded-lg border border-input bg-card px-2 text-sm";
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Site briefs</h1>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Tenants
        </Link>
      </div>
      <form className="flex flex-wrap items-center gap-2">
        <select name="status" defaultValue={status} className={selectClass} aria-label="Status">
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={type} className={selectClass} aria-label="Business type">
          <option value="">Any type</option>
          {BUSINESS_GROUPS.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.name}
            </option>
          ))}
          <option value="other">Something else</option>
        </select>
        <select name="gaps" defaultValue={gaps} className={selectClass} aria-label="Missing data">
          {GAPS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
        <button type="submit" className="h-8 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">
          Filter
        </button>
      </form>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Gaps</TableHead>
                <TableHead>Conflicts</TableHead>
                <TableHead>Made</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const tenant = r.tenants as unknown as { name: string; business_type: string | null };
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/admin/site-briefs/${r.id}`} className="font-medium hover:underline">
                        {tenant.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{tenant.business_type ?? "type not set"}</div>
                    </TableCell>
                    <TableCell>v{r.version}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "ready" ? "default" : "secondary"}>{r.status}</Badge>
                    </TableCell>
                    <TableCell>{(r.missing as string[]).length}</TableCell>
                    <TableCell>{(r.conflicts as unknown[]).length}</TableCell>
                    <TableCell>{formatShortLocal(r.created_at)}</TableCell>
                  </TableRow>
                );
              })}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No briefs match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
