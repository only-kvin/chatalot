import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { ThemeSwitcher, ThemeSync } from "@/components/dashboard/theme-switcher";

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

  if (!adminRow) redirect("/dashboard");

  return (
    <div className="app-backdrop relative min-h-screen">
      <ThemeSync />
      <div className="absolute top-4 right-4 z-10">
        <ThemeSwitcher compact />
      </div>
      {children}
    </div>
  );
}
