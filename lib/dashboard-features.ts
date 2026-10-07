import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { loadTenantFeatures } from "@/lib/features";
import type { Feature } from "@/lib/plans";

// Plan features for the signed-in dashboard user (see lib/features.ts for
// the plain loaders the public routes and background jobs use).

// The signed-in user's tenant and features, once per request.
export const currentTenantFeatures = cache(async () => {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return null;
  return { tenantId, ...(await loadTenantFeatures(await createClient(), tenantId)) };
});

// For dashboard pages of a gated area: locked → the upgrade page, hidden →
// 404 (the owner shouldn't know it exists).
export async function requireFeaturePage(feature: Feature): Promise<string> {
  const current = await currentTenantFeatures();
  if (!current) redirect("/");
  const state = current.features[feature];
  if (state === "hidden") notFound();
  if (state === "locked") redirect(`/dashboard/upgrade/${feature}`);
  return current.tenantId;
}

// For server actions of a gated area: an error message, or null when allowed.
export async function featureError(feature: Feature): Promise<string | null> {
  const current = await currentTenantFeatures();
  if (!current) return "Not authorized.";
  return current.features[feature] === "on" ? null : "That isn't included in your plan.";
}
