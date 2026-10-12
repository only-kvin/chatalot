import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/db/auth";
import { createAdminClient } from "@/lib/db/supabase-admin";

// Staff logins. A staff member isn't a tenant member, so RLS gives them
// nothing; their schedule is read with the service role, always filtered to
// the staff rows returned here.

export type StaffSeat = { staffId: string; tenantId: string; name: string; businessName: string };

export function normalEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Links open invites for this email to the user. Magic-link sign-in has
// proved they own the address, so the invite is theirs to take.
export async function claimInvites(admin: SupabaseClient, userId: string, email: string): Promise<void> {
  const { error } = await admin
    .from("staff")
    .update({ user_id: userId })
    // Exact match: emails are saved lowercased (an ilike would treat "_" in
    // an address as a wildcard).
    .eq("email", normalEmail(email))
    .not("invited_at", "is", null)
    .is("user_id", null);
  if (error) console.error(`Linking staff invites for ${userId} failed:`, error);
}

// A user's staff seats (one per business that invited them), active staff
// only, after taking any open invites for their email.
export async function staffSeatsFor(admin: SupabaseClient, userId: string, email: string | null): Promise<StaffSeat[]> {
  if (email) await claimInvites(admin, userId, email);
  const { data } = await admin.from("staff").select("id, tenant_id, name, active").eq("user_id", userId).eq("active", true);
  const rows = data ?? [];
  if (!rows.length) return [];
  const { data: configs } = await admin
    .from("agent_configs")
    .select("tenant_id, business_name")
    .in("tenant_id", [...new Set(rows.map((r) => r.tenant_id))]);
  const names = new Map((configs ?? []).map((c) => [c.tenant_id, c.business_name as string]));
  return rows.map((r) => ({ staffId: r.id, tenantId: r.tenant_id, name: r.name, businessName: names.get(r.tenant_id) ?? "" }));
}

// The signed-in user's staff seats, once per request.
export const getStaffSeats = cache(async (): Promise<StaffSeat[]> => {
  const user = await getSessionUser();
  if (!user) return [];
  return staffSeatsFor(createAdminClient(), user.id, user.email);
});
