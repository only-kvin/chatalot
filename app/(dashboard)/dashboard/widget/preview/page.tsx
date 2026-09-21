import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";

// Embedded in an iframe by the widget settings page. Renders the *real* widget
// bundle against the tenant's real config (via the same public /api/widget/config
// endpoint a real client site would hit) — not a mockup — so the preview reflects
// live saved settings exactly.
export default async function WidgetPreviewPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("public_widget_key")
    .eq("id", tenantId)
    .single();
  if (!tenant) redirect("/");

  return (
    <div style={{ minHeight: "100vh", fontFamily: "sans-serif", background: "#fafafa" }}>
      <div style={{ padding: 24, color: "#71717a", fontSize: 13 }}>
        Preview host page — the widget below is the real bundle, live from your saved settings.
      </div>
      <script src="/widget.js" data-key={tenant.public_widget_key} async />
    </div>
  );
}
