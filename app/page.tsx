import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tenantId = await getCurrentTenantId();
  if (tenantId) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-zinc-50 p-4 text-center dark:bg-black">
      <p className="text-lg font-medium">You&apos;re signed in, but not linked to a business yet.</p>
      <p className="text-sm text-zinc-500">Ask the platform admin to add you to a tenant.</p>
    </div>
  );
}
