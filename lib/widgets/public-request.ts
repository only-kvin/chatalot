import { createAdminClient } from "@/lib/db/supabase-admin";
import { isOriginAllowed, isOwnAppRequest } from "@/lib/security/origin-check";
import { parsePlan, resolveFeatures, type Feature } from "@/lib/plans";

// Shared front door for the public widget API. Resolves the business from
// its public widget key server-side, refuses suspended businesses and
// websites not on their allowed list, and only then hands out CORS headers,
// so other sites can't read anything. Errors stay generic.

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function corsHeaders(origin: string | null, methods = "GET, POST, OPTIONS"): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

// Preflights carry no key, so the origin can't be checked yet; echoing it is
// harmless because real responses only get CORS headers after the check.
export function preflight(request: Request): Response {
  return new Response(null, { headers: corsHeaders(request.headers.get("origin")) });
}

export type PublicTenant = {
  tenantId: string;
  origin: string | null;
  headers: Record<string, string>;
};

// `feature`: the plan feature this endpoint belongs to. A business without it
// gets the same 404 as an unknown key — customers never see plans.
export async function resolvePublicTenant(
  request: Request,
  key: string | null | undefined,
  feature: Feature,
): Promise<PublicTenant | Response> {
  if (!key || key.length > 100) return Response.json({ error: "Not found" }, { status: 404 });
  const origin = request.headers.get("origin");
  const { data: tenant } = await createAdminClient()
    .from("tenants")
    .select("id, status, allowed_domains, plan, feature_overrides")
    .eq("public_widget_key", key)
    .maybeSingle();
  // A business waiting for approval can still preview its widgets in its own
  // dashboard (requests from our own pages); every other site gets a 404.
  const ownApp = isOwnAppRequest(request);
  if (!tenant || !(tenant.status === "active" || (tenant.status === "pending" && ownApp))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (resolveFeatures(parsePlan(tenant.plan), tenant.feature_overrides)[feature] !== "on") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!ownApp && !isOriginAllowed(origin, tenant.allowed_domains)) {
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  }
  return { tenantId: tenant.id, origin, headers: corsHeaders(origin) };
}
