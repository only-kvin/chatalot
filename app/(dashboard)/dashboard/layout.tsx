import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { currentTenantFeatures } from "@/lib/dashboard-features";
import { ThemeScript } from "@/components/theme/theme-script";
import { parseTheme, THEME_COOKIE } from "@/components/theme/theme";
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

  const current = await currentTenantFeatures();
  if (!current) redirect("/");
  const { tenantId, features } = current;

  // RLS on platform_admins only returns the caller's own row, so this is the
  // same check the /admin layout makes.
  const [{ data: adminRow }, { data: config }, { count: needsYou }] = await Promise.all([
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("agent_configs").select("business_name").eq("tenant_id", tenantId).maybeSingle(),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "human"),
  ]);
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

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
      <PageTransition>{children}</PageTransition>
    </div>
  );
}
