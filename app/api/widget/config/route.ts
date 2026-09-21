import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { isOriginAllowed } from "@/lib/security/origin-check";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const origin = request.headers.get("origin");

  if (!key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, status, allowed_domains")
    .eq("public_widget_key", key)
    .single();

  if (!tenant || tenant.status !== "active") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isOriginAllowed(origin, tenant.allowed_domains)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }

  const [{ data: widgetSettings }, { data: agentConfig }] = await Promise.all([
    admin
      .from("widget_settings")
      .select(
        "primary_color, position, avatar_url, launcher_text, teaser_text, quick_replies, whatsapp_link",
      )
      .eq("tenant_id", tenant.id)
      .single(),
    admin.from("agent_configs").select("business_name, greeting").eq("tenant_id", tenant.id).single(),
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
    { headers: { "Access-Control-Allow-Origin": origin ?? "*" } },
  );
}
