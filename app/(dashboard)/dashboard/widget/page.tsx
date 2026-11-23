import Link from "next/link";
import { appUrl } from "@/lib/app-url";
import { redirect } from "next/navigation";
import { cn } from "cn";
import { createClient } from "@/lib/db/supabase-server";
import { currentTenantFeatures } from "@/lib/dashboard-features";
import { WIDGET_FEATURE } from "@/lib/plans";
import { loadWidget, loadWidgetTheme, WIDGET_TYPE_LABEL } from "@/lib/widgets/config";
import { listWidgets, widgetBox } from "@/lib/widgets/instances";
import { WidgetList, type ListedWidget } from "./widget-list";
import { PageHeader } from "@/components/dashboard/page-header";
import { WidgetEditor } from "./widget-editor";
import { BookingWidgetTab, WidgetSnippet } from "./booking-widget-editor";
import { pageFrame } from "@/components/dashboard/page-frame";

const TABS = [
  { id: "chat", label: "Chat" },
  { id: "schedule", label: "Schedule" },
  { id: "appointment", label: "Appointment" },
  { id: "contact", label: "Contact" },
  { id: "registration", label: "Registration" },
  { id: "events", label: "Events" },
  { id: "classes", label: "Classes" },
] as const;

export default async function WidgetPage({ searchParams }: { searchParams: Promise<{ tab?: string; w?: string }> }) {
  const current = await currentTenantFeatures();
  if (!current) redirect("/");
  const { tenantId, features } = current;
  // Only widgets on their plan; the menu's lock is where the rest are offered.
  const tabs = TABS.filter((t) => features[WIDGET_FEATURE[t.id]] === "on");
  const { tab: requested, w: requestedWidget } = await searchParams;
  const tab = (tabs.find((t) => t.id === requested) ?? tabs[0])?.id;
  if (!tab) {
    return (
      <div className={pageFrame("wide")}>
        <PageHeader title="Widgets" description="No website widgets are included in your plan." />
      </div>
    );
  }

  const supabase = await createClient();
  const { data: tenant } = await supabase.from("tenants").select("public_widget_key").eq("id", tenantId).single();
  const script = `<script src="${appUrl("/widget.js")}" data-key="${tenant?.public_widget_key ?? ""}" async></script>`;

  const nav = (
    <nav className="mb-6 flex gap-1 border-b" aria-label="Widgets">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.id === "chat" ? "/dashboard/widget" : `/dashboard/widget?tab=${t.id}`}
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
  );

  if (tab !== "chat") {
    const all = (await listWidgets(supabase, tenantId)).filter((w) => w.type === tab);
    // The main widget first (a business that never saved one still has it, on built-in settings).
    const widgets: ListedWidget[] = all.some((w) => w.isDefault)
      ? all.map((w) => ({ id: w.id, name: w.name, status: w.status, isDefault: w.isDefault }))
      : [{ id: null, name: WIDGET_TYPE_LABEL[tab], status: "live", isDefault: true }, ...all.map((w) => ({ id: w.id, name: w.name, status: w.status, isDefault: w.isDefault }))];
    const chosen = widgets.find((w) => w.id && w.id === requestedWidget && !w.isDefault) ?? null;
    const [theme, instance] = await Promise.all([loadWidgetTheme(supabase, tenantId), loadWidget(supabase, tenantId, tab, chosen?.id)]);
    return (
      <div className={pageFrame("wide")}>
        <PageHeader title="Widgets" description="What customers see on your website." />
        {nav}
        <div className="flex flex-col gap-8">
          <WidgetList key={`${tab}-${chosen?.id ?? "main"}`} type={tab} widgets={widgets} selectedId={chosen?.id ?? widgets[0]?.id ?? null} />
          <WidgetSnippet type={tab} snippet={`${widgetBox(tab, { widgetId: chosen?.id })}
${script}`} />
          <BookingWidgetTab
            key={`${tab}-${chosen?.id ?? "main"}`}
            type={tab}
            widgetId={chosen?.id ?? null}
            theme={theme}
            initial={{
              active: instance.active,
              copy: instance.copy as Record<string, string>,
              settings: instance.settings as Record<string, boolean>,
              fields: instance.fields,
            }}
          />
        </div>
      </div>
    );
  }

  const { data: settings } = await supabase
    .from("widget_settings")
    .select("primary_color, position, avatar_url, assistant_name, icon_on_launcher, launcher_text, teaser_text, quick_replies, whatsapp_link")
    .eq("tenant_id", tenantId)
    .single();

  return (
    <div className={pageFrame("wide")}>
      <PageHeader title="Widgets" description="What customers see on your website." />
      {nav}
      <WidgetEditor
        snippet={script}
        initialSettings={{
          primary_color: settings?.primary_color ?? "#4f46e5",
          position: (settings?.position as "bottom-right" | "bottom-left") ?? "bottom-right",
          avatar_url: settings?.avatar_url ?? "",
          assistant_name: settings?.assistant_name ?? "",
          icon_on_launcher: settings?.icon_on_launcher ?? true,
          launcher_text: settings?.launcher_text ?? "Chat with us",
          teaser_text: settings?.teaser_text ?? "",
          quick_replies: settings?.quick_replies ?? [],
          whatsapp_link: settings?.whatsapp_link ?? "",
        }}
      />
    </div>
  );
}
