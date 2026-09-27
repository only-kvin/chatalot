import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { DashboardNav } from "./dashboard-nav";
import { PageTransition } from "./page-transition";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  // RLS on platform_admins only returns the caller's own row, so this is the
  // same check the /admin layout makes.
  const { data: adminRow } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 md:flex-row dark:bg-black">
      <DashboardNav isPlatformAdmin={!!adminRow} />
      <PageTransition>{children}</PageTransition>
    </div>
  );
}
