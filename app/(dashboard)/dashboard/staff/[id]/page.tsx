import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { StaffAvatar } from "@/components/dashboard/staff-avatar";
import { WeeklyHours } from "@/components/dashboard/weekly-hours";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteStaff, HoursMode, StaffDetailsForm, StaffServices, TimeOff } from "./staff-editor";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function StaffMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("staff")
    .select("id, name, role, avatar_url, active, max_concurrent")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!person) notFound();

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const [{ data: services }, { data: links }, { data: rules }, { data: timeOff }, { count: upcoming }, { count: ever }] =
    await Promise.all([
      supabase.from("services").select("id, name").eq("tenant_id", tenantId).eq("active", true).order("name"),
      supabase.from("staff_services").select("staff_id, service_id").eq("tenant_id", tenantId),
      supabase.from("availability_rules").select("id, weekday, start_time, end_time").eq("tenant_id", tenantId).eq("staff_id", id),
      // Upcoming time off, plus the last month for reference.
      supabase
        .from("time_off")
        .select("id, starts_at, ends_at, reason")
        .eq("tenant_id", tenantId)
        .eq("staff_id", id)
        .gte("ends_at", new Date(nowDate.getTime() - 30 * DAY_MS).toISOString())
        .order("starts_at"),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("staff_id", id)
        .eq("status", "confirmed")
        .gte("starts_at", now),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("staff_id", id),
    ]);

  // Per service: does anyone-at-all do it (no links), and does this person?
  const serviceOptions = (services ?? []).map((svc) => {
    const linked = (links ?? []).filter((l) => l.service_id === svc.id);
    return {
      id: svc.id,
      name: svc.name,
      anyone: linked.length === 0,
      offered: linked.length === 0 || linked.some((l) => l.staff_id === id),
    };
  });
  const ownHours = (rules ?? []).length > 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div>
        <Link href="/dashboard/staff" className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Staff
        </Link>
        <div className="flex items-center gap-3">
          <StaffAvatar name={person.name} url={person.avatar_url} className="size-12" />
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              {person.name}
              {!person.active && <Badge variant="secondary">Inactive</Badge>}
            </h1>
            {person.role && <p className="text-sm text-zinc-500">{person.role}</p>}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <StaffDetailsForm
            staff={person}
            upcomingBookings={upcoming ?? 0}
            bookingsHref={`/dashboard/bookings?staff=${person.id}`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Services</CardTitle>
          <CardDescription>
            What customers can book with {person.name}. Services marked &ldquo;everyone&rdquo; are offered by all
            staff; choose who offers those on the Services page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StaffServices staffId={person.id} services={serviceOptions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Working hours</CardTitle>
          <CardDescription>
            {ownHours
              ? `${person.name}'s own hours. Add two sets of hours on a day for a break, e.g. 09:00–13:00 and 14:00–18:00.`
              : `${person.name} works the business's opening hours (set on the Availability page).`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <HoursMode staffId={person.id} ownHours={ownHours} />
          {ownHours && (
            <WeeklyHours rules={rules ?? []} staffId={person.id} emptyText="No hours yet." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time off</CardTitle>
          <CardDescription>Leave, appointments, a morning off. Customers can&apos;t book them then.</CardDescription>
        </CardHeader>
        <CardContent>
          <TimeOff
            staffId={person.id}
            upcoming={(timeOff ?? []).filter((t) => t.ends_at > now)}
            past={(timeOff ?? []).filter((t) => t.ends_at <= now)}
          />
        </CardContent>
      </Card>

      {!ever && <DeleteStaff staffId={person.id} name={person.name} />}
    </div>
  );
}
