import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { checkWidgetReadLimit } from "@/lib/security/rate-limit";
import { listPublicClasses } from "@/lib/classes/public";
import { clientIp, preflight, resolvePublicTenant } from "@/lib/widgets/public-request";

export const OPTIONS = preflight;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// The class timetable between two SA dates (at most five weeks), for the
// Find a Class widget. Instructor names and photos; no customer data.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const resolved = await resolvePublicTenant(request, url.searchParams.get("key"), "events");
  if (resolved instanceof Response) return resolved;
  const { tenantId, headers } = resolved;
  if (!(await checkWidgetReadLimit(clientIp(request)))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers });
  }
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!DATE.test(from) || !DATE.test(to) || to < from) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD dates" }, { status: 400, headers });
  }
  const classes = await listPublicClasses(createAdminClient(), tenantId, { from, to });
  return NextResponse.json({ classes }, { headers });
}
