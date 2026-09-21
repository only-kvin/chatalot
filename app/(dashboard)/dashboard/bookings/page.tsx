import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { BookingsTable } from "./bookings-table";

export default async function BookingsPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, name, phone, email, starts_at, status, services(name)")
    .eq("tenant_id", tenantId)
    .order("starts_at", { ascending: false });

  const rows = (bookings ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    phone: b.phone,
    email: b.email,
    starts_at: b.starts_at,
    status: b.status,
    service_name: (b.services as { name: string }[] | null)?.[0]?.name ?? "Unknown service",
  }));

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Bookings</h1>
      <BookingsTable bookings={rows} />
    </div>
  );
}
