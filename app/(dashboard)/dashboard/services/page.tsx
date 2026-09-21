import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { ServicesEditor } from "./services-editor";

export default async function ServicesPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("id, name, description, duration_minutes, price_cents, active")
    .eq("tenant_id", tenantId)
    .order("name");

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-1 text-2xl font-semibold">Services</h1>
      <p className="mb-6 text-sm text-zinc-500">
        What your AI receptionist can book appointments for.
      </p>
      <ServicesEditor initialServices={services ?? []} />
    </div>
  );
}
