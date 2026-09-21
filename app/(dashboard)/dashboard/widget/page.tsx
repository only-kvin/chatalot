import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { WidgetEditor } from "./widget-editor";

export default async function WidgetPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const [{ data: settings }, { data: tenant }] = await Promise.all([
    supabase
      .from("widget_settings")
      .select("primary_color, position, avatar_url, launcher_text, teaser_text, quick_replies, whatsapp_link")
      .eq("tenant_id", tenantId)
      .single(),
    supabase.from("tenants").select("public_widget_key").eq("id", tenantId).single(),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const snippet = `<script src="${appUrl}/widget.js" data-key="${tenant?.public_widget_key ?? ""}" async></script>`;

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Widget</h1>
      <WidgetEditor
        snippet={snippet}
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
