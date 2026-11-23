import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { checkWidgetReadLimit } from "@/lib/security/rate-limit";
import { loadWidget } from "@/lib/widgets/config";
import { listPublicEvents } from "@/lib/events/public";
import { clientIp, preflight, resolvePublicTenant } from "@/lib/widgets/public-request";

export const OPTIONS = preflight;

// The events a business shows on its website (published ones, soonest
// first), with posters and spots left. No customer data.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const resolved = await resolvePublicTenant(request, url.searchParams.get("key"), "events");
  if (resolved instanceof Response) return resolved;
  const { tenantId, headers } = resolved;
  if (!(await checkWidgetReadLimit(clientIp(request)))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers });
  }

  const admin = createAdminClient();
  // The widget's own setting decides whether past events show.
  const widget = await loadWidget(admin, tenantId, "events", url.searchParams.get("id"));
  const events = await listPublicEvents(admin, tenantId, { showPast: widget.settings.showPast });
  return NextResponse.json({ events }, { headers });
}
