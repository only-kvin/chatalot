import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getAvailability, MAX_RANGE_DAYS } from "@/lib/bookings/availability";
import { checkWidgetReadLimit } from "@/lib/security/rate-limit";
import { addDays } from "@/lib/time";
import { clientIp, preflight, resolvePublicTenant } from "@/lib/widgets/public-request";

export const OPTIONS = preflight;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z
  .object({
    service: z.string().uuid(),
    staff: z.string().uuid().optional(),
    from: date,
    to: date,
  })
  .refine((q) => q.from <= q.to && q.to < addDays(q.from, MAX_RANGE_DAYS), "Invalid range");

// Bookable times per day for a service, from the same engine the AI and the
// dashboard use. Fully booked times are included as unavailable so the
// widget can show a busy day as busy. Staff ids aren't exposed per slot.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const resolved = await resolvePublicTenant(request, params.get("key"));
  if (resolved instanceof Response) return resolved;
  const { tenantId, headers } = resolved;
  if (!(await checkWidgetReadLimit(clientIp(request)))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers });
  }

  const parsed = querySchema.safeParse({
    service: params.get("service"),
    staff: params.get("staff") || undefined,
    from: params.get("from"),
    to: params.get("to"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
  const q = parsed.data;

  const admin = createAdminClient();
  // Only services the business shows on its website.
  const { data: service } = await admin
    .from("services")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", q.service)
    .eq("active", true)
    .eq("online_bookable", true)
    .maybeSingle();
  if (!service) return NextResponse.json({ error: "Not found" }, { status: 404, headers });

  try {
    const availability = await getAvailability(admin, tenantId, {
      serviceId: q.service,
      staffId: q.staff,
      fromDate: q.from,
      toDate: q.to,
    });
    if (!availability) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
    return NextResponse.json(
      {
        days: availability.days.map((d) => ({
          date: d.date,
          slots: d.slots.map((s) => ({ time: s.time, available: s.staffIds.length > 0 })),
        })),
      },
      { headers },
    );
  } catch (err) {
    console.error(`Widget availability for ${tenantId} failed:`, err);
    return NextResponse.json({ error: "Unavailable" }, { status: 500, headers });
  }
}
