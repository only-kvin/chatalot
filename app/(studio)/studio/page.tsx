import Link from "next/link";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getPlatformRole } from "@/lib/db/platform-role";
import { PLAN_LABEL, parsePlan } from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { pageFrame } from "@/components/dashboard/page-frame";

// Find a business by name, slug or id, to set up its widgets.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (!(await getPlatformRole())) return null;
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const admin = createAdminClient();

  let query = admin.from("tenants").select("id, name, slug, status, plan, created_at").order("created_at", { ascending: false }).limit(30);
  if (UUID.test(q)) query = query.eq("id", q);
  else if (q) {
    // Commas and brackets would break PostgREST's or() filter.
    const term = q.replace(/[%,()*\\]/g, " ").trim();
    query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`);
  }
  const { data: tenants } = await query;
  const ids = (tenants ?? []).map((t) => t.id);
  const { data: widgets } = ids.length ? await admin.from("widget_instances").select("tenant_id").in("tenant_id", ids) : { data: [] };
  const widgetCount = new Map<string, number>();
  for (const w of widgets ?? []) widgetCount.set(w.tenant_id, (widgetCount.get(w.tenant_id) ?? 0) + 1);

  return (
    <div className={pageFrame("wide", "flex flex-col gap-6")}>
      <div>
        <h1 className="text-2xl font-semibold">Businesses</h1>
        <p className="text-sm text-muted-foreground">Find a business to set up its widgets and copy embed codes for its website.</p>
      </div>

      <form className="flex max-w-xl gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Business name, slug or id" aria-label="Search businesses" autoFocus />
        <Button type="submit">Search</Button>
      </form>

      <Card>
        <CardContent className="flex flex-col divide-y p-0">
          {(tenants ?? []).map((t) => (
            <Link key={t.id} href={`/studio/${t.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-muted/50">
              <div className="min-w-0">
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.slug} · {t.id}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {t.status !== "active" && <Badge variant="warning">{t.status === "pending" ? "Awaiting approval" : t.status}</Badge>}
                <Badge variant="outline">{PLAN_LABEL[parsePlan(t.plan)]}</Badge>
                <span className="text-muted-foreground">
                  {widgetCount.get(t.id) ?? 0} widget{widgetCount.get(t.id) === 1 ? "" : "s"}
                </span>
              </div>
            </Link>
          ))}
          {!tenants?.length && <p className="px-5 py-8 text-center text-muted-foreground">{q ? "No business matches that." : "No businesses yet."}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
