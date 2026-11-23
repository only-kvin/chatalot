import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getPlatformRole } from "@/lib/db/platform-role";
import { appUrl } from "@/lib/app-url";
import { PLAN_LABEL, parsePlan, resolveFeatures, WIDGET_FEATURE } from "@/lib/plans";
import { WIDGET_TYPE_LABEL, type WidgetType } from "@/lib/widgets/config";
import { listWidgets, loaderScript, widgetBox, WIDGET_TYPES, type WidgetSummary } from "@/lib/widgets/instances";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopySnippetButton } from "@/app/(dashboard)/dashboard/widget/widget-editor";
import { pageFrame } from "@/components/dashboard/page-frame";
import { NewWidgetForm, StatusSwitch } from "./widget-controls";

// One business in the studio: its embed codes, ready to paste into the
// website being built, whether or not the business has set anything up.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TYPE_HINT: Record<WidgetType, string> = {
  appointment: "Customers pick a service, then a time.",
  schedule: "Customers pick a date and time first.",
  contact: "A contact form; messages land in the business's inbox.",
  registration: "Customers sign up to the business's customer list.",
};

function Snippet({ code, label }: { code: string; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <CopySnippetButton snippet={code} />
      </div>
      <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{code}</pre>
    </div>
  );
}

export default async function StudioBusinessPage({ params }: { params: Promise<{ tenantId: string }> }) {
  if (!(await getPlatformRole())) notFound();
  const { tenantId } = await params;
  if (!UUID.test(tenantId)) notFound();

  const admin = createAdminClient();
  const [{ data: tenant }, widgets, { count: bookableServices }] = await Promise.all([
    admin.from("tenants").select("id, name, slug, status, plan, feature_overrides, public_widget_key").eq("id", tenantId).maybeSingle(),
    listWidgets(admin, tenantId),
    admin
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .eq("online_bookable", true),
  ]);
  if (!tenant) notFound();
  const features = resolveFeatures(parsePlan(tenant.plan), tenant.feature_overrides);
  const byType = (type: WidgetType) => widgets.filter((w) => w.type === type);

  return (
    <div className={pageFrame("wide", "flex flex-col gap-6")}>
      <div>
        <Link href="/studio" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Businesses
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{tenant.name}</h1>
          <Badge variant="outline">{PLAN_LABEL[parsePlan(tenant.plan)]}</Badge>
          {tenant.status !== "active" && (
            <Badge variant="warning">{tenant.status === "pending" ? "Awaiting approval: widgets are off on websites" : tenant.status}</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {tenant.slug} · {tenant.id} · {bookableServices ?? 0} bookable service{bookableServices === 1 ? "" : "s"}
          {(bookableServices ?? 0) === 0 && " (booking widgets show \"opening soon\" until services are added)"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Loader script</CardTitle>
          <CardDescription>Once per page, in the &lt;head&gt; or just before &lt;/body&gt;. Remove data-chat=&quot;off&quot; to show the chat bubble as well.</CardDescription>
        </CardHeader>
        <CardContent>
          <Snippet code={loaderScript(appUrl(), tenant.public_widget_key)} label="Script" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. New widget</CardTitle>
          <CardDescription>
            Works straight away, before the business has set anything up: it fills in as they configure it. The first widget of a type becomes the
            business&apos;s main one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewWidgetForm tenantId={tenant.id} />
        </CardContent>
      </Card>

      <h2 className="mt-2 text-lg font-semibold">3. Widgets: paste a box where each should appear</h2>
      {WIDGET_TYPES.map((type) => {
        const list: (WidgetSummary | null)[] = byType(type).length ? byType(type) : [null];
        const feature = features[WIDGET_FEATURE[type]];
        return (
          <Card key={type}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{WIDGET_TYPE_LABEL[type]}</CardTitle>
                {feature !== "on" && <Badge variant="warning">{feature === "locked" ? "Not in their plan" : "Switched off for this business"}</Badge>}
              </div>
              <CardDescription>{TYPE_HINT[type]}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col divide-y">
              {list.map((w) => (
                <div key={w?.id ?? `${type}-default`} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{w?.name ?? WIDGET_TYPE_LABEL[type]}</span>
                    {(w?.isDefault ?? true) && <Badge variant="secondary">Main</Badge>}
                    <Badge variant={w?.status === "draft" ? "outline" : "success"}>{w?.status === "draft" ? "Draft" : "Live"}</Badge>
                    {w && !w.active && <Badge variant="warning">Turned off by the business</Badge>}
                    {!w && <span className="text-xs text-muted-foreground">Built-in settings until the business saves it</span>}
                    {w && !w.isDefault && <StatusSwitch tenantId={tenant.id} widgetId={w.id} status={w.status} />}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <Snippet code={widgetBox(type, { widgetId: w && !w.isDefault ? w.id : null })} label="On the website" />
                    <Snippet code={widgetBox(type, { widgetId: w && !w.isDefault ? w.id : null, preview: true })} label="While building (sample data, setup notes)" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
