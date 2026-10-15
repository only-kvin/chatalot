import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getSessionUser } from "@/lib/db/auth";
import { currentTenantFeatures } from "@/lib/dashboard-features";
import { getStaffSeats } from "@/lib/staff/access";
import { ThemeScript } from "@/components/theme/theme-script";
import { parseTheme, THEME_COOKIE } from "@/components/theme/theme";
import { DashboardNav } from "./dashboard-nav";
import { PageTransition } from "./page-transition";
import { DeclinedNotice, PendingBanner } from "./approval-status";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  // RLS on platform_admins only returns the caller's own row, so this is the
  // same check the /admin layout makes. It doesn't need the tenant, so it
  // runs alongside the tenant lookup.
  const [current, { data: adminRow }] = await Promise.all([
    currentTenantFeatures(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!current) {
    // Staff logins aren't business members: their place is their schedule.
    if ((await getStaffSeats()).length) redirect("/schedule");
    redirect("/");
  }
  const { tenantId, features } = current;

  const [{ data: config }, { count: needsYou }, { data: tenant }] = await Promise.all([
    supabase.from("agent_configs").select("business_name").eq("tenant_id", tenantId).maybeSingle(),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "human"),
    supabase.from("tenants").select("status").eq("id", tenantId).maybeSingle(),
  ]);
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  // A self-serve sign-up the platform admin turned down: nothing to manage.
  if (tenant?.status === "declined") return <DeclinedNotice />;

  return (
    <div className="app-backdrop flex min-h-screen flex-col md:flex-row">
      <ThemeScript />
      <DashboardNav
        isPlatformAdmin={!!adminRow}
        businessName={config?.business_name ?? ""}
        userEmail={user.email ?? ""}
        needsYou={needsYou ?? 0}
        theme={theme}
        features={features}
      />
      <PageTransition>
        {tenant?.status === "pending" && <PendingBanner />}
        {children}
      </PageTransition>
    </div>
  );
}
