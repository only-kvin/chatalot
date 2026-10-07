import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { loadScheduleWidget, loadWidgetTheme } from "@/lib/widgets/config";
import { preflight, resolvePublicTenant } from "@/lib/widgets/public-request";

export const OPTIONS = preflight;

// Public widget settings by key. Without `widget` it's the chat widget's
// config (what widget.js has always fetched); `widget=schedule` returns the
// shared look plus that widget's wording, settings and form fields.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const resolved = await resolvePublicTenant(request, url.searchParams.get("key"));
  if (resolved instanceof Response) return resolved;
  const { tenantId, headers } = resolved;
  const admin = createAdminClient();
  const widget = url.searchParams.get("widget");

  if (widget === "schedule") {
    const [theme, schedule, { data: agentConfig }] = await Promise.all([
      loadWidgetTheme(admin, tenantId),
      loadScheduleWidget(admin, tenantId),
      admin.from("agent_configs").select("business_name, handoff_contact").eq("tenant_id", tenantId).single(),
    ]);
    if (!schedule.active) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
    return NextResponse.json(
      {
        businessName: agentConfig?.business_name ?? "",
        // Shown with any error, so customers can still reach the business.
        contact: agentConfig?.handoff_contact ?? "",
        theme,
        copy: schedule.copy,
        settings: schedule.settings,
        fields: schedule.fields,
      },
      { headers },
    );
  }
  if (widget) return NextResponse.json({ error: "Not found" }, { status: 404, headers });

  const [{ data: widgetSettings }, { data: agentConfig }] = await Promise.all([
    admin
      .from("widget_settings")
      .select("primary_color, position, avatar_url, launcher_text, teaser_text, quick_replies, whatsapp_link")
      .eq("tenant_id", tenantId)
      .single(),
    admin.from("agent_configs").select("business_name, greeting").eq("tenant_id", tenantId).single(),
  ]);

  return NextResponse.json(
    {
      businessName: agentConfig?.business_name ?? "",
      greeting: agentConfig?.greeting ?? "Hi! How can I help you today?",
      primaryColor: widgetSettings?.primary_color ?? "#4f46e5",
      position: widgetSettings?.position ?? "bottom-right",
      avatarUrl: widgetSettings?.avatar_url ?? null,
      launcherText: widgetSettings?.launcher_text ?? "Chat with us",
      teaserText: widgetSettings?.teaser_text ?? null,
      quickReplies: widgetSettings?.quick_replies ?? [],
      whatsappLink: widgetSettings?.whatsapp_link ?? null,
    },
    { headers },
  );
}
