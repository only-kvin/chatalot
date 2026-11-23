import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { requireFeaturePage } from "@/lib/dashboard-features";
import { onlinePaymentAccount } from "@/lib/payments/request";
import { todayLocalISO } from "@/lib/time";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { pageFrame } from "@/components/dashboard/page-frame";
import { ClassForm } from "../class-form";

export default async function NewClassPage() {
  const tenantId = await requireFeaturePage("events");
  const supabase = await createClient();
  const [{ data: staff }, account] = await Promise.all([
    supabase.from("staff").select("id, name").eq("tenant_id", tenantId).eq("active", true).order("sort_order").order("name"),
    onlinePaymentAccount(createAdminClient(), tenantId),
  ]);
  return (
    <div className={pageFrame("form")}>
      <Link href="/dashboard/classes" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Classes
      </Link>
      <PageHeader title="New class" description="A class that happens every week. Its sessions are created eight weeks ahead." />
      <Card>
        <CardContent className="pt-6">
          <ClassForm
            classId={null}
            staff={staff ?? []}
            canTakePayments={Boolean(account)}
            initial={{
              title: "",
              description: "",
              staff_id: "",
              weekdays: [],
              start_time: "18:00",
              duration_minutes: 60,
              capacity: "",
              price: "",
              location: "",
              starts_on: todayLocalISO(),
              ends_on: "",
              active: true,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
