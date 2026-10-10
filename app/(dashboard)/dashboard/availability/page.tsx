import { createClient } from "@/lib/db/supabase-server";
import { requireFeaturePage } from "@/lib/dashboard-features";
import { todayLocalISO } from "@/lib/time";
import { PageHeader } from "@/components/dashboard/page-header";
import { WeeklyHours } from "@/components/dashboard/weekly-hours";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingRulesForm, ExceptionsEditor } from "./availability-editor";
import { pageFrame } from "@/components/dashboard/page-frame";

export default async function AvailabilityPage() {
  const tenantId = await requireFeaturePage("bookings");

  const supabase = await createClient();
  const [{ data: rules }, { data: exceptions }, { data: config }] = await Promise.all([
    // Staff members' own hours live on their pages.
    supabase
      .from("availability_rules")
      .select("id, weekday, start_time, end_time")
      .eq("tenant_id", tenantId)
      .is("staff_id", null),
    supabase
      .from("availability_exceptions")
      .select("id, date, is_closed, start_time, end_time")
      .eq("tenant_id", tenantId)
      .gte("date", todayLocalISO()),
    supabase
      .from("agent_configs")
      .select("booking_lead_time_minutes, booking_horizon_days, slot_minutes, booking_change_cutoff_minutes, bookings_need_approval")
      .eq("tenant_id", tenantId)
      .single(),
  ]);

  return (
    <div className={pageFrame("form", "flex flex-col gap-8")}>
      <PageHeader title="Availability" description="When customers can book, and the rules for booking." />

      <Card>
        <CardHeader>
          <CardTitle>Opening hours</CardTitle>
          <CardDescription>
            When the business takes bookings. Staff without their own hours work these.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WeeklyHours
            rules={rules ?? []}
            staffId={null}
            emptyText="No opening hours yet, so nothing can be booked."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Closures and special hours</CardTitle>
          <CardDescription>Public holidays, a late opening, a day off for everyone.</CardDescription>
        </CardHeader>
        <CardContent>
          <ExceptionsEditor exceptions={exceptions ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Booking rules</CardTitle>
        </CardHeader>
        <CardContent>
          <BookingRulesForm
            rules={{
              booking_lead_time_minutes: config?.booking_lead_time_minutes ?? 60,
              booking_horizon_days: config?.booking_horizon_days ?? 60,
              slot_minutes: config?.slot_minutes ?? 15,
              booking_change_cutoff_minutes: config?.booking_change_cutoff_minutes ?? 120,
              bookings_need_approval: config?.bookings_need_approval ?? false,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
