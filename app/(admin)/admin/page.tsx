import Link from "next/link";
import { createClient } from "@/lib/db/supabase-server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { formatLocalDateTime } from "@/lib/time";
import { SignupDecision } from "./pending-signups";
import { createTenantAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLAN_LABEL, parsePlan } from "@/lib/plans";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, name, slug, status, plan, public_widget_key, created_at, business_type")
    .order("created_at", { ascending: false });
  const { data: requests } = await supabase.from("upgrade_requests").select("tenant_id").is("handled_at", null);
  const waiting = (tenants ?? []).filter((t) => t.status === "pending");
  // Who signed up for each waiting business (sign-ups are service-role only).
  const { data: signups } = waiting.length
    ? await createAdminClient().from("signups").select("tenant_id, email").in("tenant_id", waiting.map((t) => t.id))
    : { data: [] };
  const signupEmail = new Map((signups ?? []).map((s) => [s.tenant_id as string, s.email as string]));
  const openRequests = new Map<string, number>();
  for (const r of requests ?? []) openRequests.set(r.tenant_id, (openRequests.get(r.tenant_id) ?? 0) + 1);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tenants</h1>
        <div className="flex gap-4">
          <Link href="/admin/site-briefs" className="text-sm text-muted-foreground hover:underline">
            Site briefs →
          </Link>
          <Link href="/admin/usage" className="text-sm text-muted-foreground hover:underline">
            Usage →
          </Link>
        </div>
      </div>

      {waiting.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Waiting for approval</CardTitle>
            <CardDescription>
              Self-serve trials. They can set up their dashboard now; their widgets and chat stay off for the public
              until you approve. Approving emails the owner.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {waiting.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link href={`/admin/tenants/${t.id}`} className="font-medium hover:underline">
                    {t.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {[signupEmail.get(t.id), t.business_type, formatLocalDateTime(t.created_at)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <SignupDecision tenantId={t.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Create tenant</CardTitle>
          <CardDescription>
            Sets up a new client with a blank agent config and widget settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createTenantAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Business name</Label>
              <Input id="name" name="name" required placeholder="Demo Salon" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" name="slug" required placeholder="demo-salon" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ownerEmail">
                Owner email <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="ownerEmail"
                name="ownerEmail"
                type="email"
                placeholder="owner@example.com"
              />
              <p className="text-xs text-muted-foreground">
                Must have signed in via /login at least once already.
              </p>
            </div>
            <Button type="submit">Create tenant</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing tenants</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants?.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link href={`/admin/tenants/${t.id}`} className="hover:underline">
                      {t.name}
                    </Link>
                  </TableCell>
                  <TableCell>{t.slug}</TableCell>
                  <TableCell>{t.status}</TableCell>
                  <TableCell>
                    {PLAN_LABEL[parsePlan(t.plan)]}
                    {!!openRequests.get(t.id) && (
                      <Badge variant="warning" className="ml-2">
                        {openRequests.get(t.id)} upgrade request{openRequests.get(t.id) === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!tenants?.length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No tenants yet.
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
