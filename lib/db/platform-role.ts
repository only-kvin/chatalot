import { cache } from "react";
import { getSessionUser } from "./auth";
import { createClient } from "./supabase-server";

// The signed-in user's role on the platform itself (not in a business):
// admin = everything in /admin and /studio; staff = the website-factory
// team, /studio only. RLS lets each user read only their own row, so the
// user's client is enough.
export type PlatformRole = "admin" | "staff";

export const getPlatformRole = cache(async (): Promise<PlatformRole | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const [{ data: admin }, { data: staff }] = await Promise.all([
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("platform_staff").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);
  return admin ? "admin" : staff ? "staff" : null;
});
