import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePlan, resolveFeatures, type Feature, type Features, type Plan } from "@/lib/plans";

// Loading a tenant's plan and features. Works with either client: public
// routes pass the service-role client; dashboard code uses the user's
// (members can read their own tenant row).
export async function loadTenantFeatures(
  client: SupabaseClient,
  tenantId: string,
): Promise<{ plan: Plan; features: Features }> {
  const { data } = await client
    .from("tenants")
    .select("plan, feature_overrides")
    .eq("id", tenantId)
    .maybeSingle();
  const plan = parsePlan(data?.plan);
  return { plan, features: resolveFeatures(plan, data?.feature_overrides) };
}

// True only when the feature is usable. Customers and the AI see locked
// and hidden features the same way: as if they didn't exist.
export async function hasFeature(client: SupabaseClient, tenantId: string, feature: Feature): Promise<boolean> {
  return (await loadTenantFeatures(client, tenantId)).features[feature] === "on";
}

// A memoised lookup for background jobs that walk many tenants' rows.
export function tenantFeaturesLookup(client: SupabaseClient): (tenantId: string) => Promise<Features> {
  const cache = new Map<string, Promise<Features>>();
  return (tenantId) => {
    if (!cache.has(tenantId)) cache.set(tenantId, loadTenantFeatures(client, tenantId).then((r) => r.features));
    return cache.get(tenantId)!;
  };
}
