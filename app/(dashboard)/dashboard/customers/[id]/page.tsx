import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { formatPhone } from "@/lib/contacts/phone";
import { CONVERSATION_LABEL, conversationTone, leadTone } from "@/lib/ui/status-tones";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CONSENT_LABEL, type ConsentKind } from "@/lib/contacts/consents";
import { STATUS_LABEL, statusVariant, type BookingStatus } from "@/lib/bookings/labels";

const CONSENT_SOURCE: Record<string, string> = {
  contact_widget: "website contact form",
  registration_widget: "website sign-up",
  customer_page: "their own page",
};
import { CustomerForm } from "./customer-form";
import { DeleteCustomer } from "./delete-customer";
import { formatShortLocal } from "@/lib/time";

const NAME_SOURCE_LABEL: Record<string, string> = {
  whatsapp_profile: "from their WhatsApp profile",
  customer: "as they gave it",
  owner: "edited by your team",
};

const when = formatShortLocal;

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("contacts")
    .select("id, name, name_source, phone_e164, email, notes, first_channel, first_seen_at, last_seen_at, consent_at, opted_out_at, registered_at")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!customer) notFound();

  const [{ data: conversations }, { data: leads }, { data: bookings }, { data: consentHistory }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, channel, status, last_message_at")
      .eq("tenant_id", tenantId)
      .eq("contact_id", id)
      .order("last_message_at", { ascending: false }),
    supabase
      .from("leads")
      .select("id, interest, status, source, created_at")
      .eq("tenant_id", tenantId)
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select("id, starts_at, status, services(name)")
      .eq("tenant_id", tenantId)
      .eq("contact_id", id)
      .order("starts_at", { ascending: false }),
    supabase
      .from("consents")
      .select("id, kind, granted, source, created_at")
      .eq("tenant_id", tenantId)
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const displayName = customer.name || customer.email || "Unnamed customer";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div>
        <Link
          href="/dashboard/customers"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" /> Customers
        </Link>
        <h1 className="text-2xl font-semibold">{displayName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatPhone(customer.phone_e164) || "No phone number"}
          {customer.first_channel && <> · first came via {customer.first_channel}</>}
          {" · "}first seen {when(customer.first_seen_at)} · last seen {when(customer.last_seen_at)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {customer.name && customer.name_source && (
            <p className="text-xs text-muted-foreground">Name {NAME_SOURCE_LABEL[customer.name_source]}.</p>
          )}
          {customer.opted_out_at && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Replied STOP on {when(customer.opted_out_at)}: they won&apos;t get reminders or booking notices from us
              until they reply START. You can still answer when they message you.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {customer.consent_at
              ? `Agreed to their details being saved on ${when(customer.consent_at)}.`
              : "Hasn't been asked to save their details yet (known from their WhatsApp number)."}
            {customer.registered_at && ` Signed up on your website on ${when(customer.registered_at)}.`}
          </p>
          {!!consentHistory?.length && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Consent history ({consentHistory.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
                {consentHistory.map((c) => (
                  <li key={c.id}>
                    {when(c.created_at)}: {c.granted ? "said yes to" : "said no to"}{" "}
                    {CONSENT_LABEL[c.kind as ConsentKind]?.toLowerCase() ?? c.kind}
                    {" · "}
                    {CONSENT_SOURCE[c.source] ?? c.source}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <CustomerForm
            customer={{
              id: customer.id,
              name: customer.name ?? "",
              email: customer.email ?? "",
              notes: customer.notes ?? "",
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conversations</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y text-sm">
            {conversations?.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/dashboard/conversations/${c.id}`} className="hover:underline">
                  {c.channel === "whatsapp" ? "WhatsApp chat" : "Website chat"}
                </Link>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Badge variant={conversationTone(c.status)}>{CONVERSATION_LABEL[c.status] ?? c.status}</Badge>
                  {when(c.last_message_at)}
                </span>
              </li>
            ))}
            {!conversations?.length && <li className="py-2 text-muted-foreground">No conversations.</li>}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leads</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y text-sm">
            {leads?.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                <span>{l.interest || "Enquiry"}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Badge variant={leadTone(l.status)}>{l.status}</Badge>
                  {when(l.created_at)}
                </span>
              </li>
            ))}
            {!leads?.length && <li className="py-2 text-muted-foreground">No leads.</li>}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bookings</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y text-sm">
            {bookings?.map((b) => {
              const service = b.services as unknown as { name: string } | null;
              return (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                  <span>{service?.name ?? "Booking"}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Badge variant={statusVariant(b.status)}>{STATUS_LABEL[b.status as BookingStatus] ?? b.status}</Badge>
                    {when(b.starts_at)}
                  </span>
                </li>
              );
            })}
            {!bookings?.length && <li className="py-2 text-muted-foreground">No bookings.</li>}
          </ul>
        </CardContent>
      </Card>

      <DeleteCustomer
        id={customer.id}
        name={displayName}
        counts={{
          conversations: conversations?.length ?? 0,
          leads: leads?.length ?? 0,
          bookings: bookings?.length ?? 0,
        }}
      />
    </div>
  );
}
