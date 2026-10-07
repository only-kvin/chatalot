import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { DashboardNav } from "./dashboard-nav";
import { PageTransition } from "./page-transition";
import { ThemeSync } from "@/components/dashboard/theme-switcher";

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
  const [{ data: adminRow }, { data: tenant }] = await Promise.all([
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
  ]);

  return (
    <div className="app-backdrop flex min-h-screen flex-col md:flex-row">
      <ThemeSync />
      <DashboardNav isPlatformAdmin={!!adminRow} tenantName={tenant?.name ?? null} />
      <PageTransition>{children}</PageTransition>
    </div>
  );
}
