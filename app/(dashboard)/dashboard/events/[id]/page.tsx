import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { requireFeaturePage } from "@/lib/dashboard-features";
import { formatLocalDateTime, formatLocalTime, localDateISO } from "@/lib/time";
import { formatRand } from "@/lib/bookings/price-label";
import { formatShortLocal } from "@/lib/bookings/labels";
import { canonicalPhone, formatPhone } from "@/lib/contacts/phone";
import { paymentBadge } from "@/lib/payments/labels";
import { posterUrl } from "@/lib/events/public";
import { onlinePaymentAccount } from "@/lib/payments/request";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageFrame } from "@/components/dashboard/page-frame";
import { EventForm } from "../event-form";
import { CancelSignupButton, EventActions, PosterUpload } from "../event-controls";
import { STATUS_BADGE } from "../labels";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; copied?: string }> }) {
  const tenantId = await requireFeaturePage("events");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: e } = await supabase
    .from("events")
    .select("id, title, summary, description, starts_at, ends_at, location, poster_path, capacity, max_per_signup, price_cents, signups_open, status")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();

  const admin = createAdminClient();
  const [{ data: signups }, account] = await Promise.all([
    supabase
      .from("event_signups")
      .select("id, name, phone, email, quantity, status, payment_status, amount_due_cents, payment_due_at, contact_id, created_at")
      .eq("tenant_id", tenantId)
      .eq("event_id", id)
      .order("created_at"),
    onlinePaymentAccount(admin, tenantId),
  ]);
  const now = new Date().toISOString();
  const holding = (s: { status: string; payment_status: string; payment_due_at: string | null }) =>
    s.status === "confirmed" && !(s.payment_status === "awaiting" && s.payment_due_at && s.payment_due_at < now);
  const taken = (signups ?? []).filter(holding).reduce((n, s) => n + s.quantity, 0);
  const badge = STATUS_BADGE[e.status] ?? STATUS_BADGE.draft;

  return (
    <div className={pageFrame("wide", "flex flex-col gap-6")}>
      <div>
        <Link href="/dashboard/events" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Events
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{e.title}</h1>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatLocalDateTime(e.starts_at)}
          {e.ends_at ? ` – ${formatLocalTime(e.ends_at)}` : ""} · {e.price_cents ? `${formatRand(e.price_cents)} a ticket` : "Free"} ·{" "}
          {e.capacity ? `${taken} of ${e.capacity} tickets taken` : `${taken} ticket${taken === 1 ? "" : "s"} taken`}
        </p>
        {query.created && <p className="mt-2 text-sm text-green-700 dark:text-green-400">Created. Add a poster, then publish it when you&apos;re ready.</p>}
        {query.copied && <p className="mt-2 text-sm text-green-700 dark:text-green-400">Copied a week later, as a Draft. Check the date and publish it.</p>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <EventForm
              key={e.status}
              eventId={e.id}
              canTakePayments={Boolean(account)}
              initial={{
                title: e.title,
                summary: e.summary,
                description: e.description,
                date: localDateISO(new Date(e.starts_at)),
                start: formatLocalTime(e.starts_at),
                end: e.ends_at ? formatLocalTime(e.ends_at) : "",
                location: e.location,
                capacity: e.capacity ? String(e.capacity) : "",
                max_per_signup: e.max_per_signup,
                price: e.price_cents ? (e.price_cents / 100).toFixed(2) : "",
                signups_open: e.signups_open,
                status: e.status as "draft" | "published" | "cancelled",
              }}
            />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Poster</CardTitle>
            </CardHeader>
            <CardContent>
              <PosterUpload eventId={e.id} posterUrl={posterUrl(admin, e.poster_path)} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <EventActions eventId={e.id} cancelled={e.status === "cancelled"} hasSignups={(signups ?? []).length > 0} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sign-ups</CardTitle>
          <CardDescription>
            {taken} ticket{taken === 1 ? "" : "s"} taken{e.capacity ? ` of ${e.capacity}` : ""}. Customers are saved to Customers when they sign up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Tickets</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Signed up</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(signups ?? []).map((s) => {
                const pay = paymentBadge(s.payment_status, s.amount_due_cents);
                return (
                  <TableRow key={s.id} className={s.status === "cancelled" ? "text-muted-foreground" : ""}>
                    <TableCell>
                      {s.contact_id ? (
                        <Link href={`/dashboard/customers/${s.contact_id}`} className="font-medium hover:underline">
                          {s.name}
                        </Link>
                      ) : (
                        s.name
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatPhone(canonicalPhone(s.phone)) || s.phone}
                      {s.email && <div className="text-xs text-muted-foreground">{s.email}</div>}
                    </TableCell>
                    <TableCell className="tabular-nums">{s.quantity}</TableCell>
                    <TableCell className="flex flex-wrap gap-1">
                      {s.status === "cancelled" ? <Badge variant="secondary">Cancelled</Badge> : <Badge variant="success">Signed up</Badge>}
                      {pay && <Badge variant={pay.variant}>{pay.label}</Badge>}
                      {s.status !== "cancelled" && s.payment_status === "not_required" && e.price_cents ? <Badge variant="outline">Pays at the event</Badge> : null}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatShortLocal(s.created_at)}</TableCell>
                    <TableCell className="text-right">{s.status !== "cancelled" && <CancelSignupButton eventId={e.id} signupId={s.id} name={s.name} />}</TableCell>
                  </TableRow>
                );
              })}
              {!signups?.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    No sign-ups yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
