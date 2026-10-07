import type { SupabaseClient } from "@supabase/supabase-js";

// Finding services by name — what the AI does when a visitor says "a cut".
// The widgets pick services by id instead.

function normalizeServiceName(s: string): string {
  return s.toLowerCase().replace(/[‘’`]/g, "'").replace(/\s+/g, " ").trim();
}

// Picks the service the model named, or null if it's unknown or ambiguous (the
// caller then lists the real names). An exact name wins; otherwise the query
// must appear as whole words in exactly one service — a plain substring match
// once booked "Men's Cut" as "Women's Cut & Blow-dry".
export function matchService<T extends { name: string }>(services: T[], query: string): T | null {
  const q = normalizeServiceName(query);
  if (!q) return null;

  const exact = services.filter((s) => normalizeServiceName(s.name) === q);
  if (exact.length === 1) return exact[0];

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wholeWords = new RegExp(`(^|[^a-z0-9'])${escaped}($|[^a-z0-9'])`);
  const partial = services.filter((s) => wholeWords.test(normalizeServiceName(s.name)));
  return partial.length === 1 ? partial[0] : null;
}

export async function listActiveServices(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ id: string; name: string; duration_minutes: number }[]> {
  const { data } = await supabase
    .from("services")
    .select("id, name, duration_minutes")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("name");
  return data ?? [];
}

export async function findServiceByName(
  supabase: SupabaseClient,
  tenantId: string,
  name: string,
): Promise<{ id: string; name: string; duration_minutes: number } | null> {
  return matchService(await listActiveServices(supabase, tenantId), name);
}

export async function listActiveServiceNames(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("services")
    .select("name")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  return (data ?? []).map((s) => s.name);
}
