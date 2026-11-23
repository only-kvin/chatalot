import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireFeaturePage } from "@/lib/dashboard-features";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { onlinePaymentAccount } from "@/lib/payments/request";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { pageFrame } from "@/components/dashboard/page-frame";
import { BLANK_EVENT, EventForm } from "../event-form";

export default async function NewEventPage() {
  const tenantId = await requireFeaturePage("events");
  const canTakePayments = Boolean(await onlinePaymentAccount(createAdminClient(), tenantId));
  return (
    <div className={pageFrame("form")}>
      <Link href="/dashboard/events" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Events
      </Link>
      <PageHeader title="New event" description="You can add a poster once it's created." />
      <Card>
        <CardContent className="pt-6">
          <EventForm eventId={null} initial={BLANK_EVENT} canTakePayments={canTakePayments} />
        </CardContent>
      </Card>
    </div>
  );
}
