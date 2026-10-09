import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/db/auth";
import { getCurrentTenantId } from "@/lib/db/current-tenant";

export const metadata: Metadata = { robots: { index: false } };

// Where proxy.ts sends signed-in visitors to "/" (the URL stays "/"): staff
// go on to their dashboard; anyone not linked to a business yet sees why.
// Dashboard pages send tenant-less users back to "/", which lands here too.
export default async function Welcome() {
  const user = await getSessionUser();
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
