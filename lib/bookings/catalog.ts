import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriceType, ServiceLocation } from "./price-label";

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

export type ActiveService = {
  id: string;
  name: string;
  duration_minutes: number;
  location: ServiceLocation;
  price_type: PriceType;
  price_cents: number | null;
  callout_fee_cents: number | null;
  arrival_window_minutes: number | null;
};

export async function listActiveServices(supabase: SupabaseClient, tenantId: string): Promise<ActiveService[]> {
  const { data } = await supabase
    .from("services")
    .select("id, name, duration_minutes, location, price_type, price_cents, callout_fee_cents, arrival_window_minutes")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("name");
  return data ?? [];
}

export async function findServiceByName(
  supabase: SupabaseClient,
  tenantId: string,
  name: string,
): Promise<ActiveService | null> {
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

// ---------------------------------------------------------------------------
// Staff, for the AI: who works here and what they offer.
// ---------------------------------------------------------------------------

export type StaffSummary = {
  id: string;
  name: string;
  role: string;
  // Service names they offer (a service nobody is linked to: everyone).
  services: string[];
};

export async function listActiveStaff(supabase: SupabaseClient, tenantId: string): Promise<StaffSummary[]> {
  const [{ data: staff }, { data: services }, { data: links }] = await Promise.all([
    supabase.from("staff").select("id, name, role").eq("tenant_id", tenantId).eq("active", true).order("sort_order").order("name"),
    supabase.from("services").select("id, name").eq("tenant_id", tenantId).eq("active", true).order("name"),
    supabase.from("staff_services").select("staff_id, service_id").eq("tenant_id", tenantId),
  ]);
  const linked = new Set((links ?? []).map((l) => l.service_id));
  return (staff ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    services: (services ?? [])
      .filter((s) => !linked.has(s.id) || (links ?? []).some((l) => l.staff_id === p.id && l.service_id === s.id))
      .map((s) => s.name),
  }));
}

// The person the visitor named, or null if unknown or ambiguous. A full
// name wins; otherwise a first name that only one person has.
export function matchStaff<T extends { name: string }>(staff: T[], query: string): T | null {
  const q = normalizeServiceName(query);
  if (!q) return null;
  const exact = staff.filter((p) => normalizeServiceName(p.name) === q);
  if (exact.length === 1) return exact[0];
  const byFirst = staff.filter((p) => normalizeServiceName(p.name).split(" ")[0] === q);
  return byFirst.length === 1 ? byFirst[0] : null;
}
