import Link from "next/link";
import { appUrl } from "@/lib/app-url";
import { redirect } from "next/navigation";
import { cn } from "cn";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { loadScheduleWidget, loadWidgetTheme } from "@/lib/widgets/config";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WidgetEditor } from "./widget-editor";
import { ScheduleForm, ScheduleSnippet, ThemeForm } from "./schedule-editor";

const TABS = [
  { id: "chat", label: "Chat" },
  { id: "schedule", label: "Schedule" },
] as const;

export default async function WidgetPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");
  const tab = (await searchParams).tab === "schedule" ? "schedule" : "chat";

  const supabase = await createClient();
  const { data: tenant } = await supabase.from("tenants").select("public_widget_key").eq("id", tenantId).single();
  const script = `<script src="${appUrl("/widget.js")}" data-key="${tenant?.public_widget_key ?? ""}" async></script>`;

  const nav = (
    <nav className="mb-6 flex gap-1 border-b" aria-label="Widgets">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.id === "chat" ? "/dashboard/widget" : `/dashboard/widget?tab=${t.id}`}
          aria-current={tab === t.id ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            tab === t.id ? "border-foreground text-foreground" : "border-transparent text-zinc-500 hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );

  if (tab === "schedule") {
    const [theme, schedule] = await Promise.all([loadWidgetTheme(supabase, tenantId), loadScheduleWidget(supabase, tenantId)]);
    return (
      <div className="mx-auto max-w-3xl p-8">
        <PageHeader title="Widgets" description="What customers see on your website." />
        {nav}
        <div className="flex flex-col gap-8">
          <ScheduleSnippet snippet={`<div data-chatalot="schedule"></div>\n${script}`} />
          <Card>
            <CardHeader>
              <CardTitle>Look</CardTitle>
              <CardDescription>Shared by all your booking widgets, so they match your website.</CardDescription>
            </CardHeader>
            <CardContent>
              <ThemeForm theme={theme} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Schedule widget</CardTitle>
              <CardDescription>
                Customers pick a day and time, then fill in this form. Times come from your services, staff and
                availability.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScheduleForm initial={schedule} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { data: settings } = await supabase
    .from("widget_settings")
    .select("primary_color, position, avatar_url, launcher_text, teaser_text, quick_replies, whatsapp_link")
    .eq("tenant_id", tenantId)
    .single();

  return (
    <div className="mx-auto max-w-5xl p-8">
      <PageHeader title="Widgets" description="What customers see on your website." />
      {nav}
      <WidgetEditor
        snippet={script}
        initialSettings={{
          primary_color: settings?.primary_color ?? "#4f46e5",
          position: (settings?.position as "bottom-right" | "bottom-left") ?? "bottom-right",
          avatar_url: settings?.avatar_url ?? "",
          launcher_text: settings?.launcher_text ?? "Chat with us",
          teaser_text: settings?.teaser_text ?? "",
          quick_replies: settings?.quick_replies ?? [],
          whatsapp_link: settings?.whatsapp_link ?? "",
        }}
      />
    </div>
  );
}
