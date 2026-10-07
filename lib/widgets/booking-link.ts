import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/app-url";
import { loadWidget } from "./config";

// Where a customer can book online by themselves: the business's own page
// with the appointment widget on it (Settings → Online booking page), or
// else ChatAlot's hosted page /book/<slug>. A service can be filled in with
// ?ca_service=<id>; the appointment widget opens on it.
export const SERVICE_PARAM = "ca_service";

export function bookingLink(o: { customUrl: string | null; slug: string; serviceId?: string | null }): string {
  const url = new URL(o.customUrl || appUrl(`/book/${encodeURIComponent(o.slug)}`));
  if (o.serviceId) url.searchParams.set(SERVICE_PARAM, o.serviceId);
  return url.toString();
}

// null when online booking is switched off (the appointment widget is off).
export async function bookingLinkFor(
  admin: SupabaseClient,
  tenantId: string,
  serviceId: string | null,
): Promise<string | null> {
  const [{ data: tenant }, { data: config }, widget] = await Promise.all([
    admin.from("tenants").select("slug").eq("id", tenantId).single(),
    admin.from("agent_configs").select("booking_page_url").eq("tenant_id", tenantId).maybeSingle(),
    loadWidget(admin, tenantId, "appointment"),
  ]);
  if (!tenant || !widget.active) return null;
  return bookingLink({ customUrl: config?.booking_page_url ?? null, slug: tenant.slug, serviceId });
}
