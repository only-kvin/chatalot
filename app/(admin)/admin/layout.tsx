import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS on platform_admins only ever returns the caller's own row, so this
  // is exactly the admin check — no service-role client needed here.
  const { data: adminRow } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // /dashboard doesn't exist until Phase 2 — send non-admins home for now.
  if (!adminRow) redirect("/");

  return <div className="min-h-screen bg-zinc-50 dark:bg-black">{children}</div>;
}
