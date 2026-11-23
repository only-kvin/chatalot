import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { requireFeaturePage } from "@/lib/dashboard-features";
import { onlinePaymentAccount } from "@/lib/payments/request";
import { formatLocalDateTime } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageFrame } from "@/components/dashboard/page-frame";
import { ClassForm } from "../class-form";
import { timetableLabel } from "../labels";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClassPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const tenantId = await requireFeaturePage("events");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("class_series")
    .select("id, title, description, staff_id, weekdays, start_time, duration_minutes, capacity, price_cents, location, starts_on, ends_on, active")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const now = new Date().toISOString();
  const [{ data: staff }, { data: sessions }, account] = await Promise.all([
    supabase.from("staff").select("id, name, active").eq("tenant_id", tenantId).order("sort_order").order("name"),
    supabase.from("events").select("id, starts_at, status, capacity").eq("tenant_id", tenantId).eq("series_id", id).gte("starts_at", now).order("starts_at").limit(60),
    onlinePaymentAccount(createAdminClient(), tenantId),
  ]);
  const ids = (sessions ?? []).map((s) => s.id);
  const { data: signups } = ids.length
    ? await supabase.from("event_signups").select("event_id, quantity, payment_status, payment_due_at").eq("tenant_id", tenantId).eq("status", "confirmed").in("event_id", ids)
    : { data: [] };
  const booked = new Map<string, number>();
  for (const s of signups ?? []) {
    if (s.payment_status === "awaiting" && s.payment_due_at && s.payment_due_at < now) continue;
    booked.set(s.event_id, (booked.get(s.event_id) ?? 0) + s.quantity);
  }

  return (
    <div className={pageFrame("wide", "flex flex-col gap-6")}>
      <div>
        <Link href="/dashboard/classes" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Classes
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{c.title}</h1>
          {!c.active && <Badge variant="secondary">Off the timetable</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{timetableLabel(c)}</p>
        {query.created && <p className="mt-2 text-sm text-green-700 dark:text-green-400">Created. Its sessions for the next eight weeks are below.</p>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Timetable</CardTitle>
            <CardDescription>Changes apply to upcoming sessions. Sessions someone has booked keep their time if you move the class.</CardDescription>
          </CardHeader>
          <CardContent>
            <ClassForm
              key={`${c.title}-${c.active}`}
              classId={c.id}
              staff={(staff ?? []).filter((p) => p.active || p.id === c.staff_id)}
              canTakePayments={Boolean(account)}
              initial={{
                title: c.title,
                description: c.description,
                staff_id: c.staff_id ?? "",
                weekdays: c.weekdays,
                start_time: c.start_time.slice(0, 5),
                duration_minutes: c.duration_minutes,
                capacity: c.capacity ? String(c.capacity) : "",
                price: c.price_cents ? (c.price_cents / 100).toFixed(2) : "",
                location: c.location,
                starts_on: c.starts_on,
                ends_on: c.ends_on ?? "",
                active: c.active,
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Upcoming sessions</CardTitle>
            <CardDescription>Open one to see who&apos;s booked, or to cancel just that session.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Booked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sessions ?? []).map((s) => (
                  <TableRow key={s.id} className={s.status === "cancelled" ? "text-muted-foreground" : ""}>
                    <TableCell>
                      <Link href={`/dashboard/events/${s.id}`} className="hover:underline">
                        {formatLocalDateTime(s.starts_at)}
                      </Link>
                      {s.status === "cancelled" && (
                        <Badge variant="secondary" className="ml-2">
                          Cancelled
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{s.capacity ? `${booked.get(s.id) ?? 0} / ${s.capacity}` : (booked.get(s.id) ?? 0)}</TableCell>
                  </TableRow>
                ))}
                {!sessions?.length && (
                  <TableRow>
                    <TableCell colSpan={2} className="py-6 text-center text-muted-foreground">
                      {c.active ? "No upcoming sessions (check the days and dates)." : "This class is off the timetable."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
