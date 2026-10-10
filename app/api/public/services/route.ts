import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { checkWidgetReadLimit } from "@/lib/security/rate-limit";
import { clientIp, preflight, resolvePublicTenant } from "@/lib/widgets/public-request";

export const OPTIONS = preflight;

// The services a business shows on its website, the staff who offer each
// one, and what customers need to know about call-outs (areas covered,
// cancellation policy, the business's address). No customer data.
export async function GET(request: Request) {
  const resolved = await resolvePublicTenant(request, new URL(request.url).searchParams.get("key"), "bookings");
  if (resolved instanceof Response) return resolved;
  const { tenantId, headers } = resolved;
  if (!(await checkWidgetReadLimit(clientIp(request)))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers });
  }

  const admin = createAdminClient();
  const [{ data: services }, { data: staff }, { data: links }, { data: config }] = await Promise.all([
    admin
      .from("services")
      .select(
        "id, name, description, category, duration_minutes, price_cents, location, price_type, callout_fee_cents, arrival_window_minutes",
      )
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .eq("online_bookable", true)
      .order("sort_order")
      .order("name"),
    admin
      .from("staff")
      .select("id, name, role, avatar_url")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("sort_order")
      .order("name"),
    admin.from("staff_services").select("staff_id, service_id").eq("tenant_id", tenantId),
    admin
      .from("agent_configs")
      .select("service_areas, cancellation_policy, business_address")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const staffIds = (staff ?? []).map((p) => p.id);
  return NextResponse.json(
    {
      services: (services ?? []).map((s) => {
        const linked = (links ?? []).filter((l) => l.service_id === s.id).map((l) => l.staff_id);
        return {
          id: s.id,
          name: s.name,
          description: s.description,
          category: s.category,
          durationMinutes: s.duration_minutes,
          priceCents: s.price_cents,
          location: s.location,
          priceType: s.price_type,
          calloutFeeCents: s.callout_fee_cents,
          arrivalWindowMinutes: s.arrival_window_minutes,
          // Who can do it: those linked, or everyone when nobody is.
          staffIds: linked.length ? linked.filter((id) => staffIds.includes(id)) : staffIds,
        };
      }),
      staff: (staff ?? []).map((p) => ({ id: p.id, name: p.name, role: p.role, avatarUrl: p.avatar_url })),
      business: {
        serviceAreas: config?.service_areas ?? [],
        cancellationPolicy: config?.cancellation_policy ?? "",
        address: config?.business_address ?? "",
      },
    },
    { headers },
  );
}
