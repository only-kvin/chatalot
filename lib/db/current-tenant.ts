import { createClient } from "./supabase-server";

// Phase 1 simplification: a user belongs to at most one tenant in practice
// right now, so this returns their first membership. Multi-tenant-per-user
// tenant switching isn't built yet.
export async function getCurrentTenantId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  return data?.tenant_id ?? null;
}
